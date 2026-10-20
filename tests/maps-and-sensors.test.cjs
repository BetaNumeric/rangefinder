const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createHarness, fakeGoogle } = require('./helpers.cjs');

test('Maps loader reports missing configuration and shares a single pending request', async () => {
  const app = createHarness(['mapsApi.js']);
  assert.equal(await app.run('mapsApi.load()'), false);
  assert.equal(app.run('mapsApi.state'), 'error');
  app.window.RANGEFINDER_CONFIG = { googleMapsApiKey: 'key&with=special characters' };
  const pending = app.run('mapsApi.load({retry:true})');
  assert.equal(app.run('mapsApi.load()'), pending);
  const script = app.run('mapsApi.script');
  assert.equal(new URL(script.src).searchParams.get('key'), 'key&with=special characters');
  app.window.google = { maps: { Map: function() {} } };
  app.window.rangefinderMapsReady();
  assert.equal(await pending, true);
  assert.equal(app.run('mapsApi.isReady()'), true);
  app.window.gm_authFailure();
  assert.equal(app.run('mapsApi.ensureReady()'), false);
});

test('Maps download failure and timeout resolve without unhandled rejections and can be retried', async () => {
  const app = createHarness(['mapsApi.js']);
  app.window.RANGEFINDER_CONFIG = { googleMapsApiKey: 'test-key' };
  const first = app.run('mapsApi.load()');
  const oldScript = app.run('mapsApi.script');
  oldScript.onerror();
  assert.equal(await first, false);
  assert.equal(app.run('mapsApi.state'), 'error');
  app.run('mapsApi.timeoutMs=5');
  assert.equal(await app.run('mapsApi.load({retry:true})'), false);
  assert.equal(oldScript.removed, true);
  assert.match(app.run('mapsApi.error.message'), /timed out/);
});

function answerMapHarness() {
  const fake = fakeGoogle();
  let ready = false;
  const mapsApi = { ensureReady: () => ready, isReady: () => ready,
    setError(error) { this.error = error; } };
  const app = createHarness(['geoUtils.js', 'interactiveMap.js'], {
    mapsApi, google: fake.google,
    mapSettingsScreen: { settings: { showPlayerLocation: true }, getMapStyles: () => [] },
    playerLocation: { lat: 0, lon: 0 },
    getScoreHexForMap: () => '0x00ff00'
  });
  return { ...app, ...fake, mapsApi, setReady() { ready = true; } };
}

test('answer map waits for Google, then renders an equatorial target after map idle', () => {
  const app = answerMapHarness();
  assert.equal(app.run('interactiveMap.initialize(0,100,390,300)'), false);
  assert.equal(app.elements.length, 0);
  app.setReady();
  assert.equal(app.run('interactiveMap.initialize(0,100,390,300)'), true);
  app.run(`interactiveMap.drawAnswer({playerLat:1,playerLon:0,targetLat:0,targetLon:0,
    guessDistance:100,guessDirection:180,score2:90});`);
  assert.equal(app.run('interactiveMap.isLoaded'), false);
  app.idleListeners[0].callback();
  assert.equal(app.run('interactiveMap.markers.length'), 1);
  assert.equal(app.run('interactiveMap.paths.length'), 2);
  assert.equal(app.mapsCreated[0].bounds.points[1].lat, 0);
});

test('leaving a map disconnects observers, removes markers, and cancels late idle callbacks', () => {
  const app = answerMapHarness();
  app.setReady();
  app.run('interactiveMap.initialize(0,0,300,200)');
  const player = app.run('interactiveMap.playerMarker');
  app.run('interactiveMap.remove()');
  assert.equal(player.map, null);
  assert.equal(app.observers[0].disconnected, true);
  assert.equal(app.idleListeners[0].removed, true);
  app.idleListeners[0].callback();
  assert.equal(app.run('interactiveMap.isLoaded'), false);
  assert.equal(app.run('interactiveMap.map'), null);
});

test('a map constructor failure cleans up its container and reports an unavailable map', () => {
  const app = answerMapHarness();
  app.setReady();
  app.google.maps.Map = function() { throw new Error('Map failed'); };
  assert.equal(app.run('interactiveMap.initialize(0,0,300,200)'), false);
  assert.equal(app.elements[0].removed, true);
  assert.equal(app.run('interactiveMap.mapElement'), null);
  assert.match(app.mapsApi.error.message, /Map failed/);
});

test('Discoveries does not access Google or create a container while Maps is unavailable', () => {
  const app = createHarness(['discoveryMapScreen.js'], { mapsApi: { ensureReady: () => false } });
  assert.equal(app.run('discoveryMap.initialize()'), false);
  assert.equal(app.elements.length, 0);
});

test('place selection uses the new widget, requests needed fields, and clears a stale selection on input', async () => {
  class PlaceAutocompleteElement extends EventTarget {
    constructor() { super(); this.style = {}; }
    setAttribute() {}
  }
  const app = createHarness(['searchLocationScreen.js'], {
    mapsApi: { ensureReady: () => true },
    google: { maps: { places: { PlaceAutocompleteElement } } }
  });
  assert.equal(app.run('searchLocationScreen.initialize()'), true);
  const widget = app.run('searchLocationScreen.searchBox');
  let requestedFields;
  const place = { displayName: 'Bremen', location: { lat: () => 53.0758, lng: () => 8.8072 },
    addressComponents: [{ types: ['country'], longText: 'Germany' }],
    async fetchFields({ fields }) { requestedFields = Array.from(fields); } };
  await app.run('searchLocationScreen.selectHandler')({ placePrediction: { toPlace: () => place } });
  assert.deepEqual(requestedFields, ['displayName', 'location', 'addressComponents']);
  assert.equal(app.run('searchLocationScreen.selectedLocation.country'), 'Germany');
  widget.dispatchEvent(new Event('input'));
  assert.equal(app.run('searchLocationScreen.selectedLocation'), null);
});

