// settingsScreen.js
/*
Settings screen that handles:
- Game configuration
- Dataset selection
- Permission management
- Data import/export
- Theme settings
*/
/*jshint esversion: 8 */
let settingsScreen = {
  elements: {
    buttons: [],
    datasetSelector: null,
    importInput: null
  },

  createButton(label, y, onClick) {
    const offset = getCanvasOffset();
    const button = createButton(label);
    button.position(width/2 - 100 + offset.x, y);
    button.size(200, 50);
    button.style('background-color', 'var(--button-bg)');
    button.style('color', 'var(--button-text)');
    button.style('border', 'none');
    button.style('border-radius', '10px');
    button.style('font-size', '20px');
    button.style('cursor', 'pointer');
    button.mousePressed(onClick);
    this.elements.buttons.push(button);
    return button;
  },

  createDatasetSelector(x, y) {
    const offset = getCanvasOffset();
    const selector = createSelect();
    selector.position(x, y);
    selector.style('width', '200px');
    selector.style('height', '50px');
    selector.style('background-color', 'var(--button-bg)');
    selector.style('color', 'var(--button-text)');
    selector.style('border', 'none');
    selector.style('border-radius', '10px');
    selector.style('padding', '8px');
    selector.style('font-size', '20px');
    selector.style('cursor', 'pointer');
    selector.style('text-align-last', 'center');
    selector.style('text-align', 'center');
    
    Object.entries(dataLoader.datasets).forEach(([key, dataset]) => {
      if (key !== 'custom' || 
         (dataset.locations && dataset.locations.length > 0)) {
        selector.option(dataset.name, key);
      }
    });
    
    this.elements.datasetSelector = selector;
    return selector;
  },

  createImportInput() {
    const input = createFileInput((file) => {
      if (file.type === 'application' && file.subtype === 'json') {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const data = JSON.parse(e.target.result);
            
            // Import score history if it exists
            if (data.scoreHistory) {
              localStorage.setItem('scoreHistory', JSON.stringify(data.scoreHistory));
            }
            
            // Import discovered locations for each dataset
            if (data.discovered) {
              Object.entries(data.discovered).forEach(([datasetKey, locations]) => {
                localStorage.setItem(`discovered_${datasetKey}`, JSON.stringify(locations));
              });
            }
            
            // Import custom locations if they exist
            if (data.customLocations) {
              localStorage.setItem('customLocations', JSON.stringify(data.customLocations));
              dataLoader.datasets.custom.locations = data.customLocations;
            }
            
            // Handle old format (single dataset)
            else if (Object.keys(data).length > 0 && !data.scoreHistory) {
              const currentDataset = localStorage.getItem('selectedDataset') || 'global';
              localStorage.setItem(`discovered_${currentDataset}`, JSON.stringify(data));
            }
            
            alert('Data imported successfully!');
          } catch (err) {
            console.error('Import error:', err);
            alert('Error importing data');
          }
        };
        reader.readAsText(file.file);
      }
    });
    input.style('display', 'none');
    this.elements.importInput = input;
    return input;
  },

  updateElementPositions() {
    const offset = getCanvasOffset();
    
    // Update dataset selector if it exists
    if (this.elements.datasetSelector) {
      this.elements.datasetSelector.position(width/2 - 100 + offset.x, height/3 - 70);
    }
    
    // Update all button positions
    this.elements.buttons.forEach((button, i) => {
      const y = height/3 + i * 70;
      button.position(width/2 - 100 + offset.x, y);
    });
  },

  drawSettingsScreen() {
    if (drawCloseButton()) {
      this.cleanup();
      return;
    }

    // Title
    fill(getTextColor());
    noStroke();
    textSize(32);
    textAlign(CENTER, CENTER);
    text("Settings", width/2, height/6);

    // Create elements if they don't exist
    if (this.elements.buttons.length === 0) {
      let startY = height/3 - 70;
      const spacing = 70;

      // Dataset selector
      const selector = this.createDatasetSelector(width/2 - 100, startY);
      selector.selected(localStorage.getItem('selectedDataset') || 'global');
      selector.changed(() => {
        localStorage.setItem('selectedDataset', selector.value());
        dataLoader.loadQuestions(selector.value());
      });
      startY += spacing;  

      // Location permission button
      this.createButton("Location Access", startY, async () => {
        try {
          await permissionScreen.requestLocation();
        } catch (err) {}
      });
      startY += spacing;

      // Compass permission button
      this.createButton("Compass Access", startY, async () => {
        try {
          await orientationService.requestPermission();
        } catch (err) {}
      });
      startY += spacing;

      // Map settings button
      this.createButton("Map Settings", startY, () => {
        this.cleanup();
        goToScreen("mapSettings");
      });
      startY += spacing;

      // Dark mode toggle
      this.createButton(
        document.documentElement.getAttribute('data-theme') === 'dark' ? "Light Mode" : "Dark Mode", 
        startY,
        () => this.setDarkMode(document.documentElement.getAttribute('data-theme') !== 'dark')
      );
      startY += spacing;

      // Export data button
      this.createButton("Export Data", startY, () => {
        // Get all datasets
        const allData = {};
        const scoreHistory = localStorage.getItem('scoreHistory');
        
        // Add score history if it exists
        if (scoreHistory) {
          allData.scoreHistory = JSON.parse(scoreHistory);
        }
        
        // Add discovered locations from all datasets
        allData.discovered = {};
        Object.keys(dataLoader.datasets).forEach(datasetKey => {
          const discoveredKey = `discovered_${datasetKey}`;
          const data = localStorage.getItem(discoveredKey);
          if (data) {
            allData.discovered[datasetKey] = JSON.parse(data);
          }
        });

        // Add custom locations if they exist
        const customLocations = localStorage.getItem('customLocations');
        if (customLocations) {
          allData.customLocations = JSON.parse(customLocations);
        }
        
        // Only export if we have any data
        if (Object.keys(allData.discovered).length > 0 || 
            allData.scoreHistory || 
            allData.customLocations) {
          const blob = new Blob([JSON.stringify(allData, null, 2)], {type: 'application/json'});
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `rangefinder_all_data.json`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        } else {
          alert('No data to export');
        }
      });
      startY += spacing;

      // Import data button and hidden input
      this.createImportInput();
      this.createButton("Import Data", startY, () => {
        this.elements.importInput.elt.click();
      });

      // Delete data button
      this.createButton("Delete All Data", startY, () => {
        if (confirm('Are you sure you want to delete all discovered locations, custom locations, and scores?')) {
          
          localStorage.removeItem('scoreHistory');
          
          // Remove discovered locations from all datasets
          Object.keys(dataLoader.datasets).forEach(datasetKey => {
            localStorage.removeItem(`discovered_${datasetKey}`);
          });

          // Remove custom locations
          localStorage.removeItem('customLocations');
          dataLoader.datasets.custom.locations = [];
          
          // If we're in the custom dataset, switch to global
          if (localStorage.getItem('selectedDataset') === 'custom') {
            localStorage.setItem('selectedDataset', 'global');
            if (this.elements.datasetSelector) {
              this.elements.datasetSelector.selected('global');
            }
          }
          
          alert('All data deleted');
        }
      });
    }

    // Update positions in case of resize
    this.updateElementPositions();
  },

  setDarkMode(isDark) {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    
    // Update button labels and styles
    this.elements.buttons.forEach(button => {
      if (button.html() === "Dark Mode" || button.html() === "Light Mode") {
        button.html(isDark ? "Light Mode" : "Dark Mode");
      }
      button.style('background-color', 'var(--button-bg)');
      button.style('color', 'var(--button-text)');
    });
    
    // Update other elements
    if (this.elements.datasetSelector) {
      this.elements.datasetSelector.style('background-color', 'var(--button-bg)');
      this.elements.datasetSelector.style('color', 'var(--button-text)');
    }
  },

  cleanup() {
    // Remove all buttons
    this.elements.buttons.forEach(button => button.remove());
    this.elements.buttons = [];
    
    // Remove dataset selector
    if (this.elements.datasetSelector) {
      this.elements.datasetSelector.remove();
      this.elements.datasetSelector = null;
    }
    
    // Remove import input
    if (this.elements.importInput) {
      this.elements.importInput.remove();
      this.elements.importInput = null;
    }
  }
};

