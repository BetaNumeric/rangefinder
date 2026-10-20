// answerScreen.js
/*
Answer screen that shows:
- Game results and scoring
- Interactive map with guess visualization
- Score statistics
- Play again options
*/

let currentAnswer = {
  correctDistance: 0,
  correctDirection: 0,
  guessDistance: 0,
  guessDirection: 0,
  score: 0
};

let staticMapImg;
let staticMapState = 'idle';
let staticMapRequestId = 0;
let mapInitialized = false;

function drawAnswerScreen() {
  const useInteractiveMap = progressStore.getSetting('useInteractiveMap', 'true') === 'true';
  
  let mapX = 0;
  let mapY = height / 2;
  let mapW = width;
  let mapH = height / 2;

  if (height > width) {
    mapW = width;
    mapH = height / 2.75; 
  } else {
    mapW = height / 2;
    mapH = height / 2;
  }

  mapX = width/2 - mapW/2;
  mapW = round(mapW);
  mapH = round(mapH);

  if (useInteractiveMap && !mapsApi.ensureReady()) {
    interactiveMap.remove();
    mapInitialized = false;
    mapsApi.drawStatus(mapX, mapY, mapW, mapH);
  } else if (useInteractiveMap && !mapInitialized) {

    // Ensure dimensions are integers
    mapX = Math.floor(mapX);
    mapY = Math.floor(mapY);
    mapW = Math.floor(mapW);
    mapH = Math.floor(mapH);
     
    const initResult = interactiveMap.initialize(mapX, mapY, mapW, mapH);
    if (initResult) {
      interactiveMap.drawAnswer(currentAnswer);
      mapInitialized = true;
    } else {
      mapsApi.drawStatus(mapX, mapY, mapW, mapH);
    }
  } else if (!useInteractiveMap) {
    if (staticMapState === 'idle') {
      loadStaticMap();
    }
    if (staticMapState === 'ready' && staticMapImg) {
      imageMode(CORNER);
      let { w: finalW, h: finalH } = drawMapWithAspectRatio(staticMapImg, mapW, mapH, mapX, mapY);
    } else {
      mapsApi.drawStatus(mapX, mapY, mapW, mapH, {
        state: staticMapState,
        onRetry: () => { staticMapState = 'idle'; }
      });
    }
  }

  if (userSettings.practiceMode) {
    // Use game screen's input handling but don't show joysticks
    if (!distanceLocked) drawTiltDistanceInput();
    
    if (!directionLocked) {
      userGuessDirection = orientationService.getHeading();
    }

    // Update current answer with new values
    if (userGuessDistance !== currentAnswer.guessDistance || 
        userGuessDirection !== currentAnswer.guessDirection) {
      
      // Constrain distance to max range setting
      userGuessDistance = constrain(userGuessDistance, 0.001, userSettings.radius);
      
      let score = scoringService.calculateScore(
        currentAnswer.correctDistance,
        userGuessDistance,
        currentAnswer.correctDirection,
        userGuessDirection,
        currentAnswer.playerLat,
        currentAnswer.playerLon,
        currentAnswer.targetLat,
        currentAnswer.targetLon
      );

      // Update display values but don't save to history
      currentAnswer.guessDistance = userGuessDistance;
      currentAnswer.guessDirection = userGuessDirection;
      currentAnswer.score1 = score.score1;
      currentAnswer.score2 = score.score2;
      currentAnswer.details = score.details;
      
      // Update only paths on the map, not markers
      if (interactiveMap.map) {
        interactiveMap.updatePaths(currentAnswer);
      }
    }
  }

  const distanceAccuracy = Math.round(currentAnswer.details.distanceScore);
  const directionAccuracy = Math.round(currentAnswer.details.directionScore);

  textSize(32);
  textAlign(CENTER, CENTER);
  noStroke();
  textStyle(BOLD);
  fill(getTextColor());
  
  // Create clickable location name
  let locationY = height/4 - height/8;
  let locationX = width/2;
  let maxWidth = width * 0.8;
  let textH = 40;
  
  // Create or update the link element
  let linkId = 'location-link';
  let locationLink = document.getElementById(linkId);
  if (!locationLink) {
    locationLink = document.createElement('a');
    locationLink.id = linkId;
    locationLink.style.position = 'absolute';
    locationLink.style.textAlign = 'center';
    locationLink.style.textDecoration = 'none';
    locationLink.style.color = 'inherit';
    locationLink.style.cursor = 'pointer';
    locationLink.style.fontFamily = 'Helvetica, Arial, sans-serif';
    locationLink.style.zIndex = '0';
    locationLink.style.whiteSpace = 'nowrap';
    locationLink.rel = 'noopener noreferrer';
    locationLink.target = '_blank';
    document.body.appendChild(locationLink);
  }

  // Hide link when dropdown is open
  locationLink.style.display = dropdownMenu.isOpen ? 'none' : 'flex';
  
  if (!dropdownMenu.isOpen) {
    // Only update link if dropdown is closed
    const offset = getCanvasOffset();
    locationLink.style.left = (offset.x + locationX - maxWidth/2) + 'px';
    locationLink.style.top = (offset.y + locationY - textH/2) + 'px';
    locationLink.style.width = maxWidth + 'px';
    locationLink.style.height = textH + 'px';
    locationLink.style.alignItems = 'center';
    locationLink.style.justifyContent = 'center';
    
    // Set the link URL
    const origin = `${currentAnswer.playerLat},${currentAnswer.playerLon}`;
    const destination = `${currentAnswer.targetLat},${currentAnswer.targetLon}`;
    locationLink.href = `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=best`;

    // Update link text and base style
    locationLink.style.color = getComputedStyle(document.documentElement).getPropertyValue('--text-color');
    locationLink.style.fontWeight = 'bold';
    locationLink.style.lineHeight = textH + 'px';
    
    // Set text and adjust font size if needed
    locationLink.innerText = currentAnswer.locationName;
    
    // Start with default size and reduce if too wide
    let fontSize = 32;
    locationLink.style.fontSize = fontSize + 'px';
    
    // Measure text width using a temporary canvas
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.font = `bold ${fontSize}px Helvetica, Arial, sans-serif`;
    let textWidth = ctx.measureText(currentAnswer.locationName).width;
    
    // Reduce font size until text fits
    while (textWidth > maxWidth * 0.95 && fontSize > 16) {
      fontSize -= 1;
      ctx.font = `bold ${fontSize}px Helvetica, Arial, sans-serif`;
      textWidth = ctx.measureText(currentAnswer.locationName).width;
    }
    
    locationLink.style.fontSize = fontSize + 'px';
  }

  // Check if mouse is over location name for visual feedback
  if (mouseX > locationX - maxWidth/2 && 
      mouseX < locationX + maxWidth/2 &&
      mouseY > locationY - textH/2 && 
      mouseY < locationY + textH/2) {
    cursor(HAND);
    stroke(getTextColor());
    strokeWeight(1);
    line(locationX - textWidth(currentAnswer.locationName)/2, locationY + textH/3,
         locationX + textWidth(currentAnswer.locationName)/2, locationY + textH/3);
  } else {
    cursor(AUTO);
  }
  
  // Add country name
  textSize(18);
  noStroke();
  textStyle(NORMAL);
  fill(getTextColor());
  text(currentAnswer.country, width/2, locationY + 35);

  let centerY = height/4+height/20;
  let radius = min(width, height) * 0.15;
  let spacing = radius * 3;

    drawAccuracyCircle(
    width/2 - spacing/2, 
    centerY,
    radius,
    distanceAccuracy,
    "Distance",
    geoUtils.formatDistance(currentAnswer.guessDistance),
    geoUtils.formatDistance(currentAnswer.correctDistance),
    currentAnswer.guessDistance,
    currentAnswer.correctDistance
  );

  drawAccuracyCircle(
    width/2 + spacing/2,
    centerY,
    radius,
    directionAccuracy,
    "Direction",
    Math.round(currentAnswer.guessDirection) + "°",
    Math.round(currentAnswer.correctDirection) + "°"
  );

  let guessedCoords = computeDestinationLatLon(
    currentAnswer.playerLat,
    currentAnswer.playerLon,
    currentAnswer.guessDistance,
    currentAnswer.guessDirection
  );
  let differenceDistance = (
    calculateDistance(
      guessedCoords.lat, 
      guessedCoords.lon, 
      currentAnswer.targetLat, 
      currentAnswer.targetLon
    )
  );

  textSize(20);
  fill(getTextColor());
  text("Off by " + geoUtils.formatDistance(differenceDistance), width/2, height/4 + height/5.5);
  fill(getScoreP5Color(currentAnswer.score2));
  text("Score: " + currentAnswer.score2 + "%", width/2, height/4 + height/4.5);

  let btnW = 150, btnH = 50;
  let playAgainX = width/2 - btnW/2;
  let playAgainY = height * 0.9;

  drawInteractiveButton(
    playAgainX, playAgainY,
    btnW, btnH,
    enteredFromSearch ? "New Search" : "Play Again",
    () => {
      if (enteredFromSearch) {
        enteredFromSearch = false; 
        goToScreen("search");
      } else {
        resetLockStates();
        pickNewQuestion();
        goToScreen("game");
      }
    }
  );
  
  // Draw dropdown menu
  dropdownMenu.draw('answer');
  
  if (drawCloseButton()) {
    return;
  }
}