test('late place details cannot restore a selection after leaving Search', async () => {
  class PlaceAutocompleteElement extends EventTarget {
    constructor() { super(); this.style = {}; }
    setAttribute() {}
  }
  const app = createHarness(['searchLocationScreen.js'], {
    mapsApi: { ensureReady: () => true }, google: { maps: { places: { PlaceAutocompleteElement } } }
  });
  app.run('searchLocationScreen.initialize()');
  let complete;
  const pending = app.run('searchLocationScreen.selectHandler')({ placePrediction: { toPlace: () => ({
    fetchFields: () => new Promise(resolve => { complete = resolve; })
  }) } });
  app.run('searchLocationScreen.cleanup()');
  complete();
  await pending;
  assert.equal(app.run('searchLocationScreen.selectedLocation'), null);
});

function sensorHarness(permission) {
  const app = createHarness(['orientationService.js']);
  app.window.DeviceOrientationEvent = function() {};
  if (permission) app.window.DeviceOrientationEvent.requestPermission = permission;
  return app;
}

test('relative rotation updates tilt without pretending to provide north', () => {
  const app = sensorHarness();
  app.run('orientationService.start(); orientationService.handleOrientation({absolute:false,alpha:123,beta:20,gamma:0})');
  assert.equal(app.run('orientationService.hasCompass()'), false);
  assert.equal(app.run('orientationService.getBeta()'), 20);
  app.run('orientationService.handleOrientation({absolute:true,alpha:null,beta:null})');
  assert.equal(app.run('orientationService.hasCompass()'), false);
});

test('absolute compass permission is requested immediately, and a grant waits for actual data', async () => {
  let requested = false;
  const app = sensorHarness(async absolute => { assert.equal(absolute, true); requested = true; return 'granted'; });
  const pending = app.run('orientationService.requestPermission()');
  assert.equal(requested, true);
  await Promise.resolve();
  assert.equal(app.run('orientationService.hasCompass()'), false);
  app.run('orientationService.handleOrientation({absolute:true,alpha:0,beta:10,gamma:0})');
  assert.equal(await pending, true);
  assert.equal(app.run('orientationService.getHeading()'), 0);
  app.clock.now += 40;
  app.run('orientationService.handleOrientation({absolute:true,alpha:1,beta:10,gamma:0})');
  assert.equal(app.run('orientationService.getHeading()'), 0);
  app.clock.now += 6000;
  assert.equal(app.run('orientationService.hasCompass()'), false);
});

test('WebKit headings work even if an absolute alpha value is also present', () => {
  const app = sensorHarness();
  app.run('orientationService.handleOrientation({absolute:true,alpha:10,webkitCompassHeading:270,beta:10,gamma:0})');
  assert.equal(app.run('orientationService.getHeading()'), 270);
});

test('repeated permission requests reuse listeners, and stop detaches both event types', async () => {
  const app = sensorHarness();
  const counts = { added: 0, removed: 0 };
  app.window.addEventListener = () => { counts.added++; };
  app.window.removeEventListener = () => { counts.removed++; };
  app.run('orientationService.start(); orientationService.start(); orientationService.handleOrientation({absolute:true,alpha:90})');
  assert.equal(await app.run('orientationService.requestPermission()'), true);
  assert.equal(counts.added, 2);
  app.run('orientationService.stop()');
  assert.equal(counts.removed, 2);
  assert.equal(app.run('orientationService.hasCompass()'), false);
});

test('denied, unsupported, and silent sensors do not start a game with a fabricated heading', async () => {
  const denied = sensorHarness(async () => 'denied');
  await assert.rejects(denied.run('orientationService.requestPermission()'), /denied/);
  assert.equal(denied.run('orientationService.hasCompass()'), false);
  const unsupported = createHarness(['orientationService.js']);
  await assert.rejects(unsupported.run('orientationService.requestPermission()'), /not available/);
  const silent = sensorHarness();
  silent.run('orientationService.readingTimeout=5');
  await assert.rejects(silent.run('orientationService.requestPermission()'), /No compass reading/);
  assert.equal(silent.run('orientationService.hasCompass()'), false);
});

test('the permission screen starts only after location and a valid absolute compass reading', async () => {
  const app = sensorHarness(async () => 'granted');
  app.window.isSecureContext = true;
  app.context.DEV_MODE = false;
  app.context.playerLocation = { lat: 53.0758, lon: 8.8072 };
  app.context.enteredFromSearch = false;
  app.context.resetLockStates = () => {};
  app.context.pickNewQuestion = () => {};
  let started = false;
  app.context.goToScreen = screen => { started = screen === 'game'; };
  app.context.getPermissionStatusColor = () => '#000000';
  app.stored.set('locationPermission', 'granted');
  app.load('permissionScreen.js');
  app.run('permissionScreen.draw()');
  const pending = app.run('orientationService.requestPermission()');
  await Promise.resolve();
  app.run('permissionScreen.draw()');
  assert.equal(started, false);
  app.run('orientationService.handleOrientation({absolute:true,alpha:90,beta:30,gamma:0})');
  await pending;
  app.run('permissionScreen.draw()');
  assert.equal(started, true);
  assert.equal(app.run('permissionScreen.compassButton'), null);
});
