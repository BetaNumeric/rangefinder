// dataLoader.js
/*
Data management service that handles:
- Location dataset loading
- Custom location management
- Question selection
- Data filtering
*/

let dataLoader = {
  isLoading: false,
  loadingProgress: 0,
  retryAttempt: 0,
  loadingText: "",  // Current loading status text
  loadedCount: 0,   // Number of locations loaded so far
  totalCount: 0,    // Total expected locations
  cache: {},        // Cache for loaded dataset data
  currentDatasetIndex: 0,  // For tracking which dataset is being loaded
  totalDatasets: 0,        // Total number of datasets to load
  CACHE_VERSION: 'v3',   // Version for dataset cache
  datasets: {
    global: {
      name: "Global Cities",
      localPath: "assets/locations/global_cities.csv",  // Try local file first
      url: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQw8Xy3qL1mquvQYPO3D9ik39Izfb2w92Gv70-9mwttU0UUp5k-gmXDjojkYdvhvlAiWBX9t4kST86v/pub?gid=1827066601&single=true&output=csv",
      defaultRadius: 15000,
      estimatedRows: 135464  // Approximate number of locations for progress estimation
    },
    capitals: {
      name: "World Capitals",
      localPath: "assets/locations/world_capitals.csv",
      url: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQw8Xy3qL1mquvQYPO3D9ik39Izfb2w92Gv70-9mwttU0UUp5k-gmXDjojkYdvhvlAiWBX9t4kST86v/pub?gid=0&single=true&output=csv",
      defaultRadius: 5000,
      estimatedRows: 199
    },
    germany: {
      name: "German Cities",
      localPath: "assets/locations/german_cities.csv",
      url: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQw8Xy3qL1mquvQYPO3D9ik39Izfb2w92Gv70-9mwttU0UUp5k-gmXDjojkYdvhvlAiWBX9t4kST86v/pub?gid=1604396001&single=true&output=csv",
      defaultRadius: 1000,
      estimatedRows: 83
    },
    bremen: {
      name: "Bremen Places",
      localPath: "assets/locations/bremen_places.csv",
      url: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQw8Xy3qL1mquvQYPO3D9ik39Izfb2w92Gv70-9mwttU0UUp5k-gmXDjojkYdvhvlAiWBX9t4kST86v/pub?gid=1150536605&single=true&output=csv",
      defaultRadius: 30,
      estimatedRows: 20
    },
    custom: {
      name: "Custom Locations",
      locations: [],
      defaultRadius: 10000,
      estimatedRows: 0
    }
  },

  lastError: '',
  pending: new Map(),
  requestTimeout: 25000,

  getSelectedDataset() {
    const selected = progressStore.getSetting('selectedDataset', 'capitals');
    return Object.hasOwn(this.datasets, selected) &&
      (selected !== 'custom' || progressStore.get().customLocations.length) ? selected : 'capitals';
  },

  getRadius(dataset) {
    const saved = Number(progressStore.getSetting('radius_' + dataset));
    return Number.isFinite(saved) && saved >= 1 && saved <= 20000 ? saved : this.datasets[dataset].defaultRadius;
  },

  setRadius(radius) {
    userSettings.radius = Math.max(1, Math.min(20000, radius));
    progressStore.setSetting('radius_' + this.getSelectedDataset(), userSettings.radius);
  },

  syncCustomLocations(refreshSelection = false) {
    const locations = progressStore.get().customLocations;
    this.datasets.custom.locations = locations;
    this.cache.custom = locations;
    if (refreshSelection && progressStore.getSetting('selectedDataset') === 'custom') {
      if (locations.length) questions = locations;
      else {
        progressStore.setSetting('selectedDataset', 'capitals');
        questions = this.cache.capitals || [];
        if (!this.isLoading) this.activateDataset('capitals');
      }
    }
  },

  initialize(callback) {
    this.syncCustomLocations();
    const selected = this.getSelectedDataset();
    this.activateDataset(selected, success => {
      if (success || selected === 'capitals') { callback(success); return; }
      // Smaller bundled data is a useful fallback when a previously selected set is unavailable.
      this.activateDataset('capitals', callback);
    });
  },

  activateDataset(datasetKey, callback = () => {}) {
    if (!Object.hasOwn(this.datasets, datasetKey) || this.isLoading) { callback(false); return; }
    this.loadQuestions(datasetKey, loadedQuestions => {
      if (!loadedQuestions.length) { callback(false); return; }
      questions = loadedQuestions;
      userSettings.radius = this.getRadius(datasetKey);
      recentLocations = [];
      progressStore.setSetting('selectedDataset', datasetKey);
      if (currentScreen === 'game' || currentScreen === 'answer') {
        enteredFromSearch = false;
        pickNewQuestion();
        if (currentScreen === 'answer') goToScreen('game');
      }
      callback(true);
    });
  },

  loadFromCache(datasetKey) {
    try {
      if (localStorage.getItem('dataset_cache_version_' + datasetKey) !== this.CACHE_VERSION) return null;
      const data = JSON.parse(localStorage.getItem('dataset_cache_' + datasetKey));
      if (!Array.isArray(data) || !data.length) return null;
      return data.map(location => progressStore.normalizeLocation(location));
    } catch { return null; }
  },

  saveToCache(datasetKey, data) {
    try {
      const serialized = JSON.stringify(data);
      if (serialized.length > 2 * 1024 * 1024) return; // Large CSVs belong in the service worker cache.
      localStorage.setItem('dataset_cache_' + datasetKey, serialized);
      localStorage.setItem('dataset_cache_version_' + datasetKey, this.CACHE_VERSION);
    } catch (error) { console.warn('Optional dataset cache unavailable:', error); }
  },

  loadQuestions(datasetKey, callback = () => {}) {
    if (!Object.hasOwn(this.datasets, datasetKey)) { callback([]); return Promise.resolve([]); }
    if (datasetKey === 'custom') this.syncCustomLocations();
    if (this.cache[datasetKey]) {
      callback(this.cache[datasetKey]);
      return Promise.resolve(this.cache[datasetKey]);
    }
    const cached = this.loadFromCache(datasetKey);
    if (cached) {
      this.cache[datasetKey] = cached;
      callback(cached);
      return Promise.resolve(cached);
    }
    if (!this.pending.has(datasetKey)) {
      this.isLoading = true;
      this.loadingProgress = 0.05;
      this.loadingText = 'Loading ' + this.datasets[datasetKey].name + '…';
      this.lastError = '';
      const pending = this.readDataset(datasetKey).then(data => {
        this.cache[datasetKey] = data;
        this.saveToCache(datasetKey, data);
        this.loadingProgress = 1;
        return data;
      }).catch(error => {
        this.lastError = 'Could not load these locations. Check your connection and try again.';
        this.loadingText = this.lastError;
        console.warn('Dataset load failed:', error);
        return [];
      }).finally(() => {
        this.pending.delete(datasetKey);
        this.isLoading = this.pending.size > 0;
        this.retryAttempt = 0;
      });
      this.pending.set(datasetKey, pending);
    }
    return this.pending.get(datasetKey).then(data => { callback(data); return data; });
  },

  async fetchText(url, retries = 1) {
    for (let attempt = 0; ; attempt++) {
      this.retryAttempt = attempt;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.requestTimeout);
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) {
          const error = new Error('Dataset request failed: ' + response.status);
          error.clientError = response.status >= 400 && response.status < 500;
          throw error;
        }
        return await response.text(); // Keep the timeout active until the body is complete.
      } catch (error) {
        const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
        if (attempt >= retries || error.clientError || offline) throw error;
      } finally { clearTimeout(timer); }
      await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
    }
  },

  *csvRows(text) {
    let field = '', columns = [], quoted = false;
    for (let i = 0; i < text.length; i++) {
      const character = text[i];
      if (character === '"') {
        if (quoted && text[i + 1] === '"') { field += '"'; i++; }
        else quoted = !quoted;
      } else if (!quoted && (character === ',' || character === '\n')) {
        columns.push(field); field = '';
        if (character === '\n') { yield { columns, offset: i }; columns = []; }
      } else if (character !== '\r' || quoted) field += character;
    }
    if (quoted) throw new Error('The CSV contains an unterminated quote.');
    if (field || columns.length) { columns.push(field); yield { columns, offset: text.length }; }
  },

  async readDataset(datasetKey) {
    const dataset = this.datasets[datasetKey];
    let text;
    try { text = await this.fetchText(dataset.localPath); }
    catch (error) {
      if (!dataset.url || (typeof navigator !== 'undefined' && navigator.onLine === false)) throw error;
      text = await this.fetchText(dataset.url, 2);
    }
    const result = [];
    let rows = 0, skipped = 0;
    for (const { columns, offset } of this.csvRows(text)) {
      if (rows++ === 0) continue; // Header
      if (columns.every(column => !column.trim())) continue;
      try {
        if (!columns[1]?.trim() || !columns[2]?.trim()) throw new Error('Missing coordinates.');
        result.push(progressStore.normalizeLocation({
          name: columns[0], lat: Number(columns[1]), lon: Number(columns[2]),
          type: columns[3], country: columns[4], population: Number(columns[5]) || 0
        }));
      } catch { skipped++; }
      if (rows % 1000 === 0) {
        this.loadedCount = result.length;
        this.loadingProgress = 0.65 + 0.3 * offset / text.length;
        this.loadingText = 'Reading ' + result.length.toLocaleString() + ' locations…';
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
    if (!result.length) throw new Error('No valid locations in this dataset.');
    if (skipped) console.warn('Skipped ' + skipped + ' invalid CSV rows.');
    this.loadedCount = result.length;
    this.totalCount = result.length;
    return result;
  },

  addCustomLocation(location) {
    let normalized;
    try { normalized = progressStore.normalizeLocation(location, true); }
    catch { return false; }
    const state = progressStore.get(true);
    if (state.customLocations.some(loc => loc.id === normalized.id)) return false;
    if (!progressStore.commit({ ...state, customLocations: [...state.customLocations, normalized] })) return false;
    this.syncCustomLocations(true);
    return true;
  },

  deleteCustomLocation(id) {
    const state = progressStore.get(true);
    const remaining = state.customLocations.filter(location => location.id !== id);
    if (!progressStore.commit({ ...state, customLocations: remaining })) return false;
    this.syncCustomLocations(true);
    return true;
  }
};

function filterAndSortLocationsByDistance(allLocations, playerLat, playerLon, maxRadiusKm) {
  // Question selection is random, so sorting every city is unnecessary.
  return allLocations.map(location => ({ ...location,
    distance: geoUtils.calculateDistance(playerLat, playerLon, location.lat, location.lon) }))
    .filter(location => location.distance <= maxRadiusKm);
}
