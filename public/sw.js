const CACHE_NAME = 'baha-cache-v2';
const urlsToCache = [
    '/',
    '/index.html',
    '/style.css',
    '/script.js',
    '/i18n.js',
    '/icon/favicon.ico',
    '/icon/icon-192.png',
    '/icon/icon-512.png'
];

// 安裝 Service Worker 並快取必要檔案
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
    );
});

// 攔截網路請求，若有快取則優先使用快取
self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request).then(response => response || fetch(event.request))
    );
});