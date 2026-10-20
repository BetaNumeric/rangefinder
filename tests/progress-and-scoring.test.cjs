const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createHarness } = require('./helpers.cjs');

function legacyScore(name = 'Bremen', lat = 53.07582, lon = 8.80717, score = 85, timestamp = 1000) {
  return { timestamp, score, locationName: name, country: lon < 0 ? 'United States' : 'Germany', dataset: 'global',
    location: { lat, lon, type: 'City' }, distance: { guess: 100, actual: 100, error: 10, score: 85 },
    direction: { guess: 90, actual: 90, score: 100 }, guess: { lat: 0, lon: 0 } };
}

function makeAnswer(app, { lat = 0.00134, lon = 0, guessDistance = 0.1, guessDirection = 0, name = 'Landmark' } = {}) {
  app.context.target = { lat, lon, guessDistance, guessDirection, name };
  return app.run(`(() => {
    const actual = calculateDistance(0,0,target.lat,target.lon);
    const direction = calculateBearing(0,0,target.lat,target.lon);
    const result = scoringService.calculateScore(actual,target.guessDistance,direction,target.guessDirection,0,0,target.lat,target.lon);
    return {locationName:target.name,country:'Germany',type:'City',dataset:'global',correctDistance:actual,
      correctDirection:direction,guessDistance:target.guessDistance,guessDirection:target.guessDirection,
      playerLat:0,playerLon:0,targetLat:target.lat,targetLon:target.lon,...result};
  })()`);
}

test('legacy namesakes recover separate discoveries and their correct scores from history', () => {
  const app = createHarness([]);
  const germany = legacyScore();
  const usa = legacyScore('Bremen', 33.72122, -85.1455, 20, 2000);
  app.stored.set('scoreHistory', JSON.stringify([germany, usa]));
  app.stored.set('discovered_global', JSON.stringify({ Bremen: {
    name: 'Bremen', country: 'United States', lat: usa.location.lat, lon: usa.location.lon,
    type: 'City', bestScore: 85, lastScore: 20, plays: 2
  } }));
  const locations = app.run("scoringService.getDiscoveredLocations('global')");
  assert.equal(locations.length, 2);
  assert.equal(locations.find(loc => loc.lon > 0).bestScore, 85);
  assert.equal(locations.find(loc => loc.lon < 0).bestScore, 20);
  assert.equal(app.run('scoringService.getScores().length'), 2);
  assert.ok(app.stored.has('rangefinder_progress_v2'));
  assert.equal(app.stored.has('scoreHistory'), false);
  assert.equal(Object.keys(app.run('progressStore.exportData().recovery')).length, 1);
});

test('discovery-only legacy progress survives migration without invented attempts', () => {
  const app = createHarness([]);
  app.stored.set('discovered_bremen', JSON.stringify({ Rathaus: {
    name: 'Rathaus', country: 'Bremen', lat: 53.076028, lon: 8.807931, type: 'local', bestScore: 92, lastScore: 80, plays: 5
  } }));
  assert.equal(app.run("scoringService.getDiscoveredLocations('bremen')[0].plays"), 5);
  assert.equal(app.run("scoringService.getDiscoveredLocations('bremen')[0].bestScore"), 92);
  assert.equal(app.run('scoringService.getScores().length'), 0);
});

test('malformed saved JSON is recoverable in an export and does not prevent reading other progress', () => {
  const app = createHarness([]);
  app.stored.set('scoreHistory', '{broken JSON');
  app.stored.set('customLocations', JSON.stringify([{ name: 'Rathaus', lat: 53.076, lon: 8.808, type: 'custom' }]));
  assert.equal(app.run('progressStore.get().customLocations.length'), 1);
  assert.equal(app.run('progressStore.exportData().recovery.scoreHistory'), '{broken JSON');
  assert.match(app.run('progressStore.notice'), /recovery/);
  const reloaded = createHarness([]);
  reloaded.stored.set('rangefinder_progress_v2', app.stored.get('rangefinder_progress_v2'));
  assert.equal(reloaded.run('progressStore.exportData().recovery.scoreHistory'), '{broken JSON');
});

test('an invalid stored snapshot retains the original text while recovering legacy records', () => {
  const app = createHarness([]);
  app.stored.set('rangefinder_progress_v2', '[invalid snapshot');
  app.stored.set('scoreHistory', JSON.stringify([legacyScore()]));
  assert.equal(app.run('scoringService.getScores().length'), 1);
  assert.equal(app.run("progressStore.exportData().recovery.rangefinder_progress_v2"), '[invalid snapshot');
});

test('corrupt individual records are preserved for recovery while valid records remain usable', () => {
  const app = createHarness([]);
  app.stored.set('scoreHistory', JSON.stringify([legacyScore(), { score: 500, dataset: 'bogus' }]));
  assert.equal(app.run('scoringService.getScores().length'), 1);
  assert.equal(JSON.parse(app.run('progressStore.exportData().recovery.scoreHistory')).length, 2);
});

