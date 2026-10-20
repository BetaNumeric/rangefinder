// splashScreen.js
/*
Initial loading screen that shows:
- Game logo
- Loading status
- Initial animations
*/

let loadingState = {
  started: false,
  progress: 0,
  message: "Initializing...",
  dots: 0,
  lastDotUpdate: 0,
  rotation: 0
};

function drawSplashScreen() {
  background(getBackgroundColor());
  
  // Draw logo with spinning compass
  if (logoMarker && logoCompass) {
    const maxLogoSize = min(width * 0.6, height * 0.4);
    const aspectRatio = logoMarker.width / logoMarker.height;
    const logoWidth = maxLogoSize;
    const logoHeight = logoWidth / aspectRatio;
    
    push();
    imageMode(CENTER);
    translate(width/2, height/4);
    
    // Draw marker (static)
    if (document.documentElement.getAttribute('data-theme') === 'dark') {
      image(logoMarkerInverted, 0, 0, logoWidth, logoHeight);
    } else {
      image(logoMarker, 0, 0, logoWidth, logoHeight);
    }
    
    // Draw compass (rotating)
    push();
    // Use deltaTime for consistent rotation speed across devices
    loadingState.rotation += (deltaTime / 50); // Adjust this value to control speed
    rotate(loadingState.rotation);
    if (document.documentElement.getAttribute('data-theme') === 'dark') {
      image(logoCompassInverted, 0, 0, logoWidth, logoHeight);
    } else {
      image(logoCompass, 0, 0, logoWidth, logoHeight);
    }
    pop();
    
    pop();
  }
  
  // Show loading text with animated dots
  fill(getTextColor());
  textSize(24);
  noStroke();
  textAlign(CENTER, CENTER);
  
  // Animate loading dots
  if (millis() - loadingState.lastDotUpdate > 500) {
    loadingState.dots = (loadingState.dots + 1) % 4;
    loadingState.lastDotUpdate = millis();
  }
  
  let dots = ".".repeat(loadingState.dots).padEnd(3);
  push();
  text(""+loadingState.message + dots, width/2, height/2);
  pop();
    
  // Start loading if not already started
  if (!loadingState.started) {
    loadingState.started = true;
    
    // Load dataset
    loadingState.message = "Loading locations";
    const selectedDataset = localStorage.getItem('selectedDataset') || 'global';
    dataLoader.selectDataset(dataLoader.datasets[selectedDataset] ? selectedDataset : 'global').then(loaded => {
      if (currentScreen !== 'splash') return;
      if (loaded) goToScreen('mainMenu');
      else loadingState.message = 'Could not load locations';
    });
  }
  if (!dataLoader.isLoading && dataLoader.error) {
    drawInteractiveButton(width / 2 - 75, height * 0.65, 150, 50, 'Try Again', () => {
      loadingState.started = false;
      dataLoader.error = '';
    });
    drawInteractiveButton(width / 2 - 75, height * 0.75, 150, 50, 'Settings', () => goToScreen('settings'));
  }
}
