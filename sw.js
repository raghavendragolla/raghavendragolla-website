const CACHE_NAME = 'raghavendra-portfolio-v7';

const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/css/variables.css?v=20.0',
  '/css/style.css?v=20.0',
  '/css/animations.css?v=20.0',
  '/css/responsive.css?v=20.0',
  '/js/script.js?v=20.0',
  '/manifest.json',
  '/favicon/favicon.png',
  '/favicon/favicon-192x192.png',
  '/favicon/favicon-512x512.png',
  '/favicon/apple-touch-icon.png'
];

// Install event - Pre-cache critical app shell for instant launch
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        PRECACHE_ASSETS.map((url) =>
          cache.add(url).catch((err) => {
            console.warn('Pre-cache notice for asset:', url, err);
          })
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// Activate event - clean old caches and claim clients immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - Stale-While-Revalidate for 0ms instant loading
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith('http')) return;

  const url = new URL(event.request.url);

  // Skip analytics & tracking
  if (url.hostname.includes('google-analytics.com') || url.hostname.includes('googletagmanager.com')) {
    return;
  }

  const isSameOrigin = url.origin === self.location.origin;
  const isGoogleFont = url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com');

  if (isSameOrigin || isGoogleFont) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cachedResponse = await cache.match(event.request);

        const fetchPromise = fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
              cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
          })
          .catch(() => {
            if (event.request.mode === 'navigate') {
              return cache.match('/index.html') || cache.match('/');
            }
            return cachedResponse;
          });

        // Serve instantly from cache if available, silently update in background
        return cachedResponse || fetchPromise;
      })
    );
  }
});

