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
  CACHE_VERSION: 'v2.3',   // Version for dataset cache
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

  /**
   * Load dataset from localStorage cache
   * @param {string} datasetKey - Dataset identifier
   * @returns {Array|null} - Cached dataset or null if not found/invalid
   */
  loadFromCache(datasetKey) {
    try {
      const cacheKey = `dataset_cache_${datasetKey}`;
      const versionKey = `dataset_cache_version_${datasetKey}`;
      
      const cachedVersion = localStorage.getItem(versionKey);
      const cachedData = localStorage.getItem(cacheKey);
      
      // Check if cache exists and version matches
      if (cachedData && cachedVersion === this.CACHE_VERSION) {
        const parsed = JSON.parse(cachedData);
        console.log(`✓ Loaded ${datasetKey} from localStorage cache (${parsed.length} locations)`);
        return parsed;
      } else if (cachedData && cachedVersion !== this.CACHE_VERSION) {
        console.log(`Cache version mismatch for ${datasetKey}, will reload`);
        // Clear old version
        localStorage.removeItem(cacheKey);
        localStorage.removeItem(versionKey);
      }
      
      return null;
    } catch (error) {
      console.warn(`Failed to load ${datasetKey} from cache:`, error);
      return null;
    }
  },

  /**
   * Save dataset to localStorage cache
   * @param {string} datasetKey - Dataset identifier
   * @param {Array} data - Dataset to cache
   */
  saveToCache(datasetKey, data) {
    try {
      const cacheKey = `dataset_cache_${datasetKey}`;
      const versionKey = `dataset_cache_version_${datasetKey}`;
      
      const jsonString = JSON.stringify(data);
      const sizeMB = (jsonString.length / 1024 / 1024).toFixed(2);
      const sizeKB = (jsonString.length / 1024).toFixed(2);
      
      // localStorage has a 5-10 MB limit, skip large datasets
      const MAX_SIZE_MB = 4; // Conservative limit
      if (jsonString.length > MAX_SIZE_MB * 1024 * 1024) {
        console.log(`⚠ Skipping cache for ${datasetKey} (${sizeMB} MB) - too large for localStorage`);
        console.log(`  Dataset will be downloaded each time (or use IndexedDB in future)`);
        return;
      }
      
      console.log(`Saving ${datasetKey} to localStorage (${sizeKB} KB)...`);
      localStorage.setItem(cacheKey, jsonString);
      localStorage.setItem(versionKey, this.CACHE_VERSION);
      
      // Verify it was saved
      const saved = localStorage.getItem(cacheKey);
      if (saved) {
        console.log(`✓ Saved ${datasetKey} to localStorage cache (${sizeKB} KB)`);
      } else {
        console.error(`✗ Failed to save ${datasetKey} - verification failed`);
      }
    } catch (error) {
      // Handle quota exceeded
      if (error.name === 'QuotaExceededError') {
        console.error(`✗ Storage quota exceeded, cannot cache ${datasetKey}`);
        console.error('   Dataset will be downloaded each time');
        // Try to clear old caches to make room
        this.clearOldCaches();
      } else {
        console.error(`✗ Failed to save ${datasetKey} to cache:`, error);
      }
    }
  },

  /**
   * Clear old cache versions
   */
  clearOldCaches() {
    try {
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (key.startsWith('dataset_cache_')) {
          const versionKey = key.replace('dataset_cache_', 'dataset_cache_version_');
          const version = localStorage.getItem(versionKey);
          if (version && version !== this.CACHE_VERSION) {
            console.log(`Clearing old cache: ${key}`);
            localStorage.removeItem(key);
            localStorage.removeItem(versionKey);
          }
        }
      });
    } catch (error) {
      console.warn('Failed to clear old caches:', error);
    }
  },

  /**
   * Smoothly animate progress from current to target value
   * @param {number} target - Target progress (0-1)
   * @param {number} durationMs - Animation duration in milliseconds
   */
  animateProgress(target, durationMs) {
    const startProgress = this.loadingProgress;
    const startTime = Date.now();
    
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / durationMs, 1);
      
      // Ease out cubic for smooth deceleration
      const eased = 1 - Math.pow(1 - progress, 3);
      
      this.loadingProgress = startProgress + (target - startProgress) * eased;
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        this.loadingProgress = target;
      }
    };
    
    requestAnimationFrame(animate);
  },

  /**
   * Retry a fetch request with exponential backoff
   * @param {string} url - URL to fetch
   * @param {number} maxRetries - Maximum retry attempts (default: 3)
   * @returns {Promise<Response>}
   */
  async fetchWithRetry(url, maxRetries = 3) {
    let lastError;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        this.retryAttempt = attempt;
        
        if (attempt > 0) {
          console.log(`Retrying data fetch (attempt ${attempt + 1}/${maxRetries + 1})...`);
        }
        
        const response = await fetch(url);
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        // Reset retry counter on success
        this.retryAttempt = 0;
        return response;
        
      } catch (error) {
        lastError = error;
        
        // Don't retry if it's a 4xx client error
        if (error.message && error.message.includes('status: 4')) {
          throw error;
        }
        
        // Don't retry on last attempt
        if (attempt === maxRetries) {
          break;
        }
        
        // Calculate exponential backoff: 1s, 2s, 4s...
        const delayMs = Math.pow(2, attempt) * 1000;
        console.warn(`Request failed: ${error.message}. Retrying in ${delayMs/1000}s...`);
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
    
    // All retries exhausted
    this.retryAttempt = 0;
    throw new Error(`Failed after ${maxRetries + 1} attempts: ${lastError.message}`);
  },

  activateDataset(datasetKey, callback = () => {}) {
    if (!this.datasets[datasetKey] || this.isLoading) {
      callback(false);
      return;
    }
    this.loadQuestions(datasetKey, loadedQuestions => {
      if (!Array.isArray(loadedQuestions) || loadedQuestions.length === 0) {
        callback(false);
        return;
      }
      // Commit the selection only after its questions are available.
      questions = loadedQuestions;
      userSettings.radius = this.datasets[datasetKey].defaultRadius;
      recentLocations = [];
      localStorage.setItem('selectedDataset', datasetKey);
      // The user may have left Settings while an uncached dataset was loading.
      if (currentScreen === 'game' || currentScreen === 'answer') {
        enteredFromSearch = false;
        pickNewQuestion();
        if (currentScreen === 'answer') goToScreen('game');
      }
      callback(true);
    });
  },

  loadQuestions: function(datasetKey, callback = () => {}) {
    // Check memory cache first
    if (this.cache[datasetKey]) {
      console.log(`Using memory cache for ${datasetKey}`);
      callback(this.cache[datasetKey]);
      return;
    }
    
    // Check localStorage cache
    const cachedData = this.loadFromCache(datasetKey);
    if (cachedData) {
      this.cache[datasetKey] = cachedData;
      callback(cachedData);
      return;
    }
    
    // Race condition guard: prevent concurrent loads
    if (this.isLoading) {
      console.warn(`Data load already in progress for dataset '${datasetKey}', ignoring duplicate request`);
      return;
    }
    
    this.isLoading = true;
    this.loadingProgress = 0;
    this.retryAttempt = 0;
    this.loadingText = "Connecting...";
    this.loadedCount = 0;
    this.totalCount = 0;
    
    const dataset = this.datasets[datasetKey];
    if (!dataset) {
      console.error(`Failed to load dataset: Invalid dataset key '${datasetKey}'. Available datasets:`, Object.keys(this.datasets).join(', '));
      this.isLoading = false;
      this.loadingProgress = 0;
      this.loadingText = "";
      callback([]);
      return;
    }

    // Handle custom dataset differently
    if (datasetKey === 'custom') {
      // Load saved custom locations from localStorage
      this.loadingProgress = 0.5;
      const savedLocations = localStorage.getItem('customLocations');
      if (savedLocations) {
        dataset.locations = JSON.parse(savedLocations);
      } else {
        dataset.locations = [];
      }
      
      this.totalCount = dataset.locations.length;
      this.loadedCount = dataset.locations.length;
      this.loadingText = `Loaded ${dataset.locations.length} custom location${dataset.locations.length !== 1 ? 's' : ''}`;
      
      this.loadingProgress = 1.0;
      this.isLoading = false;
      
      // Cache the custom locations (memory only, already in localStorage)
      this.cache[datasetKey] = dataset.locations;
      
      callback(dataset.locations);
      return;
    }

    // Regular CSV dataset loading with retry logic
    this.loadingProgress = 0.1;
    const estimatedRows = dataset.estimatedRows || 500;
    this.totalCount = estimatedRows;
    
    // Show dataset progress if preloading multiple datasets
    if (this.totalDatasets > 0) {
      this.loadingText = `Loading dataset ${this.currentDatasetIndex} of ${this.totalDatasets}: ${dataset.name}`;
    } else {
      this.loadingText = `Loading ${dataset.name} ...`;
    }
    
    // Estimate download time and animate progress
    const estimatedDownloadTime = Math.max(1000, Math.min(estimatedRows * 3, 5000));
    
    // Start smooth animation to 60% during download (will be overridden if we get actual progress)
    this.animateProgress(0.6, estimatedDownloadTime);
    
    // Try local file first, fall back to Google Sheets URL
    const sourceUrl = dataset.localPath || dataset.url;
    const isLocal = !!dataset.localPath;
    
    if (isLocal) {
      console.log(`📁 Attempting to load ${datasetKey} from local file: ${sourceUrl}`);
    }
    
    this.fetchWithRetry(sourceUrl, isLocal ? 1 : 3)  // Only 1 retry for local files
      .catch(async (localError) => {
        // If local file failed and we have a remote URL, try that
        if (isLocal && dataset.url) {
          console.warn(`⚠ Local file failed for ${datasetKey}, falling back to Google Sheets...`);
          this.loadingText = `Downloading ${dataset.name} from cloud...`;
          return this.fetchWithRetry(dataset.url, 3);
        }
        throw localError;  // Re-throw if no fallback available
      })
      .then(response => {
        // Download complete - set to 60% if we got here
        this.loadingProgress = 0.6;
        
        // Log source of data
        if (isLocal && response.url && response.url.includes('/assets/locations/')) {
          console.log(`✓ Loaded ${datasetKey} from local file`);
          this.loadingText = `Loaded from local file`;
        } else {
          console.log(`✓ Downloaded ${datasetKey} from cloud`);
          this.loadingText = `Downloaded from cloud`;
        }
        
        // Check if we can track download progress
        const contentLength = response.headers.get('content-length');
        
        if (contentLength) {
          // Stream response with progress tracking
          const total = parseInt(contentLength, 10);
          let loaded = 0;
          
          const reader = response.body.getReader();
          const stream = new ReadableStream({
            start: (controller) => {
              const push = () => {
                reader.read().then(({ done, value }) => {
                  if (done) {
                    controller.close();
                    return;
                  }
                  loaded += value.length;
                  // Progress from 0.1 to 0.6 during download
                  this.loadingProgress = 0.1 + (0.5 * (loaded / total));
                  controller.enqueue(value);
                  push();
                });
              };
              push();
            }
          });
          
          return new Response(stream).text();
        } else {
          // Can't track actual progress - animation is already running
          return response.text();
        }
      })
      .then(async text => {
        // Download complete, jump to 65%
        this.loadingProgress = 0.65;
        
        const rows = text.trim().split("\n");
        let result = [];
        let invalidCount = 0;
        
        // Update total count based on actual rows
        this.totalCount = rows.length - 1; // Exclude header row
        this.loadingText = `Loading 0 of ${this.totalCount.toLocaleString()} locations...`;
        
        // Parse in chunks to allow UI updates
        const CHUNK_SIZE = 100; // Parse 100 rows then yield to UI
        
        for (let i = 1; i < rows.length; i++) {
          // Yield to browser every CHUNK_SIZE rows to update UI
          if (i % CHUNK_SIZE === 0) {
            // Update progress and text
            const parseProgress = i / rows.length;
            this.loadingProgress = 0.65 + (0.30 * parseProgress); // 65% to 95%
            this.loadedCount = result.length;
            this.loadingText = `Loading ${result.length.toLocaleString()} of ${this.totalCount.toLocaleString()} locations...`;
            
            // Yield control to browser to update UI
            await new Promise(resolve => setTimeout(resolve, 0));
          }
          
          // Skip empty rows
          if (!rows[i].trim()) {
            continue;
          }
          
          let cols = rows[i].split(",");
          
          // Validate we have enough columns
          if (cols.length < 3) {
            console.warn(`Row ${i}: Not enough columns, skipping`);
            invalidCount++;
            continue;
          }
          
          // Parse and validate coordinates
          const lat = parseFloat(cols[1]);
          const lon = parseFloat(cols[2]);
          
          // Validate latitude and longitude
          if (isNaN(lat) || isNaN(lon)) {
            console.warn(`Row ${i}: Invalid coordinates (NaN), skipping`);
            invalidCount++;
            continue;
          }
          
          if (lat < -90 || lat > 90) {
            console.warn(`Row ${i}: Invalid latitude ${lat}, must be between -90 and 90, skipping`);
            invalidCount++;
            continue;
          }
          
          if (lon < -180 || lon > 180) {
            console.warn(`Row ${i}: Invalid longitude ${lon}, must be between -180 and 180, skipping`);
            invalidCount++;
            continue;
          }
          
          // Build validated location object with safe defaults
          let obj = {
            name: (cols[0] && cols[0].trim()) || 'Unknown Location',
            lat: lat,
            lon: lon,
            type: (cols[3] && cols[3].trim()) || 'unknown',
            country: (cols[4] && cols[4].trim()) || 'Unknown',
            population: parseInt(cols[5]) || 0
          };
          
          result.push(obj);
        }
        
        if (invalidCount > 0) {
          console.warn(`Skipped ${invalidCount} invalid location(s) from dataset`);
        }
        
        if (result.length === 0) {
          throw new Error('No valid locations found in dataset');
        }
        
        // Final progress update to 95%
        this.loadingProgress = 0.95;
        this.loadedCount = result.length;
        this.loadingText = `Processing ${result.length.toLocaleString()} location${result.length !== 1 ? 's' : ''}...`;
        
        // Update to final state
        this.loadingProgress = 0.98;
        this.loadingText = `Loaded ${result.length.toLocaleString()} location${result.length !== 1 ? 's' : ''}`;
        
        // Small delay to show final text
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // Final animation to 100%
        this.loadingProgress = 1.0;
        await new Promise(resolve => setTimeout(resolve, 200));
        
        this.isLoading = false;
        
        // Cache the loaded data (memory cache always, localStorage if small enough)
        this.cache[datasetKey] = result;
        this.saveToCache(datasetKey, result);
        
        callback(result);
      })
      .catch(err => {
        console.error(`Failed to load dataset '${datasetKey}':`, err.message || err);
        console.error("Dataset URL:", dataset.url);
        this.isLoading = false;
        this.loadingProgress = 0;
        this.retryAttempt = 0;
        this.loadingText = "Failed to load";
        this.loadedCount = 0;
        this.totalCount = 0;
        
        // Show user-friendly error message
        if (window.alert) {
          const errorMsg = err.message || 'Unknown error';
          const retryInfo = err.message.includes('Failed after') 
            ? '\n\nConnection failed after multiple retry attempts.'
            : '';
          alert(`Unable to load location data\n\nDataset: ${dataset.name}\nError: ${errorMsg}${retryInfo}\n\nPlease check your internet connection and try reloading the page.`);
        }
        
        callback([]);
      });
  },

  /**
   * Preload all datasets sequentially for faster switching later
   * @param {function} callback - Called when all datasets are loaded
   */
  preloadAllDatasets: async function(callback = () => {}) {
    console.log('=== PRELOAD DATASETS DEBUG ===');
    console.log('Cache version:', this.CACHE_VERSION);
    console.log('localStorage available:', typeof localStorage !== 'undefined');
    
    // Check localStorage size
    try {
      let totalSize = 0;
      for (let key in localStorage) {
        if (localStorage.hasOwnProperty(key)) {
          totalSize += localStorage[key].length;
        }
      }
      console.log('Total localStorage size:', (totalSize / 1024 / 1024).toFixed(2), 'MB');
    } catch (e) {
      console.warn('Could not calculate localStorage size:', e);
    }
    
    // Clear old cache versions first
    this.clearOldCaches();
    
    // Get all dataset keys except custom (loaded from localStorage)
    const datasetKeys = Object.keys(this.datasets).filter(key => key !== 'custom');
    console.log('Datasets to check:', datasetKeys);
    
    // Load custom locations first (instant)
    const savedLocations = localStorage.getItem('customLocations');
    if (savedLocations) {
      this.datasets.custom.locations = JSON.parse(savedLocations);
      this.cache.custom = this.datasets.custom.locations;
    } else {
      this.cache.custom = [];
    }
    
    // Check which datasets need to be downloaded
    const datasetsToLoad = [];
    const cachedDatasets = [];
    
    for (const key of datasetKeys) {
      console.log(`Checking cache for ${key}...`);
      const cacheKey = `dataset_cache_${key}`;
      const versionKey = `dataset_cache_version_${key}`;
      const hasData = localStorage.getItem(cacheKey) !== null;
      const hasVersion = localStorage.getItem(versionKey) !== null;
      const version = localStorage.getItem(versionKey);
      
      console.log(`  - ${key}: hasData=${hasData}, hasVersion=${hasVersion}, version=${version}`);
      
      const cachedData = this.loadFromCache(key);
      if (cachedData) {
        this.cache[key] = cachedData;
        cachedDatasets.push(key);
      } else {
        datasetsToLoad.push(key);
      }
    }
    
    if (cachedDatasets.length > 0) {
      console.log(`Found ${cachedDatasets.length} cached datasets:`, cachedDatasets.join(', '));
    }
    
    if (datasetsToLoad.length === 0) {
      console.log(`✓ All datasets loaded from cache!`);
      callback();
      return;
    }
    
    console.log(`📥 Need to download ${datasetsToLoad.length} dataset(s):`, datasetsToLoad.join(', '));
    if (datasetsToLoad.includes('global')) {
      console.log(`   Note: Global Cities is too large for localStorage cache`);
    }
    this.totalDatasets = datasetsToLoad.length;
    this.currentDatasetIndex = 0;
    
    // Load each dataset sequentially
    for (let i = 0; i < datasetsToLoad.length; i++) {
      const key = datasetsToLoad[i];
      this.currentDatasetIndex = i + 1;
      
      await new Promise((resolve) => {
        this.loadQuestions(key, (loadedData) => {
          console.log(`✓ Loaded and cached ${key}: ${loadedData.length} locations`);
          resolve();
        });
      });
    }
    
    console.log(`All datasets ready!`);
    callback();
  },

  addCustomLocation: function(location) {
    // Comprehensive validation
    if (!location || typeof location !== 'object') {
      console.error("Failed to add custom location: Data must be an object, received:", typeof location);
      return false;
    }
    
    const lat = parseFloat(location.lat);
    const lon = parseFloat(location.lon);
    
    // Validate coordinates are numbers
    if (typeof location.lat !== 'number' || typeof location.lon !== 'number' || 
        isNaN(lat) || isNaN(lon)) {
      console.error(`Failed to add custom location '${location.name || 'Unknown'}': Invalid coordinates (lat: ${location.lat}, lon: ${location.lon})`);
      return false;
    }
    
    // Validate coordinate ranges
    if (lat < -90 || lat > 90) {
      console.error(`Failed to add custom location '${location.name || 'Unknown'}': Latitude ${lat} out of range (must be -90 to 90)`);
      return false;
    }
    
    if (lon < -180 || lon > 180) {
      console.error(`Failed to add custom location '${location.name || 'Unknown'}': Longitude ${lon} out of range (must be -180 to 180)`);
      return false;
    }
    
    // Ensure all required properties exist with safe defaults
    const processedLocation = {
      name: (location.name && typeof location.name === 'string' && location.name.trim()) 
        ? location.name.trim() 
        : 'Unknown Location',
      lat: lat,
      lon: lon,
      type: (location.type && typeof location.type === 'string') 
        ? location.type.trim() 
        : 'custom',
      country: (location.country && typeof location.country === 'string') 
        ? location.country.trim() 
        : 'Unknown',
      population: (location.population && typeof location.population === 'number') 
        ? Math.max(0, Math.floor(location.population))
        : 0
    };
    
    // Add to custom dataset
    const customDataset = this.datasets.custom;
    if (!customDataset.locations) {
      customDataset.locations = [];
    }
    
    // Check if location already exists (within small tolerance for floating point)
    const COORDINATE_TOLERANCE = 0.00001;
    const exists = customDataset.locations.some(loc => 
      loc && 
      typeof loc.lat === 'number' && 
      typeof loc.lon === 'number' &&
      Math.abs(loc.lat - processedLocation.lat) < COORDINATE_TOLERANCE && 
      Math.abs(loc.lon - processedLocation.lon) < COORDINATE_TOLERANCE
    );
    
    if (exists) {
      console.warn(`Custom location '${processedLocation.name}' already exists at (${lat.toFixed(4)}, ${lon.toFixed(4)})`);
      return false;
    }
    
    try {
      customDataset.locations.push(processedLocation);
      
      // Save to localStorage with error handling
      try {
        localStorage.setItem('customLocations', 
          JSON.stringify(customDataset.locations)
        );
      } catch (storageError) {
        // Handle localStorage quota exceeded
        console.error("Failed to save custom location to browser storage:", storageError.message || storageError);
        // Remove the location we just added
        customDataset.locations.pop();
        
        if (storageError.name === 'QuotaExceededError') {
          alert('Storage Full\n\nYour browser storage is full. Please delete some old custom locations or score data to make room.');
        } else {
          alert(`Failed to save location\n\nError: ${storageError.message || 'Unknown error'}`);
        }
        return false;
      }
      
      // Update memory cache
      this.cache.custom = customDataset.locations;
      
      // If we're currently in the custom dataset, update questions array
      if (localStorage.getItem('selectedDataset') === 'custom') {
        questions = customDataset.locations;
      }
      
      return true;
    } catch (error) {
      console.error("Unexpected error adding custom location:", error.message || error, error);
      return false;
    }
  }
};

function filterAndSortLocationsByDistance(allLocations, playerLat, playerLon, maxRadiusKm) {
  let enriched = allLocations.map(loc => {
    let dist = geoUtils.calculateDistance(playerLat, playerLon, loc.lat, loc.lon);
    return { ...loc, distance: dist };
  });

  let filtered = enriched.filter(loc => 
    loc.distance <= maxRadiusKm
  );
  filtered.sort((a, b) => a.distance - b.distance);
  return filtered;
}

// Geographic calculation functions moved to geoUtils.js
// Keeping backward compatibility aliases - these reference the shared implementation:
// - getDistanceKm() -> geoUtils.calculateDistance()
// - toRad() -> geoUtils.toRadians()
