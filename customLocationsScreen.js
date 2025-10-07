/*
Custom locations management screen that provides:
- List of custom locations
- Deletion functionality
- Location statistics
*/

let customLocationsScreen = {
  scrollOffset: 0,
  maxScroll: 0,
  touchStart: 0,
  
  draw() {

    // Title
    fill(getTextColor());
    noStroke();
    textSize(32);
    textAlign(CENTER, CENTER);
    text("Custom Locations", width/2, height/8);

    const locations = dataLoader.datasets.custom.locations || [];
    
    // Show count
    textSize(20);
    text(`${locations.length} locations`, width/2, height/8 + 40);

    // Calculate max scroll based on content
    const itemHeight = 80;
    const startY = height/4;
    const visibleHeight = height - startY - 20;
    this.maxScroll = Math.max(0, (locations.length * itemHeight) - visibleHeight);
    
    // Clamp scroll
    this.scrollOffset = constrain(this.scrollOffset, 0, this.maxScroll);

    // Draw locations
    push();
    translate(0, -this.scrollOffset);
    
    locations.forEach((loc, index) => {
      const y = startY + (index * itemHeight);
      
      // Only draw if in view
      if (y + itemHeight > this.scrollOffset && y < this.scrollOffset + height) {
        // Location box
        fill(getButtonColor());
        noStroke();
        rect(20, y, width - 40, itemHeight - 10, 10);
        
        // Location info
        fill(getTextColor());
        textAlign(LEFT, CENTER);  
        textSize(18);
        text(loc.name+" ("+loc.country+")", 40, y + itemHeight/2 - 5);
        
        // Delete button
        let deleteBtn = {
          x: width - 100,
          y: y + 15,
          w: 60,
          h: 40
        };
        
        //fill(color(200, 50, 50));
        //rect(deleteBtn.x, deleteBtn.y, deleteBtn.w, deleteBtn.h, 8);
        
        fill(getTextColor());
        textAlign(CENTER, CENTER);
        textSize(18);
        text("X", deleteBtn.x + deleteBtn.w/2, deleteBtn.y + deleteBtn.h/2);
        
        // Handle delete click
        if (mouseIsPressed && !lastMousePressed &&
            mouseX > deleteBtn.x && mouseX < deleteBtn.x + deleteBtn.w &&
            mouseY > deleteBtn.y - this.scrollOffset && 
            mouseY < deleteBtn.y + deleteBtn.h - this.scrollOffset) {
          if (confirm(`Delete "${loc.name}"?`)) {
            dataLoader.datasets.custom.locations.splice(index, 1);
            localStorage.setItem('customLocations', 
              JSON.stringify(dataLoader.datasets.custom.locations)
            );
          }
        }
      }
    });
    pop();

    // Show scroll indicators if needed
    if (this.maxScroll > 0) {
      if (this.scrollOffset > 0) {
        fill(getTextColor());
        triangle(width/2, 60, width/2 - 10, 75, width/2 + 10, 75);
      }
      if (this.scrollOffset < this.maxScroll) {
        fill(getTextColor());
        triangle(width/2, height - 20, width/2 - 10, height - 35, width/2 + 10, height - 35);
      }
    }
    
    
    
    // Draw dropdown menu
    dropdownMenu.draw('customLocations');
    
    if (drawCloseButton()) {
      goToScreen("search");
      return;
    }

  },

  mouseWheel(event) {
    if (currentScreen === 'customLocations') {
      this.scrollOffset += event.delta;
      this.scrollOffset = constrain(this.scrollOffset, 0, this.maxScroll);
      return false;
    }
  },

  touchStarted() {
    if (currentScreen === 'customLocations') {
      this.touchStart = mouseY;
      return false; // Prevent default
    }
  },

  touchMoved() {
    if (currentScreen === 'customLocations') {
      this.scrollOffset = constrain(
        this.touchStart - mouseY,
        0,
        this.maxScroll
      );
      return false; // Prevent default
    }
  },

  // Add touch end handler
  touchEnded() {
    if (currentScreen === 'customLocations') {
      this.touchStart = 0;
      return false;
    }
  }
}; 
