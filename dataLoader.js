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
  selectedDataset: null,
  selectionVersion: 0,
  error: '',
  datasets: {
    global: {
      name: "Global Cities",
      url: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQw8Xy3qL1mquvQYPO3D9ik39Izfb2w92Gv70-9mwttU0UUp5k-gmXDjojkYdvhvlAiWBX9t4kST86v/pub?gid=1827066601&single=true&output=csv",
      defaultRadius: 15000
    },
    capitals: {
      name: "World Capitals",
      url: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQw8Xy3qL1mquvQYPO3D9ik39Izfb2w92Gv70-9mwttU0UUp5k-gmXDjojkYdvhvlAiWBX9t4kST86v/pub?gid=0&single=true&output=csv",
      defaultRadius: 5000
    },
    germany: {
      name: "German Cities",
      url: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQw8Xy3qL1mquvQYPO3D9ik39Izfb2w92Gv70-9mwttU0UUp5k-gmXDjojkYdvhvlAiWBX9t4kST86v/pub?gid=1604396001&single=true&output=csv",
      defaultRadius: 1000
    },
    bremen: {
      name: "Bremen Places",
      url: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQw8Xy3qL1mquvQYPO3D9ik39Izfb2w92Gv70-9mwttU0UUp5k-gmXDjojkYdvhvlAiWBX9t4kST86v/pub?gid=1150536605&single=true&output=csv",
      defaultRadius: 30
    },
    custom: {
      name: "Custom Locations",
      locations: [],
      defaultRadius: 10000
    }
  },

  readCustomLocations() {
    const saved = JSON.parse(localStorage.getItem('customLocations') || '[]');
    if (!Array.isArray(saved) || saved.some(location => !isValidLocation(location))) {
      throw new Error('Saved custom locations could not be read. Export your data before replacing it.');
    }
    return saved;
  },

  initialize() {
    try {
      this.datasets.custom.locations = this.readCustomLocations();
    } catch (error) {
      // Preserve unreadable storage instead of silently replacing it on the next addition.
      this.error = error.message;
    }
  },

  async loadQuestions(datasetKey) {
    const dataset = this.datasets[datasetKey];
    if (!dataset) throw new Error('Unknown dataset.');
    if (datasetKey === 'custom') return this.readCustomLocations();

    const response = await fetch(dataset.url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('The location dataset could not be downloaded.');
    const rows = parseLocationCsv(await response.text());
    const locations = rows.slice(1).map(cols => ({
      name: (cols[0] || '').trim(),
      lat: Number((cols[1] || '').trim() || NaN),
      lon: Number((cols[2] || '').trim() || NaN),
      type: (cols[3] || 'place').trim(),
      country: (cols[4] || 'Unknown').trim(),
      population: Number.parseInt(cols[5], 10) || 0
    })).filter(isValidLocation);
    if (locations.length === 0) throw new Error('This dataset has no usable locations.');
    return locations;
  },

  async selectDataset(datasetKey) {
    const version = ++this.selectionVersion;
    this.isLoading = true;
    this.error = '';
    try {
      const locations = await this.loadQuestions(datasetKey);
      if (version !== this.selectionVersion) return false;
      // Commit the collection and its identity together, only after a successful load.
      localStorage.setItem('selectedDataset', datasetKey);
      questions = locations;
      this.selectedDataset = datasetKey;
      if (datasetKey === 'custom') this.datasets.custom.locations = locations;
      userSettings.radius = this.datasets[datasetKey].defaultRadius;
      if (datasetKey === 'custom' && hasValidPlayerLocation() && locations.length) {
        userSettings.radius = Math.min(20000, Math.max(userSettings.radius,
          ...locations.map(location => Math.ceil(getDistanceKm(
            playerLocation.lat, playerLocation.lon, location.lat, location.lon)))));
      }
      recentLocations = [];
      // Completed answers retain their own target and dataset until the next round.
      if (currentScreen === 'game') pickNewQuestion();
      if (currentScreen === 'discoveries' && discoveryMap.map) discoveryMap.updateMarkers();
      return true;
    } catch (error) {
      if (version === this.selectionVersion) {
        this.error = 'Could not load locations. Check your connection or choose another dataset.';
        console.error('Dataset load failed:', error);
      }
      return false;
    } finally {
      if (version === this.selectionVersion) this.isLoading = false;
    }
  },

  addCustomLocation(location) {
    if (!isValidLocation(location)) throw new Error('This place has invalid coordinates.');
    const locations = this.readCustomLocations();
    const existing = locations.find(loc => loc.lat === location.lat && loc.lon === location.lon);
    const processed = existing || {
      ...location,
      id: location.id || location.placeId || `custom:${location.lat},${location.lon}`,
      name: location.name || 'Unknown Location',
      type: 'custom',
      country: location.country || 'Unknown',
      population: location.population || 0
    };
    if (!existing) locations.push(processed);
    // Write before updating memory: a failed write must not appear to have saved a place.
    localStorage.setItem('customLocations', JSON.stringify(locations));
    this.datasets.custom.locations = locations;
    if (this.selectedDataset === 'custom') questions = locations;
    return processed;
  }
};

function isValidLocation(location) {
  return !!location && typeof location.name === 'string' && location.name.trim().length > 0 &&
    Number.isFinite(location.lat) && Math.abs(location.lat) <= 90 &&
    Number.isFinite(location.lon) && Math.abs(location.lon) <= 180;
}

// Handles quoted commas, escaped quotes, CRLF, and newlines inside quoted fields.
function parseLocationCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++; }
      else quoted = !quoted;
    } else if (!quoted && (char === ',' || char === '\n' || char === '\r')) {
      row.push(field); field = '';
      if (char !== ',') {
        if (row.some(value => value.trim())) rows.push(row);
        row = [];
        if (char === '\r' && text[i + 1] === '\n') i++;
      }
    } else field += char;
  }
  if (quoted) throw new Error('The dataset contains an unterminated quoted field.');
  row.push(field);
  if (row.some(value => value.trim())) rows.push(row);
  return rows;
}

function filterAndSortLocationsByDistance(allLocations, playerLat, playerLon, maxRadiusKm) {
  let enriched = allLocations.map(loc => {
    let dist = getDistanceKm(playerLat, playerLon, loc.lat, loc.lon);
    return { ...loc, distance: dist };
  });

  let filtered = enriched.filter(loc => 
    loc.distance <= maxRadiusKm
  );
  filtered.sort((a, b) => a.distance - b.distance);
  return filtered;
}

function getDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  let dLat = toRad(lat2 - lat1);
  let dLon = toRad(lon2 - lon1);
  let rLat1 = toRad(lat1);
  let rLat2 = toRad(lat2);

  let a = Math.max(0, Math.min(1, Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(rLat1) * Math.cos(rLat2) *
          Math.sin(dLon / 2) * Math.sin(dLon / 2)));
  let c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(value) {
  return value * Math.PI / 180;
}
