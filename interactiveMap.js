let interactiveMap = {
  map: null,
  mapElement: null,
  container: null,
  paths: [],
  markers: [],
  observer: null,
  layout: null,
  error: false,

  initialize(x, y, w, h) {
    if (!mapsApi.isReady()) {
      if (this.map) this.remove();
      return false;
    }
    if (this.error) return false;
    if (!this.container) {
      this.container = createDiv('');
      this.container.class('map-container');
      this.mapElement = createDiv('');
      this.mapElement.parent(this.container);
      this.mapElement.id('map');
    }
    const offset = getCanvasOffset();
    const layout = [x + offset.x, y, w, h].join(',');
    const resized = layout !== this.layout;
    if (resized) {
      this.container.position(x + offset.x, y);
      this.container.size(w, h);
      this.mapElement.size(w, h);
      this.layout = layout;
    }
    if (!this.map) {
      try { this.createMap(); }
      catch (error) {
        console.error('Map initialization failed:', error);
        this.remove();
        this.error = true;
        return false;
      }
    } else if (resized) google.maps.event.trigger(this.map, 'resize');
    return !!this.map;
  },

  createMap() {
    this.map = new google.maps.Map(this.mapElement.elt, {
      zoom: 4,
      center: { lat: 0, lng: 0 },
      disableDefaultUI: true,
      keyboardShortcuts: false,
      gestureHandling: 'greedy',
      clickableIcons: false,
      backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--background-color'),
      mapTypeId: mapSettingsScreen.settings.satelliteView ? 'hybrid' : 'roadmap',
      styles: mapSettingsScreen.getMapStyles()
    });
    this.observer = new MutationObserver(() => {
      if (!this.map) return;
      this.map.setOptions({
        backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--background-color'),
        styles: mapSettingsScreen.getMapStyles()
      });
      if (currentScreen === 'answer') this.drawAnswer(currentAnswer);
    });
    this.observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  },

  drawAnswer(answer, fitBounds = true) {
    if (!this.map) return;
    this.clearMap();
    const player = { lat: answer.playerLat, lng: answer.playerLon };
    const target = { lat: answer.targetLat, lng: answer.targetLon };
    const point = computeDestinationLatLon(answer.playerLat, answer.playerLon, answer.guessDistance, answer.guessDirection);
    const guess = { lat: point.lat, lng: point.lon };
    const guessColor = getScoreHexForMap(answer.score2).replace('0x', '#');
    const lineColor = document.documentElement.getAttribute('data-theme') === 'dark' ? '#FFFFFF' : '#000000';
    this.markers.push(new google.maps.Marker({ position: target, map: this.map, title: answer.locationName }));
    this.markers.push(new google.maps.Marker({
      position: guess, map: this.map, title: 'Your guess',
      icon: { path: google.maps.SymbolPath.CIRCLE, scale: 6, fillColor: guessColor, fillOpacity: 1, strokeWeight: 1 }
    }));
    if (mapSettingsScreen.settings.showPlayerLocation) {
      this.markers.push(new google.maps.Marker({
        position: player, map: this.map, title: 'Round starting position',
        icon: { path: google.maps.SymbolPath.CIRCLE, scale: 7, fillColor: '#4285F4', fillOpacity: 1, strokeWeight: 2, strokeColor: '#FFFFFF' }
      }));
    }
    [[player, guess, guessColor, 3, 1], [guess, target, lineColor, 1, 0.3]].forEach(([from, to, color, weight, opacity]) => {
      this.paths.push(new google.maps.Polyline({
        path: [from, to], geodesic: true, map: this.map,
        strokeColor: color, strokeWeight: weight, strokeOpacity: opacity
      }));
    });
    if (fitBounds) {
      const bounds = new google.maps.LatLngBounds();
      [player, target, guess].forEach(position => bounds.extend(position));
      this.map.fitBounds(bounds, 30);
    }
  },

  updatePaths(answer) {
    this.drawAnswer(answer, false);
  },

  clearMap() {
    this.markers.forEach(marker => marker.setMap(null));
    this.paths.forEach(path => path.setMap(null));
    this.markers = [];
    this.paths = [];
  },

  remove() {
    if (this.observer) this.observer.disconnect();
    this.observer = null;
    this.clearMap();
    if (this.map) google.maps.event.clearInstanceListeners(this.map);
    if (this.container) this.container.remove();
    this.container = this.mapElement = this.map = this.layout = null;
    this.error = false;
  }
};

function drawMapStatus(x, y, w, h) {
  push();
  fill(getTextColor());
  noStroke();
  textSize(16);
  textAlign(CENTER, CENTER);
  text(mapsApi.state === 'loading' ? 'Loading map…' : 'Maps are unavailable. You can still play.', x + w / 2, y + h / 3);
  if (mapsApi.state !== 'loading') {
    drawInteractiveButton(x + w / 2 - 65, y + h / 2, 130, 44, 'Retry map', () => {
      staticMapImg = null;
      staticMapError = false;
      interactiveMap.remove();
      mapInitialized = false;
      mapsApi.load();
    });
  }
  pop();
}
