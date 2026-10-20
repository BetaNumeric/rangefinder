const { test } = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('./helpers.cjs');

const oldPlace = { name: 'Old place', lat: 53, lon: 8, type: 'custom', country: 'Germany' };
const csv = name => `name,lat,lon,type,country,population\n${name},53.1,8,city,Germany,1`;

test('startup hydrates custom places with a different dataset selected', () => {
  const a = app({ customLocations: JSON.stringify([oldPlace]), selectedDataset: 'global' });
  a.run('dataLoader.initialize()');
  assert.equal(a.run('dataLoader.datasets.custom.locations[0].name'), 'Old place');
});

test('custom additions merge persisted places, including without prior hydration', () => {
  const a = app({ customLocations: JSON.stringify([oldPlace]) });
  a.run("dataLoader.addCustomLocation({ name: 'New', lat: 54, lon: 9 })");
  assert.equal(JSON.parse(a.storage.get('customLocations')).length, 2);
  a.run("dataLoader.addCustomLocation({ name: 'New again', lat: 54, lon: 9 })");
  assert.equal(JSON.parse(a.storage.get('customLocations')).length, 2);
});

test('corrupted custom storage is preserved rather than overwritten', () => {
  const a = app({ customLocations: '{bad' });
  a.run('dataLoader.initialize()');
  assert.throws(() => a.run("dataLoader.addCustomLocation({ name: 'New', lat: 54, lon: 9 })"));
  assert.equal(a.storage.get('customLocations'), '{bad');
});

test('a failed custom write does not update memory', () => {
  const a = app({ customLocations: JSON.stringify([oldPlace]) });
  a.run('dataLoader.initialize()');
  a.c.localStorage.setItem = () => { throw new Error('quota'); };
  assert.throws(() => a.run("dataLoader.addCustomLocation({ name: 'New', lat: 54, lon: 9 })"));
  assert.equal(a.run('dataLoader.datasets.custom.locations.length'), 1);
});

test('Settings selection updates questions and dataset together', async () => {
  const a = app();
  a.run('settingsScreen.drawSettingsScreen()');
  a.run("settingsScreen.elements.datasetSelector.value('bremen')");
  await a.run('settingsScreen.elements.datasetSelector.change()');
  assert.equal(a.run('questions[0].name'), 'Bremen');
  assert.equal(a.storage.get('selectedDataset'), 'bremen');
});

test('failed dataset changes retain the previous playable collection', async () => {
  const a = app();
  await a.run("dataLoader.selectDataset('global')");
  a.c.fetch = async () => ({ ok: false });
  assert.equal(await a.run("dataLoader.selectDataset('bremen')"), false);
  assert.equal(a.storage.get('selectedDataset'), 'global');
  assert.equal(a.run('questions[0].name'), 'Bremen');
  assert.equal(a.run('dataLoader.isLoading'), false);
});

test('a late dataset response cannot replace a more recent selection', async () => {
  const a = app();
  let release;
  a.c.fetch = () => new Promise(resolve => { release = resolve; });
  const slow = a.run("dataLoader.selectDataset('global')");
  a.c.fetch = async () => ({ ok: true, text: async () => csv('New selection') });
  await a.run("dataLoader.selectDataset('bremen')");
  release({ ok: true, text: async () => csv('Stale selection') });
  assert.equal(await slow, false);
  assert.equal(a.run('questions[0].name'), 'New selection');
  assert.equal(a.storage.get('selectedDataset'), 'bremen');
});

test('quoted CSV fields parse correctly and invalid coordinates are excluded', async () => {
  const a = app();
  a.c.fetch = async () => ({ ok: true, text: async () => csv('"Museum, Bremen"') + '\nBad,999,8,city,Germany,0' });
  await a.run("dataLoader.selectDataset('bremen')");
  assert.equal(a.run('questions.length'), 1);
  assert.equal(a.run('questions[0].name'), 'Museum, Bremen');
  assert.equal(a.run('questions[0].lat'), 53.1);
});

