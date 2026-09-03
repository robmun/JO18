// Wisselplanner service worker — maakt de app offline bruikbaar.
//
// Strategie: eerst het netwerk proberen, bij geen verbinding terugvallen op de
// lokale kopie. Elke geslaagde ophaalactie ververst die kopie meteen.
//
// De cachenaam bevat GEEN versienummer. Dat is niet nodig — het netwerk gaat
// immers voor — en het zou dit bestand bij elke release opnieuw laten uploaden.
// Nu is sw.js een vast bestand: eenmalig plaatsen en klaar.

// ── Twee gescheiden caches ──
// De echte app en de demo delen dezelfde herkomst: robmun.github.io is één
// herkomst voor ál je GitHub Pages-projecten, want het pad telt niet mee. Zonder
// eigen cachenaam serveren ze elkaars bestanden en wist de één de offline-
// gegevens van de ander.
//
// De twee namen mogen elkaar ook niet overlappen. Met 'wisselplanner' en
// 'wisselplanner-demo' zou het opruimen van de eerste de tweede meenemen, omdat
// de ene naam met de andere begint. Vandaar '-main' en '-demo'.
const DEMO  = /\/demo\/$/.test(new URL('./', self.location).pathname);
const CACHE = 'wisselplanner-' + (DEMO ? 'demo' : 'main');

// Opruimen blijft binnen de eigen reeks: de eigen naam, en die gevolgd door een
// streepje. Zo blijven de andere versie én andere projecten op deze herkomst
// ongemoeid. De naam van vóór deze splitsing ruimen we eenmalig mee op — maar
// alleen de echte app doet dat, anders wist de demo alsnog andermans cache.
const OUD = 'wisselplanner';
function vanOns(k){
  if (k === CACHE || k.startsWith(CACHE + '-')) return true;
  return !DEMO && k === OUD;
}

// Zonder deze drie werkt de app offline niet; de rest is meegenomen.
const KERN   = ['./', './index.html', './timer.html'];
const EXTRA  = ['./icon-ghc-navy.png', './apple-touch-icon.png', './icon-demo.png',
                DEMO ? './manifest-demo.webmanifest' : './manifest.webmanifest'];
const ASSETS = KERN.concat(EXTRA);

// De eigen map. De worker van de echte app heeft de hele site als bereik en zou
// dus ook de bestanden van de demo opslaan — die belanden dan in de verkeerde
// cache en kunnen bij een storing als verouderde kopie worden teruggegeven.
// Daarom slaat elke worker alleen op wat in zijn eigen map staat.
const EIGEN_MAP = new URL('./', self.location).pathname;
function inEigenMap(pad){
  if (!pad.startsWith(EIGEN_MAP)) return false;
  // De echte app staat in de bovenliggende map; alles onder /demo/ is niet van hem.
  if (!DEMO && /\/demo\//.test(pad)) return false;
  return true;
}

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // addAll faalt in zijn geheel als één bestand ontbreekt; per bestand proberen
    // zorgt dat een ontbrekend pictogram de installatie niet sloopt.
    const mislukt = [];
    await Promise.all(ASSETS.map(u => c.add(u).catch(() => { mislukt.push(u); })));
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
        .filter(k => vanOns(k) && k !== CACHE)
        .map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;   // Firebase e.d. niet via de cache

  // Verzoeken met een queryreeks krijgen elk een eigen sleutel in de cache. De
  // updatecontrole gebruikt een unieke ?upd=<tijd>; zonder maatregel kwam er dus
  // elke minuut een nieuwe kopie van de hele app bij.
  //
  // Ze helemaal niet bewaren ging te ver. De app laadt de timer als
  // 'timer.html?v=175' om een oude kopie uit de browsercache te weren, en daardoor
  // belandde timer.html na de installatie nooit meer in de cache. Mislukte die ene
  // installatie, dan stond hij er dus helemaal niet — en viel het verzoek terug op
  // de regel hieronder. Nu bewaren we zulke documenten onder hun schone adres: één
  // sleutel die telkens wordt overschreven, en die de fallback ook vindt.
  const isDocument = /\/(index|timer)\.html$/.test(url.pathname) || url.pathname.endsWith('/');
  const bewaarAls = (isDocument && url.search !== '') ? url.origin + url.pathname : null;
  const nietBewaren = (url.search !== '' && !bewaarAls)
    || url.pathname.endsWith('/version.json')
    || !inEigenMap(url.pathname);
  const isNavigatie = e.request.mode === 'navigate';
  // Een iframe telt ook als navigatie, en de timer ís een iframe. Dat onderscheid
  // hebben we verderop nodig. 'destination' kent niet elke browser, dus vangen we
  // het geval dat we hier echt kennen er apart bij op.
  const isIframe = e.request.destination === 'iframe'
    || /\/timer\.html$/.test(url.pathname);

  e.respondWith(
    fetch(e.request)
      .then(r => {
        if (r && r.ok && !nietBewaren) {
          const copy = r.clone();
          // waitUntil houdt de service worker in leven tot het wegschrijven klaar
          // is. Zonder dit mag de browser hem stilleggen zodra het antwoord er is,
          // en dan gebeurt het bijwerken van de cache soms simpelweg niet. Wachten
          // vóór het teruggeven van het antwoord zou de gebruiker onnodig laten
          // wachten op een schrijfactie naar de opslag.
          e.waitUntil(
            caches.open(CACHE).then(c => c.put(bewaarAls || e.request, copy)).catch(() => {})
          );
        }
        return r;
      })
      .catch(() =>
        // ignoreSearch: zo vindt timer.html?v=165 de opgeslagen timer.html.
        caches.match(e.request, { ignoreSearch: true }).then(r => {
          if (r) return r;
          // Alleen bij het openen van een pagina terugvallen op index.html. Deden
          // we dat altijd, dan kreeg een ontbrekende afbeelding of een script
          // 250 KB HTML terug — een kapotte afbeelding, of een parseerfout.
          //
          // En nooit voor een iframe. De timer is een iframe, dus die kreeg bij een
          // onbereikbare timer.html de héle app terug en laadde die in zichzelf: een
          // leeg scherm met drie tabbalken onder elkaar, zonder één aanwijzing wat
          // er scheelde. Een nette melding is oneindig veel bruikbaarder.
          if (isNavigatie && !isIframe) return caches.match('./index.html');
          if (isNavigatie) return new Response(
            '<!doctype html><html lang="nl"><meta charset="utf-8">'
            + '<meta name="viewport" content="width=device-width,initial-scale=1">'
            + '<body style="margin:0;display:grid;place-items:center;min-height:100vh;'
            + 'background:#091e48;color:#fff;font:15px/1.5 -apple-system,BlinkMacSystemFont,sans-serif;'
            + 'text-align:center;padding:24px;box-sizing:border-box">'
            + '<div><p style="font-weight:800;margin:0 0 8px">De timer kon niet worden geladen.</p>'
            + '<p style="margin:0;opacity:.75">Het bestand <b>timer.html</b> is niet bereikbaar. '
            + 'Staat het wel op de server, naast index.html? De rest van de app werkt gewoon.</p></div>',
            { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
          return new Response('', { status: 504, statusText: 'Offline' });
        })
      )
  );
});
