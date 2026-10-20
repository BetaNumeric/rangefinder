// mainMenuScreen.js
/*
Main menu screen that provides:
- Game mode selection
- Location
- Animated compass logo
- Navigation to other screens
*/
/*jshint esversion: 8 */

let mainMenuButtons = [
  {
    label: "Start Game", 
    action: () => { 
      enteredFromSearch = false;  // Reset the flag when starting from main menu
      startNewGame(); 
    }
  },
  {
    label: "Add Locations",
    action: () => { goToScreen("search"); }
  },
  {
    label: "Discoveries", 
    action: () => { goToScreen("discoveries"); }
  },
  {
    label: "Settings", 
    action: () => { goToScreen("settings"); }
  }
];

let rotationState = {
  baseAngle: 0,
  oscillation: 0,
  oscillationSpeed: 20,
  nextJumpTime: 0,
  isJumping: false,
  targetAngle: 0,
  currentSpeed: 1
};

let locationUpdateInterval = null;

function startLocationUpdates() {
  if (locationUpdateInterval !== null || document.hidden ||
      progressStore.getSetting('locationPermission') !== 'granted' || !navigator.geolocation) return;
  locationUpdateInterval = navigator.geolocation.watchPosition(position => {
    playerLocation = { lat: position.coords.latitude, lon: position.coords.longitude };
  }, error => console.warn('Location update unavailable:', error),
  { enableHighAccuracy: false, maximumAge: 10000, timeout: 15000 });
}

function stopLocationUpdates() {
  if (locationUpdateInterval !== null) {
    navigator.geolocation.clearWatch(locationUpdateInterval);
    locationUpdateInterval = null;
  }
}

function drawMainMenuScreen() {
  // Start location updates when entering menu
  if (locationUpdateInterval === null) {
    startLocationUpdates();
  }

  // Draw logo
  if (logoMarker) {
    const maxLogoSize = min(width * 0.6, height * 0.4);
    const aspectRatio = logoMarker.width / logoMarker.height;
    const logoWidth = maxLogoSize;
    const logoHeight = logoWidth / aspectRatio;
    
    push();
    imageMode(CENTER);
    push();
    
    // Only show coordinates if we have playerLocation
    if (playerLocation) {
      const latDMS = convertToDMS(playerLocation.lat, 'N', 'S');
      const lonDMS = convertToDMS(playerLocation.lon, 'E', 'W');
      text(`${latDMS}   ${lonDMS}`, width/2, height/2);
    }
    
    translate(width/2, height/4);
    
    // Use deltaTime for smoother animation
    const bounceSpeed = 0.1;
    const bounceAmount = 20;
    
    // Only bounce if we have a valid location
    const hasValidLocation = playerLocation && 
      (playerLocation.lat !== 0 || playerLocation.lon !== 0) &&
      progressStore.getSetting('locationPermission') === 'granted';
      
    if (hasValidLocation) {
      translate(0, -bounceAmount * sin((millis() * bounceSpeed) % 360));
    }
    
    if (document.documentElement.getAttribute('data-theme') === 'dark') {
      image(logoMarkerInverted, 0, 0, logoWidth, logoHeight);
    } else {
      image(logoMarker, 0, 0, logoWidth, logoHeight);
    }
    
    if(!orientationService.hasCompass()) {
      // Update rotation state
      let currentTime = millis();
       
      if (currentTime > rotationState.nextJumpTime) {
        if (!rotationState.isJumping) { 
          rotationState.isJumping = true;
          rotationState.targetAngle = random(360);
          rotationState.currentSpeed = random(1, 2); 
          rotationState.nextJumpTime = currentTime + random(4000, 8000);
        }
      }
      
      // Handle jumping transition
      if (rotationState.isJumping) {
        let diff = rotationState.targetAngle - rotationState.baseAngle;
        if (diff > 180) diff -= 360;
        if (diff < -180) diff += 360;
        
        rotationState.baseAngle += diff * 0.02; 
         
        if (abs(diff) < 1) {
          rotationState.isJumping = false;
          rotationState.currentSpeed = 1;
        }
      }
      
      // Update oscillation
      rotationState.oscillation = sin(currentTime/rotationState.oscillationSpeed) * 20;
      
      // Apply rotation
      rotate(rotationState.baseAngle + rotationState.oscillation * rotationState.currentSpeed);
    } else {
      rotate(-orientationService.getHeading());
    }

    if (document.documentElement.getAttribute('data-theme') === 'dark') {
      image(logoCompassInverted, 0, 0, logoWidth, logoHeight);
    } else {
      image(logoCompass, 0, 0, logoWidth, logoHeight);
    }
    pop();
    

    pop();
  }

  textSize(40);
  fill(getTextColor());

  let btnWidth = width/2;
  const btnHeight = Math.max(44, Math.min(60, height * 0.08));
  const gap = Math.max(10, Math.min(20, height * 0.025));
  const stackHeight = mainMenuButtons.length * btnHeight + (mainMenuButtons.length - 1) * gap;
  const startY = Math.min(height * 0.55, height - stackHeight - 16);

  for (let i = 0; i < mainMenuButtons.length; i++) {
    let x = width/2 - btnWidth/2;
    let y = startY + i*(btnHeight+gap);
    
    drawInteractiveButton(
      x, y, btnWidth, btnHeight,
      mainMenuButtons[i].label,
      mainMenuButtons[i].action
    );
  }
  if (progressStore.notice) {
    textSize(12);
    text('Progress needs attention. Open Settings for details.', width/2, height - 8);
  }
}

// Helper function to convert decimal degrees to DMS format
function convertToDMS(degrees, posChar, negChar) {
  const direction = degrees >= 0 ? posChar : negChar;
  degrees = Math.abs(degrees);
  
  const d = Math.floor(degrees);
  const mFloat = (degrees - d) * 60;
  const m = Math.floor(mFloat);
  const s = Math.round((mFloat - m) * 60);
  
  let finalM = m;
  let finalD = d;
  let finalS = s;
  
  if (finalS === 60) {
    finalS = 0;
    finalM += 1;
    if (finalM === 60) {
      finalM = 0;
      finalD += 1;
    }
  }
  
  return `${finalD}° ${finalM}' ${finalS}" ${direction}`;
}