for (const invalid of [
  { customLocations: [{ name: 'Invalid', lat: 999, lon: 0 }] },
  { customLocations: null }, { scoreHistory: {} }, { scoreHistory: null },
  { discovered: null }, { discovered: { bogus: {} } }, { schemaVersion: 100, scoreHistory: [] },
  { scoreHistory: [legacyScore('Invalid', Infinity, 0)] }
]) {
  test('invalid import keeps existing progress intact: ' + JSON.stringify(invalid).slice(0, 70), () => {
    const app = createHarness([]);
    app.context.valid = { customLocations: [{ name: 'Kept', lat: 1, lon: 2 }] };
    app.run('progressStore.importData(valid)');
    const before = app.stored.get('rangefinder_progress_v2');
    app.context.invalid = invalid;
    assert.throws(() => app.run('progressStore.importData(invalid)'));
    assert.equal(app.stored.get('rangefinder_progress_v2'), before);
    assert.equal(app.run('progressStore.get().customLocations[0].name'), 'Kept');
  });
}

test('an import containing only discoveries does not replace the score history or custom places', () => {
  const app = createHarness([]);
  app.context.backup = { scoreHistory: [legacyScore()], customLocations: [{ name: 'Custom', lat: 1, lon: 2 }] };
  app.run('progressStore.importData(backup)');
  app.context.extra = { discovered: { bremen: { Rathaus: { name: 'Rathaus', lat: 53.076, lon: 8.808, bestScore: 90, lastScore: 90, plays: 1 } } } };
  app.run('progressStore.importData(extra)');
  assert.equal(app.run('progressStore.get().scoreHistory.length'), 1);
  assert.equal(app.run('progressStore.get().customLocations.length'), 1);
  assert.equal(app.run("scoringService.getDiscoveredLocations('bremen').length"), 1);
});

test('a full browser cannot partially apply an import', () => {
  const app = createHarness([]);
  app.run('progressStore.importData({customLocations:[{name:"Kept",lat:1,lon:2}]})');
  const before = app.stored.get('rangefinder_progress_v2');
  app.context.localStorage.setItem = () => { throw new Error('Quota exceeded'); };
  assert.throws(() => app.run('progressStore.importData({customLocations:[{name:"New",lat:3,lon:4}]})'), /could not be saved/);
  assert.equal(app.stored.get('rangefinder_progress_v2'), before);
  assert.equal(app.run('progressStore.get().customLocations[0].name'), 'Kept');
});

test('a score that cannot be persisted remains available in the session and its exported backup', () => {
  const app = createHarness([]);
  app.context.answer = makeAnswer(app);
  app.context.localStorage.setItem = () => { throw new Error('Quota exceeded'); };
  app.run('scoringService.saveScore(answer)');
  assert.equal(app.run('progressStore.dirty'), true);
  assert.equal(app.run('progressStore.exportData().scoreHistory.length'), 1);
  assert.equal(app.run("scoringService.getDiscoveredLocations('global').length"), 1);
  assert.match(app.run('progressStore.notice'), /could not be saved/);
});

test('the next save incorporates progress written by another tab', () => {
  const app = createHarness([]);
  app.run('progressStore.get()');
  const otherTab = createHarness([]);
  otherTab.context.answer = makeAnswer(otherTab, { name: 'Other', lat: 1 });
  otherTab.run('scoringService.saveScore(answer)');
  app.stored.set('rangefinder_progress_v2', otherTab.stored.get('rangefinder_progress_v2'));
  app.context.answer = makeAnswer(app);
  app.run('scoringService.saveScore(answer)');
  assert.equal(app.run('scoringService.getScores().length'), 2);
});

test('unsaved session results cannot silently overwrite a newer snapshot from another tab', () => {
  const app = createHarness([]);
  app.context.answer = makeAnswer(app);
  const originalWrite = app.context.localStorage.setItem;
  app.context.localStorage.setItem = () => { throw new Error('Full'); };
  app.run('scoringService.saveScore(answer)');
  app.context.localStorage.setItem = originalWrite;
  const other = createHarness([]);
  other.context.answer = makeAnswer(other, { lat: 2 });
  other.run('scoringService.saveScore(answer)');
  const newer = other.stored.get('rangefinder_progress_v2');
  app.stored.set('rangefinder_progress_v2', newer);
  app.run('scoringService.saveScore(answer)');
  assert.equal(app.stored.get('rangefinder_progress_v2'), newer);
  assert.match(app.run('progressStore.notice'), /another tab/);
  assert.equal(app.run('progressStore.exportData().scoreHistory.length'), 2);
});

test('deleting all progress does not resurrect legacy records after reloading', () => {
  const app = createHarness([]);
  app.stored.set('scoreHistory', JSON.stringify([legacyScore()]));
  app.run('progressStore.get(); progressStore.clear()');
  const reload = createHarness([]);
  for (const [key, value] of app.stored) reload.stored.set(key, value);
  assert.equal(reload.run('scoringService.getScores().length'), 0);
  assert.equal(reload.run("scoringService.getDiscoveredLocations('global').length"), 0);
});

