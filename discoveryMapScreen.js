// discoveryMapScreen.js
/*
Discovery map screen that provides:
- Interactive world map of discovered locations
- Location history visualization
- Score visualization per location
- Dataset filtering and statistics
*/ 
/*jshint esversion: 9*/

let discoveryMap = {
  map: null,
  markers: [],
  infoWindow: null,
  colorSelect: null,
  paths: [],  
  mapElement: null,
  styleElement: null,
  themeObserver: null,
  storageHandler: null,
  playerMarker: null,
  
  initialize() {
    if (!mapsApi.ensureReady()) return false;
    try {
      if (!this.map) {
        const offset = getCanvasOffset();
        const mapDiv = createDiv('');
        this.mapElement = mapDiv;
        mapDiv.id('discoveryMap');
        mapDiv.size(width, height*0.75);
        mapDiv.position(offset.x, height*0.25);

        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

        this.map = new google.maps.Map(mapDiv.elt, {
          zoom: 2,
          center: { lat: 20, lng: 0 },
          streetViewControl: false,
          fullscreenControl: false,
          disableDefaultUI: true,
          keyboardShortcuts: false,
          backgroundColor: isDark ? '#212121' : '#f5f5f5',
          mapTypeId: mapSettingsScreen.settings.satelliteView ? 'hybrid' : 'roadmap',
          styles: mapSettingsScreen.getMapStyles()
        });

        // Add custom styles for info windows and controls
        const style = document.createElement('style');
        style.textContent = `
          .gm-style .gm-style-iw-c {
            background-color: var(--background-color) !important;
            padding: 12px !important;
            padding-top: 0px !important;
            margin-top: -12px !important;
          }
          .gm-style .gm-style-iw-d {
            overflow: hidden !important;
            background-color: var(--background-color) !important;
            padding-top: 0px !important;
            margin-top: 0px !important;
          }
          .gm-style .gm-style-iw-t::after {
            background: var(--background-color) !important;
          }
          .gm-ui-hover-effect {
            top: 0px !important;
            right: 0px !important;
            opacity: 0.8 !important;
          }
          .gm-ui-hover-effect img {
            filter: var(--theme-filter) !important;
          }
          .custom-map-control select {
            background-color: var(--button-bg) !important;
            color: var(--button-text) !important;
            border: none !important;
            padding: 8px !important;
            border-radius: 8px !important;
            cursor: pointer !important;
            font-size: 16px !important;
            -webkit-appearance: none !important;
            -moz-appearance: none !important;
            appearance: none !important;
            width: 150px !important;
          }
          .custom-map-control select:focus {
            outline: none !important;
          }
          .custom-map-control select option {
            background-color: var(--background-color) !important;
            color: var(--text-color) !important;
            padding: 8px !important;
          }
        `;
        document.head.appendChild(style);
        this.styleElement = style;

        // Add color mode controls as a map control
        const colorModeDiv = document.createElement('div');
        colorModeDiv.className = 'custom-map-control';
        colorModeDiv.style.backgroundColor = 'transparent';
        colorModeDiv.style.padding = '8px';
        colorModeDiv.style.margin = '10px';

        const select = document.createElement('select');

        const options = [
          { value: 'best', text: 'Best Score' },
          { value: 'last', text: 'Last Score' },
          { value: 'average', text: 'Average Score' },
          { value: 'distance', text: 'Distance Score' },
          { value: 'direction', text: 'Direction Score' }
        ];

        options.forEach(opt => {
          const option = document.createElement('option');
          option.value = opt.value;
          option.text = opt.text;
          select.appendChild(option);
        });

        select.value = progressStore.getSetting('markerColorMode', 'best');
        select.addEventListener('change', () => {
          progressStore.setSetting('markerColorMode', select.value);
          this.updateMarkers();
        });

        colorModeDiv.appendChild(select);
        this.map.controls[google.maps.ControlPosition.TOP_LEFT].push(colorModeDiv);

        // Update map when settings change
        this.storageHandler = (e) => {
          if (e.key === 'mapSettings') {
          const settings = progressStore.readJSON('mapSettings', {});
            mapSettingsScreen.settings = { ...mapSettingsScreen.settings, ...settings };
            this.map?.setMapTypeId(mapSettingsScreen.settings.satelliteView ? 'hybrid' : 'roadmap');
            this.map?.setOptions({ styles: mapSettingsScreen.getMapStyles() });
          }
        };
        window.addEventListener('storage', this.storageHandler);

        // Update map when theme changes
        this.themeObserver = new MutationObserver((mutations) => {
          mutations.forEach((mutation) => {
            if (mutation.attributeName === 'data-theme' && this.map) {
              const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
              this.map.setOptions({
                backgroundColor: isDark ? '#212121' : '#f5f5f5',
                styles: mapSettingsScreen.getMapStyles()
              });
            }
          });
        });

        this.themeObserver.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ['data-theme']
        });

        // Add player location if enabled
        if (mapSettingsScreen.settings.showPlayerLocation && playerLocation) {
          this.playerMarker = new google.maps.Marker({
            position: { lat: playerLocation.lat, lng: playerLocation.lon },
            map: this.map,
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              scale: 8,
              fillColor: '#4285F4',
              fillOpacity: 0.7,
              strokeWeight: 2,
              strokeColor: '#FFFFFF'
            },
            title: 'Your Location'
          });
        }
      }

      this.updateMarkers();
      return true;
    } catch (error) {
      this.remove();
      mapsApi.setError(error);
      return false;
    }
  },
  
  buildInfoContent(location, scores, averages, markerColor) {
    const header = document.createElement('div');
    header.textContent = location.name;
    Object.assign(header.style, { color: getScoreHexForMap(markerColor).replace('0x', '#'), fontSize: '20px', fontWeight: 'bold' });
    const content = document.createElement('div');
    Object.assign(content.style, { maxWidth: '230px', color: 'var(--text-color)' });
    const line = text => {
      const paragraph = document.createElement('p');
      paragraph.style.margin = '4px 0';
      paragraph.textContent = text;
      content.appendChild(paragraph);
    };
    line(location.country);
    line('Best Score: ' + location.bestScore + '%');
    line('Last Score: ' + location.lastScore + '%');
    line('Average: ' + (averages.score === null ? '—' : averages.score + '%'));
    line('Distance: ' + (averages.distance === null ? '—' : averages.distance + '%'));
    line('Direction: ' + (averages.direction === null ? '—' : averages.direction + '%'));
    line('Played: ' + location.plays + ' times');
    if (scores.length) {
      const latest = scores[0];
      line('Last Attempt: ' + new Date(latest.timestamp).toLocaleString());
      line('Guessed: ' + geoUtils.formatDistance(latest.distance.guess) + ', ' + Math.round(latest.direction.guess) % 360 + '°');
      line('Actual: ' + geoUtils.formatDistance(latest.distance.actual) + ', ' + Math.round(latest.direction.actual) % 360 + '°');
      line('Off by ' + geoUtils.formatDistance(latest.distance.error));
    }
    return { header, content };
  },

  updateMarkers() {
    this.markers.forEach(marker => marker.setMap(null));
    this.paths.forEach(path => path.setMap(null));
    this.markers = [];
    this.paths = [];
    if (!this.map) return;

    const dataset = dataLoader.getSelectedDataset();
    const locations = scoringService.getDiscoveredLocations(dataset);
    const byLocation = new Map();
    for (const score of scoringService.getScores()) {
      if (score.dataset !== dataset) continue;
      if (!byLocation.has(score.locationId)) byLocation.set(score.locationId, []);
      byLocation.get(score.locationId).push(score);
    }
    const mode = progressStore.getSetting('markerColorMode', 'best');
    for (const location of locations) {
      const scores = (byLocation.get(location.id) || []).sort((a, b) => b.timestamp - a.timestamp);
      const average = getter => scores.length ? Math.round(scores.reduce((sum, score) => sum + getter(score), 0) / scores.length) : null;
      const averages = { score: average(score => score.score), distance: average(score => score.distance.score),
        direction: average(score => score.direction.score) };
      const choices = { best: location.bestScore, last: location.lastScore, average: averages.score,
        distance: averages.distance, direction: averages.direction };
      const markerColor = choices[mode] ?? location.lastScore;
      const marker = new google.maps.Marker({
        position: { lat: location.lat, lng: location.lon }, map: this.map, cursor: 'pointer',
        icon: { path: google.maps.SymbolPath.CIRCLE, scale: 10,
          fillColor: getScoreHexForMap(markerColor).replace('0x', '#'), fillOpacity: 0.7, strokeOpacity: 0 }
      });
      const { header, content } = this.buildInfoContent(location, scores, averages, markerColor);
      marker.addListener('click', () => {
        this.paths.forEach(path => path.setMap(null));
        this.paths = [];
        this.infoWindow?.close();
        this.infoWindow = new google.maps.InfoWindow({ content, headerContent: header, disableAutoPan: true });
        this.infoWindow.open(this.map, marker);
        for (const score of scores) {
          this.paths.push(new google.maps.Polyline({
            path: [{ lat: score.guess.calculatedPoint.lat, lng: score.guess.calculatedPoint.lon },
              { lat: score.location.lat, lng: score.location.lon }],
            geodesic: true, strokeColor: getScoreHexForMap(score.score).replace('0x', '#'),
            strokeOpacity: 0.3, strokeWeight: 2, map: this.map
          }));
        }
      });
      this.markers.push(marker);
    }
  },
  
  remove() {
    this.infoWindow?.close();
    this.paths.forEach(p => p.setMap(null));
    this.paths = [];
    this.markers.forEach(marker => marker.setMap(null));
    this.playerMarker?.setMap(null);
    this.themeObserver?.disconnect();
    if (this.storageHandler) window.removeEventListener('storage', this.storageHandler);
    this.styleElement?.remove();
    this.mapElement?.remove();
    this.mapElement = null;
    this.styleElement = null;
    this.themeObserver = null;
    this.storageHandler = null;
    this.playerMarker = null;
    this.map = null;
    this.markers = [];
    this.infoWindow = null;
  }
  
};

function drawDiscoveryMapScreen() {
  if (!mapsApi.ensureReady() && discoveryMap.map) discoveryMap.remove();
  // Initialize map if needed
  if (!discoveryMap.map) {
    discoveryMap.initialize();
    if (!discoveryMap.map) mapsApi.drawStatus(0, height*0.25, width, height*0.75);
  }

  // Draw header
  fill(getTextColor());
  noStroke();
  textAlign(CENTER);
  textSize(32);
  text("Discovered Locations", width/2, height/8);
  
  const currentDataset = dataLoader.getSelectedDataset();
  const locations = scoringService.getDiscoveredLocations(currentDataset);
  
  textSize(20);
  // Show loading indicator if data is being loaded
  if (dataLoader.isLoading) {
    // Draw progress bar using reusable component
    // Position it below the header text
    drawLoadingProgressBar(width/2, height/8 + 60, width * 0.5);
  } else {
    text(`${locations.length} in ${dataLoader.datasets[currentDataset].name}`, 
      width/2, height/8 + 40);
  }
    
  // Draw dropdown menu
  dropdownMenu.draw('discoveries');

  if (drawCloseButton()) {
    discoveryMap.remove();
    return;
  }
} 
