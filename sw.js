self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open('rangefinder-v1').then((cache) => {
      return cache.addAll([
        '/',
        '/index.html',
        '/main.js',
        '/assets/images/rangefinder_192.png',
        '/assets/images/rangefinder_512.png',
        // Add other essential files
      ]);
    })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
}); 