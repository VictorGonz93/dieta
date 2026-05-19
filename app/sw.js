const CACHE_NAME = 'nutrition-tracker-v2';
const urlsToCache = [
    '/',
    '/index.html',
    '/app.js',
    '/styles.css',
    '/manifest.json',
    // CDN Resources
    'https://cdn.tailwindcss.com',
    'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/3.9.1/chart.min.js',
    'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Poppins:wght@600;700;800&display=swap',
    'https://fonts.googleapis.com/icon?family=Material+Icons'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(urlsToCache).catch((err) => {
                console.log('Some assets failed to cache (this is OK for CDN):', err);
                return Promise.resolve();
            });
        })
    );
    self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
    // Estrategia: primero cache, luego network (para offline)
    event.respondWith(
        caches.match(event.request).then((response) => {
            if (response) {
                // Si está en cache, devolverlo
                return response;
            }
            
            // Si no está en cache, intentar fetchear
            return fetch(event.request).then((response) => {
                // Si es un request válido, cachearlo para próxima vez
                if (!response || response.status !== 200 || response.type === 'error') {
                    return response;
                }
                
                // Clonar para poder usar en cache y en response
                const responseToCache = response.clone();
                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, responseToCache);
                });
                
                return response;
            }).catch(() => {
                // Si no hay conexión y no está en cache, devolver página offline
                return new Response(
                    '<html><body><h1>Sin conexión</h1><p>Esta funcionalidad requiere internet. Los datos locales están disponibles en la app.</p></body></html>',
                    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
                );
            });
        })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
});
