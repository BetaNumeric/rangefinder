// gameScreen.js

/*
Game screen implementation that handles:
- Core gameplay mechanics
- Distance and direction input
- Joystick controls
- Location display
- Score submission
*/

/*jshint esversion: 8*/

let directionLocked = false;
let distanceLocked = false;

const RECENT_LOCATIONS_SIZE = 100;
let recentLocations = [];

const LAYOUT = {
  titleY: h => h/2,    
  titleSpacing: 50,
  topOverlayHeight: h => h/5,
  compass: {
    size: (w, h) => min(w, h) * 0.90,
    transparency: 180
  },
  arrow: {
    length: h => h/6,
    headSize: 20,
    weight: 1
  },
  statusY: h => h/2 - 100,
  errorY: h => h - 120,
  tiltInput: {
    maxDistance: 20000,
    minBeta: -90,
    maxBeta: 90,
    y: h => h/2 + h/8
  },
  lockButton: {
    width: 120,
    height: 44,
    borderRadius: 8
  },
  button: {
    width: 120,
    height: 50,
    y: h => h * 0.9,
    borderRadius: 8
  },
  distanceY: h => h/2 + 60,
  closeButton: {
    size: 144,
    padding: 16,
    color: 'var(--button-bg)'
  }
};

const JOYSTICK = {
  size: 44,
  innerSize: 44,
  get maxOffset() { return height/3; },
  visualMaxOffset: 32,
  active: false,
  startY: 0,
  currentY: 0,
  adjustingDistance: false,
  baseValue: 0,
  internalValue: 0,
  internalDirection: 0,
  width: 120,
  borderRadius: 8,
  touchArea: 150,
  dragStarted: false,
  touchStartX: 0,
  touchStartY: 0,
  // Use getter for ranges to always use current maxOffset
  get distanceRanges() {
    return [
      { threshold: this.maxOffset*0.2, step: 0.0001, multiplier: 1 },
      { threshold: this.maxOffset*0.4, step: 0.001, multiplier: 2 },
      { threshold: this.maxOffset*0.6, step: 0.01, multiplier: 5 },
      { threshold: this.maxOffset*0.8, step: 0.1, multiplier: 10 },
      { threshold: this.maxOffset, step: 1, multiplier: 20 }
    ];
  },
  get directionRanges() {
    return [
      { threshold: this.maxOffset*0.2, step: 0.005 },
      { threshold: this.maxOffset*0.4, step: 0.05 },
      { threshold: this.maxOffset*0.6, step: 0.1 },
      { threshold: this.maxOffset*0.8, step: 0.5 },
      { threshold: this.maxOffset, step: 1 }
    ];
  }
};

// Add near the top of the file with other event handlers
document.addEventListener('touchmove', function(e) {
  if (JOYSTICK.active) {
    e.preventDefault();
  }
}, { passive: false });

