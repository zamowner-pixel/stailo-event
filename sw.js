// Service worker ringkas: simpan fail apps supaya cepat dibuka.
// Tukar VERSION setiap kali anda kemas kini kod, supaya phone vendor dapat versi baru.
const VERSION = 'stailo-v14';
const SHELL = [
  './', './index.html', './css/app.css', './manifest.webmanifest',
  './js/app.js', './js/lib.js', './js/config.js',
  './js/views-auth.js', './js/views-vendor.js', './js/views-admin.js', './js/views-invoice.js', './js/views-agreement.js',
  './icons/icon-192.png', './icons/icon-512.png', './assets/intro-poster.jpg'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// Fail apps: cuba rangkaian dahulu (supaya sentiasa terkini), guna cache bila offline.
// Data Supabase tidak disimpan dalam cache.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  // Video dimainkan terus dari rangkaian (tidak dicache)
  if (e.request.destination === 'video' || url.pathname.endsWith('.mp4') || e.request.headers.has('range')) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html')))
  );
});
