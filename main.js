// main.js
/*
Main application file that handles:
- Game state and initialization
- Screen management and transitions
- Asset loading (images)
- Window and canvas setups
- Core game loop (draw function)
*/
/*jshint esversion: 8*/

// App version - update this to change version everywhere
const APP_VERSION = "2.41";

let currentScreen = "splash"; 
let questions = [];
let currentQuestionIndex = 0;
let userGuessDistance = 0;
let userGuessDirection = 0; 
let currentQuestion = null;
let compassRose;
let compassRoseInverted;
let compassArrow;
let compassArrowInverted;
let logo;
let logoInverted;
let logoMarker;
let logoMarkerInverted;
let logoCompass;
let logoCompassInverted;
let settingsIcon;
let settingsIconInverted;
let playerLocation = null;
let roundLocation = null;
let frameRates = [];
const FRAMERATE_SAMPLES = 60;
let lastMousePressed = false;
const DEV_MODE = false;
let debugText = "";
let mainCanvas;
let enteredFromSearch = false;

let userSettings = {
  radius: 2000,
  practiceMode: false
};

// Debounce utility for performance optimization
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Draws a loading progress bar with status text (reusable component)
 * @param {number} centerX - X position of center
 * @param {number} centerY - Y position of center
 * @param {number} barWidth - Width of progress bar
 * @param {string} title - Title text above progress bar (optional)
 */
function drawLoadingProgressBar(centerX, centerY, barWidth = null, title = null) {
  if (!dataLoader || !dataLoader.isLoading) return;
  
  const actualBarWidth = barWidth || width * 0.6;
  const barHeight = 8;
  const barX = centerX - actualBarWidth/2;
  const barY = centerY;
  
  push();
  
  // Draw title if provided
  if (title) {
    textAlign(CENTER, CENTER);
    textSize(28);
    fill(getTextColor());
    noStroke();
    text(title, centerX, barY - 40);
  }
  
  // Show loading status text ABOVE the progress bar
  if (dataLoader.loadingText) {
    textSize(14);
    fill(getTextColor());
    textAlign(CENTER, CENTER);
    text(dataLoader.loadingText, centerX, barY - 10);
  }
  
  // Background bar
  noStroke();
  fill(getTextColor());
  rect(barX, barY, actualBarWidth, barHeight, barHeight/2);
  
  // Progress bar
  fill(lerpColor(color(200, 200, 200), getTextColor(), 0.5));
  const progress = dataLoader.loadingProgress || 0;
  rect(barX, barY, actualBarWidth * progress, barHeight, barHeight/2);
  
  // Progress percentage text
  textSize(16);
  fill(getTextColor());
  textAlign(CENTER, CENTER);
  text(`${Math.round(progress * 100)}%`, centerX, barY + 20);
  
  // Show retry info if retrying
  if (dataLoader.retryAttempt > 0) {
    textSize(14);
    fill(lerpColor(getTextColor(), color(255, 100, 0), 0.3));
    text(`Connection issue, retry ${dataLoader.retryAttempt}/3`, centerX, barY + 50);
  }
  
  pop();
}

// Maps and Places readiness is managed by mapsApi.js.

