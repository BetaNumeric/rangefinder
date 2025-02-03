// searchLocationScreen.js
/*
Custom location search screen that provides:
- Location search functionality
- Place selection
- Custom location game setup
- Location data processing
*/ 

let searchLocationScreen = {
  searchBox: null,
  selectedLocation: null,

  initialize() {
    if (!this.searchBox) {
      const offset = getCanvasOffset();
      
      // Create search input
      const input = createInput('');
      input.position(width/2 - 150 + offset.x, height/3);
      input.size(300, 40);
      input.style('font-size', '16px');
      input.style('padding', '8px');
      input.style('border-radius', '8px');
      input.style('border', 'none');
      input.style('background-color', 'var(--button-bg)');
      input.style('color', 'var(--button-text)');
      
      // Create searchBox using Google Places API
      this.searchBox = new google.maps.places.SearchBox(input.elt);
      
      // Handle place selection
      this.searchBox.addListener('places_changed', () => {
        const places = this.searchBox.getPlaces();
        if (places.length === 0) {
          return;
        }
        
        const place = places[0];
        this.selectedLocation = {
          name: place.name,
          lat: place.geometry.location.lat(),
          lon: place.geometry.location.lng(),
          type: 'custom',
          country: this.getCountryFromPlace(place)
        };
      });
      
      this.elements = { input };
    }
  },

  getCountryFromPlace(place) {
    for (let component of place.address_components) {
      if (component.types.includes('country')) {
        return component.long_name;
      }
    }
    return 'Unknown';
  },

  cleanup() {
    if (this.elements) {
      Object.values(this.elements).forEach(element => element.remove());
    }
    this.searchBox = null;
    this.elements = null;
  }
};

function drawSearchLocationScreen() {
  if (drawCloseButton()) {
    searchLocationScreen.cleanup();
    return;
  }

  // Initialize search box if needed
  searchLocationScreen.initialize();

  // Title
  fill(getTextColor());
  noStroke();
  textSize(32);
  textAlign(CENTER, CENTER);
  text("Search Location", width/2, height/6);

  // Instructions and stats
  textSize(18);
  text("Enter a location to guess", width/2, height/4);
  
  // Play button
  if (searchLocationScreen.selectedLocation) {
    let btnW = 150;
    let btnH = 50;
    let btnX = width/2 - btnW/2;
    let btnY = height * 0.9;

    drawInteractiveButton(
      btnX, btnY, btnW, btnH,
      "Start Game",
      () => {
        dataLoader.addCustomLocation(searchLocationScreen.selectedLocation);
        localStorage.setItem('selectedDataset', 'custom');
        currentQuestion = searchLocationScreen.selectedLocation;
        enteredFromSearch = true;
        searchLocationScreen.cleanup();
        goToScreen("game");
      }
    );
  }
}
