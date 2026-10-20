// One loader for maps and Places. A failed request must not stop the game loop.
const mapsApi = {
  state: 'idle',
  error: null,
  promise: null,
  script: null,
  timeoutMs: 20000,

  getApiKey() {
    return window.RANGEFINDER_CONFIG?.googleMapsApiKey?.trim() || '';
  },

  isReady() {
    return this.state === 'ready' && typeof window.google?.maps?.Map === 'function';
  },

  ensureReady() {
    if (this.state === 'idle') this.load();
    return this.isReady();
  },

  setError(error) {
    this.state = 'error';
    this.error = error;
    console.warn('Google Maps unavailable:', error.message || error);
  },

  load({ retry = false } = {}) {
    if (this.state === 'loading' || (this.promise && !retry)) return this.promise;
    const apiKey = this.getApiKey();
    if (!apiKey) {
      this.setError(new Error('GOOGLE_MAPS_JS_API_KEY is not configured.'));
      this.promise = Promise.resolve(false);
      return this.promise;
    }

    this.script?.remove();
    this.state = 'loading';
    this.error = null;
    this.promise = new Promise(resolve => {
      let finished = false;
      const finish = (success, error) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        if (success) this.state = 'ready';
        else this.setError(error);
        resolve(success);
      };
      const timer = setTimeout(() => finish(false, new Error('Google Maps loading timed out.')), this.timeoutMs);
      window.rangefinderMapsReady = () => {
        const ready = typeof window.google?.maps?.Map === 'function';
        finish(ready, new Error('Google Maps did not initialize.'));
      };
      window.gm_authFailure = () => {
        const error = new Error('Google Maps rejected the API key or its restrictions.');
        // Authentication can fail after the script's callback has already fired.
        this.setError(error);
        finish(false, error);
      };

      const script = document.createElement('script');
      const url = new URL('https://maps.googleapis.com/maps/api/js');
      url.search = new URLSearchParams({ key: apiKey, libraries: 'places', loading: 'async',
        callback: 'rangefinderMapsReady', v: 'weekly' });
      script.src = url.href;
      script.async = true;
      script.onerror = () => finish(false, new Error('Google Maps could not be downloaded.'));
      this.script = script;
      document.head.appendChild(script);
    });
    return this.promise;
  },

  drawStatus(x, y, w, h, { state = this.state, onRetry = () => this.load({ retry: true }) } = {}) {
    push();
    fill(getTextColor());
    noStroke();
    textAlign(CENTER, CENTER);
    textSize(16);
    text(state === 'loading' || state === 'idle' ? 'Loading map…' : 'Map unavailable right now.', x + w/2, y + h/2 - 20);
    if (state === 'error') {
      drawInteractiveButton(x + w/2 - 65, y + h/2 + 8, 130, 44, 'Try Again', onRetry);
    }
    pop();
  }
};
