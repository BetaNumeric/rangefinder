const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function app(initialStorage = {}) {
  const storage = new Map([['useInteractiveMap', 'true'], ...Object.entries(initialStorage)]);
  const listeners = new Map();
  const elements = new Map();
  const observers = [];
  const watches = new Map();
  const maps = [];
  function element(tag = 'div') {
    const node = {
      tagName: tag.toUpperCase(), style: {}, children: [], value: '',
      appendChild(child) { this.children.push(child); child.parentNode = this; return child; },
      remove() { this.removed = true; },
      addEventListener() {},
      getContext() { return { measureText: text => ({ width: String(text).length * 8 }) }; },
      querySelector(tag) { return this.children.find(child => child.tagName === tag.toUpperCase()); }
    };
    Object.defineProperty(node, 'id', { set(id) { elements.set(id, node); } });
    return node;
  }
  function wrapper(tag = 'div', label = '') {
    const node = element(tag);
    node.textContent = label;
    const w = {
      elt: node,
      style(key, value) { node.style[key] = value; return w; },
      position(x, y) { w.x = x; w.y = y; return w; },
      size(width, height) { w.width = width; w.height = height; return w; },
      parent(parent) { parent.elt.appendChild(node); return w; },
      class() { return w; },
      id(id) { elements.set(id, node); return w; },
      remove() { node.remove(); },
      option() {},
      selected(value) { node.value = value; },
      value(value) { if (value !== undefined) node.value = value; return node.value; },
      changed(fn) { w.change = fn; },
      input(fn) { w.onInput = fn; },
      mousePressed(fn) { w.press = fn; },
      html(value) { if (value !== undefined) node.textContent = value; return node.textContent; },
      attribute(key, value) { node[key] = value; },
      removeAttribute(key) { delete node[key]; }
    };
    return w;
  }
  const canvas = element('canvas');
  const document = {
    hidden: false, baseURI: 'http://localhost/rangefinder/',
    head: element('head'), body: element('body'),
    documentElement: { theme: 'light', getAttribute() { return this.theme; }, setAttribute(key, value) { this.theme = value; } },
    createElement: element,
    getElementById: id => elements.get(id) || null,
    getElementsByTagName: () => [canvas],
    addEventListener(name, fn) { addEventListener('document:' + name, fn); }
  };
  const addEventListener = (name, fn) => {
    if (!listeners.has(name)) listeners.set(name, new Set());
    listeners.get(name).add(fn);
  };
  const c = vm.createContext({
    console: { log() {}, warn() {}, error() {} },
    URL, URLSearchParams, AbortSignal, Date, setTimeout, clearTimeout,
    document, navigator: { userAgent: 'Test', geolocation: {
      watchPosition(ok, fail) { const id = watches.size; watches.set(id, { ok, fail }); return id; },
      clearWatch(id) { watches.delete(id); },
      getCurrentPosition(ok) { ok({ coords: { latitude: 53, longitude: 8, accuracy: 5 }, timestamp: Date.now() }); }
    } },
    screen: {}, isSecureContext: true,
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: key => storage.delete(key)
    },
    now: 100,
    addEventListener,
    removeEventListener: (name, fn) => listeners.get(name)?.delete(fn),
    fetch: async () => ({ ok: true, text: async () => 'name,lat,lon,type,country,population\nBremen,53.1,8,city,Germany,1' }),
    getComputedStyle: () => ({ getPropertyValue: () => '#ffffff' }),
    MutationObserver: class {
      constructor(fn) { this.fn = fn; observers.push(this); }
      observe() { this.active = true; }
      disconnect() { this.active = false; }
    },
    createDiv: () => wrapper(), createButton: label => wrapper('button', label),
    createSelect: () => wrapper('select'), createInput: () => wrapper('input'),
    createSlider: () => wrapper('input'), createFileInput: () => wrapper('input'),
    select: selector => elements.get(selector.slice(1)) || null,
    createCanvas: () => ({ elt: canvas }),
    alert() {}, confirm: () => false,
    width: 390, height: 844, windowWidth: 390, windowHeight: 844,
    mouseX: -1, mouseY: -1, mouseIsPressed: false, touches: [], deltaTime: 1000 / 60,
    min: Math.min, max: Math.max, abs: Math.abs, round: Math.round, floor: Math.floor, pow: Math.pow,
    sin: value => Math.sin(value * Math.PI / 180), dist: (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1),
    constrain: (value, min, max) => Math.max(min, Math.min(max, value)),
    color: value => value, lerpColor: a => a, red: () => 0, green: () => 0, blue: () => 0,
    textWidth: value => String(value).length * 8, frameRate: () => 60,
    millis: () => 0, random: () => 0,
    CENTER: 'center', CORNER: 'corner', LEFT: 'left', RIGHT: 'right', TOP: 'top', BOTTOM: 'bottom',
    BOLD: 'bold', NORMAL: 'normal', DEGREES: 'degrees', HAND: 'hand', AUTO: 'auto', INVERT: 'invert'
  });
  c.performance = { now: () => c.now };
  c.window = c;
  for (const name of ['push', 'pop', 'fill', 'noFill', 'stroke', 'noStroke', 'strokeWeight', 'textSize',
    'textAlign', 'textStyle', 'text', 'rect', 'circle', 'arc', 'line', 'triangle', 'translate', 'rotate',
    'scale', 'image', 'imageMode', 'resetMatrix', 'background', 'cursor', 'filter', 'angleMode', 'resizeCanvas']) c[name] = () => {};
  c.DeviceOrientationEvent = function() {};
  class MapMock {
    constructor() { this.options = []; this.bounds = []; this.controls = { topLeft: [] }; maps.push(this); }
    setOptions(options) { this.options.push(options); }
    fitBounds(bounds) { this.bounds.push(bounds); }
    setMapTypeId() {}
  }
  const google = { maps: {
    Map: MapMock,
    Marker: class { constructor(options) { this.options = options; } setMap(map) { this.map = map; } },
    Polyline: class { constructor(options) { this.options = options; } setMap(map) { this.map = map; } },
    LatLngBounds: class { extend() {} }, SymbolPath: { CIRCLE: 'circle' }, ControlPosition: { TOP_LEFT: 'topLeft' },
    event: { trigger() {}, clearInstanceListeners() {} }
  } };
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const files = [...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map(match => match[1]);
  for (const file of files) {
    if (file.startsWith('libraries/')) continue;
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), c, { filename: file });
  }
  return {
    c, storage, listeners, observers, watches, maps, google,
    run: code => vm.runInContext(code, c),
    emit(name, event) { for (const fn of listeners.get(name) || []) fn(event); },
    location() { vm.runInContext('playerLocation = { lat: 53, lon: 8, accuracy: 5, timestamp: Date.now() }', c); },
    enableMaps() { c.google = google; vm.runInContext("mapsApi.state = 'ready'", c); }
  };
}

module.exports = { app };