test('coincident, near-coincident, and opposite-direction guesses produce finite bounded ratings', () => {
  const app = createHarness([]);
  for (const target of [{ lat: 0, lon: 0, guessDistance: 0 }, { lat: 0, lon: 0, guessDistance: 1 },
    { lat: 0.000001, lon: 0, guessDistance: 0 }, { lat: 1, lon: 0, guessDistance: 100, guessDirection: 180 }]) {
    const answer = makeAnswer(app, target);
    for (const rating of [answer.score2, answer.details.distanceScore, answer.details.directionScore]) {
      assert.ok(Number.isFinite(rating) && rating >= 0 && rating <= 100);
    }
  }
  assert.equal(makeAnswer(app, { lat: 0, lon: 0, guessDistance: 0 }).score2, 100);
});

test('distance, direction, and overall scores have separate meanings and save the same subratings', () => {
  const app = createHarness([]);
  const answer = makeAnswer(app, { lat: 1, lon: 0, guessDistance: app.run('calculateDistance(0,0,1,0)'), guessDirection: 90 });
  assert.equal(answer.details.distanceScore, 100);
  assert.equal(answer.details.directionScore, 0);
  assert.equal(answer.score2, 0);
  app.context.answer = answer;
  app.run('scoringService.saveScore(answer)');
  assert.equal(app.run('scoringService.getScores()[0].distance.score'), 100);
  assert.equal(app.run('scoringService.getScores()[0].direction.score'), 0);
});

test('short-distance scoring uses the original distance rather than its rounded display value', () => {
  const app = createHarness([]);
  const answer = makeAnswer(app);
  assert.ok(answer.correctDistance > 0.14 && answer.correctDistance < 0.15);
  assert.equal(app.run('geoUtils.roundDistance(target.lat * Math.PI / 180 * 6371)'), 0.1);
  assert.ok(answer.score2 >= 66 && answer.score2 <= 68);
  app.context.answer = answer;
  app.run('scoringService.saveScore(answer)');
  assert.equal(app.run('scoringService.getScores()[0].distance.actual'), answer.correctDistance);
});

test('submitting snapshots the round origin and saves once before any answer rendering', () => {
  const app = createHarness(['gameScreen.js', 'main.js', 'answerScreen.js']);
  app.run(`currentQuestion={name:'Landmark',country:'Germany',type:'City',lat:0.00134,lon:0};
    roundLocation={lat:0,lon:0};playerLocation={lat:40,lon:40};userGuessDistance=0.1;userGuessDirection=0;
    goToScreen=screen=>{currentScreen=screen};submitGuess();`);
  assert.equal(app.run('currentAnswer.playerLat'), 0);
  assert.equal(app.run('currentScreen'), 'answer');
  assert.equal(app.run('scoringService.getScores().length'), 1);
  assert.ok(app.run('currentAnswer.correctDistance') < 0.15);
});

test('question selection distinguishes two locations with the same name', () => {
  const app = createHarness(['gameScreen.js', 'main.js', 'dataLoader.js']);
  app.run(`playerLocation={lat:0,lon:0};userSettings.radius=20000;
    questions=[{name:'Bremen',lat:1,lon:1},{name:'Bremen',lat:2,lon:2}];currentQuestion=questions[0];pickNewQuestion();`);
  assert.equal(app.run('currentQuestion.lat'), 2);
  assert.equal(app.run('recentLocations.length'), 1);
});

test('map popup names and countries are text, including HTML-shaped imported strings', () => {
  const app = createHarness(['discoveryMapScreen.js'], { getScoreHexForMap: () => '0x00ff00' });
  app.context.location = { name: '<img src=x onerror="alert(1)">', country: '<svg onload=alert(2)>',
    bestScore: 90, lastScore: 80, plays: 1 };
  const popup = app.run('discoveryMap.buildInfoContent(location,[],{score:null,distance:null,direction:null},90)');
  assert.equal(popup.header.textContent, app.context.location.name);
  assert.equal(popup.header.children.length, 0);
  assert.equal(popup.content.children[0].textContent, app.context.location.country);
  assert.ok(popup.content.children.every(child => !Object.hasOwn(child, 'innerHTML')));
});

test('displayed local distances distinguish a 100 metre guess from a 149 metre target', () => {
  const app = createHarness([]);
  assert.equal(app.run('geoUtils.formatDistance(0.1)'), '100 m');
  assert.equal(app.run('geoUtils.formatDistance(0.149)'), '149 m');
  assert.equal(app.run('geoUtils.formatDistance(0.049)'), '49 m');
});

test('map paths stay finite for identical and antipodal endpoints', () => {
  const app = createHarness(['answerScreen.js']);
  for (const coordinates of [[0,0,0,0], [0,0,0,180], [53,8,53,8]]) {
    app.context.points = coordinates;
    const points = app.run('generateGreatCirclePoints(...points,64)');
    assert.equal(points.length, 65);
    assert.ok(points.every(point => Number.isFinite(point.lat) && Number.isFinite(point.lon)));
  }
});