function drawAccuracyCircle(x, y, radius, accuracy, label, guessValue, correctValue, rawGuess = null, rawCorrect = null) {
  // Parse values to numbers for comparison
  const guessNum = rawGuess ?? parseFloat(guessValue);
  const correctNum = rawCorrect ?? parseFloat(correctValue);
  
  // Special handling for direction angles
  const isDirection = label === "Direction";
  let isOvershot = false;
  
  if (isDirection) {
    // Calculate the shortest path between angles
    let diff = ((guessNum - correctNum + 180 + 360) % 360) - 180;
    isOvershot = diff > 0;  // Positive diff means we need to go counterclockwise
  } else {
    isOvershot = guessNum > correctNum;
  }
  
  noFill();
  stroke(getButtonColor());
  strokeWeight(10);
  circle(x, y, radius * 2);

  let col = getScoreP5Color(accuracy);
  stroke(col);
  
  push();
  if (isOvershot) {
    // For overshot values, flip the arc horizontally
    translate(x, y);
    scale(-1, 1);
    translate(-x, -y);
  }
  
  // Draw accuracy arc
  arc(x, y, radius * 2, radius * 2, -90, -90 + (accuracy * 3.6));
  pop();

  noStroke();
  fill(getTextColor());
  textAlign(CENTER, CENTER);
  
  // Responsive text sizing - relative to width below 360px for better scaling
  let labelSize, valueSize, correctSize;
  if (width < 360) {
    // Scale relative to width (at 320px: label=13, value=18, correct=13)
    labelSize = Math.max(1, width * 0.04);
    valueSize = Math.max(1, width * 0.0575);
    correctSize = Math.max(1, width * 0.04);
  } else {
    // Fixed sizes for wider screens
    labelSize = 16;
    valueSize = 24;
    correctSize = 16;
  }
  
  textSize(labelSize);
  text(label, x, y - radius/2);
  
  textSize(valueSize);
  fill(col);
  text(guessValue, x, y);
  
  textSize(correctSize);
  fill(getTextColor());
  text("(" + correctValue + ")", x, y + radius/2);
}

