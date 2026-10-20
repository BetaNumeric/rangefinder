const assert = require('node:assert/strict');
const { test, after } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { buildSite } = require('../scripts/build-site.cjs');
const { root } = require('./helpers.cjs');

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'rangefinder-test-'));
after(() => {
  assert.equal(path.dirname(temporary), path.resolve(os.tmpdir()));
  assert.ok(path.basename(temporary).startsWith('rangefinder-test-'));
  fs.rmSync(temporary, { recursive: true, force: true });
});

function workerHarness(scope = 'https://example.github.io/rangefinder/', options = {}) {
  const handlers = {};
  const contents = new Map();
  const deleted = [];
  let precached = [];
  const cache = {
    async addAll(urls) {
      if (options.installFails) throw new Error('Download failed');
      precached = urls;
    },
    async match(request) { return contents.get(typeof request === 'string' ? request : request.url); },
    async put(request, response) { contents.set(request.url, response); }
  };
  const context = vm.createContext({
    URL, console,
    self: { registration: { scope }, clients: { claim: async () => {} },
      addEventListener(type, handler) { handlers[type] = handler; } },
    caches: { open: async () => cache, keys: async () => options.cacheNames || [],
      delete: async name => { deleted.push(name); } },
    fetch: options.fetch || (async () => { throw new Error('Offline'); })
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'sw.js'), 'utf8'), context);
  function lifetime(type) {
    let pending;
    handlers[type]({ waitUntil(promise) { pending = promise; } });
    return pending;
  }
  function request(url, { method = 'GET', mode = 'cors' } = {}) {
    let response;
    handlers.fetch({ request: { url, method, mode }, respondWith(promise) { response = promise; } });
    return response;
  }
  return { context, contents, deleted, lifetime, request, precached: () => precached };
}

test('build packages a configured static site with a deterministic content version', () => {
  const output = path.join(temporary, 'site');
  buildSite({ apiKey: 'test-key', outputDirectory: output });
  const window = {};
  vm.runInNewContext(fs.readFileSync(path.join(output, 'config.js'), 'utf8'), { window });
  assert.equal(window.RANGEFINDER_CONFIG.googleMapsApiKey, 'test-key');
  assert.ok(fs.existsSync(path.join(output, 'assets/locations/global_cities.csv')));
  assert.ok(fs.existsSync(path.join(output, 'mapsApi.js')));
  assert.ok(!fs.existsSync(path.join(output, '.github')));
  assert.ok(!fs.existsSync(path.join(output, 'tests')));
  const worker = fs.readFileSync(path.join(output, 'sw.js'), 'utf8');
  assert.ok(!worker.includes('__BUILD_ID__'));
  assert.ok(!fs.readFileSync(path.join(output, 'index.html'), 'utf8').includes('${GOOGLE_MAPS_JS_API_KEY}'));
  buildSite({ apiKey: 'test-key', outputDirectory: output });
  assert.equal(fs.readFileSync(path.join(output, 'sw.js'), 'utf8'), worker);
  buildSite({ apiKey: 'changed-test-key', outputDirectory: output });
  assert.notEqual(fs.readFileSync(path.join(output, 'sw.js'), 'utf8'), worker);
});

test('build rejects a missing key and output directories containing source', () => {
  assert.throws(() => buildSite({ apiKey: '' }), /GOOGLE_MAPS_JS_API_KEY/);
  for (const outputDirectory of [root, path.dirname(root), path.join(root, 'assets/build')]) {
    assert.throws(() => buildSite({ apiKey: 'test-key', outputDirectory }), /source files/);
  }
});

for (const scope of ['https://example.github.io/', 'https://example.github.io/rangefinder/']) {
  test(`precache paths exist and remain inside ${new URL(scope).pathname}`, async () => {
    const worker = workerHarness(scope);
    await worker.lifetime('install');
    for (const url of worker.precached()) {
      assert.ok(url.startsWith(scope), url);
      const relative = url.slice(scope.length) || 'index.html';
      assert.ok(fs.existsSync(path.join(root, relative)), relative);
    }
    assert.ok(worker.precached().includes(new URL('a2hs.js', scope).href));
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
    assert.equal(new URL(manifest.start_url, scope).href, scope);
    assert.equal(new URL(manifest.scope, scope).href, scope);
  });
}

test('failed precaching rejects installation rather than activating an incomplete cache', async () => {
  const worker = workerHarness(undefined, { installFails: true });
  await assert.rejects(worker.lifetime('install'), /Download failed/);
});

test('activation preserves caches belonging to other project URLs', async () => {
  const prefix = 'rangefinder-%2Frangefinder%2F-';
  const worker = workerHarness(undefined, { cacheNames: [prefix + 'old', prefix + '__BUILD_ID__', 'rangefinder-%2Fother%2F-old', 'unrelated'] });
  await worker.lifetime('activate');
  assert.deepEqual(worker.deleted, [prefix + 'old']);
});

test('worker serves cached assets and navigation offline, and ignores other origins and projects', async () => {
  const worker = workerHarness();
  const shell = new Response('app shell');
  worker.contents.set('https://example.github.io/rangefinder/index.html', shell);
  assert.equal(await worker.request('https://example.github.io/rangefinder/index.html'), shell);
  assert.equal(await worker.request('https://example.github.io/rangefinder/?offline', { mode: 'navigate' }), shell);
  assert.equal(worker.request('https://example.github.io/other/main.js'), undefined);
  assert.equal(worker.request('https://maps.googleapis.com/maps/api/js'), undefined);
  assert.equal(worker.request('https://example.github.io/rangefinder/main.js', { method: 'POST' }), undefined);
  await assert.rejects(worker.request('https://example.github.io/rangefinder/missing.csv'), /Offline/);
});

test('the global CSV is cached after its first successful request', async () => {
  let fetched = 0;
  const worker = workerHarness(undefined, { fetch: async () => {
    fetched++;
    const response = new Response('cities');
    Object.defineProperty(response, 'type', { value: 'basic' });
    return response;
  } });
  const url = 'https://example.github.io/rangefinder/assets/locations/global_cities.csv';
  assert.equal(await (await worker.request(url)).text(), 'cities');
  assert.equal(await (await worker.request(url)).text(), 'cities');
  assert.equal(fetched, 1);
});
