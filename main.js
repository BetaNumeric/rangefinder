// main.js
/*
Main application file that handles:
- Game state and initialization
- Screen management and transitions
- Asset loading (images)
- Window and canvas setup
- Core game loop (draw function)
*/
/*jshint esversion: 8*/

let currentScreen = "splash"; 
let questions = [];
let currentQuestionIndex = 0;
let userGuessDistance = 0;
let userGuessDirection = 0; 
let currentQuestion = null;
let compassRose;
let compassRoseInverted;
let compassArrow;
let logo;
let logoInverted;
let logoMarker;
let logoMarkerInverted;
let logoCompass;
let logoCompassInverted;
let settingsIcon;
let settingsIconInverted;
let playerLocation = null;
let frameRates = [];
const FRAMERATE_SAMPLES = 60;
let lastMousePressed = false;
const DEV_MODE = false;
let debugText = "";
let mainCanvas;
let enteredFromSearch = false;

let userSettings = {
  radius: 2000
};

window.initMap = function() {
  console.log("Google Maps API loaded");
  interactiveMap.isLoaded = true;
};

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
  // Calculate canvas size to maintain portrait orientation
  let canvasWidth = windowWidth;
  let canvasHeight = windowHeight;
  
  // If width is greater than height, limit width to maintain portrait ratio
  if (windowWidth > windowHeight) {
    canvasWidth = windowHeight * 0.6;
  }
  
  // Create the canvas and store the reference
  mainCanvas = createCanvas(canvasWidth, canvasHeight);
  
  textAlign(CENTER, CENTER);

  try {
    if (screen.orientation && screen.orientation.lock) {
      await screen.orientation.lock('portrait');
    } else if (screen.lockOrientation) {
      screen.lockOrientation('portrait');
    }
  } catch (error) {
  }
  
  try {
    if ("geolocation" in navigator) {
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject);
      });
      playerLocation = {
        lat: position.coords.latitude,
        lon: position.coords.longitude
      };
      localStorage.setItem('locationPermission', 'granted');
    }
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      const response = await DeviceOrientationEvent.requestPermission();
      if (response === 'granted') {
        orientationService.hasPermission = true;
        localStorage.setItem('compassPermission', 'granted');
      }
    }
  } catch (error) {
    console.error("Error requesting initial permissions:", error);
  }

  orientationService.start();
  frameRate(60);
  angleMode(DEGREES);
  
  mainCanvas = document.getElementsByTagName('canvas')[0];
  mainCanvas.addEventListener('touchstart', function(e) {
    if (currentScreen !== "permissions") {
      e.preventDefault();
    }
  }, { passive: false });
  
  mainCanvas.addEventListener('touchmove', function(e) {
    if (currentScreen !== "permissions") {
      e.preventDefault();
    }
  }, { passive: false });

  // Initialize dark mode from localStorage
  const darkMode = localStorage.getItem('darkMode') === 'enabled';
  document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');

  // Set interactive map as default
  if (localStorage.getItem('useInteractiveMap') === null) {
    localStorage.setItem('useInteractiveMap', 'true');
  }

  mapSettingsScreen.initialize();
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
  }
  
  dropdownMenu.onScreenExit();
  
  currentScreen = newScreen;
  
  // Start location updates when entering game screen
  if (newScreen === "game") {
    startLocationUpdates();
  }

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

function windowResized() {
  let canvasWidth = windowWidth;
  let canvasHeight = windowHeight;
  
  if (windowWidth > windowHeight) {
    canvasWidth = windowHeight * 0.6;
  }
  
  resizeCanvas(canvasWidth, canvasHeight);
  let offset = getCanvasOffset(); 
}

function startNewGame() {
  console.log("Starting new game");
  if (DEV_MODE) {
    if (!playerLocation) {
      playerLocation = { lat: 52.52, lon: 13.405 };
    }
    if (!orientationService.hasPermission) {
      orientationService.hasPermission = true;
    }
    currentQuestionIndex = 0;
    resetLockStates();
    console.log("About to call pickNewQuestion from startNewGame");
    pickNewQuestion();
    goToScreen("game");
    return;
  }

  // Check if we need permissions first
  if (!playerLocation || !orientationService.hasPermission) {
    goToScreen("permissions");  // Changed from currentScreen = to goToScreen()
    return;
  }
  
  // Only proceed with game start if we have necessary permissions
  if (!orientationService.getHeading()) {
    orientationService.start(); 
  }
  
  currentQuestionIndex = 0;
  resetLockStates();
  pickNewQuestion();
  goToScreen("game");
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
    if (currentScreen === "game") {
      dropdownMenu.cleanup();
      resetLockStates();
    } else if (currentScreen === "answer") {
      dropdownMenu.cleanup();
    } else if (currentScreen === "settings") {
      settingsScreen.cleanup();
    } else if (currentScreen === "permissions") {
      permissionScreen.cleanup();
    }
    goToScreen("mainMenu");
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
  textSize(20);
  text(label, x + w/2, y + h/2);

  if (isHovered && !mouseIsPressed && lastMousePressed) {
    console.log("Button clicked:", label);
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
