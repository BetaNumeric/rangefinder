const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { createHarness, root } = require('./helpers.cjs');

const capitals = 'name,latitude,longitude,type,inside,population\nBerlin,52.52,13.405,Capital,Germany,3000000\n';
function loaderHarness(overrides) {
  return createHarness(['gameScreen.js', 'main.js', 'dataLoader.js'], overrides);
}
function initialize(app) {
  return new Promise(resolve => app.run('dataLoader.initialize.bind(dataLoader)')(resolve));
}

test('fresh startup loads only the small default dataset', async () => {
  const requested = [];
  const app = loaderHarness({ fetch: async url => { requested.push(url); return new Response(capitals); } });
  assert.equal(await initialize(app), true);
  assert.deepEqual(requested, ['assets/locations/world_capitals.csv']);
  assert.equal(app.run('questions[0].name'), 'Berlin');
  assert.equal(app.stored.get('selectedDataset'), 'capitals');
  assert.equal(app.run('dataLoader.cache.global'), undefined);
});

test('a saved selection is kept and unrelated datasets are not downloaded', async () => {
  const requested = [];
  const app = loaderHarness({ fetch: async url => { requested.push(url); return new Response(capitals); } });
  app.stored.set('selectedDataset', 'bremen');
  assert.equal(await initialize(app), true);
  assert.deepEqual(requested, ['assets/locations/bremen_places.csv']);
  assert.equal(app.stored.get('selectedDataset'), 'bremen');
});

test('an empty selected custom dataset recovers to capitals instead of blocking startup', async () => {
  const app = loaderHarness({ fetch: async () => new Response(capitals) });
  app.stored.set('selectedDataset', 'custom');
  app.stored.set('customLocations', '[]');
  assert.equal(await initialize(app), true);
  assert.equal(app.run('questions.length'), 1);
  assert.equal(app.stored.get('selectedDataset'), 'capitals');
});

test('an unavailable selected dataset falls back to bundled capitals offline', async () => {
  const requested = [];
  const app = loaderHarness({ navigator: { onLine: false }, fetch: async url => {
    requested.push(url);
    if (url.includes('global_cities')) throw new Error('Not cached');
    return new Response(capitals);
  } });
  app.stored.set('selectedDataset', 'global');
  assert.equal(await initialize(app), true);
  assert.deepEqual(requested, ['assets/locations/global_cities.csv', 'assets/locations/world_capitals.csv']);
  assert.equal(app.stored.get('selectedDataset'), 'capitals');
});

test('a failed fallback finishes with an error rather than leaving the loader busy', async () => {
  const app = loaderHarness({ navigator: { onLine: false }, fetch: async () => { throw new Error('Offline'); } });
  assert.equal(await initialize(app), false);
  assert.equal(app.run('dataLoader.isLoading'), false);
  assert.match(app.run('dataLoader.lastError'), /Could not load/);
});

test('duplicate loads share one download and notify every caller', async () => {
  let complete, fetched = 0, callbacks = 0;
  const app = loaderHarness({ fetch: () => { fetched++; return new Promise(resolve => { complete = resolve; }); } });
  const load = app.run('dataLoader.loadQuestions.bind(dataLoader)');
  const first = load('bremen', () => callbacks++);
  const second = load('bremen', () => callbacks++);
  assert.equal(fetched, 1);
  complete(new Response(capitals));
  await Promise.all([first, second]);
  assert.equal(callbacks, 2);
  assert.equal(app.run('dataLoader.isLoading'), false);
});

test('a stalled response body times out instead of leaving startup loading forever', async () => {
  const app = loaderHarness({ fetch: async (_url, { signal }) => ({ ok: true,
    text: () => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('Aborted'))))
  }) });
  app.run('dataLoader.requestTimeout=5');
  await assert.rejects(app.run("dataLoader.fetchText('dataset.csv',0)"), /Aborted/);
});

test('CSV parsing handles escaped quotes, commas, and embedded newlines', async () => {
  const text = 'name,latitude,longitude,type,inside,population\n"A, \"\"quoted\"\"\nplace",1,2,City,"Country, Region",10\n';
  const app = loaderHarness({ fetch: async () => new Response(text) });
  const records = await app.run("dataLoader.readDataset('bremen')");
  assert.equal(records.length, 1);
  assert.equal(records[0].name, 'A, "quoted"\nplace');
  assert.equal(records[0].country, 'Country, Region');
  assert.match(records[0].id, /^geo:/);
});

