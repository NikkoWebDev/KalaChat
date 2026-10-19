const CACHE = 'reprebot-v2'
const ESENCIALES = ['/', '/manifest.json', '/logo.png', '/logo-64.png', '/logo-192.png']

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((cache) =>
      // Tolerate individual failures: a single 404 must not kill the install.
      Promise.allSettled(
        ESENCIALES.map(async (url) => {
          const r = await fetch(new Request(url, { cache: 'reload' }))
          if (r.ok) await cache.put(url, r)
        })
      )
    )
  )
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((claves) =>
      Promise.all(claves.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (e) => {
  const { request } = e
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  // La API y todo lo cross-origin van directo a la red
  if (url.origin !== location.origin) return

  e.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok) {
          const copia = res.clone()
          caches.open(CACHE).then((c) => c.put(request, copia))
        }
        return res
      })
      .catch(() => caches.match(request).then((r) => r || caches.match('/')))
  )
})
