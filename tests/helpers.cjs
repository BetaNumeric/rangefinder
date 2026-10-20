const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function createHarness(files, overrides = {}) {
  const stored = new Map();
  const elements = [];
  const observers = [];
  const clock = { now: 100 };
  const window = new EventTarget();
  const document = {
    documentElement: { getAttribute: () => 'light', setAttribute() {} },
    head: { appendChild(element) { element.attached = true; } },
    createElement(tag) {
      const elt = new EventTarget();
      Object.assign(elt, {
        tagName: tag, style: {}, children: [],
        appendChild(child) { this.children.push(child); },
        setAttribute(name, value) { this[name] = value; },
        click() { this.dispatchEvent(new Event('click')); },
        remove() { this.removed = true; }
      });
      return elt;
    }
  };
  document.body = document.createElement('body');
  function element(label = '') {
    const result = {
      elt: document.createElement('div'), label, options: [], attributes: {},
      position(x, y) { this.positionValue = [x, y]; },
      size(w, h) { this.sizeValue = [w, h]; },
      style() {}, class() {}, parent() {}, id() {},
      attribute(name, value) { this.attributes[name] = value; },
      removeAttribute(name) { delete this.attributes[name]; },
      option(label, value) { this.options.push({ label, value }); },
      selected(value) { if (value !== undefined) this.selectedValue = value; return this.selectedValue; },
      value() { return this.selectedValue; },
      changed(handler) { this.changeHandler = handler; },
      remove() { this.removed = true; },
      html(value) { if (value !== undefined) this.label = value; return this.label; }
    };
    elements.push(result);
    return result;
  }
  class MutationObserver {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe() { this.observing = true; }
    disconnect() { this.disconnected = true; }
  }
  const globals = {
    console: { log() {}, warn() {}, error() {} },
    window, document, MutationObserver,
    URL, URLSearchParams, Request, Response, ReadableStream, Event, EventTarget, AbortController, Blob,
    setTimeout, clearTimeout, setInterval, clearInterval,
    performance: { now: () => clock.now },
    localStorage: {
      getItem: key => stored.get(key) ?? null,
      setItem: (key, value) => stored.set(key, String(value)),
      removeItem: key => stored.delete(key)
    },
    width: 390, height: 844, windowWidth: 390, windowHeight: 844,
    CENTER: 'center', CORNER: 'corner', LEFT: 'left', RIGHT: 'right',
    BOLD: 'bold', NORMAL: 'normal', HAND: 'hand', AUTO: 'auto',
    mouseIsPressed: false, mouseX: 0, mouseY: 0,
    createButton: element, createSelect: element, createDiv: element, createFileInput: element,
    getCanvasOffset: () => ({ x: 0, y: 0 }),
    getTextColor: () => '#000000', getButtonColor: () => '#cccccc',
    getComputedStyle: () => ({ getPropertyValue: () => '#000000' }),
    constrain: (n, lo, hi) => Math.min(hi, Math.max(lo, n)),
    min: Math.min, max: Math.max, round: Math.round,
    text() {}, textSize() {}, textAlign() {}, textStyle() {},
    noStroke() {}, noFill() {}, fill() {}, push() {}, pop() {}, rect() {},
    color: value => value,
    drawCloseButton: () => false,
    ...overrides
  };
  const context = vm.createContext(globals);
  const run = code => vm.runInContext(code, context);
  const loaded = new Set();
  function load(file) {
    if (loaded.has(file)) return;
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
    loaded.add(file);
  }
  ['geoUtils.js', 'progressStore.js', 'scoringService.js'].forEach(load);
  files.forEach(load);
  return { context, run, load, stored, elements, observers, clock, window, document };
}

function fakeGoogle() {
  const mapsCreated = [];
  const idleListeners = [];
  class Map {
    constructor(element, options) { this.element = element; this.options = options; mapsCreated.push(this); }
    fitBounds(bounds) { this.bounds = bounds; }
    setOptions() {}
  }
  class Overlay {
    constructor(options) { Object.assign(this, options); }
    setMap(map) { this.map = map; }
    setPosition(position) { this.position = position; }
  }
  class LatLngBounds {
    constructor() { this.points = []; }
    extend(point) { this.points.push(point); }
  }
  const google = { maps: {
    Map, Marker: Overlay, Polyline: Overlay, LatLngBounds,
    SymbolPath: { CIRCLE: 'circle' },
    event: {
      trigger() {},
      addListenerOnce(map, type, callback) {
        const listener = { callback, remove() { this.removed = true; } };
        idleListeners.push(listener);
        return listener;
      }
    }
  } };
  return { google, mapsCreated, idleListeners };
}

module.exports = { createHarness, fakeGoogle, root };
