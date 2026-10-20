// Custom place search uses the current Places widget and requests only needed fields.
let searchLocationScreen = {
  searchBox: null,
  elements: null,
  selectedLocation: null,
  message: '',
  selectionVersion: 0,
  selectHandler: null,
  inputHandler: null,
  errorHandler: null,

  initialize() {
    if (!mapsApi.ensureReady()) return false;
    if (!this.searchBox) {
      const host = createDiv('');
      this.elements = { input: host };
      try {
        const widget = new google.maps.places.PlaceAutocompleteElement();
        widget.setAttribute('aria-label', 'Search for a location');
        widget.style.width = '100%';
        host.elt.appendChild(widget);
        this.searchBox = widget;
        this.selectHandler = async event => {
          const version = ++this.selectionVersion;
          this.selectedLocation = null;
          this.message = 'Loading location…';
          try {
            const place = event.placePrediction.toPlace();
            await place.fetchFields({ fields: ['displayName', 'location', 'addressComponents'] });
            if (this.searchBox !== widget || version !== this.selectionVersion) return;
            if (!place.location) throw new Error('This place has no coordinates.');
            this.selectedLocation = {
              name: place.displayName || 'Unknown Location',
              lat: place.location.lat(),
              lon: place.location.lng(),
              type: 'custom',
              country: this.getCountryFromPlace(place)
            };
            this.message = '';
          } catch (error) {
            if (this.searchBox !== widget || version !== this.selectionVersion) return;
            this.message = 'Could not load this location. Please try another search.';
            console.warn('Place selection failed:', error);
          }
        };
        this.inputHandler = () => {
          this.selectionVersion++;
          this.selectedLocation = null;
          this.message = '';
        };
        this.errorHandler = () => {
          this.selectionVersion++;
          this.selectedLocation = null;
          this.message = 'Search is unavailable right now. Please try again.';
        };
        widget.addEventListener('gmp-select', this.selectHandler);
        widget.addEventListener('input', this.inputHandler);
        widget.addEventListener('gmp-error', this.errorHandler);
      } catch (error) {
        this.cleanup();
        mapsApi.setError(error);
        return false;
      }
    }
    const offset = getCanvasOffset();
    const inputWidth = Math.min(300, width - 32);
    this.elements.input.size(inputWidth, 50);
    this.elements.input.position(width/2 - inputWidth/2 + offset.x, height/3);
    this.searchBox.style.colorScheme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    return true;
  },

  getCountryFromPlace(place) {
    return place.addressComponents?.find(component => component.types.includes('country'))?.longText || 'Unknown';
  },

  cleanup() {
    if (this.searchBox) {
      this.searchBox.removeEventListener('gmp-select', this.selectHandler);
      this.searchBox.removeEventListener('input', this.inputHandler);
      this.searchBox.removeEventListener('gmp-error', this.errorHandler);
    }
    if (this.elements) Object.values(this.elements).forEach(element => element.remove());
    this.selectionVersion++;
    this.searchBox = null;
    this.elements = null;
    this.selectedLocation = null;
    this.message = '';
  }
};

function drawSearchLocationScreen() {
  const searchReady = searchLocationScreen.initialize();

  fill(getTextColor());
  noStroke();
  textSize(32);
  textAlign(CENTER, CENTER);
  text('Search Location', width/2, height/6);
  textSize(18);
  text('Enter a location to guess', width/2, height/4);
  if (!searchReady) {
    mapsApi.drawStatus(0, height/3, width, height/3);
  } else if (searchLocationScreen.message) {
    textSize(16);
    text(searchLocationScreen.message, 16, height/3 + 75, width - 32, 70);
  }

  const customLocations = dataLoader.datasets.custom.locations || [];
  const manageBtnW = 250;
  const manageBtnH = 40;
  const manageBtnX = width/2 - manageBtnW/2;
  const manageBtnY = height * 0.8;
  push();
  textAlign(CENTER);
  textSize(16);
  fill(getButtonColor());
  rect(manageBtnX, manageBtnY, manageBtnW, manageBtnH, 8);
  fill(getTextColor());
  text(`Manage Custom Locations (${customLocations.length})`, width/2, manageBtnY + manageBtnH/2);
  pop();

  if (mouseIsPressed && !lastMousePressed &&
      mouseX > manageBtnX && mouseX < manageBtnX + manageBtnW &&
      mouseY > manageBtnY && mouseY < manageBtnY + manageBtnH) {
    goToScreen('customLocations');
    return;
  }

  if (searchReady && searchLocationScreen.selectedLocation) {
    drawInteractiveButton(width/2 - 75, height * 0.9, 150, 50, 'Start Game', () => {
      const location = searchLocationScreen.selectedLocation;
      const exists = customLocations.some(loc =>
        Math.abs(loc.lat - location.lat) < 0.00001 && Math.abs(loc.lon - location.lon) < 0.00001);
      if (!exists && !dataLoader.addCustomLocation(location)) {
        searchLocationScreen.message = 'Could not save this location. Please try again.';
        return;
      }
      dataLoader.activateDataset('custom', success => {
        if (!success) return;
        currentQuestion = location;
        enteredFromSearch = true;
        resetLockStates();
        const ready = playerLocation && orientationService.hasCompass() &&
          localStorage.getItem('locationPermission') === 'granted';
        goToScreen(ready ? 'game' : 'permissions');
      });
    });
  }

  dropdownMenu.draw('search');
  drawCloseButton();
}
