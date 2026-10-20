// The build derives this version from every published file, including datasets.
const CACHE_PREFIX = `rangefinder-${encodeURIComponent(new URL(self.registration.scope).pathname)}-`;
const CACHE_NAME = `${CACHE_PREFIX}__BUILD_ID__`;
const FILES_TO_CACHE = [
  './', 'index.html', 'config.js', 'mapsApi.js', 'manifest.json', 'a2hs.js',
  'main.js', 'geoUtils.js', 'progressStore.js', 'answerScreen.js', 'customLocationsScreen.js',
  'dataLoader.js', 'discoveryMapScreen.js', 'dropdownMenu.js', 'gameScreen.js',
  'interactiveMap.js', 'mainMenuScreen.js', 'mapSettingsScreen.js',
  'orientationService.js', 'permissionScreen.js', 'scoringService.js',
  'searchLocationScreen.js', 'settingsScreen.js', 'splashScreen.js',
  'libraries/p5.min.js',
  'assets/images/rangefinder_16.png', 'assets/images/rangefinder_32.png',
  'assets/images/rangefinder_192.png', 'assets/images/rangefinder_512.png',
  'assets/images/rangefinder_touch-icon_180.png',
  'assets/images/compass_rose.png', 'assets/images/compass_rose_inverted.png',
  'assets/images/arrow.png', 'assets/images/arrow_inverted.png',
  'assets/images/rangefinder_logo.png', 'assets/images/rangefinder_logo_inverted.png',
  'assets/images/rangefinder_marker.png', 'assets/images/rangefinder_marker_inverted.png',
  'assets/images/rangefinder_compass.png', 'assets/images/rangefinder_compass_inverted.png',
  'assets/images/settings.png', 'assets/images/settings_inverted.png',
  'assets/locations/world_capitals.csv', 'assets/locations/german_cities.csv',
  'assets/locations/bremen_places.csv'
  // The large global dataset is cached when first requested.
].map(file => new URL(file, self.registration.scope).href);

self.addEventListener('install', event => {
  // A failed download must leave the previous worker and its cache in place.
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(FILES_TO_CACHE)));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(names => Promise.all(
    names.filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
      .map(name => caches.delete(name))
  )).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  const scope = new URL(self.registration.scope);
  if (event.request.method !== 'GET' || url.origin !== scope.origin ||
      !url.pathname.startsWith(scope.pathname)) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(event.request);
    if (cached) return cached;
    try {
      const response = await fetch(event.request);
      if (response.ok && response.type === 'basic') {
        try { await cache.put(event.request, response.clone()); }
        catch (error) { console.warn('Could not cache response:', error); }
      }
      return response;
    } catch (error) {
      if (event.request.mode === 'navigate') {
        const shell = await cache.match(new URL('index.html', scope).href);
        if (shell) return shell;
      }
      throw error;
    }
  })());
});

// Updates normally activate after existing app tabs close, avoiding mixed versions.
self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});