function loadStaticMap() {
  const apiKey = mapsApi.getApiKey();
  if (!apiKey) {
    staticMapState = 'error';
    return;
  }
  staticMapState = 'loading';
  const requestId = ++staticMapRequestId;
  let screenW = width;
  let screenH = height;
  let isPortrait = (screenH > screenW);
  let mapW, mapH;

  if (isPortrait) {
    mapW = min(screenW, 640);
    mapH = min(screenH / 3, 640);
  } else {
    mapW = 640;
    mapH = 640;
  }
  mapW = round(mapW);
  mapH = round(mapH);

  let scale = 2;
  let pLat = currentAnswer.playerLat; 
  let pLon = currentAnswer.playerLon; 
  let tLat = currentAnswer.targetLat;
  let tLon = currentAnswer.targetLon;

  let guessCoords = computeDestinationLatLon(
    pLat, pLon,
    currentAnswer.guessDistance,
    currentAnswer.guessDirection
  );
  let gLat = guessCoords.lat;
  let gLon = guessCoords.lon;
  
  let targetPoints = generateGreatCirclePoints(pLat, pLon, tLat, tLon, 64);
  let targetPathString = buildPathString(targetPoints, "0x000000", 3);
  let differencePoints = generateGreatCirclePoints(gLat, gLon, tLat, tLon, 64);
  let differencePathString = buildPathString(differencePoints, "0x00000033", 1);
  let guessColorHex = getScoreHexForMap(currentAnswer.score2);
  let guessPoints = generateGreatCirclePoints(pLat, pLon, gLat, gLon, 64);
  let guessPathString = buildPathString(guessPoints, guessColorHex, 3);

  let params = [
    `size=${mapW}x${mapH}`,
    `scale=${scale}`,
    `style=feature:all|element:labels|visibility:off`,
    `style=feature:road|element:geometry|visibility:off`,
    `style=feature:poi|visibility:off`,
    `style=feature:transit|visibility:off`,
    `markers=color:black|label:X|${tLat},${tLon}`,
    targetPathString, 
    guessPathString,
    differencePathString,
    `key=${encodeURIComponent(apiKey)}`
  ];
  
  let base = "https://maps.googleapis.com/maps/api/staticmap";
  let url = base + "?" + params.join("&");

  staticMapImg = loadImage(
    url,
    () => { if (requestId === staticMapRequestId) staticMapState = 'ready'; },
    err => {
      if (requestId === staticMapRequestId) staticMapState = 'error';
      console.error("Map load error:", err);
    }
  );
}