test('the full worldwide CSV retains every row and correctly parses quoted countries', async () => {
  const text = fs.readFileSync(path.join(root, 'assets/locations/global_cities.csv'), 'utf8');
  const app = loaderHarness({ fetch: async () => new Response(text) });
  const records = await app.run("dataLoader.readDataset('global')");
  assert.equal(records.length, 135464);
  assert.ok(records.some(record => record.name === 'Hong Kong' && record.country === 'China, Hong Kong SAR'));
  assert.equal(new Set(records.filter(record => record.name === 'Bremen').map(record => record.id)).size, 4);
});

test('a malformed optional dataset cache is ignored and replaced by downloaded data', async () => {
  const app = loaderHarness({ fetch: async () => new Response(capitals) });
  app.stored.set('dataset_cache_version_capitals', 'v3');
  app.stored.set('dataset_cache_capitals', '{broken');
  assert.equal(await initialize(app), true);
  assert.equal(app.run('questions[0].name'), 'Berlin');
});

test('importing custom locations replaces both the in-memory list and the active question source', () => {
  const app = loaderHarness();
  app.stored.set('selectedDataset', 'custom');
  app.run(`progressStore.importData({customLocations:[{name:'Old',lat:1,lon:2}]});dataLoader.syncCustomLocations();
    progressStore.importData({customLocations:[{name:'New',lat:3,lon:4}]});dataLoader.syncCustomLocations(true);`);
  assert.equal(app.run('dataLoader.datasets.custom.locations[0].name'), 'New');
  assert.equal(app.run('dataLoader.cache.custom[0].name'), 'New');
  assert.equal(app.run('questions[0].name'), 'New');
});

test('deleting the last custom place switches the active dataset and survives reloading', () => {
  const app = loaderHarness();
  app.stored.set('selectedDataset', 'custom');
  app.run(`progressStore.importData({customLocations:[{name:'Last',lat:1,lon:2}]});dataLoader.syncCustomLocations();
    dataLoader.cache.capitals=[{name:'Berlin',lat:52.52,lon:13.405}];
    dataLoader.deleteCustomLocation(dataLoader.cache.custom[0].id);`);
  assert.equal(app.stored.get('selectedDataset'), 'capitals');
  assert.equal(app.run('questions[0].name'), 'Berlin');
  assert.equal(app.run('dataLoader.cache.custom.length'), 0);
  const reload = loaderHarness();
  for (const [key, value] of app.stored) reload.stored.set(key, value);
  assert.equal(reload.run('dataLoader.getSelectedDataset()'), 'capitals');
});

test('failed custom deletion leaves the stored list and active questions intact', () => {
  const app = loaderHarness();
  app.stored.set('selectedDataset', 'custom');
  app.run(`progressStore.importData({customLocations:[{name:'Kept',lat:1,lon:2}]});dataLoader.syncCustomLocations(true);`);
  app.context.localStorage.setItem = () => { throw new Error('Full'); };
  assert.equal(app.run('dataLoader.deleteCustomLocation(dataLoader.cache.custom[0].id)'), false);
  assert.equal(app.run('questions[0].name'), 'Kept');
  assert.equal(app.run('dataLoader.cache.custom.length'), 1);
});

test('maximum range is saved per dataset and restored when switching back', () => {
  const app = loaderHarness();
  app.run(`dataLoader.cache.bremen=[{name:'Rathaus',lat:53.076,lon:8.808}];
    dataLoader.cache.germany=[{name:'Berlin',lat:52.52,lon:13.405}];
    dataLoader.activateDataset('bremen');dataLoader.setRadius(17);
    dataLoader.activateDataset('germany');dataLoader.setRadius(700);dataLoader.activateDataset('bremen');`);
  assert.equal(app.run('userSettings.radius'), 17);
  app.run("dataLoader.activateDataset('germany')");
  assert.equal(app.run('userSettings.radius'), 700);
  app.run('dataLoader.setRadius(0)');
  assert.equal(app.run('userSettings.radius'), 1);
});

test('location watching reuses watch ID zero and stops cleanly', () => {
  let watched = 0, cleared;
  const app = createHarness(['mainMenuScreen.js'], { navigator: { geolocation: {
    watchPosition() { watched++; return 0; }, clearWatch(id) { cleared = id; }
  } } });
  app.stored.set('locationPermission', 'granted');
  app.run('startLocationUpdates();startLocationUpdates();stopLocationUpdates()');
  assert.equal(watched, 1);
  assert.equal(cleared, 0);
});
