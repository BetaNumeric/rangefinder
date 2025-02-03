// orientationService.js
/*
Device orientation handling service that manages:
- Compass readings
- Device orientation permissions
- Heading calculations
- Motion filtering
*/

let orientationService = {
  alpha: 0,
  beta: 0,
  gamma: 0,
  heading: 0,
  hasPermission: false,
  isWebkit: false,
  lastUpdate: 0,
  updateInterval: 33,
  filterFactor: 0.3,
  filteredHeading: 0,
  
  start: function() {
    if (!window.DeviceOrientationEvent) {
      console.error("Device orientation not supported");
      return;
    }
    this.isWebkit = typeof DeviceOrientationEvent.requestPermission === 'function';

    if (this.isWebkit) {
      let storedPermission = localStorage.getItem('compassPermission');
      if (storedPermission === 'granted') {
        let testListener = (event) => {
          if (event.alpha !== null || event.webkitCompassHeading !== undefined) {
            this.hasPermission = true;
            window.addEventListener('deviceorientation', this.handleOrientation.bind(this), 
              { capture: true, passive: true }
            );
          } else {
            localStorage.removeItem('compassPermission');
            this.hasPermission = false;
          }
          window.removeEventListener('deviceorientation', testListener);
        };
        window.addEventListener('deviceorientation', testListener, { once: true });
        setTimeout(() => {
          window.removeEventListener('deviceorientation', testListener);
          if (!this.hasPermission) {
            localStorage.removeItem('compassPermission');
          }
        }, 1000);
      }
      return;
    }

    let testListener = (event) => {
      if (event.alpha !== null) {
        this.hasPermission = true;
        localStorage.setItem('compassPermission', 'granted');
      } else {
        localStorage.removeItem('compassPermission');
        this.hasPermission = false;
      }
      window.removeEventListener('deviceorientationabsolute', testListener);
      window.removeEventListener('deviceorientation', testListener);
      
      if (this.hasPermission) {
        window.addEventListener('deviceorientationabsolute', this.handleOrientation.bind(this), 
          { capture: true, passive: true }
        );
        window.addEventListener('deviceorientation', this.handleOrientation.bind(this), 
          { capture: true, passive: true }
        );
      }
    };

    window.addEventListener('deviceorientationabsolute', testListener, { once: true });
    window.addEventListener('deviceorientation', testListener, { once: true });
  },

  requestPermission: async function() {
    if (this.isWebkit) {
      try {
        const response = await DeviceOrientationEvent.requestPermission();
        if (response === 'granted') {
          this.hasPermission = true;
          localStorage.setItem('compassPermission', 'granted');
          window.addEventListener('deviceorientation', this.handleOrientation.bind(this), true);
          return true;
        } else {
          localStorage.setItem('compassPermission', 'denied');
          console.error("Permission denied for device orientation");
          return false;
        }
      } catch (error) {
        console.error("Error requesting device orientation permission:", error);
        throw error;
      }
    } else if (window.DeviceOrientationEvent) {
      this.hasPermission = true;
      window.addEventListener('deviceorientationabsolute', this.handleOrientation.bind(this), true);
      window.addEventListener('deviceorientation', this.handleOrientation.bind(this), true);
      return true;
    }
    return this.hasPermission;
  },

  handleOrientation: function(event) {
    const now = performance.now();
    if (now - this.lastUpdate < this.updateInterval) {
      return;
    }
    this.lastUpdate = now;

    if (event.absolute) {
      this.alpha = event.alpha || 0;
    } else if (event.webkitCompassHeading !== undefined) {
      this.alpha = event.webkitCompassHeading;
    }

    this.beta = event.beta || 0;
    this.gamma = event.gamma || 0;
    const newHeading = this.calculateTrueHeading();

    if (this.filteredHeading === 0) {
      this.filteredHeading = newHeading;
    } else {
      let diff = newHeading - this.filteredHeading;
      if (diff > 180) diff -= 360;
      if (diff < -180) diff += 360;
      this.filteredHeading = (this.filteredHeading + (diff * this.filterFactor)) % 360;
      if (this.filteredHeading < 0) this.filteredHeading += 360;
    }
    this.heading = this.filteredHeading;
  },

  calculateTrueHeading: function() {
    let heading;
    if (this.isWebkit) {
      heading = this.alpha;
    } else {
      heading = (360 - this.alpha) % 360;
    }
    if (Math.abs(this.gamma) > 90) {
      heading = (heading + 180) % 360;
    }
    return heading;
  },

  getHeading: function() {
    if (!this.hasPermission) {
      return 0;
    }
    return Math.round(this.heading);
  },

  hasCompass: function() {
    return this.hasPermission;
  },

  getBeta: function() {
    return this.beta;
  }
};
