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
    loadingState.rotation += 2; // Adjust speed by changing this value
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
  textAlign(CENTER, CENTER);
  
  // Animate loading dots
  if (millis() - loadingState.lastDotUpdate > 500) {
    loadingState.dots = (loadingState.dots + 1) % 4;
    loadingState.lastDotUpdate = millis();
  }
  
  let dots = ".".repeat(loadingState.dots).padEnd(3);
  push();
  text(loadingState.message + dots, width/2, height/2);
  pop();
    
  // Start loading if not already started
  if (!loadingState.started) {
    loadingState.started = true;
    
    // Load dataset
    loadingState.message = "Loading";
    const selectedDataset = localStorage.getItem('selectedDataset') || 'global';
    dataLoader.loadQuestions(selectedDataset, (loadedQuestions) => {
      if (loadedQuestions && loadedQuestions.length > 0) {
        questions = loadedQuestions;
        userSettings.radius = dataLoader.datasets[selectedDataset].defaultRadius;
        
        // Small delay to ensure everything is ready
        setTimeout(() => {
          loadingState = { 
            started: false, 
            progress: 0, 
            message: "Initializing...", 
            dots: 0, 
            lastDotUpdate: 0,
            rotation: 0 
          };
          goToScreen("mainMenu");
        }, 500);
      } else {
        loadingState.message = "Error loading data";
      }
    });
  }
}
