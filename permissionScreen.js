// permissionScreen.js
/*
Permission management screen that handles:
- Location permission requests
- Compass permission requests
- Permission status display
- Fallback options
*/
/*jshint esversion: 8 */

let permissionScreen = {
  needsLocation: true,
  needsCompass: true,
  message: "",
  compassButton: null,
  locationButton: null,
  continueButton: null,
  
  draw: function() {
    if (DEV_MODE) {
      startNewGame();
      return;
    }
    if (drawCloseButton()) {
      this.cleanup();
      return;
    }
    
    textAlign(CENTER, CENTER);
    noStroke();
    textSize(24);
    fill(getTextColor());
    text("Permissions Needed", width/2, height/6);
    
    if (window.isSecureContext) {
      textSize(16);
      fill(getTextColor());
      text("This game needs access to:", width/2, height/4);
      this.createButtons();
    } else {
      textSize(16);
      fill(255, 0, 0);
      text("This game requires a secure connection (HTTPS).", width/2, height/3);
      text("Please use HTTPS or localhost to play.", width/2, height/3 + 30);
    }
    
    if (this.locationButton) {
      this.locationButton.style(
        'background-color',
        getPermissionStatusColor(localStorage.getItem('locationPermission') === 'granted')
      );
    }
    if (this.compassButton) {
      this.compassButton.style(
        'background-color',
        getPermissionStatusColor(orientationService.hasPermission)
      );
    }
      
    if (this.message) {
      fill(255, 0, 0);
      textAlign(CENTER, CENTER);
      text(this.message, width/2, height - 100);
    }
    
    // Only auto-transition if we got permissions normally (not through continue button)
    if (playerLocation && orientationService.hasPermission && 
        (localStorage.getItem('locationPermission') === 'granted' || 
         localStorage.getItem('compassPermission') === 'granted')) {
      this.cleanup();
      startNewGame();
    }
  },

  createButtons: function() {
    if (this.needsLocation && !this.locationButton) {
      this.locationButton = createButton('Location');
      this.styleButton(this.locationButton, height/3);
      this.locationButton.mousePressed(async () => {
        this.locationButton.attribute('disabled', '');
        try {
          const position = await this.requestLocation();
          playerLocation = {
            lat: position.coords.latitude,
            lon: position.coords.longitude
          };
          this.message = "";
          this.locationButton.removeAttribute('disabled');
        } catch (error) {
          this.locationButton.removeAttribute('disabled');
          this.message = "Location access denied. Please check browser settings.";
        }
      });
    }

    if (this.needsCompass && !this.compassButton) {
      this.compassButton = createButton('Compass');
      this.styleButton(this.compassButton, height/3 + 70);
      this.compassButton.mousePressed(async () => {
        this.compassButton.attribute('disabled', '');
        this.compassButton.style('opacity', '0.5');
        
        try {
          if (typeof DeviceOrientationEvent.requestPermission === 'function') {
            await new Promise(resolve => setTimeout(resolve, 100));
            const response = await DeviceOrientationEvent.requestPermission();
            if (response === 'granted') {
              orientationService.hasPermission = true;
              localStorage.setItem('compassPermission', 'granted');
              window.addEventListener('deviceorientation', orientationService.handleOrientation.bind(orientationService), 
                { capture: true, passive: true }
              );
              this.message = "";
            } else {
              throw new Error("Permission denied");
            }
          } else {
            orientationService.hasPermission = true;
            localStorage.setItem('compassPermission', 'granted');
          }
        } catch (error) {
          this.message = "Please try again or check browser settings";
        }
        this.compassButton.removeAttribute('disabled');
        this.compassButton.style('opacity', '1');
      });
    }

    // Add continue button
    if (!this.continueButton) {
      this.continueButton = createButton('start without access');
      this.styleButton(this.continueButton, height/3 + 140);
      this.continueButton.style('background-color', getButtonColor());
      this.continueButton.mousePressed(() => {
        if (!playerLocation) {
          playerLocation = { lat: 0, lon: 0 };
        }
        orientationService.hasPermission = true;
        localStorage.setItem('compassPermission', 'granted');
        this.cleanup();
        currentQuestionIndex = 0;
        resetLockStates();
        pickNewQuestion();
        goToScreen("game");
      });
    }
  },

  styleButton: function(button, yPosition) {
    const offset = getCanvasOffset();
    const btnWidth = 200;
    
    button.style('font-size', '20px');
    button.style('padding', '8px');
    button.style('border', 'none');
    button.style('border-radius', '10px');
    button.style('cursor', 'pointer');
    button.style('width', btnWidth + 'px');
    button.style('height', '50px');
    button.style('touch-action', 'auto');
    button.style('pointer-events', 'auto');
    button.style('z-index', '1000');
    
    button.position(width/2 - btnWidth/2 + offset.x, yPosition + offset.y);
    
    button.elt.addEventListener('touchstart', function(e) {
      e.stopPropagation();
    }, { passive: true });
  },

  cleanup: function() {
    if (this.locationButton) {
      this.locationButton.remove();
      this.locationButton = null;
    }
    if (this.compassButton) {
      this.compassButton.remove();
      this.compassButton = null;
    }
    if (this.continueButton) {
      this.continueButton.remove();
      this.continueButton = null;
    }
  },
  
  requestLocation() {
    return new Promise((resolve, reject) => {
      if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
          position => {
            localStorage.setItem('locationPermission', 'granted');
            resolve(position);
          },
          error => {
            localStorage.setItem('locationPermission', 'denied');
            reject(error);
          }
        );
      } else {
        reject(new Error("Geolocation not available"));
      }
    });
  },

  handleClick: function() {
    // Called from mousePressed in main.js if needed
  }
};
