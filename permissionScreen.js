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
    
    // Title
    textAlign(CENTER, CENTER);
    noStroke();
    textSize(32);
    fill(getTextColor());
    text("Permissions Needed", width/2, height/6);
    
    if (window.isSecureContext) {
      // Subtitle
      textSize(20);
      fill(getTextColor());
      text("This game needs access to:", width/2, height/3 - 40);
      this.createButtons();
    } else {
      textSize(20);
      fill(255, 0, 0);
      text("This game requires a secure connection (HTTPS).", width/2, height/3);
      text("Please use HTTPS or localhost to play.", width/2, height/3 + 30);
    }
    
    // Update button colors but keep status indication
    if (this.locationButton) {
      const isGranted = localStorage.getItem('locationPermission') === 'granted';
      this.locationButton.style('background-color', getPermissionStatusColor(isGranted));
      this.locationButton.style('color', 'var(--text-color)');
      this.locationButton.style('font-family', 'Helvetica, Arial, sans-serif');
    }
    if (this.compassButton) {
      const isGranted = orientationService.hasCompass();
      this.compassButton.style('background-color', getPermissionStatusColor(isGranted));
      this.compassButton.style('color', 'var(--text-color)');
      this.compassButton.style('font-family', 'Helvetica, Arial, sans-serif');
    }
      
    if (this.message) {
      textSize(16);
      fill(255, 0, 0);
      textAlign(CENTER, CENTER);
      text(this.message, width/2, height - 100);
    }
    
    // Only proceed to game if we have permissions and they were granted normally
    if (playerLocation && orientationService.hasCompass() && 
        localStorage.getItem('locationPermission') === 'granted') {
      this.cleanup();
      currentQuestionIndex = 0;
      resetLockStates();
      if (!enteredFromSearch) pickNewQuestion();
      goToScreen("game");
    }
  },

  createButtons: function() {
    const centerY = height/2 - 75; // Center point for buttons
    const spacing = 70; // Space between buttons
    
    if (this.needsLocation && !this.locationButton) {
      this.locationButton = createButton('Location');
      this.styleButton(this.locationButton, centerY);
      this.locationButton.elt.addEventListener('click', async () => {
        const button = this.locationButton;
        button.attribute('disabled', '');
        try {
          const position = await this.requestLocation();
          playerLocation = {
            lat: position.coords.latitude,
            lon: position.coords.longitude
          };
          this.message = "";
        } catch (error) {
          this.message = "Location access denied. Please check browser settings.";
        } finally {
          if (this.locationButton === button) button.removeAttribute('disabled');
        }
      });
    }

    if (this.needsCompass && !this.compassButton) {
      this.compassButton = createButton('Compass');
      this.styleButton(this.compassButton, centerY + spacing);
      this.compassButton.elt.addEventListener('click', async () => {
        const button = this.compassButton;
        button.attribute('disabled', '');
        button.style('opacity', '0.5');
        
        try {
          await orientationService.requestPermission();
          this.message = "";
        } catch (error) {
          this.message = error.message || "Please try again or check browser settings";
        } finally {
          if (this.compassButton === button) {
            button.removeAttribute('disabled');
            button.style('opacity', '1');
          }
        }
      });
    }

    if (!this.continueButton && DEV_MODE) {
      this.continueButton = createButton('Start without access');
      this.styleButton(this.continueButton, centerY + spacing * 2);
      this.continueButton.style('background-color', 'var(--button-bg)');
      this.continueButton.style('color', 'var(--text-color)');
      this.continueButton.elt.addEventListener('click', () => {
        if (!playerLocation) {
          playerLocation = { lat: 0, lon: 0 };
        }
        orientationService.hasPermission = true;
        localStorage.setItem('compassPermission', 'granted');
        this.cleanup();
        currentQuestionIndex = 0;
        resetLockStates();
        pickNewQuestion();
        goToScreen("game");  // Continue directly to game
      });
    }
  },

  styleButton: function(button, yPosition) {
    const offset = getCanvasOffset();
    const btnWidth = 200;
    
    button.style('font-size', '18px');
    button.style('padding', '8px');
    button.style('border', 'none');
    button.style('border-radius', '10px');
    button.style('cursor', 'pointer');
    button.style('width', btnWidth + 'px');
    button.style('height', '50px');
    button.style('touch-action', 'auto');
    button.style('pointer-events', 'auto');
    button.style('z-index', '1000');
    button.style('font-family', 'Helvetica, Arial, sans-serif');
    button.style('transition', 'opacity 0.2s');
    
    button.position(width/2 - btnWidth/2 + offset.x, yPosition);
    
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
            playerLocation = { lat: position.coords.latitude, lon: position.coords.longitude };
            localStorage.setItem('locationPermission', 'granted');
            resolve(position);
          },
          error => {
            localStorage.setItem('locationPermission', 'denied');
            reject(error);
          },
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
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