function drawGameScreen() {
  if (dataLoader.isLoading) {
    if (dropdownMenu.isOpen) {
      dropdownMenu.cleanup();
    }
    
    // Show loading state
    textAlign(CENTER, CENTER);
    noStroke();
    textSize(28);
    fill(getTextColor());
    text("Loading new locations...", width/2, height/2);
    return;
  }

  if (!playerLocation) {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(position => {
        playerLocation = {
          lat: position.coords.latitude,
          lon: position.coords.longitude
        };
      }, err => {
        playerLocation = { lat:0, lon:0 };
      });
    }
  }

  drawCompass();

  textAlign(CENTER, CENTER);

  textSize(20);
  
  fill(getTextColor());

  // Draw location name with dynamic font size
  let locationText = `${currentQuestion.name}\n(${currentQuestion.country})`;
  let boxW = width * 0.8;
  let boxX = width/2;
  let boxY = height/2;
  
  // Create temporary canvas for text measurement
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  // Start with default size
  let fontSize = 28;
  ctx.font = `bold ${fontSize}px Helvetica, Arial, sans-serif`;
  let nameWidth = ctx.measureText(currentQuestion.name).width;
  
  // Reduce font size if name is too wide
  while (nameWidth > boxW * 0.95 && fontSize > 16) {
    fontSize -= 1;
    ctx.font = `bold ${fontSize}px Helvetica, Arial, sans-serif`;
    nameWidth = ctx.measureText(currentQuestion.name).width;
  }
  
  push();
  textAlign(CENTER, CENTER);
  textSize(fontSize);
  noStroke();
  textStyle(BOLD);
  text(currentQuestion.name, boxX, height/2);
  
  // Draw country with smaller size
  textAlign(CENTER, BOTTOM);
  textSize(fontSize * 0.65);
  textStyle(NORMAL);
  text(`(${currentQuestion.country})`, boxX, height/2 + fontSize * 1.25);

  drawDirectionArrow();

  let btnX = width/2 - LAYOUT.button.width/2;
  let btnY = LAYOUT.button.y(height);
  
  if (currentQuestion.name === "No location found!") {
    // Show explanation and retry button
    fill(color(255, 100, 100));
    noStroke();
    textAlign(CENTER);
    textSize(16);
    const currentDataset = localStorage.getItem('selectedDataset') || 'global';
    const datasetName = dataLoader.datasets[currentDataset].name;
    const totalLocations = currentDataset === 'custom' ? 
      dataLoader.datasets.custom.locations.length : 
      questions.length;
    
    const locationsInRange = filterAndSortLocationsByDistance(
      currentDataset === 'custom' ? dataLoader.datasets.custom.locations : questions,
      playerLocation.lat, 
      playerLocation.lon, 
      userSettings.radius
    ).length;
    
    text(`No locations found within ${userSettings.radius}km in ${datasetName}.\n` +
         `${locationsInRange} of ${totalLocations} locations in range\n` +
         `Try increasing the range in the settings menu.`, 
      width/2, btnY - LAYOUT.button.height/2-20);
    
    // Add Try Again button
    drawInteractiveButton(
      btnX, btnY,
      LAYOUT.button.width, LAYOUT.button.height,
      "Try Again",
      () => {
        pickNewQuestion();
      }
    );
  } else {
    drawInteractiveButton(
      btnX, btnY,
      LAYOUT.button.width, LAYOUT.button.height,
      "Submit",
      () => {
        // Only allow submission if not dragging a joystick
        if (!JOYSTICK.dragStarted) {
          if (!directionLocked) {
            userGuessDirection = orientationService.getHeading();
          }
          submitGuess();
        }
      }
    );
  }

  let heading = directionLocked ? userGuessDirection : orientationService.getHeading();
  let directionBtn = drawLockButton(Math.round(heading), directionLocked, width/2, LAYOUT.statusY(height), '°');
  let distanceBtn = drawLockButton(userGuessDistance, distanceLocked, width/2, LAYOUT.distanceY(height), 'km');

  // Add mouse drag handling near the top of drawGameScreen
  if (mouseIsPressed) {
    let dirTouchArea = {
      x: directionBtn.x,
      y: directionBtn.y,
      w: directionBtn.w,
      h: directionBtn.h
    };
    let distTouchArea = {
      x: distanceBtn.x,
      y: distanceBtn.y,
      w: distanceBtn.w,
      h: distanceBtn.h
    };
    
    let inDirArea = mouseX > dirTouchArea.x && mouseX < dirTouchArea.x + dirTouchArea.w &&
                    mouseY > dirTouchArea.y && mouseY < dirTouchArea.y + dirTouchArea.h;
    let inDistArea = mouseX > distTouchArea.x && mouseX < distTouchArea.x + distTouchArea.w &&
                     mouseY > distTouchArea.y && mouseY < distTouchArea.y + distTouchArea.h;
    
    if (!JOYSTICK.active) {
      if (inDirArea || inDistArea) {
        JOYSTICK.active = true;
        JOYSTICK.adjustingDistance = inDistArea;
        JOYSTICK.touchStartX = mouseX;
        JOYSTICK.touchStartY = mouseY;
        JOYSTICK.startY = mouseY;
        JOYSTICK.currentY = mouseY;
        JOYSTICK.dragStarted = false;
        JOYSTICK.baseValue = inDistArea ? userGuessDistance : userGuessDirection;
      }
    } else {
      // Check if we've moved enough to consider it a drag
      let dragDist = dist(JOYSTICK.touchStartX, JOYSTICK.touchStartY, mouseX, mouseY);
      if (dragDist > 4) {
        JOYSTICK.dragStarted = true;
        if (JOYSTICK.adjustingDistance) {
          distanceLocked = true;
        } else {
          directionLocked = true;
        }
      }

      if (JOYSTICK.dragStarted) {
        JOYSTICK.currentY = mouseY;
        let offset = JOYSTICK.currentY - JOYSTICK.startY;
        offset = constrain(offset, -JOYSTICK.maxOffset, JOYSTICK.maxOffset);
        
        
        if (JOYSTICK.adjustingDistance) {
          // Find appropriate step size based on offset
          let step = 0;
          let multiplier = 1;
          for (let range of JOYSTICK.distanceRanges) {
            if (abs(offset) <= range.threshold) {
              step = range.step;
              multiplier = range.multiplier;
              break;
            }
          }
          
          // Store precise internal value
          if (!JOYSTICK.internalValue) {
            JOYSTICK.internalValue = userGuessDistance;
          }
          
          // Scale step size based on current value
          if (JOYSTICK.internalValue > 1000) {
            step *= multiplier*10;
          } else if (JOYSTICK.internalValue > 100) {
            step *= multiplier*1;
          } else if (JOYSTICK.internalValue > 10) {
            step *= multiplier*0.1;
          } else if (JOYSTICK.internalValue > 1) {
            step *= multiplier*0.01;
          }
          
          // Apply step based on direction
          if (offset < 0) {
            JOYSTICK.internalValue += step;
          } else if (offset > 0) {
            JOYSTICK.internalValue -= step;
          }
          
          // Constrain internal value
          JOYSTICK.internalValue = constrain(JOYSTICK.internalValue, 0.001, userSettings.radius);
          
          // Round for display using the same ranges as tilt input
          const ranges = [
            { max: 0.01, decimals: 3 },
            { max: 0.1, decimals: 2 },
            { max: 1, decimals: 1 },
            { max: 10, decimals: 1 },
            { max: 100, decimals: 0 },
            { max: 1000, decimals: -1 },
            { max: 20000, decimals: -2 }
          ];

          // Find appropriate rounding
          for (let range of ranges) {
            if (JOYSTICK.internalValue <= range.max) {
              if (range.decimals >= 0) {
                userGuessDistance = Number(JOYSTICK.internalValue.toFixed(range.decimals));
              } else {
                const factor = Math.pow(10, -range.decimals);
                userGuessDistance = Math.round(JOYSTICK.internalValue/factor) * factor;
              }
              break;
            }
          }
        } else {
          // Adjust direction continuously with variable step size
          // Store precise internal value on first touch
          if (!JOYSTICK.internalDirection) {
            JOYSTICK.internalDirection = userGuessDirection;
          }
          
          // Find appropriate step size based on offset
          let step = 0;
          for (let range of JOYSTICK.directionRanges) {
            if (abs(offset) <= range.threshold) {
              step = range.step;
              break;
            }
          }
          
          // Apply step based on direction
          if (offset < 0) {
            JOYSTICK.internalDirection = (JOYSTICK.internalDirection + step) % 360;
          } else if (offset > 0) {
            JOYSTICK.internalDirection = (JOYSTICK.internalDirection - step + 360) % 360;
          }
          
          // Round for display
          userGuessDirection = Math.round(JOYSTICK.internalDirection);
        }
      }
    }
  } else if (!touches.length) {
    // Reset joystick when no input
    JOYSTICK.active = false;
    JOYSTICK.dragStarted = false;
    JOYSTICK.internalValue = null;
    JOYSTICK.internalDirection = null;
  }

  if (!distanceLocked) {
    drawTiltDistanceInput();
  }

  if (!directionLocked) {
    userGuessDirection = heading;
  }

  if (!orientationService.hasCompass()) {
    fill(255, 0, 0);
    text("Compass not available", width/2, LAYOUT.errorY(height));
  }
  
  
  // Draw dropdown menu
  dropdownMenu.draw('game');
  
  if (drawCloseButton()) {
    return;
  }
  
  // Update the click handling section:
  if (!mouseIsPressed && lastMousePressed) {
    // Only handle unlock if we haven't dragged
    if (!JOYSTICK.dragStarted) {
      // Check for direction button clicks
      if (mouseX > directionBtn.x && mouseX < directionBtn.x + directionBtn.w &&
          mouseY > directionBtn.y && mouseY < directionBtn.y + directionBtn.h) {
        if (directionLocked) {
          // Unlock if locked
          directionLocked = false;
          JOYSTICK.active = false;
          JOYSTICK.internalDirection = null;
        } else {
          // Lock if unlocked
          directionLocked = true;
          userGuessDirection = Math.round(orientationService.getHeading());
        }
      }
      
      // Check for distance button clicks
      if (mouseX > distanceBtn.x && mouseX < distanceBtn.x + distanceBtn.w &&
          mouseY > distanceBtn.y && mouseY < distanceBtn.y + distanceBtn.h) {
        if (distanceLocked) {
          // Unlock if locked
          distanceLocked = false;
          JOYSTICK.active = false;
          JOYSTICK.internalValue = null;
        } else {
          // Lock if unlocked
          distanceLocked = true;
          // Keep current tilt input value when locking
          userGuessDistance = userGuessDistance;
        }
      }
    }
  }
}