function preload() {
  
  loadImage("assets/images/compass_rose.png", 
    img => {
      compassRose = img;
    },
    error => {
      console.error("Error loading compass rose:", error);
      compassRose = null;
    }
  );
  
  loadImage("assets/images/compass_rose_inverted.png", 
    img => {
      compassRoseInverted = img;
    },
    error => {
      console.error("Error loading compass rose:", error);
      compassRoseInverted = null;
    }
  );
  
  loadImage("assets/images/arrow.png", 
    img => {
      compassArrow = img;
    },
    error => {
      console.error("Error loading arrow:", error);
      compassArrow = null;
    }
  );
  
  loadImage("assets/images/arrow_inverted.png", 
    img => {
      compassArrowInverted = img;
    },
    error => {
      console.error("Error loading inverted arrow:", error);
      compassArrowInverted = null;
    }
  );
  
  loadImage("assets/images/rangefinder_logo.png", 
    img => {
      logo = img;
    },
    error => {
      console.error("Error loading logo:", error);
      logo = null;
    }
  );
  
  loadImage("assets/images/rangefinder_logo_inverted.png", 
    img => {
      logoInverted = img;
    },
    error => {
      console.error("Error loading inverted logo:", error);
      logoInverted = null;
    }
  );

  loadImage("assets/images/rangefinder_marker.png", 
    img => {
      logoMarker = img;
    },
    error => {
      console.error("Error loading logo marker:", error);
      logoMarker = null;
    }
  );
  
  loadImage("assets/images/rangefinder_marker_inverted.png", 
    img => {
      logoMarkerInverted = img;
    },
    error => {
      console.error("Error loading logo marker:", error);
      logoMarkerInverted = null;
    }
  );
  
  loadImage("assets/images/rangefinder_compass.png", 
    img => {
      logoCompass = img;
    },
    error => {
      console.error("Error loading logo compass:", error);
      logoCompass = null;
    }
  );  
  
  loadImage("assets/images/rangefinder_compass_inverted.png", 
    img => {
      logoCompassInverted = img;
    },
    error => {
      console.error("Error loading logo compass:", error);
      logoCompassInverted = null;
    }
  );
  
  loadImage("assets/images/settings.png", 
    img => {
      settingsIcon = img;
    },
    error => {
      console.error("Error loading settings:", error);
      settingsIcon = null;
    }
  );
  
  loadImage("assets/images/settings_inverted.png",
    img => {
      settingsIconInverted = img;
    },
    error => {
      console.error("Error loading settings:", error);
      settingsIconInverted = null;
    }
  );


}

async function setup() {
  mapsApi.load();
  // Calculate canvas size to maintain portrait orientation
  let canvasWidth = windowWidth;
  let canvasHeight = windowHeight;
  
  // If width is greater than height, limit width to maintain portrait ratio
  if (windowWidth > windowHeight) {
    canvasWidth = windowHeight * 0.6;
  }
  
  // Create the canvas and store the reference
  mainCanvas = createCanvas(canvasWidth, canvasHeight);
  const mainCanvasEl = mainCanvas.elt;
  
  textAlign(CENTER, CENTER);
  
  // Update HTML title with version
  document.title = `v${APP_VERSION} Rangefinder`;

  // A fresh fix is required; (0,0) must never stand in for missing location data.
  playerLocation = null;
  orientationService.start();
  frameRate(60);
  angleMode(DEGREES);

  try {
    if (screen.orientation && screen.orientation.lock) {
      await screen.orientation.lock('portrait');
    } else if (screen.lockOrientation) {
      screen.lockOrientation('portrait');
    }
  } catch (error) {
    // Expected on desktop browsers - orientation lock only works on mobile devices
    console.log("Orientation lock unavailable (normal on desktop):", error.message || error);
  }
  
  // Attach input listeners to the actual canvas element
  mainCanvasEl.addEventListener('touchstart', function(e) {
    if (currentScreen !== "permissions") {
      e.preventDefault();
    }
  }, { passive: false });
  
  mainCanvasEl.addEventListener('touchmove', function(e) {
    if (currentScreen !== "permissions") {
      e.preventDefault();
    }
  }, { passive: false });
  
  // Add these new listeners
  mainCanvasEl.addEventListener('touchend', function(e) {
    if (currentScreen !== "permissions") {
      e.preventDefault();
    }
  }, { passive: false });
  
  mainCanvasEl.addEventListener('contextmenu', function(e) {
    e.preventDefault();
  });
  
  // Prevent long press (merged with touchstart above)

  // Initialize theme from localStorage (unified with settingsScreen.js)
  const savedTheme = progressStore.getSetting('theme');
  const theme = savedTheme === 'dark' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', theme);

  // Set interactive map as default
  if (progressStore.getSetting('useInteractiveMap') === null) {
    progressStore.setSetting('useInteractiveMap', 'true');
  }

  mapSettingsScreen.initialize();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopLocationUpdates();
    else if (currentScreen === 'mainMenu' || currentScreen === 'game') startLocationUpdates();
  });
  window.addEventListener('storage', event => {
    if (event.key !== progressStore.key) return;
    progressStore.get(true);
    dataLoader.syncCustomLocations(true);
    if (currentScreen === 'discoveries' && discoveryMap.map) discoveryMap.updateMarkers();
  });
}