test('empty custom datasets load successfully', async () => {
  const a = app();
  assert.equal(await a.run("dataLoader.selectDataset('custom')"), true);
  assert.equal(a.run('questions.length'), 0);
});

function round(a) {
  a.location();
  a.run("userSettings.manualControls = true; currentScreen = 'game'; beginRound({ name: 'Original', country: 'Germany', type: 'city', lat: 53.01, lon: 8 }, 'global')");
}

test('round submission uses a captured origin, target, and dataset', () => {
  const a = app(); round(a);
  a.run("playerLocation.lat = 40; currentQuestion.name = 'Changed'; localStorage.setItem('selectedDataset', 'bremen'); submitGuess()");
  assert.equal(a.run('currentAnswer.playerLat'), 53);
  assert.equal(a.run('currentAnswer.locationName'), 'Original');
  const saved = JSON.parse(a.storage.get('scoreHistory'))[0];
  assert.equal(saved.dataset, 'global');
  assert.equal(saved.locationName, 'Original');
  assert.equal(saved.guess.lat, 53);
});

test('dataset changes on results apply to the next round without changing the answer', async () => {
  const a = app(); round(a); a.run('submitGuess()');
  const answer = a.run('JSON.stringify(currentAnswer)');
  a.c.fetch = async () => ({ ok: true, text: async () => csv('Next target') });
  a.run("dropdownMenu.createDatasetSelector(0, 0); dropdownMenu.datasetSelector.value('bremen')");
  await a.run('dropdownMenu.datasetSelector.change()');
  assert.equal(a.run('JSON.stringify(currentAnswer)'), answer);
  assert.equal(a.run('currentQuestion.name'), 'Original');
  assert.equal(a.run('questions[0].name'), 'Next target');
});

test('rendering results does not save an attempt again', () => {
  const a = app(); round(a); a.run('submitGuess(); drawAnswerScreen(); drawAnswerScreen()');
  assert.equal(JSON.parse(a.storage.get('scoreHistory')).length, 1);
});

test('local scoring and feedback retain metres and full precision', () => {
  const a = app();
  const score = a.run('scoringService.calculateScore(0.149, 0.1, 0, 0, 0, 0, 0.149 / 6371 * 180 / Math.PI, 0)');
  assert.equal(score.score2, 67);
  assert.ok(Math.abs(score.details.distanceScore - 67.1140939597) < 0.0001);
  assert.equal(a.run('formatDistance(0.149)'), '149 m');
  assert.equal(a.run('formatDistance(0.049)'), '49 m');
  assert.equal(a.run('roundGuessDistance(0.149)'), 0.149);
});

test('zero-distance scores are finite and perfect guesses score 100', () => {
  const a = app();
  assert.equal(a.run('scoringService.calculateScore(0, 0, 0, 0, 0, 0, 0, 0).score2'), 100);
  assert.equal(a.run('Number.isFinite(scoringService.calculateScore(0, 0.001, 0, 0, 0, 0, 0, 0).score2)'), true);
});

test('direction scoring wraps north and uses the same policy for results and history', () => {
  const a = app();
  assert.equal(a.run('scoringService.calculateScore(1, 1, 0, 90, 0, 0, 0, 1).details.directionScore'), 0);
  assert.equal(a.run('scoringService.calculateScore(1, 1, 359, 1, 0, 0, 0, 1).details.directionError'), 2);
});

test('saved distances retain calculation precision', () => {
  const a = app(); round(a); a.run('submitGuess()');
  const saved = JSON.parse(a.storage.get('scoreHistory'))[0];
  assert.equal(saved.distance.actual, a.run('currentAnswer.correctDistance'));
  assert.equal(saved.scoringVersion, 2);
  assert.equal(saved.distance.score, a.run('Math.round(currentAnswer.details.distanceScore)'));
});

test('relative or null orientation data cannot enable sensor play', () => {
  const a = app(); a.run('orientationService.start()');
  a.emit('deviceorientation', { alpha: 145, beta: 35, gamma: 0, absolute: false });
  assert.equal(a.run('orientationService.hasCompass()'), false);
  assert.equal(a.run('orientationService.getHeading()'), null);
  assert.equal(a.run('orientationService.getBeta()'), 35);
  a.emit('deviceorientationabsolute', { alpha: null, beta: null, absolute: true });
  assert.equal(a.run('orientationService.hasCompass()'), false);
});

