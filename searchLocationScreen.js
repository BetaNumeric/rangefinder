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
      const inputWidth = 300;
      const horizontalPadding = 32; // 16px on each side
      
      // Adjust width to account for padding
      input.size(inputWidth - horizontalPadding, 40);
      input.position(width/2 - inputWidth/2 + offset.x, height/3);
      
      input.style('font-size', '16px');
      input.style('padding', '8px 16px');
      input.style('border-radius', '8px');
      input.style('border', 'none');
      input.style('background-color', 'var(--button-bg)');
      input.style('color', 'var(--text-color)');
      input.attribute('placeholder', 'Search for a location...');
      
      // Style the placeholder text
      const placeholderStyle = document.createElement('style');
      placeholderStyle.textContent = `
        input::placeholder {
          color: var(--button-locked-text);
          opacity: 1;
        }
        input:focus {
          outline: none;
          box-shadow: 0 0 0 2px var(--text-color);
        }
      `;
      document.head.appendChild(placeholderStyle);
      
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
    } else {
      // Update position on resize
      const offset = getCanvasOffset();
      const inputWidth = 300;
      this.elements.input.position(width/2 - inputWidth/2 + offset.x, height/3);
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
  
  // Show custom locations count and management button
  const customLocations = dataLoader.datasets.custom.locations || [];
  let manageBtnW = 250;
  let manageBtnH = 40;
  let manageBtnX = width/2 - manageBtnW/2;
  let manageBtnY = height * 0.8;
  
  // Style as a more subtle button
  push();
  textAlign(CENTER);
  textSize(16);
  fill(getButtonColor());
  rect(manageBtnX, manageBtnY, manageBtnW, manageBtnH, 8);
  fill(getTextColor());
  text(`Manage Custom Locations (${customLocations.length})`, width/2, manageBtnY + manageBtnH/2);
  pop();
  
  // Handle click
  if (mouseIsPressed && !lastMousePressed &&
      mouseX > manageBtnX && mouseX < manageBtnX + manageBtnW &&
      mouseY > manageBtnY && mouseY < manageBtnY + manageBtnH) {
    searchLocationScreen.cleanup();
    goToScreen("customLocations");
  }
  
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
  
  
  // Draw dropdown menu
  dropdownMenu.draw('search');
  
  if (drawCloseButton()) {
    searchLocationScreen.cleanup();
    return;
  }

}
