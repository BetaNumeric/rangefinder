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

  loadQuestions: function(datasetKey, callback = () => {}) {
    this.isLoading = true;
    const dataset = this.datasets[datasetKey];
    if (!dataset) {
      console.error("Invalid dataset key:", datasetKey);
      this.isLoading = false;
      callback([]);
      return;
    }

    // Calculate appropriate radius based on max distance
    const calculateDefaultRadius = (locations) => {
      if (!locations || locations.length === 0 || !playerLocation) {
        console.log("Using default radius - no locations or player location");
        return dataset.defaultRadius;
      }
      
      // Find max distance
      let maxDist = 0;
      let validDistanceFound = false;
      
      locations.forEach(loc => {
        if (typeof loc.lat === 'number' && typeof loc.lon === 'number' &&
            !isNaN(loc.lat) && !isNaN(loc.lon)) {
          const dist = getDistanceKm(playerLocation.lat, playerLocation.lon, loc.lat, loc.lon);
          if (!isNaN(dist)) {
            maxDist = Math.max(maxDist, dist);
            validDistanceFound = true;
          }
        }
      });
      
      // If no valid distances were found, use default
      if (!validDistanceFound || maxDist === 0) {
        console.log("Using default radius - no valid distances calculated");
        return dataset.defaultRadius;
      }
      
      // Round up to nice numbers
      if (maxDist <= 10){ return Math.ceil(maxDist / 1) * 1; } 
      if (maxDist <= 100){ return Math.ceil(maxDist / 10) * 10; } 
      if (maxDist <= 1000){ return Math.ceil(maxDist / 100) * 100; } 
      return Math.ceil(maxDist / 1000) * 1000; 
    };

    // Handle custom dataset differently
    if (datasetKey === 'custom') {
      // Load saved custom locations from localStorage
      const savedLocations = localStorage.getItem('customLocations');
      if (savedLocations) {
        dataset.locations = JSON.parse(savedLocations);
      } else {
        dataset.locations = [];
      }
      
      // Set radius based on locations
      userSettings.radius = calculateDefaultRadius(dataset.locations);
      
      this.isLoading = false;
      callback(dataset.locations);
      return;
    }

    // Regular CSV dataset loading
    fetch(dataset.url)
      .then(response => response.text())
      .then(text => {
        const rows = text.trim().split("\n");
        let result = [];
        
        for (let i = 1; i < rows.length; i++) {
          let cols = rows[i].split(",");
          let obj = {
            name: cols[0].trim(),
            lat: parseFloat(cols[1]),
            lon: parseFloat(cols[2]),
            type: cols[3].trim(),
            country: cols[4].trim(),
            population: parseInt(cols[5]) || 0
          };
          result.push(obj);
        }
        
        // Set radius based on loaded locations
        userSettings.radius = calculateDefaultRadius(result);
        
        this.isLoading = false;
        callback(result);
      })
      .catch(err => {
        console.error("Error loading location data (try reloading)", err);
        this.isLoading = false;
        callback([]);
      });
  },

  addCustomLocation: function(location) {
    if (!location || typeof location.lat !== 'number' || typeof location.lon !== 'number') {
      console.warn("Invalid location data:", location);
      return; 
    }
    
    // Ensure all required properties exist with defaults if needed
    const processedLocation = {
      name: location.name || 'Unknown Location',
      lat: location.lat,
      lon: location.lon,
      type: location.type || 'custom',
      country: location.country || 'Unknown',
      population: location.population || 0
    };
    
    // Add to custom dataset
    const customDataset = this.datasets.custom;
    if (!customDataset.locations) {
      customDataset.locations = [];
    }
    
    // Check if location already exists
    const exists = customDataset.locations.some(loc => 
      loc && 
      typeof loc.lat === 'number' && 
      typeof loc.lon === 'number' &&
      loc.lat === processedLocation.lat && 
      loc.lon === processedLocation.lon
    );
    
    if (!exists) {
      customDataset.locations.push(processedLocation);
      // Save to localStorage
      localStorage.setItem('customLocations', 
        JSON.stringify(customDataset.locations)
      );
      
      // If we're currently in the custom dataset, update questions array
      if (localStorage.getItem('selectedDataset') === 'custom') {
        questions = customDataset.locations;
      }
    }
  }
};

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

  let a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(rLat1) * Math.cos(rLat2) *
          Math.sin(dLon / 2) * Math.sin(dLon / 2);
  let c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(value) {
  return value * Math.PI / 180;
}
