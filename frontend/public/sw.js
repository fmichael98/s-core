/* SApp — service worker: rende la web app installabile e la lascia consultare anche senza il server.
   Pagina e dati (API) arrivano sempre dal server; se non risponde si usa l'ultima copia salvata qui, segnata con
   l'intestazione X-SApp-Offline (quando era stata salvata), così la pagina dice che non è collegata. */

const CACHE = 'sapp-v1'
/** Ultime risposte delle API (solo JSON, in lettura): si cancellano uscendo (vedi `logout` nella pagina) o a sessione
 *  scaduta. */
const DATA = 'sapp-dati-v1'
const OFFLINE = '/offline.html'
/** Mai dalla copia: il collegamento dal vivo, la versione (serve per capire se il server è tornato), e
 *  amministrazione e aggiornamenti (devono dire com'è adesso, es. l'esito di un aggiornamento). */
const LIVE = ['/api/live', '/api/version']
const LIVE_PREFIX = ['/api/admin/', '/api/update/', '/api/device/']

/** Tiene solo gli ultimi file delle versioni recenti (ogni aggiornamento ne porta di nuovi). */
async function trim(c) {
  const old = (await c.keys()).filter((r) => new URL(r.url).pathname.startsWith('/assets/'))
  for (const r of old.slice(0, Math.max(0, old.length - 40))) await c.delete(r)
}

/** Server che non risponde (o proxy davanti che dice che è giù). */
const down = (res) => res.status === 502 || res.status === 503 || res.status === 504

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll([OFFLINE, '/icon-192.png'])).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== DATA).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

/** Pagina: dal server (e se ne tiene una copia); se non risponde l'ultima copia, se no "non raggiungibile". */
async function page(req) {
  const url = new URL(req.url)
  const key = url.origin + url.pathname
  try {
    const res = await fetch(req)
    if (down(res)) throw new Error('server giù')
    if (res.ok && !res.redirected && (res.headers.get('content-type') || '').includes('text/html')) {
      const c = await caches.open(CACHE)
      await c.put(key, res.clone())
    }
    return res
  } catch {
    return (await caches.match(key)) || (await caches.match(url.origin + '/')) || caches.match(OFFLINE)
  }
}

/** Dati: dal server (e se ne tiene una copia); se non risponde l'ultima copia, segnata come vecchia. */
async function data(req) {
  const c = await caches.open(DATA)
  try {
    const res = await fetch(req)
    if (down(res)) throw new Error('server giù')
    // uscito o sessione scaduta: niente dati salvati di nessuno
    if (res.status === 401) await caches.delete(DATA)
    else if (res.ok && (res.headers.get('content-type') || '').includes('application/json')) {
      const h = new Headers(res.headers)
      h.set('X-SApp-Saved', String(Date.now()))
      await c.put(req, new Response(await res.clone().blob(), { status: res.status, statusText: res.statusText, headers: h }))
    }
    return res
  } catch (err) {
    const hit = await c.match(req)
    if (!hit) throw err
    const h = new Headers(hit.headers)
    h.set('X-SApp-Offline', hit.headers.get('X-SApp-Saved') || '0')
    return new Response(hit.body, { status: hit.status, statusText: hit.statusText, headers: h })
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== location.origin) return
  // l'APK dell'app Android: sempre dal server, mai in cache
  if (url.pathname.startsWith('/app/')) return
  if (req.mode === 'navigate') {
    e.respondWith(page(req))
    return
  }
  // script e stili con l'impronta nel nome non cambiano mai: dalla cache, così l'app si apre subito
  if (url.pathname.startsWith('/assets/')) {
    e.respondWith(
      caches.open(CACHE).then((c) =>
        c.match(req).then(
          (hit) =>
            hit ||
            fetch(req).then((res) => {
              if (res.ok) c.put(req, res.clone()).then(() => trim(c))
              return res
            }),
        ),
      ),
    )
    return
  }
  if (url.pathname.startsWith('/api/') && !LIVE.includes(url.pathname) && !LIVE_PREFIX.some((p) => url.pathname.startsWith(p))) e.respondWith(data(req))
  // tutto il resto (icone, immagini): normale, dal server
})
