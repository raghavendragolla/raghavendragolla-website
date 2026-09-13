const ASSET_VERSION = 'v12.0';
const CACHE_NAME = 'raghavendra-portfolio-' + ASSET_VERSION;

const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/portfolio/',
  '/portfolio/index.html',
  '/privacy.html',
  '/404.html',
  '/portfolio/images/profile/profile.jpg',
  '/css/shared/tokens.css',
  '/css/shared/components.css',
  '/css/style.css',
  '/css/animations.css',
  '/css/responsive.css',
  '/js/shared.js',
  '/js/script.js',
  '/portfolio/css/style.css',
  '/portfolio/css/responsive.css',
  '/portfolio/js/script.js',
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

// Fetch event - Network-First for navigations, Stale-While-Revalidate for static assets
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

  if (!isSameOrigin && !isGoogleFont) return;

  // 1. Navigation strategy: Network-First with cache fallback
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(async (networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        })
        .catch(async () => {
          const cachedResponse = await caches.match(event.request);
          if (cachedResponse) return cachedResponse;

          if (url.pathname.startsWith('/portfolio')) {
            return (await caches.match('/portfolio/index.html')) || (await caches.match('/portfolio/'));
          }

          return (await caches.match('/index.html')) || (await caches.match('/404.html')) || (await caches.match('/'));
        })
    );
    return;
  }

  // 2. Asset strategy: Stale-While-Revalidate
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
        .catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});


