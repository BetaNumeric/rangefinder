const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createHarness } = require('./helpers.cjs');

function gameHarness() {
  return createHarness(['geoUtils.js', 'gameScreen.js', 'main.js', 'dataLoader.js']);
}

test('selecting a cached dataset changes questions, radius, saved selection, and recent history together', () => {
  const app = gameHarness();
  app.run(`questions = [{name:'Old city'}]; recentLocations = ['Old city'];
    userSettings.radius = 15000; dataLoader.cache.bremen = [{name:'Rathaus',lat:53.076,lon:8.808}];
    dataLoader.activateDataset('bremen');`);
  assert.equal(app.run('questions[0].name'), 'Rathaus');
  assert.equal(app.run('userSettings.radius'), 30);
  assert.equal(app.stored.get('selectedDataset'), 'bremen');
  assert.equal(app.run('recentLocations.length'), 0);
});

test('a failed or busy dataset switch preserves the active game', () => {
  const app = gameHarness();
  app.stored.set('selectedDataset', 'global');
  app.run(`questions = [{name:'Old city'}]; userSettings.radius = 15000;
    dataLoader.cache.bremen = []; dataLoader.activateDataset('bremen');`);
  assert.equal(app.run('questions[0].name'), 'Old city');
  assert.equal(app.run('userSettings.radius'), 15000);
  assert.equal(app.stored.get('selectedDataset'), 'global');
  app.run(`dataLoader.isLoading = true; dataLoader.activateDataset('germany');`);
  assert.equal(app.stored.get('selectedDataset'), 'global');
});

test('Settings selector uses the activated dataset rather than just saving its name', () => {
  const app = gameHarness();
  app.load('settingsScreen.js');
  app.run(`drawCloseButton = () => false; questions = [{name:'Old city'}];
    dataLoader.cache.bremen = [{name:'Rathaus',lat:53,lon:8}];
    settingsScreen.createImportInput = () => {}; settingsScreen.drawSettingsScreen();`);
  const selector = app.run('settingsScreen.elements.datasetSelector');
  selector.selected('bremen');
  selector.changeHandler();
  assert.equal(app.run('questions[0].name'), 'Rathaus');
  assert.equal(app.run('userSettings.radius'), 30);
  assert.equal(selector.attributes.disabled, undefined);
});

test('switching datasets on an answer starts a fresh question without mixing old results and new targets', () => {
  const app = gameHarness();
  app.load('dropdownMenu.js');
  app.run(`currentScreen='answer'; playerLocation={lat:53.0758,lon:8.8072};
    dataLoader.cache.bremen=[{name:'Rathaus',lat:53.076028,lon:8.807931}];
    goToScreen = screen => { currentScreen = screen; };
    dropdownMenu.createDatasetSelector(0,0);`);
  const selector = app.run('dropdownMenu.datasetSelector');
  selector.selected('bremen');
  selector.changeHandler();
  assert.equal(app.run('currentScreen'), 'game');
  assert.equal(app.run('currentQuestion.name'), 'Rathaus');
  assert.equal(app.stored.get('selectedDataset'), 'bremen');
});

test('a selection completing after leaving Settings replaces the old question in an active game', () => {
  const app = gameHarness();
  app.run(`currentScreen='settings'; playerLocation={lat:53.0758,lon:8.8072};
    currentQuestion={name:'Old city',lat:0,lon:0};
    let completeSelection;
    dataLoader.loadQuestions=(_key,callback)=>{completeSelection=callback};
    dataLoader.activateDataset('bremen'); currentScreen='game';
    completeSelection([{name:'Rathaus',lat:53.076028,lon:8.807931}]);`);
  assert.equal(app.run('currentQuestion.name'), 'Rathaus');
  assert.equal(app.run('userSettings.radius'), 30);
  assert.equal(app.stored.get('selectedDataset'), 'bremen');
});
