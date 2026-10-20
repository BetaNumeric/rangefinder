// One API loader shared by answer maps, discoveries, previews, and search.
let mapsApi = {
  state: 'idle',
  ready: null,
  timer: null,
  resolve: null,
  script: null,

  isReady() {
    return this.state === 'ready' && !!window.google && typeof google.maps?.Map === 'function';
  },

  finish(success) {
    clearTimeout(this.timer);
    this.state = success ? 'ready' : 'error';
    if (this.resolve) this.resolve(success);
    this.resolve = null;
  },

  load() {
    if (this.isReady()) return Promise.resolve(true);
    if (this.state === 'loading') return this.ready;
    const key = window.RANGEFINDER_CONFIG?.googleMapsApiKey;
    if (!key) {
      this.state = 'error';
      return Promise.resolve(false);
    }
    this.state = 'loading';
    this.ready = new Promise(resolve => { this.resolve = resolve; });
    if (this.script) this.script.remove();
    this.script = document.createElement('script');
    this.script.async = true;
    this.script.src = 'https://maps.googleapis.com/maps/api/js?' + new URLSearchParams({
      key, libraries: 'places,marker', loading: 'async', callback: 'initMap'
    });
    this.script.onerror = () => this.finish(false);
    this.timer = setTimeout(() => this.finish(false), 15000);
    document.head.appendChild(this.script);
    return this.ready;
  }
};

window.initMap = () => mapsApi.finish(true);
window.gm_authFailure = () => mapsApi.finish(false);
mapsApi.load();
