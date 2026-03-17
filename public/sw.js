const CACHE_NAME = 'baha-cache-v8';
const urlsToCache = [
    '/',
    '/index.html',
    '/style.css',
    '/script.js',
    '/i18n.js',
    '/manifest.json',
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

self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

// 啟用新的 Service Worker 並刪除舊版本的快取
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName); // 刪除舊快取
                    }
                })
            );
        }).then(() => self.clients.claim()) // 立刻接管所有開啟的網頁
    );
});

// 攔截網路請求，若有快取則優先使用快取
self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request).then(response => response || fetch(event.request))
    );
});
