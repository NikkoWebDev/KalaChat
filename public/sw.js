const CACHE = 'reprebot-v1'
const ESENCIALES = ['/', '/manifest.json']

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ESENCIALES)))
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