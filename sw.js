const CACHE_NAME = 'rangefinder-__BUILD_ID__';
const APP_SHELL = [
  './', 'index.html', 'config.js', 'mapsApi.js', 'main.js', 'manifest.json',
  'answerScreen.js', 'customLocationsScreen.js', 'dataLoader.js', 'discoveryMapScreen.js',
  'dropdownMenu.js', 'gameScreen.js', 'interactiveMap.js', 'mainMenuScreen.js',
  'mapSettingsScreen.js', 'orientationService.js', 'permissionScreen.js',
  'scoringService.js', 'searchLocationScreen.js', 'settingsScreen.js', 'splashScreen.js',
  'libraries/p5.min.js',
  'assets/images/compass_rose.png', 'assets/images/compass_rose_inverted.png',
  'assets/images/arrow.png', 'assets/images/rangefinder_logo.png',
  'assets/images/rangefinder_logo_inverted.png', 'assets/images/rangefinder_marker.png',
  'assets/images/rangefinder_marker_inverted.png', 'assets/images/rangefinder_compass.png',
  'assets/images/rangefinder_compass_inverted.png', 'assets/images/settings.png',
  'assets/images/settings_inverted.png', 'assets/images/rangefinder_192.png',
  'assets/images/rangefinder_512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys
    .filter(key => key.startsWith('rangefinder-') && key !== CACHE_NAME)
    .map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  // Do not cache Google APIs, location queries, or other third-party requests.
  if (event.request.method !== 'GET' || url.origin !== self.location.origin ||
      !APP_SHELL.some(file => new URL(file, self.registration.scope).href === url.href)) return;
  event.respondWith(caches.open(CACHE_NAME).then(async cache => {
    try {
      const response = await fetch(event.request);
      if (response.ok) {
        // Cache quota failures must not discard a successful network response.
        try { await cache.put(event.request, response.clone()); }
        catch (error) { console.warn('Could not cache application resource:', error); }
        return response;
      }
      return await cache.match(event.request) || response;
    } catch (error) {
      const cached = await cache.match(event.request);
      if (cached) return cached;
      throw error;
    }
  }));
});
