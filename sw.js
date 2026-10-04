const ASSET_VERSION = 'v23.0';
const CACHE_NAME = 'raghavendra-portfolio-' + ASSET_VERSION;

const SENSITIVE_QUERY_REGEX = /(?:token|auth|key|secret|session|code|pass|pair_token|jwt|signature)=/i;

const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/portfolio/',
  '/portfolio/index.html',
  '/privacy.html',
  '/404.html',
  '/portfolio/images/profile/profile.webp',
  '/portfolio/images/profile/profile.jpg',
  '/assets/css/shared/tokens.css',
  '/assets/css/shared/components.css',
  '/assets/css/style.css',
  '/assets/css/animations.css',
  '/assets/css/responsive.css',
  '/assets/js/shared.js',
  '/assets/js/script.js',
  '/assets/js/push.js',
  '/assets/images/og-image.jpg',
  '/portfolio/css/animations.css',
  '/portfolio/css/style.css',
  '/portfolio/css/responsive.css',
  '/portfolio/js/script.js',
  '/portfolio/resume/resume.pdf',
  '/portfolio/certificates/ibm-data-analyst-thumb.webp',
  '/portfolio/certificates/ibm-data-analyst.jpg',
  '/portfolio/certificates/smarted-ml-internship-thumb.webp',
  '/portfolio/certificates/smarted-ml-internship.png',
  '/manifest.json',
  '/assets/favicon/favicon.png',
  '/assets/favicon/favicon-192x192.png',
  '/assets/favicon/favicon-512x512.png',
  '/assets/favicon/apple-touch-icon.png'
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

// Activate event - Purge obsolete caches
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
            // Do not cache sensitive or transient query strings
            if (!SENSITIVE_QUERY_REGEX.test(url.search)) {
              const cache = await caches.open(CACHE_NAME);
              cache.put(event.request, networkResponse.clone());
            }
          }
          return networkResponse;
        })
        .catch(async () => {
          const cachedResponse = await caches.match(event.request);
          if (cachedResponse) return cachedResponse;

          if (url.pathname === '/' || url.pathname === '/index.html') {
            return (await caches.match('/index.html')) || (await caches.match('/'));
          }

          if (url.pathname.startsWith('/portfolio')) {
            return (await caches.match('/portfolio/index.html')) || (await caches.match('/portfolio/'));
          }

          if (url.pathname === '/privacy.html') {
            return await caches.match('/privacy.html');
          }

          // Fallback to offline 404 page for unknown paths to preserve intended 404 behavior
          return (await caches.match('/404.html')) || (await caches.match('/index.html'));
        })
    );
    return;
  }

  // 2. Asset strategy: Stale-While-Revalidate
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      // 1. Exact match ensures versioned URLs (e.g. ?v=22 vs ?v=23) are treated as distinct cache keys
      let cachedResponse = await cache.match(event.request);

      if (!cachedResponse) {
        const versionParam = url.searchParams.get('v');
        if (!versionParam && url.search.length === 0) {
          // Unversioned static asset can fall back to ignoreSearch
          cachedResponse = await cache.match(event.request, { ignoreSearch: true });
        } else if (versionParam && (versionParam === ASSET_VERSION || versionParam === ASSET_VERSION.replace(/^v/, ''))) {
          // Allow precached base asset fallback only if version param matches current ASSET_VERSION
          cachedResponse = await cache.match(url.pathname);
        }
      }

      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
            // Do not persist sensitive query strings in asset cache
            if (!SENSITIVE_QUERY_REGEX.test(url.search)) {
              cache.put(event.request, networkResponse.clone());
            }
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});

// Career Radar Web Push (a different origin — career.raghavendragolla.com —
// sends these; this service worker only displays and routes the click).
// Existing install/activate/fetch caching behavior above is unchanged.
const CAREER_RADAR_ORIGIN = 'https://career.raghavendragolla.com';

self.addEventListener('push', (event) => {
  let payload = { title: 'Career Radar', body: 'New job update available.', job_id: '' };
  if (event.data) {
    try {
      payload = Object.assign(payload, event.data.json());
    } catch {
      payload.body = event.data.text() || payload.body;
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/assets/favicon/favicon-192x192.png',
      badge: '/assets/favicon/favicon.png',
      data: { job_id: payload.job_id || '' }
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const jobId = (event.notification.data && event.notification.data.job_id) || '';
  const targetUrl = CAREER_RADAR_ORIGIN + (jobId ? `/?job=${encodeURIComponent(jobId)}` : '/');

  event.waitUntil(
    (async () => {
      // Career Radar is a different origin from this service worker, so
      // clients.matchAll() here can only ever see raghavendragolla.com
      // tabs — it cannot see or focus an already-open Career Radar tab.
      // This best-effort check only helps if such a same-origin edge case
      // ever applies; otherwise this always opens a new tab/window.
      const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of allClients) {
        if (client.url === targetUrl && 'focus' in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    })()
  );
});


