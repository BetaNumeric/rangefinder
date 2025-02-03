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
let mapInitialized = false;

function drawAnswerScreen() {
  const useInteractiveMap = localStorage.getItem('useInteractiveMap') === 'true';
  
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

  if (useInteractiveMap && !mapInitialized) {

    // Ensure dimensions are integers
    mapX = Math.floor(mapX);
    mapY = Math.floor(mapY);
    mapW = Math.floor(mapW);
    mapH = Math.floor(mapH);
     
    const initResult = interactiveMap.initialize(mapX, mapY, mapW, mapH);
    if (initResult) {
      interactiveMap.drawAnswer(currentAnswer);
      mapInitialized = true;
    }
  } else if (!useInteractiveMap) {
    if (!staticMapImg) {
      loadStaticMap();
    }
    if (staticMapImg) {
      imageMode(CORNER);
      let { w: finalW, h: finalH } = drawMapWithAspectRatio(staticMapImg, mapW, mapH, mapX, mapY);
    }
  }


  let distanceError = Math.abs(currentAnswer.correctDistance - currentAnswer.guessDistance);
  let distanceAccuracy = Math.max(0, 100 - (distanceError / currentAnswer.correctDistance * 100));
  
  let dirError = Math.min(
    Math.abs(currentAnswer.correctDirection - currentAnswer.guessDirection),
    360 - Math.abs(currentAnswer.correctDirection - currentAnswer.guessDirection)
  );
  let directionAccuracy = Math.max(0, 100 - (dirError / 180 * 100));

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
    locationLink.innerText = currentQuestion.name;
    
    // Start with default size and reduce if too wide
    let fontSize = 32;
    locationLink.style.fontSize = fontSize + 'px';
    
    // Measure text width using a temporary canvas
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.font = `bold ${fontSize}px Helvetica, Arial, sans-serif`;
    let textWidth = ctx.measureText(currentQuestion.name).width;
    
    // Reduce font size until text fits
    while (textWidth > maxWidth * 0.95 && fontSize > 16) {
      fontSize -= 1;
      ctx.font = `bold ${fontSize}px Helvetica, Arial, sans-serif`;
      textWidth = ctx.measureText(currentQuestion.name).width;
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
    line(locationX - textWidth(currentQuestion.name)/2, locationY + textH/3, 
         locationX + textWidth(currentQuestion.name)/2, locationY + textH/3);
  } else {
    cursor(AUTO);
  }
  
  // Add country name
  textSize(18);
  textStyle(NORMAL);
  fill(getTextColor());
  text(currentQuestion.country, width/2, locationY + 35);

  let centerY = height/4+height/20;
  let radius = min(width, height) * 0.15;
  let spacing = radius * 3;

    drawAccuracyCircle(
    width/2 - spacing/2, 
    centerY,
    radius,
    distanceAccuracy,
    "Distance",
    currentAnswer.guessDistance + " km",
    currentAnswer.correctDistance + " km"
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
  let differenceDistance = round(
    calculateDistance(
      guessedCoords.lat, 
      guessedCoords.lon, 
      currentAnswer.targetLat, 
      currentAnswer.targetLon
    )
  );

  textSize(20);
  fill(getTextColor());
  text("Off by " + differenceDistance + " km", width/2, height/4 + height/5.5);

  // Update score display
  textSize(18);
  fill(getScoreP5Color(currentAnswer.score2));
  text("New Score: " + currentAnswer.score2 + "%", width/2 - 100, height/4 + height/4.5);
  
  fill(getScoreP5Color(currentAnswer.score1));
  text("Old Score: " + currentAnswer.score1 + "%", width/2 + 100, height/4 + height/4.5);

  // After drawing the score
  const currentDataset = localStorage.getItem('selectedDataset') || 'global';
  const avgScore = scoringService.getAverageScore(currentDataset);
  const bestScore = scoringService.getBestScore(currentDataset);
  

  // Save score when entering answer screen
  if (!this.scoreSaved) {
    scoringService.saveScore(currentAnswer);
    this.scoreSaved = true;
  }

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

function drawAccuracyCircle(x, y, radius, accuracy, label, guessValue, correctValue) {
  noFill();
  stroke(getButtonColor());
  strokeWeight(10);
  circle(x, y, radius * 2);

  let col = getScoreP5Color(accuracy);
  stroke(col);
  arc(x, y, radius * 2, radius * 2, -90, -90 + (accuracy * 3.6));

  noStroke();
  fill(getTextColor());
  textAlign(CENTER, CENTER);
  
  textSize(16);
  text(label, x, y - radius/2);
  
  textSize(24);
  fill(col);
  text(guessValue, x, y);
  
  textSize(16);
  fill(getTextColor());
  text("(" + correctValue + ")", x, y + radius/2);
}

function loadStaticMap() {
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
  let guessColorHex = getScoreHexForMap(currentAnswer.score);
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
    `key=AIzaSyCAkeIvVvimW-5uchP9e8mDnSovuh5bNdo`
  ];
  
  let base = "https://maps.googleapis.com/maps/api/staticmap";
  let url = base + "?" + params.join("&");

  staticMapImg = loadImage(
    url,
    () => {}, 
    err => console.error("Map load error:", err)
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

function computeDestinationLatLon(lat1_deg, lon1_deg, distance_km, bearing_deg) {
  const R = 6371;
  let lat1 = radians(lat1_deg);
  let lon1 = radians(lon1_deg);
  let bearing = radians(bearing_deg);
  let d = distance_km;

  let lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d / R) +
    Math.cos(lat1) * Math.sin(d / R) * Math.cos(bearing)
  );
  let lon2 = lon1 + Math.atan2(
    Math.sin(bearing) * Math.sin(d / R) * Math.cos(lat1),
    Math.cos(d / R) - Math.sin(lat1) * Math.sin(lat2)
  );

  let lat2_deg = degrees(lat2);
  let lon2_deg = degrees(lon2);
  lon2_deg = ((lon2_deg + 540) % 360) - 180;
  return { lat: lat2_deg, lon: lon2_deg };
}

function generateGreatCirclePoints(lat1, lon1, lat2, lon2, n) {
  const φ1 = radians(lat1);
  const λ1 = radians(lon1);
  const φ2 = radians(lat2);
  const λ2 = radians(lon2);
  const d = centralAngle(φ1, λ1, φ2, λ2);
  let points = [];

  for (let i = 0; i <= n; i++) {
    let f = i / n;
    let A = Math.sin((1 - f) * d) / Math.sin(d);
    let B = Math.sin(f * d) / Math.sin(d);

    let x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
    let y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
    let z = A * Math.sin(φ1) + B * Math.sin(φ2);

    let φi = Math.atan2(z, Math.sqrt(x * x + y * y));
    let λi = Math.atan2(y, x);
    let lat_i = degrees(φi);
    let lon_i = degrees(λi);
    lon_i = ((lon_i + 540) % 360) - 180;

    points.push({ lat: lat_i, lon: lon_i });
  }
  return points;
}

function centralAngle(φ1, λ1, φ2, λ2) {
  return Math.acos(
    Math.sin(φ1) * Math.sin(φ2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.cos(λ2 - λ1)
  );
}

function radians(deg) { return deg * Math.PI / 180; }
function degrees(rad) { return rad * 180 / Math.PI; }

// Add to cleanup when leaving answer screen
function cleanupAnswerScreen() {
  staticMapImg = null;
  interactiveMap.remove();
  mapInitialized = false;
  this.scoreSaved = false;
  
  // Remove location link
  const locationLink = document.getElementById('location-link');
  if (locationLink) {
    locationLink.remove();
  }
}

// Add a window resize handler
function windowResized() {
  if (currentScreen === "answer") {
    mapInitialized = false;
  }
}

function truncateText(text, maxWidth) {
  let ellipsis = '...';
  let truncated = text;
  
  while (textWidth(truncated + ellipsis) > maxWidth && truncated.length > 0) {
    truncated = truncated.slice(0, -1);
  }
  
  return truncated + ellipsis;
}
