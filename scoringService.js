// scoringService.js
/*
Scoring system that manages:
- Score calculations
- Score history
- Statistics tracking
- Location discovery tracking
*/

let scoringService = {
  calculateScore: function(correctDistance, guessDistance, correctDir, guessDir, playerLat, playerLon, targetLat, targetLon) {
    // Direction scoring - Linear from 0° to 90°
    let directionDiff = Math.min(
      Math.abs(correctDir - guessDir),
      360 - Math.abs(correctDir - guessDir)
    );
    let directionScore = Math.max(0, 100 * (1 - directionDiff / 90));

    // Distance scoring - Method 1 (legacy)
    let distanceError = Math.abs(correctDistance - guessDistance);
    let distanceScore1;
    if (correctDistance < 0.1) {
      distanceScore1 = Math.max(0, 100 * (1 - distanceError));
    } else if (correctDistance < 1) {
      const relativeError = distanceError / correctDistance;
      distanceScore1 = 100 * (1 - Math.min(1, relativeError));
    } else {
      const relativeError = distanceError / correctDistance;
      distanceScore1 = 100 * Math.exp(-2 * relativeError);
    }

    // Distance scoring - Method 2 (actual distance between guess and target)
    const guessPoint = computeDestinationLatLon(
      playerLat, 
      playerLon, 
      guessDistance, 
      guessDir
    );
    const actualDistance = calculateDistance(
      guessPoint.lat, guessPoint.lon,
      targetLat, targetLon
    );
    
    // If the difference is larger than the distance to target, score is 0
    // Otherwise, score is the percentage of how close we got
    const distanceScore2 = actualDistance > correctDistance ? 0 : 100 * (1 - actualDistance / correctDistance);
      
    // Return both scoring methods for comparison
    return {
      score1: Math.round((distanceScore1 + directionScore) / 2),
      score2: Math.round(distanceScore2), 
      details: {
        distanceScore1,
        distanceScore2,
        directionScore,
        actualDistance
      }
    };
  },

  saveScore: function(score) {
    const scoreData = {
      timestamp: Date.now(),
      score: score.score2,
      scoreOld: score.score1, // (Keep old score for comparison)
      locationName: currentQuestion.name,
      country: currentQuestion.country,
      dataset: localStorage.getItem('selectedDataset') || 'global',
      distance: {
        guess: geoUtils.roundDistance(score.guessDistance),
        actual: geoUtils.roundDistance(score.correctDistance),
        error: geoUtils.roundDistance(score.details.actualDistance),
        score: Math.round(score.details.distanceScore2)
      },
      direction: {
        guess: score.guessDirection,
        actual: score.correctDirection,
        score: Math.round(score.details.directionScore)
      },
      location: {
        lat: currentQuestion.lat,
        lon: currentQuestion.lon,
        type: currentQuestion.type
      },
      guess: {
        lat: score.playerLat,
        lon: score.playerLon,
        calculatedPoint: computeDestinationLatLon(
          score.playerLat, 
          score.playerLon, 
          score.guessDistance, 
          score.guessDirection
        )
      }
    };

    let scores = this.getScores();
    scores.push(scoreData);
    localStorage.setItem('scoreHistory', JSON.stringify(scores));

    // Track discovered location
    this.addDiscoveredLocation(scoreData);
    
    // Update discovery map markers if we're on that screen
    if (currentScreen === 'discoveries' && discoveryMap.map) {
      discoveryMap.updateMarkers();
    }
    
    return scoreData;
  },

  addDiscoveredLocation: function(scoreData) {
    // For custom locations, always save to custom dataset
    const datasetKey = scoreData.location.type === 'custom' ? 'custom' : scoreData.dataset;
    const discoveredKey = `discovered_${datasetKey}`;
    
    let discovered = localStorage.getItem(discoveredKey);
    discovered = discovered ? JSON.parse(discovered) : {};
    
    // Use location name as key to avoid duplicates
    discovered[scoreData.locationName] = {
      name: scoreData.locationName,
      country: scoreData.country,
      lat: scoreData.location.lat,
      lon: scoreData.location.lon,
      type: scoreData.location.type,
      bestScore: discovered[scoreData.locationName] 
        ? Math.max(scoreData.score, discovered[scoreData.locationName].bestScore)
        : scoreData.score,
      lastScore: scoreData.score,
      plays: discovered[scoreData.locationName]
        ? discovered[scoreData.locationName].plays + 1
        : 1
    };
    
    localStorage.setItem(discoveredKey, JSON.stringify(discovered));
  },

  getDiscoveredLocations: function(dataset) {
    const discoveredKey = `discovered_${dataset}`;
    const discovered = localStorage.getItem(discoveredKey);
    return discovered ? Object.values(JSON.parse(discovered)) : [];
  },

  getScores: function() {
    const scoresJson = localStorage.getItem('scoreHistory');
    return scoresJson ? JSON.parse(scoresJson) : [];
  },

  getAverageScore: function(dataset = null) {
    const scores = this.getScores();
    if (scores.length === 0) return 0;
    
    const filteredScores = dataset 
      ? scores.filter(s => s.dataset === dataset)
      : scores;
      
    if (filteredScores.length === 0) return 0;
    
    const sum = filteredScores.reduce((acc, s) => acc + s.score, 0);
    return Math.round(sum / filteredScores.length);
  },

  getBestScore: function(dataset = null) {
    const scores = this.getScores();
    if (scores.length === 0) return 0;
    
    const filteredScores = dataset 
      ? scores.filter(s => s.dataset === dataset)
      : scores;
      
    if (filteredScores.length === 0) return 0;
    
    return Math.max(...filteredScores.map(s => s.score));
  }
};