test('permission alone does not mean a heading is available', async () => {
  const a = app();
  let absolute;
  a.c.DeviceOrientationEvent.requestPermission = requested => { absolute = requested; return Promise.resolve('granted'); };
  assert.equal(await a.run('orientationService.requestPermission()'), true);
  assert.equal(absolute, true);
  assert.equal(a.run('orientationService.hasCompass()'), false);
});

test('unsupported orientation APIs fail without throwing', async () => {
  const a = app(); delete a.c.DeviceOrientationEvent;
  assert.equal(await a.run('orientationService.requestPermission()'), false);
});

test('absolute and WebKit readings enable a compass, with freshness checks', () => {
  const a = app(); a.run('orientationService.start()');
  a.emit('deviceorientationabsolute', { absolute: true, alpha: 0, beta: 20 });
  assert.equal(a.run('orientationService.getHeading()'), 0);
  a.c.now += 4000;
  assert.equal(a.run('orientationService.hasCompass()'), false);
  a.emit('deviceorientation', { webkitCompassHeading: 90, beta: 30 });
  assert.equal(a.run('orientationService.hasCompass()'), true);
});

test('sensor listeners are idempotent and removed on stop', () => {
  const a = app(); a.run('orientationService.start(); orientationService.start()');
  assert.equal(a.listeners.get('deviceorientation').size, 1);
  a.run('orientationService.stop()');
  assert.equal(a.listeners.get('deviceorientation').size, 0);
  assert.equal(a.run('orientationService.hasCompass()'), false);
});

test('GPS uses one watch and stops on settings and background transitions', () => {
  const a = app({ locationPermission: 'granted' });
  a.run("goToScreen('mainMenu'); updateSensorSubscriptions()");
  assert.equal(a.watches.size, 1);
  const callback = [...a.watches.values()][0].ok;
  a.run("goToScreen('settings')");
  assert.equal(a.watches.size, 0);
  callback({ coords: { latitude: 1, longitude: 2 } });
  assert.equal(a.run('playerLocation'), null);
  a.run("goToScreen('game'); document.hidden = true; updateSensorSubscriptions()");
  assert.equal(a.watches.size, 0);
  assert.equal(a.run('orientationService.isListening'), false);
});

test('manual play still requires a real location and captures the selected target', async () => {
  const a = app();
  a.run("currentScreen = 'permissions'; permissionScreen.finish(true)");
  assert.equal(a.run('currentScreen'), 'permissions');
  await a.run("dataLoader.selectDataset('global')");
  await a.run('permissionScreen.requestLocation()');
  a.run('permissionScreen.finish(true)');
  assert.equal(a.run('currentScreen'), 'game');
  assert.equal(a.run('userSettings.manualControls'), true);
  assert.equal(a.run('directionLocked && distanceLocked'), true);
});

test('maps retry after delayed API readiness and do not recreate per frame', () => {
  const a = app();
  assert.equal(a.run('interactiveMap.initialize(0, 400, 390, 300)'), false);
  assert.equal(a.run('interactiveMap.container'), null);
  a.enableMaps();
  assert.equal(a.run('interactiveMap.initialize(0, 400, 390, 300)'), true);
  assert.equal(a.run('interactiveMap.initialize(0, 400, 390, 300)'), true);
  assert.equal(a.maps.length, 1);
});

test('map cleanup disconnects observers and survives subsequent theme changes', () => {
  const a = app(); a.enableMaps();
  a.run('interactiveMap.initialize(0, 400, 390, 300); interactiveMap.remove()');
  assert.equal(a.observers[0].active, false);
  assert.doesNotThrow(() => a.observers[0].fn([{ attributeName: 'data-theme' }]));
  assert.equal(a.run('interactiveMap.map'), null);
});

