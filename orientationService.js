// Permission and usable compass readings are separate states.
let orientationService = {
  alpha: 0,
  beta: null,
  gamma: null,
  heading: 0,
  hasPermission: false,
  hasReading: false,
  isListening: false,
  lastUpdate: 0,
  lastHeadingAt: null,
  updateInterval: 33,
  filterFactor: 0.3,
  filteredHeading: null,
  maxReadingAge: 3000,
  handler: null,

  start() {
    if (!window.DeviceOrientationEvent || this.isListening) return;
    if (!this.handler) this.handler = this.handleOrientation.bind(this);
    window.addEventListener('deviceorientationabsolute', this.handler, { passive: true });
    window.addEventListener('deviceorientation', this.handler, { passive: true });
    this.isListening = true;
  },

  stop() {
    if (this.handler) {
      window.removeEventListener('deviceorientationabsolute', this.handler);
      window.removeEventListener('deviceorientation', this.handler);
    }
    this.isListening = false;
    this.hasReading = false;
    this.lastHeadingAt = null;
    this.filteredHeading = null;
    this.beta = null;
    this.gamma = null;
  },

  async requestPermission() {
    const orientationEvent = window.DeviceOrientationEvent;
    if (!orientationEvent) return false;
    this.start();
    if (typeof orientationEvent.requestPermission === 'function') {
      // Keep the native request directly in the button's user-activation call stack.
      const response = await orientationEvent.requestPermission(true);
      this.hasPermission = response === 'granted';
      localStorage.setItem('compassPermission', response);
      if (!this.hasPermission) this.stop();
      return this.hasPermission;
    }
    // Browsers without a permission method must still deliver an absolute reading.
    return this.hasCompass();
  },

  handleOrientation(event) {
    if (Number.isFinite(event.beta)) this.beta = event.beta;
    if (Number.isFinite(event.gamma)) this.gamma = event.gamma;

    let newHeading;
    if (Number.isFinite(event.webkitCompassHeading) && event.webkitCompassHeading >= 0 &&
        !(Number.isFinite(event.webkitCompassAccuracy) && event.webkitCompassAccuracy < 0)) {
      newHeading = event.webkitCompassHeading;
    } else if (event.absolute === true && Number.isFinite(event.alpha)) {
      newHeading = 360 - event.alpha;
    } else {
      return;
    }
    const now = performance.now();
    if (this.hasReading && now - this.lastUpdate < this.updateInterval) return;
    newHeading = (newHeading % 360 + 360) % 360;
    if (this.filteredHeading === null) this.filteredHeading = newHeading;
    else {
      const diff = ((newHeading - this.filteredHeading + 540) % 360) - 180;
      this.filteredHeading = (this.filteredHeading + diff * this.filterFactor + 360) % 360;
    }
    this.heading = this.filteredHeading;
    this.lastUpdate = now;
    this.lastHeadingAt = now;
    this.hasReading = true;
    this.hasPermission = true;
  },

  hasCompass() {
    return this.isListening && this.hasReading && this.lastHeadingAt !== null &&
      performance.now() - this.lastHeadingAt <= this.maxReadingAge;
  },

  getHeading() {
    return this.hasCompass() ? Math.round(this.heading) % 360 : null;
  },

  getBeta() {
    return this.beta;
  }
};
