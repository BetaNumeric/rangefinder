// Native controls live in a scrolling panel, so every setting remains reachable.
let settingsScreen = {
  elements: { buttons: [], datasetSelector: null, importInput: null, panel: null, controls: null, status: null },
  message: '',
  layoutKey: '',

  createButton(label, onClick) {
    const button = createButton(label);
    button.parent(this.elements.controls);
    button.class('settings-action');
    button.elt.addEventListener('click', onClick);
    this.elements.buttons.push(button);
    return button;
  },

  createDatasetSelector() {
    const label = document.createElement('label');
    label.textContent = 'Dataset';
    label.htmlFor = 'settings-dataset';
    this.elements.controls.appendChild(label);
    const selector = createSelect();
    selector.parent(this.elements.controls);
    selector.id('settings-dataset');
    selector.class('settings-action');
    Object.entries(dataLoader.datasets).forEach(([key, dataset]) => {
      if (key !== 'custom' || dataset.locations.length) selector.option(dataset.name, key);
    });
    this.elements.datasetSelector = selector;
    return selector;
  },

  async importBackup(file) {
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error('Please choose a backup smaller than 20 MB.');
      const data = JSON.parse(await file.text());
      progressStore.importData(data, dataLoader.getSelectedDataset());
      dataLoader.syncCustomLocations(true);
      this.message = 'Backup imported successfully.';
      if (this.elements.panel) { this.cleanup(); this.drawSettingsScreen(); }
    } catch (error) {
      this.message = error instanceof SyntaxError ? 'This file is not valid JSON. Existing progress has been kept.'
        : error.message || 'The backup could not be imported. Existing progress has been kept.';
    }
  },

  createImportInput() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.style.display = 'none';
    input.addEventListener('change', () => {
      const file = input.files[0];
      input.value = '';
      if (file) this.importBackup(file);
    });
    this.elements.controls.appendChild(input);
    this.elements.importInput = { elt: input, remove: () => input.remove() };
    return this.elements.importInput;
  },

  exportBackup() {
    const blob = new Blob([JSON.stringify(progressStore.exportData(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'rangefinder_all_data.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    this.message = 'Backup exported.';
  },

  drawSettingsScreen() {
    if (!this.elements.panel) {
      dataLoader.syncCustomLocations();
      const panel = document.createElement('section');
      panel.className = 'settings-panel';
      panel.setAttribute('aria-label', 'Settings');
      const header = document.createElement('header');
      header.className = 'settings-header';
      const back = document.createElement('button');
      back.textContent = '←';
      back.className = 'settings-back';
      back.setAttribute('aria-label', 'Back to main menu');
      back.addEventListener('click', () => goToScreen('mainMenu'));
      const heading = document.createElement('h1');
      heading.textContent = 'Settings';
      header.appendChild(back);
      header.appendChild(heading);
      panel.appendChild(header);
      const controls = document.createElement('div');
      controls.className = 'settings-controls';
      panel.appendChild(controls);
      document.body.appendChild(panel);
      this.elements.panel = panel;
      this.elements.controls = controls;
      document.body.style.touchAction = 'auto';

      const status = document.createElement('p');
      status.className = 'settings-status';
      status.setAttribute('role', 'status');
      controls.appendChild(status);
      this.elements.status = status;

      const selector = this.createDatasetSelector();
      selector.selected(dataLoader.getSelectedDataset());
      selector.changed(() => {
        selector.attribute('disabled', '');
        this.message = '';
        dataLoader.activateDataset(selector.value(), success => {
          selector.removeAttribute('disabled');
          if (!success) {
            selector.selected(dataLoader.getSelectedDataset());
            this.message = dataLoader.lastError || 'No locations are available in this dataset.';
          }
        });
      });

      this.createButton('Location Access', async () => {
        try { await permissionScreen.requestLocation(); this.message = 'Location access granted.'; }
        catch { this.message = 'Location access was not granted. Check browser settings.'; }
      });
      this.createButton('Compass Access', async () => {
        try { await orientationService.requestPermission(); this.message = 'Compass is ready.'; }
        catch (error) { this.message = error.message; }
      });
      this.createButton('Map Settings', () => goToScreen('mapSettings'));
      this.createButton(document.documentElement.getAttribute('data-theme') === 'dark' ? 'Light Mode' : 'Dark Mode',
        () => this.setDarkMode(document.documentElement.getAttribute('data-theme') !== 'dark'));
      this.createButton('Export Data', () => this.exportBackup());
      this.createImportInput();
      this.createButton('Import Data', () => this.elements.importInput.elt.click());
      this.createButton('Delete All Data', () => {
        if (!confirm('Delete all discovered locations, custom locations, and scores?')) return;
        if (progressStore.clear()) {
          dataLoader.syncCustomLocations(true);
          this.message = 'All progress deleted.';
          this.cleanup();
          this.drawSettingsScreen();
        } else this.message = 'Data could not be deleted. Existing progress has been kept.';
      });
    }
    this.elements.status.textContent = [this.message, progressStore.notice].filter(Boolean).join(' ');
    this.elements.status.hidden = !this.elements.status.textContent;
    this.updateElementPositions();
  },

  updateElementPositions() {
    const offset = getCanvasOffset();
    const key = [offset.x, width, windowHeight].join(':');
    if (key === this.layoutKey || !this.elements.panel) return;
    this.layoutKey = key;
    Object.assign(this.elements.panel.style, { left: offset.x + 'px', width: width + 'px', height: windowHeight + 'px' });
  },

  setDarkMode(isDark) {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    progressStore.setSetting('theme', isDark ? 'dark' : 'light');
    this.elements.buttons.forEach(button => {
      if (button.html() === 'Dark Mode' || button.html() === 'Light Mode') button.html(isDark ? 'Light Mode' : 'Dark Mode');
    });
  },

  cleanup() {
    this.elements.buttons.forEach(button => button.remove());
    this.elements.datasetSelector?.remove();
    this.elements.importInput?.remove();
    this.elements.panel?.remove();
    this.elements = { buttons: [], datasetSelector: null, importInput: null, panel: null, controls: null, status: null };
    this.layoutKey = '';
    document.body.style.touchAction = '';
  }
};

// Maps slider 0..1 -> radius
const baseRadiusRanges = [
  { max: 10, decimals: 0 },
  { max: 100, decimals: -1 },
  { max: 1000, decimals: -2 },
  { max: 20000, decimals: -3 }
];

function getRoundedRadiusFromSlider(sliderValue) {
  let segSize = 1 / baseRadiusRanges.length;
  let idx = floor(sliderValue / segSize);
  idx = constrain(idx, 0, baseRadiusRanges.length-1);

  let segProg = (sliderValue - idx*segSize) / segSize;
  let segMin = idx === 0 ? 0 : baseRadiusRanges[idx-1].max;
  let segMax = baseRadiusRanges[idx].max;
  let raw = segMin + (segMax - segMin)*segProg;

  let d = baseRadiusRanges[idx].decimals;
  if (d >= 0) return Math.max(1, Number(raw.toFixed(d)));
  let f = pow(10, -d);
  let val = round(raw/f)*f;
  return val <= 0 ? 1 : val;
}

function getSliderValueFromRadius(dist) {
  let numSeg = baseRadiusRanges.length;
  let segSize = 1/numSeg;
  for (let i = 0; i < numSeg; i++) {
    let m0 = (i === 0 ? 0 : baseRadiusRanges[i-1].max);
    let m1 = baseRadiusRanges[i].max;
    if (dist >= m0 && dist <= m1) {
      let frac = (dist - m0)/(m1 - m0);
      let result = i*segSize + frac*segSize;
      return constrain(result, 0, 1);
    }
  }
  return dist > baseRadiusRanges[numSeg-1].max ? 1 : 0;
}