test('answer rendering tolerates unavailable maps and names come from the completed round', () => {
  const a = app(); round(a); a.run('submitGuess()');
  const labels = [];
  a.c.text = value => labels.push(value);
  a.run("currentQuestion = { name: 'Wrong target', country: 'Wrong country' }; drawAnswerScreen()");
  assert.ok(labels.includes('Germany'));
  assert.ok(!labels.includes('Wrong country'));
});

test('coincident static-map path points are finite', () => {
  const a = app();
  assert.equal(a.run('generateGreatCirclePoints(0, 0, 0, 0, 64).every(point => Number.isFinite(point.lat) && Number.isFinite(point.lon))'), true);
});

test('setup hydrates state without issuing native permission requests', () => {
  const a = app({ theme: 'dark', customLocations: JSON.stringify([oldPlace]) });
  let requests = 0;
  a.c.DeviceOrientationEvent.requestPermission = () => { requests++; return Promise.resolve('granted'); };
  a.c.navigator.geolocation.getCurrentPosition = () => { requests++; };
  a.run('setup()');
  assert.equal(requests, 0);
  assert.equal(a.c.document.documentElement.theme, 'dark');
  assert.equal(a.run('dataLoader.datasets.custom.locations.length'), 1);
  assert.equal(a.run('playerLocation'), null);
});

test('sensor flow waits for both location and absolute data before starting', async () => {
  const a = app();
  await a.run("dataLoader.selectDataset('global')");
  a.run('startNewGame(); permissionScreen.draw()');
  await a.run('permissionScreen.locationButton.press()');
  a.run('permissionScreen.draw()');
  assert.equal(a.run('currentScreen'), 'permissions');
  a.emit('deviceorientationabsolute', { alpha: 90, absolute: true, beta: 35 });
  a.run('permissionScreen.draw(); draw()');
  assert.equal(a.run('currentScreen'), 'game');
  assert.equal(a.run('currentRound.dataset'), 'global');
  assert.equal(a.run('currentRound.origin.lat'), 53);
});

test('manual controls can adjust and submit through the actual game draw loop', () => {
  const a = app(); round(a);
  a.run('mouseX = width / 2; mouseY = height / 2 + 82; mouseIsPressed = true; draw()');
  a.run('mouseY -= 150; draw(); draw(); draw(); mouseIsPressed = false; draw()');
  assert.ok(a.run('JOYSTICK.internalValue === null && distanceLocked && directionLocked'));
  a.run('mouseX = width / 2; mouseY = height * 0.9 + 25; mouseIsPressed = true; draw(); mouseIsPressed = false; draw()');
  assert.equal(a.run('currentScreen'), 'answer');
  a.run('draw(); draw(); submitGuess()');
  assert.equal(JSON.parse(a.storage.get('scoreHistory')).length, 1);
});

test('a searched target survives the permission screen and is not replaced at random', async () => {
  const a = app();
  await a.run("dataLoader.selectDataset('custom')");
  a.run("startNewGame({ name: 'Specific place', country: 'Germany', type: 'custom', lat: 53.1, lon: 8 })");
  await a.run('permissionScreen.requestLocation()');
  a.run('permissionScreen.finish(true)');
  assert.equal(a.run('currentQuestion.name'), 'Specific place');
  assert.equal(a.run('pendingCustomQuestion'), null);
});

test('explicit searched targets can be guessed beyond the previous range limit', async () => {
  const a = app();
  a.run("userSettings.radius = 30; startNewGame({ name: 'Distant place', country: 'Test', type: 'custom', lat: -40, lon: 178 })");
  await a.run('permissionScreen.requestLocation()');
  a.run('permissionScreen.finish(true)');
  assert.ok(a.run('userSettings.radius >= getDistanceKm(currentRound.origin.lat, currentRound.origin.lon, currentQuestion.lat, currentQuestion.lon)'));
});

test('the minimum range is positive for both filtering and input', () => {
  const a = app();
  assert.equal(a.run('getRoundedRadiusFromSlider(0)'), 1);
});

