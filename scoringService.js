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
    const directionDiff = Math.abs(((guessDir - correctDir + 540) % 360) - 180);
    const directionScore = correctDistance < 0.001 ? 100 : Math.max(0, 100 * (1 - directionDiff / 90));
    const distanceError = Math.abs(correctDistance - guessDistance);
    // A one-metre floor defines the zero-distance case without rounding real targets.
    const referenceDistance = Math.max(correctDistance, 0.001);
    const distanceScore = Math.max(0, 100 * (1 - distanceError / referenceDistance));

    // The overall rating measures the map distance between the guessed and real points.
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
    const distanceScore2 = Math.max(0, Math.min(100, 100 * (1 - actualDistance / referenceDistance)));
      
    return {
      score2: Math.round(distanceScore2), 
      details: {
        distanceScore,
        directionScore,
        distanceError,
        directionError: directionDiff,
        actualDistance
      }
    };
  },

  saveScore: function(score) {
    const scoreData = {
      timestamp: Date.now(),
      scoringVersion: 2,
      score: score.score2,
      locationName: score.locationName,
      country: score.country,
      dataset: score.dataset,
      distance: {
        guess: score.guessDistance,
        actual: score.correctDistance,
        error: score.details.actualDistance,
        score: Math.round(score.details.distanceScore)
      },
      direction: {
        guess: score.guessDirection,
        actual: score.correctDirection,
        score: Math.round(score.details.directionScore)
      },
      location: {
        lat: score.targetLat,
        lon: score.targetLon,
        type: score.type
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

function formatDistance(distanceKm) {
  if (!Number.isFinite(distanceKm)) return '—';
  if (distanceKm === 0) return '0 m';
  if (distanceKm < 0.001) return '<1 m';
  if (distanceKm < 1) return Math.round(distanceKm * 1000) + ' m';
  return Number(distanceKm.toFixed(distanceKm < 10 ? 2 : distanceKm < 100 ? 1 : 0)) + ' km';
}

function roundGuessDistance(distanceKm) {
  const step = distanceKm < 1 ? 0.001 : distanceKm < 10 ? 0.1 :
    distanceKm < 1000 ? 1 : distanceKm < 10000 ? 10 : 100;
  return Number((Math.round(distanceKm / step) * step).toFixed(3));
}
