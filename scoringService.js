// Scores use full precision. Distance and direction ratings are independent;
// the overall score measures the separation between guessed and actual points.
let scoringService = {
  calculateScore(correctDistance, guessDistance, correctDir, guessDir, playerLat, playerLon, targetLat, targetLon) {
    const difference = ((guessDir - correctDir + 540) % 360 + 360) % 360 - 180;
    const directionDiff = Math.abs(difference);
    const coincident = correctDistance <= 0.000001; // Numerical tolerance: one millimetre.
    const directionScore = coincident ? 100 : Math.max(0, 100 * (1 - directionDiff / 90));
    const distanceError = Math.abs(correctDistance - guessDistance);
    const distanceScore = coincident ? (guessDistance <= 0.000001 ? 100 : 0)
      : Math.max(0, 100 * (1 - distanceError / correctDistance));
    const guessPoint = computeDestinationLatLon(playerLat, playerLon, guessDistance, guessDir);
    const actualDistance = calculateDistance(guessPoint.lat, guessPoint.lon, targetLat, targetLon);
    const overall = coincident ? (actualDistance <= 0.000001 ? 100 : 0)
      : Math.max(0, Math.min(100, 100 * (1 - actualDistance / correctDistance)));
    return {
      score1: Math.round((distanceScore + directionScore) / 2),
      score2: Math.round(overall),
      details: { distanceScore, distanceScore1: distanceScore, distanceScore2: overall, directionScore, actualDistance }
    };
  },

  saveScore(answer) {
    const scoreData = {
      timestamp: Date.now(), scoringVersion: 2,
      score: answer.score2, scoreOld: answer.score1,
      locationId: geoUtils.locationId({ lat: answer.targetLat, lon: answer.targetLon }),
      locationName: answer.locationName, country: answer.country, dataset: answer.dataset,
      distance: { guess: answer.guessDistance, actual: answer.correctDistance,
        error: answer.details.actualDistance, score: Math.round(answer.details.distanceScore) },
      direction: { guess: answer.guessDirection, actual: answer.correctDirection,
        score: Math.round(answer.details.directionScore) },
      location: { lat: answer.targetLat, lon: answer.targetLon, type: answer.type },
      guess: { lat: answer.playerLat, lon: answer.playerLon,
        calculatedPoint: computeDestinationLatLon(answer.playerLat, answer.playerLon, answer.guessDistance, answer.guessDirection) }
    };
    scoreData.location.id = scoreData.locationId;
    const current = progressStore.get(true);
    const discovered = { ...current.discovered[scoreData.dataset] };
    discovered[scoreData.locationId] = progressStore.discoveryFromScore(scoreData, discovered[scoreData.locationId]);
    const next = { ...current, scoreHistory: [...current.scoreHistory, scoreData],
      discovered: { ...current.discovered, [scoreData.dataset]: discovered } };
    // A full browser still keeps this session's result available for export.
    const alreadyUnsaved = progressStore.dirty;
    const saved = progressStore.commit(next, { keepUnsaved: true });
    if (!saved && !alreadyUnsaved && typeof alert === 'function') {
      alert('This result is available in this session but could not be saved. Open Settings and export a backup before leaving.');
    }
    return { ...scoreData, saved };
  },

  getDiscoveredLocations(dataset) {
    return Object.values(progressStore.get().discovered[dataset] || {});
  },

  getScores() {
    return progressStore.get().scoreHistory;
  },

  getAverageScore(dataset = null) {
    const scores = this.getScores().filter(score => !dataset || score.dataset === dataset);
    return scores.length ? Math.round(scores.reduce((sum, score) => sum + score.score, 0) / scores.length) : 0;
  },

  getBestScore(dataset = null) {
    return this.getScores().reduce((best, score) =>
      !dataset || score.dataset === dataset ? Math.max(best, score.score) : best, 0);
  }
};