function buildPathString(pointsArray, colorHex, weight) {
  let path = `path=color:${colorHex}|weight:${weight}`;
  for (let p of pointsArray) {
    path += `|${p.lat},${p.lon}`;
  }
  return path;
}

function drawMapWithAspectRatio(img, maxW, maxH, x, y) {
  let aspect = img.width / img.height;
  let finalW = maxW;
  let finalH = finalW / aspect;
  image(img, x, y, finalW, finalH);
  return { w: finalW, h: finalH };
}

function getScoreP5Color(score) {
  score = constrain(score, 0, 100);
  let isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  
  let cRed = isDark ? color(200, 0, 0) : color(255, 0, 0);
  let cGreen = isDark ? color(0, 200, 0) : color(0, 255, 0);
  
  return lerpColor(cRed, cGreen, score / 100);
}

function p5ColorToHexString(c) {
  let r = Math.round(red(c));
  let g = Math.round(green(c));
  let b = Math.round(blue(c));
  let rr = r.toString(16).padStart(2, '0');
  let gg = g.toString(16).padStart(2, '0');
  let bb = b.toString(16).padStart(2, '0');
  return rr + gg + bb;
}

function getScoreHexForMap(score) {
  let p5col = getScoreP5Color(score);
  let hexString = p5ColorToHexString(p5col);
  return "0x" + hexString;
}

// Geographic calculation functions moved to geoUtils.js
// computeDestinationLatLon() is now available via backward compatibility alias

function generateGreatCirclePoints(lat1, lon1, lat2, lon2, count) {
  const distance = calculateDistance(lat1, lon1, lat2, lon2);
  const bearing = calculateBearing(lat1, lon1, lat2, lon2);
  return Array.from({ length: count + 1 }, (_, index) => index === count ? { lat: lat2, lon: lon2 }
    : geoUtils.computeDestinationLatLon(lat1, lon1, distance * index / count, bearing));
}

function centralAngle(φ1, λ1, φ2, λ2) {
  return Math.acos(
    Math.sin(φ1) * Math.sin(φ2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.cos(λ2 - λ1)
  );
}

// Use geoUtils functions for conversions
function radians(deg) { return geoUtils.toRadians(deg); }
function degrees(rad) { return geoUtils.toDegrees(rad); }

// Add to cleanup when leaving answer screen
function cleanupAnswerScreen() {
  staticMapImg = null;
  staticMapState = 'idle';
  staticMapRequestId++;
  interactiveMap.remove();
  mapInitialized = false;
  userSettings.practiceMode = false;  // Turn off practice mode
  
  // Remove location link
  const locationLink = document.getElementById('location-link');
  if (locationLink) {
    locationLink.remove();
  }
}

// Note: Window resize is handled in main.js
// Map reinitialization on resize is handled automatically by mapInitialized flag

function truncateText(text, maxWidth) {
  let ellipsis = '...';
  let truncated = text;
  
  while (textWidth(truncated + ellipsis) > maxWidth && truncated.length > 0) {
    truncated = truncated.slice(0, -1);
  }
  
  return truncated + ellipsis;
}
