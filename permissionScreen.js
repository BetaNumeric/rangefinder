let permissionScreen = {
  message: '',
  locationButton: null,
  compassButton: null,
  continueButton: null,
  generation: 0,

  draw() {
    if (drawCloseButton()) return;
    textAlign(CENTER, CENTER);
    noStroke();
    fill(getTextColor());
    textSize(30);
    text('Location and compass', width / 2, height / 6);
    textSize(16);
    if (window.isSecureContext) {
      text('Enable location, then choose your controls.', width / 2, height / 3 - 40);
      this.createButtons();
      this.positionButtons();
    } else {
      text('Open this game over HTTPS or localhost.', width / 2, height / 3);
    }
    if (this.locationButton) {
      this.locationButton.style('background-color', getPermissionStatusColor(hasValidPlayerLocation()));
      this.compassButton.style('background-color', getPermissionStatusColor(orientationService.hasCompass()));
    }
    let status = this.message;
    if (!status && orientationService.hasPermission && !orientationService.hasCompass()) {
      status = 'Waiting for a compass reading.\nYou can also use manual controls.';
    }
    if (status) text(status, width / 2, height * 0.78);
    if (!dataLoader.isLoading && hasValidPlayerLocation() && orientationService.hasCompass()) this.finish(false);
  },

  finish(manualControls) {
    if (!hasValidPlayerLocation()) {
      this.message = 'Enable location to start a round.';
      return;
    }
    if (dataLoader.isLoading) {
      this.message = 'Wait for the locations to finish loading.';
      return;
    }
    userSettings.manualControls = manualControls;
    if (pendingCustomQuestion) {
      const distance = getDistanceKm(playerLocation.lat, playerLocation.lon,
        pendingCustomQuestion.lat, pendingCustomQuestion.lon);
      userSettings.radius = Math.min(20000, Math.max(userSettings.radius, Math.ceil(distance)));
      beginRound(pendingCustomQuestion, 'custom');
      pendingCustomQuestion = null;
    } else pickNewQuestion();
    goToScreen('game');
  },

  createButtons() {
    if (this.locationButton) return;
    this.locationButton = createButton('Enable location');
    this.compassButton = createButton('Enable compass');
    this.continueButton = createButton('Use manual controls');
    [this.locationButton, this.compassButton, this.continueButton].forEach(button => this.styleButton(button));
    this.locationButton.mousePressed(async () => {
      const generation = this.generation;
      const button = this.locationButton;
      button.attribute('disabled', '');
      try {
        await this.requestLocation();
        if (generation === this.generation) this.message = '';
      } catch (error) {
        if (generation === this.generation) this.message = 'Location unavailable. Check access and try again.';
      } finally { button.removeAttribute('disabled'); }
    });
    this.compassButton.mousePressed(async () => {
      const generation = this.generation;
      const button = this.compassButton;
      button.attribute('disabled', '');
      try {
        const granted = await orientationService.requestPermission();
        if (generation === this.generation) this.message = granted ? '' :
          'No compass reading yet. Try again or use manual controls.';
      } catch (error) {
        if (generation === this.generation) this.message = 'Compass access unavailable. You can use manual controls.';
      } finally { button.removeAttribute('disabled'); }
    });
    this.continueButton.mousePressed(() => this.finish(true));
  },

  styleButton(button) {
    button.size(220, 50);
    button.style('font-size', '18px');
    button.style('border', 'none');
    button.style('border-radius', '10px');
    button.style('background-color', 'var(--button-bg)');
    button.style('color', 'var(--text-color)');
    button.style('z-index', '1000');
    button.style('touch-action', 'manipulation');
  },

  positionButtons() {
    const offset = getCanvasOffset();
    [this.locationButton, this.compassButton, this.continueButton].forEach((button, i) => {
      if (button) button.position(offset.x + width / 2 - 110, height / 2 - 75 + i * 70);
    });
  },

  requestLocation() {
    const generation = this.generation;
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) { reject(new Error('Geolocation unavailable.')); return; }
      navigator.geolocation.getCurrentPosition(position => {
        if (generation !== this.generation) { reject(new Error('Location request cancelled.')); return; }
        try {
          updatePlayerLocation(position);
          updateSensorSubscriptions();
          resolve(position);
        } catch (error) { reject(error); }
      }, error => {
        if (generation === this.generation && error.code === 1) {
          playerLocation = null;
          localStorage.setItem('locationPermission', 'denied');
        }
        reject(error);
      }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
    });
  },

  cleanup() {
    this.generation++;
    [this.locationButton, this.compassButton, this.continueButton].forEach(button => { if (button) button.remove(); });
    this.locationButton = this.compassButton = this.continueButton = null;
    this.message = '';
  },

  handleClick() {}
};