function drawDirectionArrow() {
  push();
  imageMode(CENTER);
  translate(width/2, height/2);
  stroke(getTextColor()); 
  strokeWeight(LAYOUT.arrow.weight);
  noFill(); 
  line(0, -height/2+LAYOUT.statusY(height), 0, -LAYOUT.compass.size(width, height)/2-LAYOUT.arrow.headSize);

  if (document.documentElement.getAttribute('data-theme') === 'dark') {
    filter(INVERT);
  }
  image(compassArrow, 0, -LAYOUT.compass.size(width, height)/2-LAYOUT.arrow.headSize-1, LAYOUT.arrow.headSize, LAYOUT.arrow.headSize);
  if (document.documentElement.getAttribute('data-theme') === 'dark') {
    filter(INVERT);
  }

  
  pop();
}

function drawCompass() {
  if (compassRose) {
    push();
    imageMode(CENTER);
    translate(width/2, height/2);
    let compassSize = LAYOUT.compass.size(width, height);
    let heading = directionLocked ? userGuessDirection : orientationService.getHeading();
    rotate(-heading); 
    
    image(compassRose, 0, 0, compassSize, compassSize);
    if (document.documentElement.getAttribute('data-theme') === 'dark') {
      image(compassRoseInverted, 0, 0, compassSize, compassSize);
    } else {
      image(compassRose, 0, 0, compassSize, compassSize);
    }
    
    //noTint();
    
    pop();
  } else {
    push();
    translate(width/2, height/2);
    let compassSize = min(width, height) * 0.9;
    fill(255, 255, 255, 200);
    stroke(200);
    ellipse(0, 0, compassSize, compassSize);
    let heading = orientationService.getHeading();
    rotate(-heading);
    drawBasicCompass(compassSize);
    pop();
  }
}

