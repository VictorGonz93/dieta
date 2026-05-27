const CACHE_VERSION = 54; // Incrementa esto cuando hagas cambios
const CACHE_NAME = `nutrition-tracker-v${CACHE_VERSION}`;
const urlsToCache = [
    '/',
    '/dieta/',
    '/dieta/index.html',
    '/dieta/js/app.js',
    '/dieta/js/modules/state.js',
    '/dieta/js/modules/constants.js',
    '/dieta/js/modules/products.js',
    '/dieta/js/modules/nutrition.js',
    '/dieta/js/modules/storage.js',
    '/dieta/js/modules/weight.js',
    '/dieta/js/modules/meals.js',
    '/dieta/js/modules/charts.js',
    '/dieta/js/modules/stats.js',
    '/dieta/js/modules/config-settings.js',
    '/dieta/js/modules/workout.js',
    '/dieta/js/modules/ui/notifications.js',
    '/dieta/js/modules/ui/darkmode.js',
    '/dieta/js/modules/ui/accordion.js',
    '/dieta/js/modules/ui/tabs.js',
    '/dieta/js/modules/ui/modal.js',
    '/dieta/js/modules/ui/onboarding.js',
    '/dieta/js/modules/ui/products-list.js',
    '/dieta/js/modules/ui/update.js',
    '/dieta/js/modules/ui/workout-ui.js',
    '/dieta/css/styles.css',
    '/dieta/manifest.json',
    // CDN Resources
    'https://cdn.tailwindcss.com',
    'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/3.9.1/chart.min.js',
    'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Poppins:wght@600;700;800&display=swap',
    'https://fonts.googleapis.com/icon?family=Material+Icons'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(async (cache) => {
            // cache:'reload' fuerza fetch desde red, ignorando la caché HTTP del navegador
            // Esto evita que el SW cachee versiones obsoletas al actualizarse
            const results = await Promise.allSettled(
                urlsToCache.map(url => {
                    const req = new Request(url, { cache: 'reload' });
                    return fetch(req).then(res => {
                        if (res && res.status === 200) return cache.put(url, res);
                    }).catch(() => { /* CDN o sin conexión, se ignora */ });
                })
            );
            return results;
        })
    );
    self.skipWaiting();
});

// Escuchar mensajes del cliente (app.js)
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'CHECK_UPDATE') {
        event.ports[0].postMessage({ version: CACHE_VERSION });
    }
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    if (event.data && event.data.type === 'GET_VERSION') {
        // Enviar versión actual del SW al cliente
        event.ports[0].postMessage({ version: CACHE_VERSION });
    }
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    const isJS = url.pathname.endsWith('.js');
    const isLocal = url.origin === self.location.origin;

    // Archivos JS propios: network-first para servir siempre la versión más reciente
    if (isJS && isLocal) {
        event.respondWith(
            fetch(event.request).then(response => {
                if (response && response.status === 200) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                }
                return response;
            }).catch(() => caches.match(event.request))
        );
        return;
    }

    // Resto de recursos: cache-first (CSS, HTML, imágenes, CDN)
    event.respondWith(
        caches.match(event.request).then((response) => {
            if (response) return response;
            return fetch(event.request).then((response) => {
                if (!response || response.status !== 200 || response.type === 'error') return response;
                const responseToCache = response.clone();
                caches.open(CACHE_NAME).then((cache) => { cache.put(event.request, responseToCache); });
                return response;
            }).catch(() => {
                return new Response(
                    '<html><body><h1>Sin conexión</h1><p>Esta funcionalidad requiere internet.</p></body></html>',
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
                        console.log('🔄 Limpiando cache antiguo:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
    
    // Notificar a todos los clientes que hay actualización disponible
    self.clients.matchAll().then(clients => {
        clients.forEach(client => {
            client.postMessage({
                type: 'UPDATE_AVAILABLE',
                version: CACHE_VERSION
            });
        });
    });
});