function draw() {
  frameRates.push(frameRate());
  if (frameRates.length > FRAMERATE_SAMPLES) {
    frameRates.shift();
    let avgFPS = frameRates.reduce((a, b) => a + b) / frameRates.length;
    if (avgFPS < 20) {
      orientationService.updateInterval = 50;
      orientationService.filterFactor = 0.2;
    }
  }

  background(getBackgroundColor());
  
  switch (currentScreen) {
    case "splash":
      drawSplashScreen();
      break;
    case "mainMenu":
      drawMainMenuScreen();
      break;
    case "settings":
      settingsScreen.drawSettingsScreen();
      break;
    case "game":
      drawGameScreen();
      break;
    case "answer":
      drawAnswerScreen();
      break;
    case "permissions":
      permissionScreen.draw();
      break;
    case "scores":
      drawScoresScreen();
      break;
    case "discoveries":
      drawDiscoveryMapScreen();
      break;
    case "mapSettings":
      mapSettingsScreen.drawSettingsScreen();
      break;
    case "search":
      drawSearchLocationScreen();
      break;
    case "customLocations":
      customLocationsScreen.draw();
      break;
  }

  // Draw debug text if in dev mode
  if (DEV_MODE) {
    push();
    fill(255, 0, 0);
    textSize(12);
    textAlign(LEFT, TOP);
    text(debugText, 10, 10);
    pop();
  }

  lastMousePressed = mouseIsPressed;
}

function goToScreen(newScreen) {
  // Cleanup previous screen
  if (currentScreen === "answer") {
    cleanupAnswerScreen();
  } else if (currentScreen === "settings") {
    settingsScreen.cleanup();
  } else if (currentScreen === "discoveries") {
    discoveryMap.remove();
  } else if (currentScreen === "search") {
    searchLocationScreen.cleanup();
  } else if (currentScreen === "permissions") {
    permissionScreen.cleanup();
  } else if (currentScreen === "mapSettings") {
    mapSettingsScreen.cleanup();
  } else if (currentScreen === "game") {
    // Clean up game screen event listeners
    if (typeof cleanupJoystickTouchHandler === 'function') {
      cleanupJoystickTouchHandler();
    }
  }
  
  dropdownMenu.onScreenExit();
  
  currentScreen = newScreen;
  
  // Start location updates when entering game screen
  if (newScreen === 'game' && playerLocation) roundLocation = { ...playerLocation };
  if (newScreen === 'game' || newScreen === 'mainMenu') {
    startLocationUpdates();
  } else stopLocationUpdates();

  if (newScreen === "discoveries") {
    discoveryMap.remove();
  }
}

function mousePressed() {
  if (currentScreen === "permissions") {
    permissionScreen.handleClick();
  }
}

function getCanvasOffset() {
  return {
    x: (windowWidth - width) / 2,
    y: 0
  };
}

// Debounced resize timer
let resizeDebounceTimer = null;

// Window resize handler with debouncing (p5.js calls this automatically)
function windowResized() {
  // Clear existing timer
  if (resizeDebounceTimer) {
    clearTimeout(resizeDebounceTimer);
  }
  
  // Set new timer - actual resize happens after 150ms of no resize events
  resizeDebounceTimer = setTimeout(() => {
    let canvasWidth = windowWidth;
    let canvasHeight = windowHeight;
    
    if (windowWidth > windowHeight) {
      canvasWidth = windowHeight * 0.6;
    }
    
    resizeCanvas(canvasWidth, canvasHeight);
    
    // Handle screen-specific resize logic
    if (currentScreen === "answer") {
      // Reset map initialization to trigger recreation with new dimensions
      mapInitialized = false;
    }
  }, 150);
}

function startNewGame() {
  if (!questions.length || dataLoader.isLoading) {
    loadingState.started = false;
    goToScreen('splash');
    return;
  }
  if (DEV_MODE) {
    if (!playerLocation) {
      playerLocation = { lat: 52.52, lon: 13.405 };
    }
    if (!orientationService.hasPermission) {
      orientationService.hasPermission = true;
    }
    currentQuestionIndex = 0;
    resetLockStates();
    pickNewQuestion();
    goToScreen("game");
    return;
  }

  // Show permissions screen, but don't start game immediately
  goToScreen("permissions");
}

