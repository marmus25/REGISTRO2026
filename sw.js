// ════════════════════════════════════════════
// SERVICE WORKER — Registro Pedagógico 2026
// Versión: 1.0.0
// ════════════════════════════════════════════

const CACHE_NAME = 'registro-musical-v1';

// Recursos que se guardan en caché al instalar
const PRECACHE_URLS = [
  './index.html',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
];

// ── Instalación: precargar recursos ──
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] Precacheando recursos...');
      // Cachear el HTML principal siempre
      return cache.add('./index.html').then(() => {
        // Intentar cachear xlsx (puede fallar en red restringida, no es crítico)
        return cache.add('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js')
          .catch(() => console.warn('[SW] xlsx no pudo cachearse (se reintentará online)'));
      });
    }).then(() => self.skipWaiting())
  );
});

// ── Activación: limpiar cachés viejos ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => {
          console.log('[SW] Eliminando caché antigua:', k);
          return caches.delete(k);
        })
      );
    }).then(() => self.clients.claim())
  );
});

// ── Fetch: estrategia Cache-first con fallback a red ──
self.addEventListener('fetch', event => {
  // Solo interceptar GET
  if (event.request.method !== 'GET') return;

  // No interceptar peticiones a la API de Google Drive ni googleapis
  const url = new URL(event.request.url);
  if (
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('accounts.google.com') ||
    url.hostname.includes('google.com')
  ) {
    return; // dejar pasar sin interceptar
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) {
        // Si hay versión en caché, devolverla y actualizar en segundo plano
        const fetchUpdate = fetch(event.request).then(response => {
          if (response && response.status === 200 && response.type !== 'opaque') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => {}); // silenciar error de red en background
        return cached;
      }

      // No está en caché → ir a la red
      return fetch(event.request).then(response => {
        if (!response || response.status !== 200) return response;

        // Guardar en caché solo recursos del mismo origen o cdnjs
        if (
          url.hostname === self.location.hostname ||
          url.hostname === 'cdnjs.cloudflare.com'
        ) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }

        return response;
      }).catch(() => {
        // Sin red y sin caché → devolver página principal si es navegación
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
        return new Response('Sin conexión', { status: 503, statusText: 'Offline' });
      });
    })
  );
});
