// Wisselplanner service worker — maakt de app offline bruikbaar.
//
// Strategie: eerst het netwerk proberen, bij geen verbinding terugvallen op de
// lokale kopie. Elke geslaagde ophaalactie ververst die kopie meteen.
//
// De cachenaam bevat GEEN versienummer. Dat is niet nodig — het netwerk gaat
// immers voor — en het zou dit bestand bij elke release opnieuw laten uploaden.
// Nu is sw.js een vast bestand: eenmalig plaatsen en klaar. Oude caches van
// vroegere versies worden bij de eerste activering opgeruimd.
//
// Alle caches van deze app beginnen met hetzelfde voorvoegsel. Belangrijk, want
// robmun.github.io is één herkomst voor ál je GitHub Pages-projecten: zonder
// voorvoegsel zou het opruimen ook de offline-gegevens van andere apps wissen.
// De demo staat in een submap maar deelt de herkomst met de echte app; zonder een
// eigen cachenaam zouden ze elkaars bestanden serveren.
const DEMO = /\/demo\/$/.test(new URL('./', self.location).pathname);
const CACHE_PREFIX = 'wisselplanner' + (DEMO ? '-demo' : '');
const CACHE = CACHE_PREFIX;

// Zonder deze twee werkt de app offline niet; de rest is meegenomen.
const KERN   = ['./', './index.html', './timer.html'];
const EXTRA  = ['./icon-ghc-navy.png', './apple-touch-icon.png'];
const ASSETS = KERN.concat(EXTRA);

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // addAll faalt in zijn geheel als één bestand ontbreekt; per bestand proberen
    // zorgt dat een ontbrekend pictogram de installatie niet sloopt.
    const mislukt = [];
    await Promise.all(ASSETS.map(u =>
      c.add(u).catch(() => { mislukt.push(u); })
    ));
    // Ontbreekt een kernbestand, dan werkt offline niet en was daar tot nu toe
    // geen enkel spoor van. De app toont dit in het diagnoseblok.
    const kernMislukt = mislukt.filter(u => KERN.includes(u));
    if (kernMislukt.length) {
      const cl = await self.clients.matchAll({ includeUncontrolled: true });
      cl.forEach(client => client.postMessage({ ghcSwFout: kernMislukt }));
    }
    await self.skipWaiting();
  })());
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

  // Verzoeken met een queryreeks krijgen elk een eigen sleutel in de cache. De
  // updatecontrole gebruikte een unieke ?upd=<tijd>, waardoor er elke minuut een
  // nieuwe kopie van de hele app bij kwam. Zulke verzoeken slaan we niet op;
  // voor timer.html?v=147 is dat prima, want de fallback zoekt zonder queryreeks.
  const nietBewaren = url.search !== '' || url.pathname.endsWith('/version.json');
  const isNavigatie = e.request.mode === 'navigate';

  e.respondWith(
    fetch(e.request)
      .then(r => {
        if (r && r.ok && !nietBewaren) {
          const copy = r.clone();
          // waitUntil houdt de service worker in leven tot het wegschrijven klaar
          // is. Zonder dit mag de browser hem stilleggen zodra het antwoord er is,
          // en dan gebeurt het bijwerken van de cache soms simpelweg niet.
          // Wachten vóór het teruggeven van het antwoord zou de gebruiker onnodig
          // laten wachten op een schrijfactie naar de opslag.
          e.waitUntil(
            caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {})
          );
        }
        return r;
      })
      .catch(() =>
        // ignoreSearch: zo vindt timer.html?v=147 de opgeslagen timer.html.
        caches.match(e.request, { ignoreSearch: true }).then(r => {
          if (r) return r;
          // Alleen bij het openen van een pagina terugvallen op index.html. Deden
          // we dat altijd, dan kreeg een ontbrekende afbeelding of een script
          // 250 KB HTML terug — een kapotte afbeelding, of een parseerfout.
          if (isNavigatie) return caches.match('./index.html');
          return new Response('', { status: 504, statusText: 'Offline' });
        })
      )
  );
});
