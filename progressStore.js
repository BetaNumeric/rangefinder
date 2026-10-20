// A single atomic write keeps history, discoveries, and custom places in sync.
// Legacy records are migrated only after a complete replacement is saved.
const progressStore = {
  key: 'rangefinder_progress_v2',
  datasets: ['global', 'capitals', 'germany', 'bremen', 'custom'],
  state: null,
  notice: '',
  dirty: false,
  volatileSettings: new Map(),
  serialized: null,
  conflicted: false,

  empty() {
    return { schemaVersion: 2, scoreHistory: [], customLocations: [],
      discovered: Object.fromEntries(this.datasets.map(key => [key, {}])), recovery: Object.create(null) };
  },

  getSetting(key, fallback = null) {
    if (this.volatileSettings.has(key)) return this.volatileSettings.get(key);
    try { return localStorage.getItem(key) ?? fallback; }
    catch { this.notice = 'Browser storage is unavailable. Export a backup before leaving.'; return fallback; }
  },

  setSetting(key, value) {
    try {
      localStorage.setItem(key, String(value));
      this.volatileSettings.delete(key);
      return true;
    } catch {
      this.volatileSettings.set(key, String(value));
      this.notice = 'Changes could not be saved. Export a backup before leaving.';
      return false;
    }
  },

  readJSON(key, fallback) {
    try {
      const raw = this.getSetting(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      this.notice = 'Some saved settings could not be read. Your progress is still available.';
      return fallback;
    }
  },

  text(value, fallback = 'Unknown', maxLength = 500) {
    if (value === undefined || value === null || value === '') return fallback;
    if (typeof value !== 'string' || value.length > maxLength) throw new Error('A place name or country is invalid.');
    return value.trim() || fallback;
  },

  number(value, min, max, description) {
    if (!Number.isFinite(value) || value < min || value > max) throw new Error(`Invalid ${description}.`);
    return value;
  },

  normalizeLocation(location, custom = false) {
    if (!location || typeof location !== 'object' || Array.isArray(location)) throw new Error('Invalid location.');
    const lat = this.number(location.lat, -90, 90, 'latitude');
    const lon = this.number(location.lon, -180, 180, 'longitude');
    return { id: geoUtils.locationId({ lat, lon }), lat, lon,
      name: this.text(location.name, 'Unknown Location'),
      country: this.text(location.country), type: custom ? 'custom' : this.text(location.type, 'unknown'),
      population: Number.isFinite(location.population) ? Math.max(0, Math.floor(location.population)) : 0 };
  },

  normalizeScore(record) {
    if (!record || !this.datasets.includes(record.dataset)) throw new Error('Invalid score dataset.');
    const location = this.normalizeLocation({ ...record.location, name: record.locationName, country: record.country });
    const guessDistance = this.number(record.distance?.guess, 0, 20100, 'guessed distance');
    const guessDirection = this.number(record.direction?.guess, -3600, 3600, 'guessed direction');
    const playerLat = this.number(record.guess?.lat, -90, 90, 'player latitude');
    const playerLon = this.number(record.guess?.lon, -180, 180, 'player longitude');
    const actual = geoUtils.calculateDistance(playerLat, playerLon, location.lat, location.lon);
    const bearing = geoUtils.calculateBearing(playerLat, playerLon, location.lat, location.lon);
    const calculated = scoringService.calculateScore(actual, guessDistance, bearing, guessDirection,
      playerLat, playerLon, location.lat, location.lon);
    // Keep historical overall scores; repair old NaN/null scores and subratings.
    const score = record.score === null ? calculated.score2 : this.number(record.score, 0, 100, 'score');
    return { timestamp: this.number(record.timestamp, 0, Number.MAX_SAFE_INTEGER, 'score timestamp'),
      scoringVersion: record.scoringVersion === 2 ? 2 : 1,
      score, scoreOld: Number.isFinite(record.scoreOld) ? record.scoreOld : calculated.score1,
      locationId: location.id, locationName: location.name, country: location.country,
      dataset: record.dataset, location: { id: location.id, lat: location.lat, lon: location.lon, type: location.type },
      distance: { guess: guessDistance, actual, error: calculated.details.actualDistance, score: Math.round(calculated.details.distanceScore) },
      direction: { guess: (guessDirection % 360 + 360) % 360, actual: bearing, score: Math.round(calculated.details.directionScore) },
      guess: { lat: playerLat, lon: playerLon,
        calculatedPoint: geoUtils.computeDestinationLatLon(playerLat, playerLon, guessDistance, guessDirection) } };
  },

  discoveryFromScore(score, previous) {
    return { id: score.locationId, name: score.locationName, country: score.country,
      lat: score.location.lat, lon: score.location.lon, type: score.location.type,
      bestScore: Math.max(score.score, previous?.bestScore ?? 0),
      lastScore: !previous || score.timestamp >= (previous.lastPlayed || 0) ? score.score : previous.lastScore,
      lastPlayed: Math.max(score.timestamp, previous?.lastPlayed || 0), plays: (previous?.plays || 0) + 1 };
  },

  normalize(data, { tolerant = false } = {}) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('The backup must contain an object.');
    if (data.schemaVersion !== undefined && data.schemaVersion !== 2) throw new Error('This backup version is not supported.');
    const state = this.empty();
    if (data.recovery !== undefined) {
      if (!data.recovery || typeof data.recovery !== 'object' || Array.isArray(data.recovery)) throw new Error('Invalid recovery data.');
      for (const [key, value] of Object.entries(data.recovery)) {
        if (typeof value !== 'string') throw new Error('Invalid recovery data.');
        state.recovery[key] = value;
      }
    }
    const recover = (label, raw, error) => {
      if (!tolerant) throw error;
      state.recovery[label] = JSON.stringify(raw);
    };
    for (const key of ['scoreHistory', 'customLocations']) {
      const records = Object.hasOwn(data, key) ? data[key] : [];
      if (!Array.isArray(records)) { recover(key, records, new Error(`Invalid ${key}.`)); continue; }
      for (const record of records) {
        try {
          state[key].push(key === 'scoreHistory' ? this.normalizeScore(record) : this.normalizeLocation(record, true));
        } catch (error) { recover(key, records, error); }
      }
    }
    state.customLocations = [...new Map(state.customLocations.map(loc => [loc.id, loc])).values()];
    const names = new Map();
    for (const score of state.scoreHistory) {
      const locations = state.discovered[score.dataset];
      locations[score.locationId] = this.discoveryFromScore(score, locations[score.locationId]);
      const nameKey = `${score.dataset}:${score.locationName}`;
      if (!names.has(nameKey)) names.set(nameKey, new Set());
      names.get(nameKey).add(score.locationId);
    }
    const discovered = Object.hasOwn(data, 'discovered') ? data.discovered : {};
    if (!discovered || typeof discovered !== 'object' || Array.isArray(discovered)) {
      recover('discovered', discovered, new Error('Invalid discoveries.'));
      return state;
    }
    for (const [dataset, records] of Object.entries(discovered)) {
      if (!this.datasets.includes(dataset) || !records || typeof records !== 'object') {
        recover(`discovered_${dataset}`, records, new Error('Invalid discovery dataset.')); continue;
      }
      for (const [key, record] of Object.entries(records)) {
        try {
          const location = this.normalizeLocation(record);
          const bestScore = this.number(record.bestScore, 0, 100, 'best score');
          const lastScore = this.number(record.lastScore, 0, 100, 'last score');
          const plays = this.number(record.plays, 1, Number.MAX_SAFE_INTEGER, 'play count');
          if (!Number.isInteger(plays)) throw new Error('Invalid play count.');
          const previous = state.discovered[dataset][location.id];
          if (key !== location.id && names.get(`${dataset}:${location.name}`)?.size > 1) {
            // A name-keyed aggregate cannot tell us which namesake earned its best score.
            state.recovery[`ambiguous_${dataset}_${location.id}`] = JSON.stringify(record);
            if (!previous) state.discovered[dataset][location.id] = { ...location, bestScore: lastScore, lastScore, plays: 1 };
            continue;
          }
          state.discovered[dataset][location.id] = { ...location,
            bestScore: Math.max(bestScore, previous?.bestScore ?? 0),
            lastScore: previous?.lastScore ?? lastScore,
            lastPlayed: previous?.lastPlayed || 0, plays: Math.max(plays, previous?.plays || 0) };
        } catch (error) { recover(`discovered_${dataset}`, records, error); }
      }
    }
    return state;
  },

  get(refresh = false) {
    if (this.state) {
      if (!refresh) return this.state;
      const latest = this.getSetting(this.key);
      if (latest === this.serialized) return this.state;
      if (this.dirty) {
        this.conflicted = true;
        this.notice = 'Progress changed in another tab. Export a backup before reloading.';
        return this.state;
      }
      this.state = null;
    }
    const recovery = {};
    const read = (key, fallback) => {
      const raw = this.getSetting(key);
      if (raw === null) return fallback;
      try { return JSON.parse(raw); }
      catch { recovery[key] = raw; return fallback; }
    };
    const raw = this.getSetting(this.key);
    this.serialized = raw;
    if (raw !== null) {
      try { this.state = this.normalize(JSON.parse(raw), { tolerant: true }); }
      catch { recovery[this.key] = raw; }
    }
    if (!this.state) {
      const legacy = { scoreHistory: read('scoreHistory', []), customLocations: read('customLocations', []),
        discovered: Object.fromEntries(this.datasets.map(key => [key, read(`discovered_${key}`, {})])) };
      this.state = this.normalize(legacy, { tolerant: true });
      Object.assign(this.state.recovery, recovery);
      const hasLegacy = ['scoreHistory', 'customLocations', ...this.datasets.map(key => `discovered_${key}`)]
        .some(key => this.getSetting(key) !== null);
      if (hasLegacy || Object.keys(recovery).length) this.commit(this.state, { keepUnsaved: true });
    }
    if (Object.keys(this.state.recovery).length && !this.dirty) {
      this.notice = 'Some older data needed recovery. Export a backup to keep the original records.';
    }
    return this.state;
  },

  commit(next, { keepUnsaved = false } = {}) {
    try {
      if (this.conflicted) throw new Error('Progress changed in another tab. Export a backup before reloading.');
      // setItem is atomic: an import or save either replaces the whole snapshot or leaves it intact.
      const serialized = JSON.stringify(next);
      localStorage.setItem(this.key, serialized);
      this.serialized = serialized;
      this.state = next;
      this.dirty = false;
      this.notice = Object.keys(next.recovery).length ? 'Some older data needed recovery. Export a backup to keep the original records.' : '';
      for (const key of ['scoreHistory', 'customLocations', ...this.datasets.map(key => `discovered_${key}`)]) {
        try { localStorage.removeItem(key); } catch { /* The replacement is already saved. */ }
      }
      return true;
    } catch (error) {
      if (keepUnsaved) { this.state = next; this.dirty = true; }
      this.notice = this.conflicted ? error.message : 'Progress could not be saved. Export a backup before leaving.';
      console.warn('Progress save failed:', error);
      return false;
    }
  },

  importData(data, selectedDataset = 'global') {
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid backup.');
    const structured = ['scoreHistory', 'discovered', 'customLocations'].some(key => Object.hasOwn(data, key));
    if (data.schemaVersion !== undefined && data.schemaVersion !== 2) throw new Error('This backup version is not supported.');
    const current = this.get(true);
    const incoming = structured ? data : { discovered: { [selectedDataset]: data } };
    if (Object.hasOwn(incoming, 'discovered') &&
        (!incoming.discovered || typeof incoming.discovered !== 'object' || Array.isArray(incoming.discovered))) {
      throw new Error('Invalid discoveries.');
    }
    const next = this.normalize({ ...current, ...incoming,
      discovered: { ...current.discovered, ...(incoming.discovered || {}) } });
    if (!this.commit(next)) throw new Error('The backup could not be saved. Existing progress has been kept.');
    return next;
  },

  exportData() {
    return JSON.parse(JSON.stringify(this.get(true)));
  },

  clear() {
    this.conflicted = false;
    return this.commit(this.empty());
  }
};
