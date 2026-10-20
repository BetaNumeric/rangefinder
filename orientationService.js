// Permission and usable compass readings are separate: relative rotation is not north.
let orientationService = {
  alpha: 0,
  beta: 0,
  gamma: 0,
  heading: 0,
  hasPermission: false,
  isWebkit: false,
  lastUpdate: 0,
  lastReading: null,
  maxReadingAge: 5000,
  readingTimeout: 5000,
  updateInterval: 33,
  filterFactor: 0.3,
  filteredHeading: null,
  listening: false,
  boundHandler: null,
  headingWaiters: new Set(),

  start() {
    if (!window.DeviceOrientationEvent) return false;
    if (this.listening) return true;
    this.boundHandler = this.handleOrientation.bind(this);
    window.addEventListener('deviceorientationabsolute', this.boundHandler, { capture: true, passive: true });
    window.addEventListener('deviceorientation', this.boundHandler, { capture: true, passive: true });
    this.listening = true;
    return true;
  },

  stop() {
    if (this.boundHandler) {
      window.removeEventListener('deviceorientationabsolute', this.boundHandler, true);
      window.removeEventListener('deviceorientation', this.boundHandler, true);
    }
    this.boundHandler = null;
    this.listening = false;
    this.hasPermission = false;
    this.lastReading = null;
    this.filteredHeading = null;
    this.headingWaiters.forEach(notify => notify(false));
  },

  async requestPermission() {
    if (!this.start()) throw new Error('A compass is not available on this device.');
    const OrientationEvent = window.DeviceOrientationEvent;
    if (typeof OrientationEvent.requestPermission === 'function') {
      // Call immediately from the button handler, before any unrelated await.
      const response = await OrientationEvent.requestPermission(true);
      if (response !== 'granted') {
        this.stop();
        progressStore.setSetting('compassPermission', 'denied');
        throw new Error('Compass access denied. Please check browser settings.');
      }
    }
    this.hasPermission = true;
    progressStore.setSetting('compassPermission', 'granted');
    if (this.hasCompass()) return true;
    return new Promise((resolve, reject) => {
      const notify = ready => {
        clearTimeout(timer);
        this.headingWaiters.delete(notify);
        if (ready) resolve(true);
        else reject(new Error('No compass reading received. Please check your device and browser settings.'));
      };
      const timer = setTimeout(() => notify(false), this.readingTimeout);
      this.headingWaiters.add(notify);
    });
  },

  handleOrientation(event) {
    // Relative events can supply tilt, but must not replace an absolute heading.
    if (Number.isFinite(event.beta)) this.beta = event.beta;
    if (Number.isFinite(event.gamma)) this.gamma = event.gamma;
    const webkitHeading = Number.isFinite(event.webkitCompassHeading) && event.webkitCompassHeading >= 0;
    const absoluteHeading = event.absolute === true && Number.isFinite(event.alpha);
    if (!webkitHeading && !absoluteHeading) return;

    const now = performance.now();
    if (this.lastReading !== null && now - this.lastUpdate < this.updateInterval) return;
    this.lastUpdate = now;
    this.isWebkit = webkitHeading;
    this.alpha = webkitHeading ? event.webkitCompassHeading : event.alpha;
    const newHeading = this.calculateTrueHeading();
    if (this.filteredHeading === null || this.lastReading === null || now - this.lastReading > this.maxReadingAge) {
      this.filteredHeading = newHeading;
    } else {
      let diff = ((newHeading - this.filteredHeading + 540) % 360) - 180;
      this.filteredHeading = (this.filteredHeading + diff * this.filterFactor + 360) % 360;
    }
    this.heading = this.filteredHeading;
    this.lastReading = now;
    this.hasPermission = true;
    this.headingWaiters.forEach(notify => notify(true));
  },

  calculateTrueHeading() {
    let heading = this.isWebkit ? this.alpha : 360 - this.alpha;
    if (Math.abs(this.gamma) > 90) heading += 180;
    return (heading % 360 + 360) % 360;
  },

  getHeading() {
    return this.hasCompass() ? Math.round(this.heading) % 360 : 0;
  },

  hasCompass() {
    return this.hasPermission && this.lastReading !== null &&
      performance.now() - this.lastReading <= this.maxReadingAge;
  },

  getBeta() {
    return this.beta;
  }
};
