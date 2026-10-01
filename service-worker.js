/**
 * Service Worker — Matriz IPER
 * Estrategia: precache del "app shell" (cache-first con actualización en segundo plano).
 * Las llamadas al backend (Google Apps Script, IA, Drive) nunca se cachean.
 * Al publicar una nueva versión, incremente VERSION_CACHE.
 */
const VERSION_CACHE = "iper-v1.1.0";
const APP_SHELL = [
    "./",
    "./index.html",
    "./styles.css",
    "./app.js",
    "./manifest.json",
    "./js/catalogo.js",
    "./js/riesgo.js",
    "./js/utils.js",
    "./js/config.js",
    "./js/storage-service.js",
    "./js/api-client.js",
    "./js/sheets-service.js",
    "./js/drive-service.js",
    "./js/ai-service.js",
    "./js/data-service.js",
    "./js/sync-service.js",
    "./js/imagen.js",
    "./js/exportar.js",
    "./assets/icon.svg",
    "./assets/icon-192.png",
    "./assets/icon-512.png",
    "./assets/icon-maskable-512.png"
];

self.addEventListener("install", event => {
    event.waitUntil(caches.open(VERSION_CACHE).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys()
            .then(claves => Promise.all(claves.filter(c => c !== VERSION_CACHE).map(c => caches.delete(c))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", event => {
    const req = event.request;
    if (req.method !== "GET") return;                     // POST al backend: siempre red
    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return;      // Google, Drive, IA: sin caché

    // Navegación: servir index.html desde caché si no hay red.
    if (req.mode === "navigate") {
        event.respondWith(fetch(req).then(resp => {
            const copia = resp.clone();
            caches.open(VERSION_CACHE).then(c => c.put("./index.html", copia));
            return resp;
        }).catch(() => caches.match("./index.html")));
        return;
    }

    // Recursos estáticos: cache-first + revalidación en segundo plano.
    event.respondWith(caches.match(req).then(cacheada => {
        const red = fetch(req).then(resp => {
            if (resp && resp.ok) {
                const copia = resp.clone();
                caches.open(VERSION_CACHE).then(c => c.put(req, copia));
            }
            return resp;
        }).catch(() => cacheada);
        return cacheada || red;
    }));
});
