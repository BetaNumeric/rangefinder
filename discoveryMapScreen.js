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
  
  initialize() {
    if (!this.map) {
      const offset = getCanvasOffset();
      const mapDiv = createDiv('');
      mapDiv.id('discoveryMap');
      mapDiv.style('width', '100%');
      mapDiv.style('height', '75%');
      mapDiv.position(0, height*0.25);
      
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

      // Add color mode controls as a map control
      const colorModeDiv = document.createElement('div');
      colorModeDiv.className = 'custom-map-control';
      colorModeDiv.style.backgroundColor = 'transparent';
      colorModeDiv.style.padding = '8px';
      colorModeDiv.style.margin = '10px';
      
      const select = document.createElement('select');
      
      const options = [
        { value: 'best', text: 'Best Score' },
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
      
      select.value = localStorage.getItem('markerColorMode') || 'best';
      select.addEventListener('change', () => {
        localStorage.setItem('markerColorMode', select.value);
        this.updateMarkers();
      });
      
      colorModeDiv.appendChild(select);
      this.map.controls[google.maps.ControlPosition.TOP_LEFT].push(colorModeDiv);

      // Update map when settings change
      window.addEventListener('storage', (e) => {
        if (e.key === 'mapSettings') {
          const settings = JSON.parse(e.newValue || '{}');
          mapSettingsScreen.settings = { ...mapSettingsScreen.settings, ...settings };
          this.map.setMapTypeId(mapSettingsScreen.settings.satelliteView ? 'hybrid' : 'roadmap');
          this.map.setOptions({ styles: mapSettingsScreen.getMapStyles() });
        }
      });

      // Update map when theme changes
      const themeObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.attributeName === 'data-theme') {
            const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
            this.map.setOptions({
              backgroundColor: isDark ? '#212121' : '#f5f5f5',
              styles: mapSettingsScreen.getMapStyles()
            });
          }
        });
      });
      
      themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-theme']
      });

      // Add player location if enabled
      if (mapSettingsScreen.settings.showPlayerLocation && playerLocation) {
        new google.maps.Marker({
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
  },
  
  updateMarkers() {
    // Clear existing markers and paths
    this.markers.forEach(m => m.setMap(null));
    this.markers = [];
    this.paths.forEach(p => p.setMap(null));
    this.paths = [];
    
    const currentDataset = localStorage.getItem('selectedDataset') || 'global';
    const locations = scoringService.getDiscoveredLocations(currentDataset);
    const scores = scoringService.getScores()
      .filter(s => s.dataset === currentDataset);
    
    locations.forEach(loc => {
      const locationScores = scores
        .filter(s => s.locationName === loc.name)
        .sort((a, b) => b.score - a.score);
      
      const avgScore = Math.round(
        locationScores.reduce((sum, s) => sum + s.score, 0) / locationScores.length
      );
      
      const avgDistanceScore = Math.round(
        locationScores.reduce((sum, s) => sum + (s.distance ? s.distance.score : 0), 0) / locationScores.length
      );
      
      const avgDirectionScore = Math.round(
        locationScores.reduce((sum, s) => sum + (s.direction ? s.direction.score : 0), 0) / locationScores.length
      );
      
      const colorMode = localStorage.getItem('markerColorMode') || 'best';
      let markerColor;
      switch(colorMode) {
        case 'average': markerColor = avgScore; break;
        case 'distance': markerColor = avgDistanceScore; break;
        case 'direction': markerColor = avgDirectionScore; break;
        default: markerColor = loc.bestScore;
      }
      
      const marker = new google.maps.Marker({
        position: { lat: loc.lat, lng: loc.lon },
        map: this.map,
        cursor: 'pointer',
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: getScoreHexForMap(markerColor).replace('0x', '#'),
          fillOpacity: 0.7,
          strokeOpacity: 0.0,
          //strokeWeight: 2,
          //strokeColor: document.documentElement.getAttribute('data-theme') === 'dark' ? '#FFFFFF' : '#000000'
        }
      });
      
      const headerElement = document.createElement('div');
      headerElement.innerHTML = `
        <header style="
          color: ${getScoreHexForMap(markerColor).replace('0x', '#')};
          padding: 0px;
          font-size: 20px;
          font-weight: bold;
        ">
          ${loc.name}
        </header>
      `;
      
      const contentString = `
        <div style="
          padding: 0px;
          max-width: 200px;
          color: var(--text-color);
        ">
          <p style="margin: 4px 0;">
            ${loc.country}<br>
            Best Score: <span style="color: ${getScoreHexForMap(loc.bestScore).replace('0x', '#')}">
              ${loc.bestScore}%
            </span><br>
            Average: ${avgScore}%<br>
            Distance: ${avgDistanceScore || 0}%<br>
            Direction: ${avgDirectionScore}%<br>
            Played: ${loc.plays} times
          </p>
          ${locationScores.length > 0 ? `
            <div style="margin-top: 8px; border-top: 1px solid var(--button-bg); padding-top: 8px;">
              <strong>Last Attempt:</strong><br>
              ${new Date(locationScores[0].timestamp).toLocaleString()}<br>
              <span style="color: ${getScoreHexForMap(locationScores[0].score).replace('0x', '#')}">
                ${locationScores[0].score}%
              </span><br>
              <small>
                Guessed: ${Math.round(locationScores[0].distance.guess)}km ${Math.round(locationScores[0].direction.guess)}°
                (${Math.round(locationScores[0].guess.calculatedPoint.lat * 100) / 100}, 
                 ${Math.round(locationScores[0].guess.calculatedPoint.lon * 100) / 100})
                <br>
                Actual: ${Math.round(locationScores[0].distance.actual)}km ${Math.round(locationScores[0].direction.actual)}°
              </small>
            </div>
          ` : ''}
        </div>
      `;
      
      marker.addListener('click', () => {
        // Clear previous paths
        this.paths.forEach(p => p.setMap(null));
        this.paths = [];
        
        if (this.infoWindow) this.infoWindow.close();
        this.infoWindow = new google.maps.InfoWindow({
          content: contentString,
          headerContent: headerElement,
          disableAutoPan: true
        });
        this.infoWindow.open(this.map, marker);

        // Draw paths for all attempts with decreasing opacity
        locationScores.forEach((s, idx) => {
          const guessPos = { 
            lat: s.guess.calculatedPoint.lat, 
            lng: s.guess.calculatedPoint.lon 
          };
          const targetPos = { lat: s.location.lat, lng: s.location.lon };

          // Path from guess to actual location
          this.paths.push(new google.maps.Polyline({
            path: [guessPos, targetPos],
            geodesic: true,
            strokeColor: getScoreHexForMap(s.score).replace('0x', '#'),
            strokeOpacity: Math.max(0.1, 0.8 - (idx * 0.1)),  
            strokeWeight: Math.max(2, 5 - idx), 
            map: this.map
          }));
        });
      });
      
      this.markers.push(marker);
    });
  },
  
  remove() {
    if (this.map) {
      if (this.infoWindow) {
        this.infoWindow.close();
      }
      this.paths.forEach(p => p.setMap(null));
      this.paths = [];
      const mapDiv = select('#discoveryMap');
      if (mapDiv) {
        mapDiv.remove();
      }
      this.map = null;
      this.markers = [];
      this.infoWindow = null;
    }
  }
  
};

function drawDiscoveryMapScreen() {



  // Initialize map if needed
  if (!discoveryMap.map) {
    discoveryMap.initialize();
  }

  // Draw header
  fill(getTextColor());
  noStroke();
  textAlign(CENTER);
  textSize(32);
  text("Discovered Locations", width/2, height/8);
  
  const currentDataset = localStorage.getItem('selectedDataset') || 'global';
  const locations = scoringService.getDiscoveredLocations(currentDataset);
  
  textSize(20);
  text(`${locations.length} in ${dataLoader.datasets[currentDataset].name}`, 
    width/2, height/8 + 40);
    
    
  // Draw dropdown menu
  dropdownMenu.draw('discoveries');

  if (drawCloseButton()) {
    discoveryMap.remove();
    return;
  }
    
} 
