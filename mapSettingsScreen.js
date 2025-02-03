// mapSettingsScreen.js
/*
Map settings screen that handles:
- Map style customization
- Label visibility settings
- Satellite/roadmap toggle
- Player marker options
- Map preview
*/ 

/*jshint esversion: 9 */

let mapSettingsScreen = {
  settings: {
    showLabels: false,
    showRoads: true,
    satelliteView: false,
    showPlayerLocation: true,
    labelLevel: 'none' // 'none', 'minimal', or 'all'
  },

  previewMap: null,
  mapElement: null,
  playerMarker: null,

  initialize() {
    // Load saved settings
    const savedSettings = localStorage.getItem('mapSettings');
    if (savedSettings) {
      this.settings = {...this.settings, ...JSON.parse(savedSettings) }; 
    }
  },

  saveSettings() {
    localStorage.setItem('mapSettings', JSON.stringify(this.settings));
  },

  getMapStyles() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    let styles = [
      // Hide all points of interest and administrative regions
      {
        featureType: "poi",
        stylers: [{ visibility: "off" }]
      },
      {  
        featureType: "administrative",
        stylers: [{ visibility: "off" }]
      },
      {
        featureType: "administrative.country",
        elementType: "geometry.stroke",
        stylers: [
          { visibility: "on" },
          { color: isDark ? "#646464" : "#c8c8c8" },
          { weight: 1 }
        ]
      },
      {
        featureType: "transit",
        stylers: [{ visibility: "off" }]
      }
    ];

    // Label visibility based on level
    if (this.settings.labelLevel === 'none') {
      styles.push({
        featureType: "all",
        elementType: "labels",
        stylers: [{ visibility: "off" }]
      });
    } else if (this.settings.labelLevel === 'minimal') {
      styles.push(
        {
          featureType: "all",
          elementType: "labels",
          stylers: [{ visibility: "off" }]
        },
        {
          featureType: "administrative.country",
          elementType: "labels",
          stylers: [{ visibility: "on" }]
        },
        {
          featureType: "administrative.locality",
          elementType: "labels",
          stylers: [{ visibility: "on" }]
        }
      );
    }

    // Roads visibility
    if (!this.settings.showRoads) {
      styles.push({
        featureType: "road",
        stylers: [{ visibility: "off" }]
      });
    }

    // Base colors for non-satellite view
    if (!this.settings.satelliteView) {
      styles.push(
        {
          featureType: "water",
          elementType: "geometry",
          stylers: [{ color: isDark ? "#304860" : "#aadaff" }]
        },
        {
          featureType: "landscape",
          elementType: "geometry",
          stylers: [{ color: isDark ? "#212121" : "#f5f5f5" }]
        }
      );
    }

    return styles;
  },

  updatePlayerMarker() {
    if (this.previewMap && this.settings.showPlayerLocation && playerLocation) {
      if (this.playerMarker) {
        this.playerMarker.setPosition({ lat: playerLocation.lat, lng: playerLocation.lon });
      } else {
        this.playerMarker = new google.maps.Marker({
          position: { lat: playerLocation.lat, lng: playerLocation.lon },
          map: this.previewMap,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: '#4285F4',
            fillOpacity: 0.7,
            strokeWeight: 2,
            strokeColor: '#FFFFFF'
          },
          title: 'Your Location'
        });
      }
    } else if (this.playerMarker && (!this.settings.showPlayerLocation || !playerLocation)) {
      // Remove marker if location display is disabled or location is not available
      this.playerMarker.setMap(null);
      this.playerMarker = null;
    }
  },

  drawSettingsScreen() {
    if (drawCloseButton()) {
      this.cleanup();
      return;
    }

    fill(getTextColor());
    noStroke();
    textSize(32);
    textAlign(CENTER, CENTER);
    text("Map Settings", width/2, height/6);

    // Initialize preview map
    if (!this.previewMap) {
      const offset = getCanvasOffset();
      this.mapElement = createDiv('');
      this.mapElement.id('previewMap');
      this.mapElement.style('width', '100%');
      this.mapElement.style('height', '30%');
      this.mapElement.position(0, height/6 + 40);

      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      this.previewMap = new google.maps.Map(this.mapElement.elt, {
        zoom: 5,
        center: playerLocation ? { lat: playerLocation.lat, lng: playerLocation.lon } : { lat: 0, lng: 0 },
        disableDefaultUI: true,
        keyboardShortcuts: false,
        backgroundColor: isDark ? '#212121' : '#f5f5f5',
        mapTypeId: this.settings.satelliteView ? 'hybrid' : 'roadmap',
        styles: this.getMapStyles()
      });
      
      this.updatePlayerMarker();
    }

    this.updatePlayerMarker();

    let startY = height/2 + height/8;
    let spacing = 60;

    // Label level selector
    textAlign(LEFT, CENTER);
    textSize(20);
    text("Show Labels", width/4, startY);
    
    // Create label selector with proper offset
    if (!this.labelSelector) {
      const offset = getCanvasOffset();
      const selectorDiv = document.createElement('div');
      selectorDiv.style.position = 'absolute';
      selectorDiv.style.left = `${offset.x + width * 3/4 - 75}px`;
      selectorDiv.style.top = `${startY - 15}px`;
      selectorDiv.style.zIndex = '1000';
      
      const select = document.createElement('select');
      select.style.width = '150px';
      select.style.height = '30px';
      select.style.backgroundColor = 'var(--button-bg)';
      select.style.color = 'var(--button-text)';
      select.style.border = 'none';
      select.style.borderRadius = '8px';
      select.style.padding = '5px';
      select.style.cursor = 'pointer';
      select.style.fontSize = '16px';
      
      const labelOptions = [
        { value: 'none', text: 'None' },
        { value: 'minimal', text: 'Cities & Countries' },
        { value: 'all', text: 'All Labels' }
      ];
      
      labelOptions.forEach(opt => {
        const option = document.createElement('option');
        option.value = opt.value;
        option.text = opt.text;
        select.appendChild(option);
      });
      
      select.value = this.settings.labelLevel;
      select.addEventListener('change', () => {
        this.settings.labelLevel = select.value;
        this.saveSettings();
        this.updatePreviewMap();
      });
      
      selectorDiv.appendChild(select);
      document.body.appendChild(selectorDiv);
      this.labelSelector = selectorDiv;
    }

    if (this.labelSelector) {
      const offset = getCanvasOffset();
      this.labelSelector.style.left = `${offset.x + width * 3/4 - 75}px`;
    }

    startY += spacing;

    // Toggle buttons
    this.drawToggle("Show Roads", this.settings.showRoads, startY, () => {
      this.settings.showRoads = !this.settings.showRoads;
      this.saveSettings();
      this.updatePreviewMap();
    });

    this.drawToggle("Satellite View", this.settings.satelliteView, startY + spacing, () => {
      this.settings.satelliteView = !this.settings.satelliteView;
      this.saveSettings();
      this.updatePreviewMap();
    });

    this.drawToggle("Your Location", this.settings.showPlayerLocation, startY + spacing * 2, () => {
      this.settings.showPlayerLocation = !this.settings.showPlayerLocation;
      this.saveSettings();
      this.updatePreviewMap();
    });
  },

  drawToggle(label, value, y, onClick) {
    textAlign(LEFT, CENTER);
    textSize(20);
    fill(getTextColor());
    text(label, width/4, y);

    // Draw toggle switch
    const toggleWidth = 50;
    const toggleHeight = 24;
    const x = width * 3/4 - toggleWidth/2;

    noStroke();
    fill(value ? getButtonColor() : '#cccccc');
    rect(x, y - toggleHeight/2, toggleWidth, toggleHeight, toggleHeight/2);

    fill(value ? getTextColor() : '#ffffff');
    const knobSize = toggleHeight - 4;
    const knobX = value ? x + toggleWidth - knobSize - 2 : x + 2;
    circle(knobX + knobSize/2, y, knobSize);

    if (mouseIsPressed && !lastMousePressed &&
        mouseX > x && mouseX < x + toggleWidth &&
        mouseY > y - toggleHeight/2 && mouseY < y + toggleHeight/2) {
      onClick();
    }
  },

  updatePreviewMap() {
    if (this.previewMap) {
      this.previewMap.setMapTypeId(this.settings.satelliteView ? 'hybrid' : 'roadmap');
      this.previewMap.setOptions({ styles: this.getMapStyles() });
    }
  },

  cleanup() {
    if (this.playerMarker) {
      this.playerMarker.setMap(null);
      this.playerMarker = null;
    }
    if (this.previewMap) {
      if (this.mapElement) {
        this.mapElement.remove();
        this.mapElement = null;
      }
      this.previewMap = null;
    }
    if (this.labelSelector) {
      this.labelSelector.remove();
      this.labelSelector = null;
    }
  }
}; 
