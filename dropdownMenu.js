// dropdownMenu.js
/*
Dropdown menu component that provides:
- Quick access to settings
- Dataset selection
- Range adjustment
- Screen-specific options
- Consistent menu styling across screens
*/ 


let dropdownMenu = {
  isOpen: false,
  radiusSlider: null,
  datasetSelector: null,
  isChangingDataset: false,
  
  draw(currentScreen) {
    if (!this.isOpen) {
      // Draw settings button in top right
      let buttonSize = 44;
      let padding = 16;
      let x = width - buttonSize - padding;
      let y = padding;
      
      noStroke();
      fill(getButtonColor());
      rect(x, y, buttonSize, buttonSize, 8);
      
      imageMode(CENTER);
      image(settingsIcon, x + buttonSize/2, y + buttonSize/2, buttonSize-padding, buttonSize-padding);
      if (document.documentElement.getAttribute('data-theme') === 'dark') {
        image(settingsIconInverted, x + buttonSize/2, y + buttonSize/2, buttonSize-padding, buttonSize-padding);
      }
      
      // Only handle click on release
      if (!mouseIsPressed && lastMousePressed &&
          mouseX > x && mouseX < x + buttonSize &&
          mouseY > y && mouseY < y + buttonSize) {
        this.isOpen = true;
        this.createControls(currentScreen);
      }
    } else {
      // Draw dropdown panel
      let panelWidth = width;
      let panelHeight = this.getPanelHeight(currentScreen);
      let x = 0;
      let y = 0;
      
      // Check for click outside menu
      if (!mouseIsPressed && lastMousePressed) {
        if (mouseX < x || mouseX > x + panelWidth || 
            mouseY < y || mouseY > y + panelHeight) {
          this.cleanup();
          return;
        }
      }
      
      noStroke();
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      if (isDark) {
        fill(45, 45, 45);
      } else {
        fill(235, 235, 235);
      }
      rect(x, y, panelWidth, panelHeight);
      
      // Bottom border
      stroke(getButtonColor());
      strokeWeight(1);
      line(x, y + panelHeight, x + panelWidth, y + panelHeight);
      
      // Close button
      stroke(getTextColor());
      strokeWeight(2);
      let closeX = x + panelWidth - 40;
      let closeY = y + 16;
      line(closeX, closeY, closeX + 20, closeY + 20);
      line(closeX + 20, closeY, closeX, closeY + 20);
      
      // Settings content
      noStroke();
      fill(getTextColor());
      textAlign(LEFT, CENTER);
      textSize(20);
      let contentY = y + 80;

      // Dataset selector for specific screens
      if (!['mainMenu', 'splash', 'search', 'customLocations'].includes(currentScreen)) {
        text("Dataset", x + 20, contentY);
        if (!this.datasetSelector) {
          this.createDatasetSelector(x + panelWidth - 170, contentY);
        }
        this.datasetSelector.style('background-color', getComputedStyle(document.documentElement)
          .getPropertyValue('--button-bg'));
        this.datasetSelector.style('color', getComputedStyle(document.documentElement)
          .getPropertyValue('--button-text'));
        this.datasetSelector.style('border', 'none');
        this.datasetSelector.style('padding', '8px');
        this.datasetSelector.style('border-radius', '8px');
        this.datasetSelector.style('cursor', 'pointer');
        this.datasetSelector.style('font-size', '16px');
        contentY += 60;
      }
      
      // Only show radius control in game/answer screen
      if (currentScreen === 'game' || currentScreen === 'answer') {
        text("Max Range", x + 20, contentY);
        textAlign(RIGHT);
        text(`${userSettings.radius} km`, x + panelWidth - 20, contentY);
        contentY += 100;
      }
      
      // Add practice mode toggle for answer screen
      if (currentScreen === 'answer') {
        fill(getTextColor());
        textAlign(LEFT);
        text("Practice Mode", x + 20, contentY);
        this.drawToggleSwitch(x + panelWidth - 70, contentY, 
          () => userSettings.practiceMode,
          (enabled) => {
            userSettings.practiceMode = enabled;
            // Reset input values when enabling practice mode
            if (enabled) {
              userGuessDistance = currentAnswer.guessDistance;
              userGuessDirection = currentAnswer.guessDirection;
            }
          }
        );
        contentY += 60;
      }
      
      // Dark Mode Toggle always shown
      textAlign(LEFT);
      fill(getTextColor());
      text("Dark Mode", x + 20, contentY);
      this.drawToggleSwitch(x + panelWidth - 70, contentY);
      
      // handle close click on release
      if (!mouseIsPressed && lastMousePressed) {
        if (mouseX > closeX - 10 && mouseX < closeX + 30 &&
            mouseY > closeY - 10 && mouseY < closeY + 30) {
          this.cleanup();
        }
      }
    }
  },
  
  getPanelHeight(currentScreen) {
    switch(currentScreen) {
      case 'game':
        return 280; 
      case 'answer':
        return 340; 
      case 'discoveries':
      case 'scores':
        return 180; 
      case 'search':
      case 'customLocations':
        return 130;
      default:
        return 130; 
    }
  },
  
  createDatasetSelector(x, y) {
    if (!this.datasetSelector) {
      const offset = getCanvasOffset();
      this.datasetSelector = createSelect();
      this.datasetSelector.position(x + offset.x, y - 15);
      this.datasetSelector.style('width', '150px');
      
      Object.entries(dataLoader.datasets).forEach(([key, dataset]) => {
        // Only show custom dataset if it has locations
        if (key !== 'custom' || 
           (dataset.locations && dataset.locations.length > 0)) {
          this.datasetSelector.option(dataset.name, key);
        }
      });
      
      const currentDataset = localStorage.getItem('selectedDataset') || 'global';
      // If current dataset is custom but empty, switch to global
      if (currentDataset === 'custom' && 
          (!dataLoader.datasets.custom.locations || 
           dataLoader.datasets.custom.locations.length === 0)) {
        localStorage.setItem('selectedDataset', 'global');
        this.datasetSelector.selected('global');
      } else {
        this.datasetSelector.selected(currentDataset);
      }
      
      this.datasetSelector.changed(() => {
        if (this.isChangingDataset) return;
        this.isChangingDataset = true;
        
        localStorage.setItem('selectedDataset', this.datasetSelector.value());
        const newDataset = this.datasetSelector.value();
        
        // Clear recent locations when changing datasets
        recentLocations = [];
        
        // Update max range based on dataset
        userSettings.radius = dataLoader.datasets[newDataset].defaultRadius;
        
        // Clean up dropdown immediately when loading starts
        this.cleanup();
        
        // Reload questions
        dataLoader.loadQuestions(newDataset, (loadedQuestions) => {
          console.log("Dataset changed, loading new questions");
          if (loadedQuestions && loadedQuestions.length > 0) {
            questions = loadedQuestions;
            if (currentScreen === 'game' || currentScreen === 'answer') {
              console.log("About to call pickNewQuestion from dataset change");
              pickNewQuestion();
            }
          }
          
          // Update views that need refreshing
          if (currentScreen === 'discoveries') {
            discoveryMap.updateMarkers();
          }
        });
      });
    }
  },
  
  drawToggleSwitch(x, y, getValue = () => document.documentElement.getAttribute('data-theme') === 'dark', 
                  onToggle = (enabled) => settingsScreen.setDarkMode(enabled)) {
    const isEnabled = getValue();
    let toggleWidth = 50;
    let toggleHeight = 24;
    
    // Draw background
    noStroke();
    fill(isEnabled ? getButtonColor() : '#cccccc');
    rect(x, y - toggleHeight/2, toggleWidth, toggleHeight, toggleHeight/2);
    
    // Draw knob
    fill(isEnabled ? getTextColor() : '#ffffff');
    let knobSize = toggleHeight - 4;
    let knobX = isEnabled ? x + toggleWidth - knobSize - 2 : x + 2;
    circle(knobX + knobSize/2, y, knobSize);
    
    // Handle click
    if (mouseIsPressed && !lastMousePressed &&
        mouseX > x && mouseX < x + toggleWidth &&
        mouseY > y - toggleHeight/2 && mouseY < y + toggleHeight/2) {
      onToggle(!isEnabled);
    }
  },
  
  createControls(currentScreen) {
    let contentY = 80;
    
    // Create dataset selector for specific screens
    if (!['mainMenu', 'splash', 'search', 'customLocations'].includes(currentScreen)) {
      this.createDatasetSelector(width - 170, contentY);
      contentY += 50;
    }
    
    // Only create radius slider for game/answer screens
    if (currentScreen === 'game' || currentScreen === 'answer') {
      this.createRadiusSlider();
    }
  },
  
  createRadiusSlider() {
    if (!this.radiusSlider) {
      const offset = getCanvasOffset();
      this.radiusSlider = createSlider(0, 1, 0.5, 0.001);
      
      // Make the slider more touch-friendly
      this.radiusSlider.style('width', width - 40 + 'px');
      this.radiusSlider.style('height', '60px');
      this.radiusSlider.style('-webkit-appearance', 'none');
      this.radiusSlider.style('appearance', 'none');
      this.radiusSlider.style('background', 'transparent');
      this.radiusSlider.style('cursor', 'pointer');
      
      // Add custom CSS for the slider
      const sliderStyle = document.createElement('style');
      sliderStyle.textContent = `
        input[type=range] {
          -webkit-appearance: none;
          width: 100%;
          background: transparent;
        }

        input[type=range]::-webkit-slider-runnable-track {
          width: 100%;
          height: 8px;
          background: var(--button-bg);
          border-radius: 4px;
          border: none;
        }

        input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none;
          height: 32px;
          width: 32px;
          border-radius: 50%;
          background: var(--text-color);
          margin-top: -12px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.3);
          cursor: pointer;
        }

        input[type=range]::-moz-range-track {
          width: 100%;
          height: 8px;
          background: var(--button-bg);
          border-radius: 4px;
          border: none;
        }

        input[type=range]::-moz-range-thumb {
          height: 32px;
          width: 32px;
          border-radius: 50%;
          background: var(--text-color);
          border: none;
          box-shadow: 0 1px 3px rgba(0,0,0,0.3);
          cursor: pointer;
        }

        input[type=range]:focus {
          outline: none;
        }
      `;
      document.head.appendChild(sliderStyle);
      
      let initVal = getSliderValueFromRadius(userSettings.radius);
      this.radiusSlider.value(initVal);
      
      this.radiusSlider.input(() => {
        let sVal = this.radiusSlider.value();
        userSettings.radius = getRoundedRadiusFromSlider(sVal);
      });
      
      this.radiusSlider.position(20 + offset.x, 150);
    }
  },
  
  cleanup() {
    this.isOpen = false;
    if (this.radiusSlider) {
      this.radiusSlider.remove();
      this.radiusSlider = null;
    }
    if (this.datasetSelector) {
      this.datasetSelector.remove();
      this.datasetSelector = null;
    }
    this.isChangingDataset = false;
  },

  // Add method to handle screen transitions
  onScreenExit() {
    if (this.isOpen) {
      this.cleanup();
    }
  }
}; 