function drawBasicCompass(size) {
  textSize(size/20);
  textAlign(CENTER, CENTER);
  noStroke();
  fill(getTextColor());
  text("N", 0, -size/2 + size/20);
  text("S", 0, size/2 - size/20);
  text("E", size/2 - size/20, 0);
  text("W", -size/2 + size/20, 0);

  stroke(getTextColor());
  for (let i = 0; i < 360; i += 15) {
    push();
    rotate(radians(i));
    let markerLength = (i % 90 === 0) ? size/30 :
                       (i % 45 === 0) ? size/40 : size/50;
    line(0, -size/2, 0, -size/2 + markerLength);
    pop();
  }
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const φ1 = lat1 * Math.PI/180;
  const φ2 = lat2 * Math.PI/180;
  const Δφ = (lat2-lat1) * Math.PI/180;
  const Δλ = (lon2-lon1) * Math.PI/180;
  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function calculateBearing(lat1, lon1, lat2, lon2) {
  const φ1 = lat1 * Math.PI/180;
  const φ2 = lat2 * Math.PI/180;
  const λ1 = lon1 * Math.PI/180;
  const λ2 = lon2 * Math.PI/180;
  const y = Math.sin(λ2-λ1) * Math.cos(φ2);
  const x = Math.cos(φ1)*Math.sin(φ2) -
            Math.sin(φ1)*Math.cos(φ2)*Math.cos(λ2-λ1);
  const θ = Math.atan2(y, x);
  return (θ*180/Math.PI + 360) % 360;
}

function drawTiltDistanceInput() {
  if (distanceLocked) return;
  let beta = orientationService.getBeta();
  let normalizedTilt = constrain(beta / 70, 0, 1);
  let maxDist = userSettings.radius || 20000;
  let minDist = 0.001;

  const baseRanges = [
    { max: 0.01, decimals: 3 },
    { max: 0.1, decimals: 2 },
    { max: 1, decimals: 1 },
    { max: 10, decimals: 1 },
    { max: 100, decimals: 0 },
    { max: 1000, decimals: -1 },
    { max: 20000, decimals: -2 }
  ];

  let tiltRanges = buildTiltRanges(baseRanges, minDist, maxDist);
  if (tiltRanges.length === 0) {
    userGuessDistance = minDist;
    return;
  }

  let segmentSize = 1 / tiltRanges.length;
  let rangeIndex = Math.floor(normalizedTilt / segmentSize);
  rangeIndex = constrain(rangeIndex, 0, tiltRanges.length - 1);
  let segmentProgress = (normalizedTilt - rangeIndex * segmentSize) / segmentSize;
  let seg = tiltRanges[rangeIndex];
  let segMin = seg.min;
  let segMax = seg.max;
  let rawDistance = segMin + (segMax - segMin) * segmentProgress;
  let decimals = seg.decimals;

  if (decimals >= 0) {
    userGuessDistance = Number(rawDistance.toFixed(decimals));
  } else {
    let factor = Math.pow(10, -decimals); 
    userGuessDistance = Math.round(rawDistance / factor) * factor;
  }
}

function buildTiltRanges(baseRanges, minDist, maxDist) {
  let output = [];
  for (let i = 0; i < baseRanges.length; i++) {
    let seg = baseRanges[i];
    let segMin = i === 0 ? 0 : baseRanges[i - 1].max;
    let segMax = seg.max;
    let decimals = seg.decimals;
    let actualMin = Math.max(segMin, minDist);
    let actualMax = Math.min(segMax, maxDist);
    if (actualMin < actualMax) {
      output.push({ min: actualMin, max: actualMax, decimals: decimals });
    }
  }
  return output;
}

function submitGuess() {
  console.log("Submit guess called");
  // Don't submit if no valid location
  if (currentQuestion.name === "No location found!") {
    return;
  }

  let correctDistance = calculateDistance(
    playerLocation.lat, playerLocation.lon,
    currentQuestion.lat, currentQuestion.lon
  );

  // Round the correct distance using the same ranges as input
  const roundDistance = (dist) => {
    const ranges = [
      { max: 0.01, decimals: 3 },
      { max: 0.1, decimals: 2 },
      { max: 1, decimals: 1 },
      { max: 10, decimals: 1 },
      { max: 100, decimals: 0 },
      { max: 1000, decimals: -1 },
      { max: 20000, decimals: -2 }
    ];

    for (let range of ranges) {
      if (dist <= range.max) {
        if (range.decimals >= 0) {
          return Number(dist.toFixed(range.decimals));
        } else {
          const factor = Math.pow(10, -range.decimals);
          return Math.round(dist/factor) * factor;
        }
      }
    }
    return Math.round(dist);
  };

  correctDistance = roundDistance(correctDistance);
  
  let correctDirection = calculateBearing(
    playerLocation.lat, playerLocation.lon,
    currentQuestion.lat, currentQuestion.lon
  );

  let score = scoringService.calculateScore(
    correctDistance,
    userGuessDistance,
    correctDirection,
    userGuessDirection,
    playerLocation.lat,
    playerLocation.lon,
    currentQuestion.lat,
    currentQuestion.lon
  );

  currentAnswer = {
    correctDistance: correctDistance,
    correctDirection: correctDirection,
    guessDistance: userGuessDistance,
    guessDirection: userGuessDirection,
    score1: score.score1,
    score2: score.score2,
    details: score.details,
    targetLat: currentQuestion.lat,
    targetLon: currentQuestion.lon,
    playerLat: playerLocation.lat,
    playerLon: playerLocation.lon
  };
  goToScreen("answer");
}

function drawLockButton(value, isLocked, x, y, label) {
  let btnW = LAYOUT.lockButton.width;
  let btnH = LAYOUT.lockButton.height;
  let btnX = x - btnW/2;
  
  // Check if this button is being used as a joystick
  let isJoystickActive = JOYSTICK.active && 
    ((JOYSTICK.adjustingDistance && label === 'km') || 
     (!JOYSTICK.adjustingDistance && label === '°'));


  // Draw button background
  if (isLocked || isJoystickActive) {
    stroke(getButtonColor());
    strokeWeight(4);
    noFill(); 
    rect(btnX+btnW/2-8, y+2, 16, btnH-4, LAYOUT.lockButton.borderRadius);

    fill(color(getComputedStyle(document.documentElement).getPropertyValue('--button-locked')));
  } else {
    fill(getButtonColor());
  }


  
  if (isJoystickActive) {
    // Get visual offset for active joystick
    let offset = JOYSTICK.currentY - JOYSTICK.startY;
    offset = constrain(offset, -JOYSTICK.maxOffset, JOYSTICK.maxOffset);
    let visualOffset = (offset / JOYSTICK.maxOffset) * JOYSTICK.visualMaxOffset;
    y += visualOffset;
  }


  
  noStroke();
  rect(btnX, y, btnW, btnH, LAYOUT.lockButton.borderRadius);

  // Draw text
  if (isLocked || isJoystickActive) {
    fill(color(getComputedStyle(document.documentElement)
      .getPropertyValue('--button-locked-text')));
  } else {
    fill(getTextColor());
  }

  textSize(20);
  text(value + (label ? ' ' + label : ''), x, y + btnH/2);
  return { x: btnX, y: y, w: btnW, h: btnH };
}

function handleLockButtonClick(x, y, w, h) {
  return mouseIsPressed &&
         mouseX > x && mouseX < x + w &&
         mouseY > y && mouseY < y + h;
}

function resetLockStates() {
  directionLocked = false;
  distanceLocked = false;
}

function pickNewQuestion() {
  console.log("pickNewQuestion start");
  if (!playerLocation) {
    playerLocation = { lat: 52.52, lon: 13.405 };
  }
  
  let possible = filterAndSortLocationsByDistance(
    questions, 
    playerLocation.lat, 
    playerLocation.lon, 
    userSettings.radius
  );
  
  console.log("Total possible locations:", possible.length);
  console.log("Current question:", currentQuestion?.name);
  console.log("Recent locations:", recentLocations);

  if (possible.length === 0) {
    console.warn("No locations found within radius = " + userSettings.radius);
    currentQuestion = {
      name: "No location found!",
      lat: 0,
      lon: 0,
      type: "N/A",
      country: "N/A",
      population: 0
    };
    return;
  }

  // Always avoid at least the current question if we have more than one option
  let availableLocations = possible;
  if (possible.length > 1) {
    availableLocations = possible.filter(loc => 
      currentQuestion ? loc.name !== currentQuestion.name : true
    );
  }
  console.log("Locations after removing current:", availableLocations.length);
  
  // Then try to avoid recently used locations if we have enough options
  if (availableLocations.length > RECENT_LOCATIONS_SIZE) {
    let nonRecentLocations = availableLocations.filter(loc => 
      !recentLocations.includes(loc.name)
    );
    console.log("Non-recent locations available:", nonRecentLocations.length);
    if (nonRecentLocations.length > 0) {
      availableLocations = nonRecentLocations;
    }
  }
  
  // Pick a random location from available ones
  let randIndex = Math.floor(Math.random() * availableLocations.length);
  currentQuestion = availableLocations[randIndex];
  console.log("Selected new question:", currentQuestion.name);
  
  // Add to recent locations and remove oldest if needed
  if (!recentLocations.includes(currentQuestion.name)) {
    recentLocations.push(currentQuestion.name);
    if (recentLocations.length > RECENT_LOCATIONS_SIZE) {
      recentLocations.shift();
    }
    console.log("Updated recent locations:", recentLocations);
  }
  
  resetLockStates();
}

function drawJoystick(x, y, isActive) {
  push();
  // Draw back button
  if (isActive) {
    fill(color(getComputedStyle(document.documentElement)
      .getPropertyValue('--button-locked'))); 
  } else {
    fill(getButtonColor());
  }
  noStroke(); 
  rect(x - JOYSTICK.width/2, y - JOYSTICK.size/2, JOYSTICK.width, JOYSTICK.size, JOYSTICK.borderRadius);
       
  
  // Draw inner slider with constrained visual movement
  let innerY = y;
  if (isActive) {
    // Get full range offset for input
    let offset = JOYSTICK.currentY - JOYSTICK.startY;
    offset = constrain(offset, -JOYSTICK.maxOffset, JOYSTICK.maxOffset);
    
    // Scale down the visual offset
    let visualOffset = (offset / JOYSTICK.maxOffset) * JOYSTICK.visualMaxOffset;
    innerY = y + visualOffset;
  }
  
  fill(getButtonColor());
  noFill();
  stroke(getButtonColor());
  rect(x - JOYSTICK.width/2, innerY - JOYSTICK.innerSize/2, JOYSTICK.width, JOYSTICK.innerSize, JOYSTICK.borderRadius); 
  pop();
}

function drawInteractiveButton(x, y, w, h, label, action, cornerRadius = 10) {
  const isHovered = mouseX > x && mouseX < x + w && mouseY > y && mouseY < y + h;
  const isDisabled = JOYSTICK.dragStarted;
  
  if (isDisabled) {
    fill(lerpColor(getButtonColor(), color(0), 0.4)); 
  } else if (isHovered && mouseIsPressed) {
    fill(lerpColor(getButtonColor(), color(0), 0.2)); 
  } else {
    fill(getButtonColor());
  }
  
  noStroke();
  rect(x, y, w, h, cornerRadius);
  fill(isDisabled ? color(150) : getTextColor()); 
  textAlign(CENTER, CENTER);
  textSize(20);
  text(label, x + w/2, y + h/2);

  if (!isDisabled && isHovered && !mouseIsPressed && lastMousePressed) {
    action();
  }
}