test('a cancelled location request cannot restart subscriptions after navigation', async () => {
  const a = app();
  let respond;
  a.c.navigator.geolocation.getCurrentPosition = ok => { respond = ok; };
  a.run("goToScreen('permissions')");
  const request = a.run('permissionScreen.requestLocation()');
  a.run("goToScreen('settings')");
  respond({ coords: { latitude: 53, longitude: 8 } });
  await assert.rejects(request, /cancelled/);
  assert.equal(a.watches.size, 0);
  assert.equal(a.run('playerLocation'), null);
});

test('discovery maps dispose theme and storage observers on exit', () => {
  const a = app(); a.enableMaps();
  a.run("currentScreen = 'discoveries'; discoveryMap.initialize()");
  assert.equal(a.listeners.get('storage').size, 1);
  a.run('discoveryMap.remove()');
  assert.equal(a.listeners.get('storage').size, 0);
  assert.equal(a.observers.filter(observer => observer.active).length, 0);
  assert.doesNotThrow(() => a.observers[0].fn([{ attributeName: 'data-theme' }]));
});

test('Maps API callers share one pending load and failures can be retried', async () => {
  const a = app();
  a.run("RANGEFINDER_CONFIG.googleMapsApiKey = 'test-key'");
  const first = a.run('mapsApi.load()');
  const second = a.run('mapsApi.load()');
  assert.equal(first, second);
  assert.equal(a.c.document.head.children.length, 1);
  a.run('mapsApi.finish(false)');
  assert.equal(await first, false);
  const retry = a.run('mapsApi.load()');
  a.c.google = a.google;
  a.run('initMap()');
  assert.equal(await retry, true);
  assert.equal(a.run('mapsApi.isReady()'), true);
  a.run('gm_authFailure()');
  assert.equal(a.run('mapsApi.isReady()'), false);
});

test('production build stages only public files and writes escaped configuration', t => {
  const fs = require('node:fs');
  const path = require('node:path');
  const os = require('node:os');
  const vm = require('node:vm');
  const { buildSite } = require('../scripts/build-site.cjs');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rangefinder-build-test-'));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith('rangefinder-build-test-'));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const key = 'test-key-with-"quotes"';
  const sourceConfig = fs.readFileSync(path.join(__dirname, '..', 'config.js'), 'utf8');
  const output = buildSite({ apiKey: key, outputDirectory: directory });
  const c = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(output, 'config.js'), 'utf8'), c);
  assert.equal(c.window.RANGEFINDER_CONFIG.googleMapsApiKey, key);
  const html = fs.readFileSync(path.join(output, 'index.html'), 'utf8');
  for (const match of html.matchAll(/<script[^>]*src="([^"]+)"/g)) assert.ok(fs.existsSync(path.join(output, match[1])), match[1]);
  for (const file of ['package.json', 'APP_REVIEW.md', 'tests', '.git']) assert.equal(fs.existsSync(path.join(output, file)), false);
  const manifest = JSON.parse(fs.readFileSync(path.join(output, 'manifest.json')));
  assert.equal(manifest.start_url, './');
  const worker = fs.readFileSync(path.join(output, 'sw.js'), 'utf8');
  assert.ok(!worker.includes('__BUILD_ID__'));
  assert.equal(fs.readFileSync(path.join(__dirname, '..', 'config.js'), 'utf8'), sourceConfig);
});

test('service-worker shell covers local scripts and stays within a project subpath', async () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const vm = require('node:vm');
  const events = {};
  let shell;
  const c = {
    self: { addEventListener: (name, fn) => { events[name] = fn; } },
    caches: { open: async () => ({ addAll: files => { shell = files; } }) }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8'), c);
  let installing;
  events.install({ waitUntil: promise => { installing = promise; } });
  await installing;
  for (const file of shell) {
    assert.ok(!file.startsWith('/'));
    assert.ok(fs.existsSync(path.join(__dirname, '..', file)), file);
    assert.ok(new URL(file, 'https://example.com/rangefinder/').pathname.startsWith('/rangefinder/'));
  }
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  for (const match of html.matchAll(/<script[^>]*src="([^"]+)"/g)) assert.ok(shell.includes(match[1]), match[1]);
});