function drawCloseButton() {
  let buttonSize = 44;
  let padding = 16;
  
  // Position in top left
  let closeX = padding;
  let closeY = padding;
  
  // Draw button background
  noStroke();
  fill(getButtonColor());
  rect(closeX, closeY, buttonSize, buttonSize, 8); 
  
  // Draw the "back" arrow icon
  stroke(getTextColor());
  strokeWeight(2);
  noFill();
  
  let iconPadding = 12;
  let arrowX = closeX + iconPadding;
  let arrowY = closeY + buttonSize/2;
  let arrowWidth = buttonSize - (iconPadding * 2);
  
  // Draw arrow pointing left
  line(arrowX + arrowWidth, arrowY, arrowX, arrowY);
  line(arrowX, arrowY, arrowX + 8, arrowY - 8);
  line(arrowX, arrowY, arrowX + 8, arrowY + 8);
  
  if (mouseIsPressed && !lastMousePressed &&
      mouseX > closeX && mouseX < closeX + buttonSize &&
      mouseY > closeY && mouseY < closeY + buttonSize) {
    if (currentScreen === "customLocations") {
      goToScreen("search");
    } else if (currentScreen === "mapSettings") {
      goToScreen("settings");
    } else if (currentScreen === "game") {
      dropdownMenu.cleanup();
      resetLockStates();
      goToScreen("mainMenu");
    } else {
      if (currentScreen === "answer") {
        dropdownMenu.cleanup();
      } else if (currentScreen === "settings") {
        settingsScreen.cleanup();
      } else if (currentScreen === "permissions") {
        permissionScreen.cleanup();
      }
      goToScreen("mainMenu");
    }
    return true;
  }
  return false;
}

// Add helper functions for colors
function getBackgroundColor() {
  return color(getComputedStyle(document.documentElement)
    .getPropertyValue('--background-color'));
}

function getTextColor() {
  return color(getComputedStyle(document.documentElement)
    .getPropertyValue('--text-color'));
}

function getButtonColor() {
  return color(getComputedStyle(document.documentElement)
    .getPropertyValue('--button-bg'));
}

function drawInteractiveButton(x, y, w, h, label, action, cornerRadius = 10) {
  const isHovered = mouseX > x && mouseX < x + w && mouseY > y && mouseY < y + h;
  
  if (isHovered && mouseIsPressed) {
    fill(lerpColor(getButtonColor(), color(0), 0.2)); 
  } else {
    fill(getButtonColor());
  }
  noStroke();
  rect(x, y, w, h, cornerRadius);
  fill(getTextColor());
  textAlign(CENTER, CENTER);
  
  // Responsive text sizing for buttons - scale relative to width below 300px
  let buttonTextSize;
  if (width < 300) {
    // Scale relative to width (at 280px: ~18px, at 250px: ~16px)
    buttonTextSize = Math.max(1, width * 0.064);
  } else {
    // Fixed size for wider screens
    buttonTextSize = 20;
  }
  
  textSize(buttonTextSize);
  text(label, x + w/2, y + h/2);

  if (isHovered && !mouseIsPressed && lastMousePressed) {
    action();
  }
}

function getPermissionStatusColor(isGranted, isDark = document.documentElement.getAttribute('data-theme') === 'dark') {
  if (isGranted) { 
    return isDark ? '#408040' : '#90EE90';
  } else { 
    return isDark ? '#804040' : '#FFB6C1';
  }
}

function addDebugText(text) {
  debugText = text + "\n" + debugText.split("\n").slice(0, 10).join("\n");
}

function mouseWheel(event) {
  if (customLocationsScreen.mouseWheel) {
    customLocationsScreen.mouseWheel(event);
  }
}

function touchStarted() {
  if (customLocationsScreen.touchStarted) {
    customLocationsScreen.touchStarted();
  }
}

function touchMoved() {
  if (customLocationsScreen.touchMoved) {
    customLocationsScreen.touchMoved();
  }
}

function touchEnded() {
  if (customLocationsScreen.touchEnded) {
    customLocationsScreen.touchEnded();
  }
}
