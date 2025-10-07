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
  initAttempts: 0,
  maxInitAttempts: 5,

  initialize(x, y, w, h) {
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
      
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      
      if (isIOS) {
        this.tryCreateMapForIOS();
        return true;
      } else if (!googleMapsLoaded) {
        return false;
      }
      
      return this.createMap();
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
    
    return true;
  },

  tryCreateMapForIOS() {
    if (this.initAttempts >= this.maxInitAttempts) {
      return;
    }

    if (!google || !google.maps) {
      this.initAttempts++;
      setTimeout(() => this.tryCreateMapForIOS(), 500);
      return;
    }

    try {
      const success = this.createMap();
      if (!success) {
        this.initAttempts++;
        setTimeout(() => this.tryCreateMapForIOS(), 500);
      }
    } catch (error) {
      this.initAttempts++;
      setTimeout(() => this.tryCreateMapForIOS(), 500);
    }
  },

  createMap() {
    if (!google || !google.maps) {
      return false;
    }

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

    // Update map styles when theme changes
    const observer = new MutationObserver((mutations) => {
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
    
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme']
    });

    // Add player location marker if enabled
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

    google.maps.event.addListenerOnce(this.map, 'idle', () => {
      this.isLoaded = true;
      if (currentAnswer && currentAnswer.targetLat) {
        this.drawAnswer(currentAnswer);
      }
    });

    return true;
  },

  drawAnswer(answer) {
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
    if (this.mapElement) {
      this.container.remove();
      this.container = null;
      this.mapElement = null;
      this.map = null;
    }
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
