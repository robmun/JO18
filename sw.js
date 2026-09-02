// Wisselplanner service worker — maakt de app offline bruikbaar.
//
// Strategie: eerst het netwerk proberen, bij geen verbinding terugvallen op de
// lokale kopie. Elke geslaagde ophaalactie ververst die kopie meteen.
//
// De cachenaam bevat GEEN versienummer meer. Dat was niet nodig — het netwerk
// gaat immers voor — en het dwong je dit bestand bij elke release opnieuw te
// uploaden. Nu is sw.js een vast bestand: eenmalig plaatsen en klaar. Oude
// caches van vroegere versies worden bij de eerste activering opgeruimd.
// Alle caches van deze app beginnen met dit voorvoegsel. Belangrijk, want
// robmun.github.io is één herkomst voor ál je GitHub Pages-projecten: zonder
// voorvoegsel zou het opruimen ook de offline-gegevens van andere apps wissen.
const CACHE_PREFIX = 'wisselplanner';
const CACHE = CACHE_PREFIX;
const ASSETS = ['./', './index.html', './timer.html', './icon-ghc-navy.png', './apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      // addAll faalt in zijn geheel als één bestand ontbreekt; per bestand
      // proberen zorgt dat een ontbrekend pictogram de installatie niet sloopt.
      .then(c => Promise.all(ASSETS.map(u => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(k => k.startsWith(CACHE_PREFIX) && k !== CACHE)
        .map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;   // Firebase e.d. niet via de cache
  e.respondWith(
    fetch(e.request)
      .then(r => {
        if (r && r.ok) {
          const copy = r.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return r;
      })
      .catch(() =>
        caches.match(e.request, { ignoreSearch: true })
          .then(r => r || caches.match('./index.html'))
      )
  );
});
