// interactiveMap.js
/*
Interactive map component that handles:
- Map initialization and display
- Path and marker rendering
- Score visualization
- Map style management
- iOS compatibility fixes
*/
let interactiveMap = {
  map: null,
  mapElement: null,
  paths: [],
  markers: [],
  isLoaded: false,
  lastBounds: null,
  container: null,
  themeObserver: null,
  styleElement: null,
  idleListener: null,
  playerMarker: null,
  pendingAnswer: null,

  initialize(x, y, w, h) {
    if (!mapsApi.ensureReady()) return false;
    if (!this.mapElement) {
      const offset = getCanvasOffset();
      
      this.container = createDiv('');
      this.container.class('map-container');
      this.container.position(x + offset.x, y);
      this.container.size(w, h);
      
      this.mapElement = createDiv('');
      this.mapElement.parent(this.container);
      this.mapElement.size(w, h);
      this.mapElement.id('map');
    }

    const offset = getCanvasOffset();
    this.container.position(x + offset.x, y);
    this.container.size(w, h);
    this.mapElement.size(w, h);
    
    if (this.map) {
      google.maps.event.trigger(this.map, 'resize');
      if (this.lastBounds) {
        this.map.fitBounds(this.lastBounds);
      }
    }
    
    try {
      return this.map ? true : this.createMap();
    } catch (error) {
      this.remove();
      mapsApi.setError(error);
      return false;
    }
  },

  createMap() {
    if (!mapsApi.isReady()) return false;

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const mapOptions = {
      zoom: 4,
      center: { lat: 0, lng: 0 },
      disableDefaultUI: true,
      keyboardShortcuts: false,
      gestureHandling: 'greedy',
      clickableIcons: false,
      scrollwheel: true,
      backgroundColor: isDark ? '#212121' : '#f5f5f5',
      mapTypeId: mapSettingsScreen.settings.satelliteView ? 'hybrid' : 'roadmap',
      styles: mapSettingsScreen.getMapStyles()
    };

    this.map = new google.maps.Map(this.mapElement.elt, mapOptions);
    this.isLoaded = false;
    
    // Add custom styles for map background
    const mapStyle = document.createElement('style');
    mapStyle.textContent = `
      .gm-style {
        background-color: var(--background-color) !important;
      }
      .gm-style > div {
        background-color: var(--background-color) !important;
      }
    `;
    document.head.appendChild(mapStyle);
    this.styleElement = mapStyle;

    // Update map styles when theme changes
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

    // Add player location marker if enabled
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

    const createdMap = this.map;
    this.idleListener = google.maps.event.addListenerOnce(this.map, 'idle', () => {
      if (this.map !== createdMap) return;
      this.isLoaded = true;
      if (this.pendingAnswer) this.drawAnswer(this.pendingAnswer);
    });

    return true;
  },

  drawAnswer(answer) {
    this.pendingAnswer = answer;
    if (!this.map || !this.isLoaded) return;

    this.clearMap();
    
    const playerPos = { lat: answer.playerLat, lng: answer.playerLon };
    const targetPos = { lat: answer.targetLat, lng: answer.targetLon };
    const guessPos = computeDestinationLatLon(
      answer.playerLat,
      answer.playerLon,
      answer.guessDistance,
      answer.guessDirection
    );
    guessPos.lng = guessPos.lon;

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const mainLineColor = isDark ? '#FFFFFF' : '#000000';

    // Add marker
    const marker = new google.maps.Marker({
      position: targetPos,
      map: this.map
    });
    
    this.markers.push(marker);

    this.paths.push(new google.maps.Polyline({
      path: [playerPos, guessPos],
      geodesic: true,
      strokeColor: getScoreHexForMap(answer.score2).replace('0x', '#'),
      strokeOpacity: 1.0,
      strokeWeight: 3,
      map: this.map
    }));

    this.paths.push(new google.maps.Polyline({
      path: [guessPos, targetPos],
      geodesic: true,
      strokeColor: mainLineColor,
      strokeOpacity: 0.2,
      strokeWeight: 1,
      map: this.map
    }));

    // Fit bounds
    const bounds = new google.maps.LatLngBounds();
    bounds.extend(playerPos);
    bounds.extend(targetPos);
    bounds.extend(guessPos);

    this.lastBounds = bounds;
    this.map.fitBounds(bounds, { padding: 50 });
  },

  clearMap() {
    this.markers.forEach(marker => marker.setMap(null));
    this.paths.forEach(path => path.setMap(null));
    this.markers = [];
    this.paths = [];
  },

  remove() {
    this.clearMap();
    this.playerMarker?.setMap(null);
    this.idleListener?.remove();
    this.themeObserver?.disconnect();
    this.styleElement?.remove();
    this.container?.remove();
    this.container = null;
    this.mapElement = null;
    this.map = null;
    this.playerMarker = null;
    this.idleListener = null;
    this.themeObserver = null;
    this.styleElement = null;
    this.isLoaded = false;
    this.lastBounds = null;
    this.pendingAnswer = null;
  },

  updatePaths(answer) {
    // Clear existing paths
    this.paths.forEach(path => path.setMap(null));
    this.paths = [];

    const playerPos = { lat: answer.playerLat, lng: answer.playerLon };
    const targetPos = { lat: answer.targetLat, lng: answer.targetLon };
    const guessPos = computeDestinationLatLon(
      answer.playerLat,
      answer.playerLon,
      answer.guessDistance,
      answer.guessDirection
    );
    guessPos.lng = guessPos.lon;

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const mainLineColor = isDark ? '#FFFFFF' : '#000000';

    // Add paths without updating markers
    this.paths.push(new google.maps.Polyline({
      path: [playerPos, guessPos],
      geodesic: true,
      strokeColor: getScoreHexForMap(answer.score2).replace('0x', '#'),
      strokeOpacity: 1.0,
      strokeWeight: 3,
      map: this.map
    }));

    this.paths.push(new google.maps.Polyline({
      path: [guessPos, targetPos],
      geodesic: true,
      strokeColor: mainLineColor,
      strokeOpacity: 0.2,
      strokeWeight: 1,
      map: this.map
    }));
  }
};