// Maps slider 0..1 -> radius
const baseRadiusRanges = [
  { max: 10, decimals: 0 },
  { max: 100, decimals: -1 },
  { max: 1000, decimals: -2 },
  { max: 20000, decimals: -3 }
];

function getRoundedRadiusFromSlider(sliderValue) {
  let segSize = 1 / baseRadiusRanges.length;
  let idx = floor(sliderValue / segSize);
  idx = constrain(idx, 0, baseRadiusRanges.length-1);

  let segProg = (sliderValue - idx*segSize) / segSize;
  let segMin = idx === 0 ? 0 : baseRadiusRanges[idx-1].max;
  let segMax = baseRadiusRanges[idx].max;
  let raw = segMin + (segMax - segMin)*segProg;

  let d = baseRadiusRanges[idx].decimals;
  if (d >= 0) return Number(raw.toFixed(d));
  let f = pow(10, -d);
  let val = round(raw/f)*f;
  return val <= 0 ? 1 : val;
}

function getSliderValueFromRadius(dist) {
  let numSeg = baseRadiusRanges.length;
  let segSize = 1/numSeg;
  for (let i = 0; i < numSeg; i++) {
    let m0 = (i === 0 ? 0 : baseRadiusRanges[i-1].max);
    let m1 = baseRadiusRanges[i].max;
    if (dist >= m0 && dist <= m1) {
      let frac = (dist - m0)/(m1 - m0);
      let result = i*segSize + frac*segSize;
      return constrain(result, 0, 1);
    }
  }
  return dist > baseRadiusRanges[numSeg-1].max ? 1 : 0;
}
