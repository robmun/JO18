// Toetst de vier adressen waarop de app draait en de twee dingen die daar eerder
// misgingen: welke bestanden een pagina ophaalt (dat liep mis op de kijk-link, die
// op /t/<teamcode>/ staat en dus een map dieper lijkt), en welke naam de iPad
// voorstelt bij 'Zet op beginscherm' (die kwam uit het manifest en zette een
// kijker op de coachversie).
const { startBrowser, nieuweContext, volgBuitenverkeer } = require('../lib/browser');

const naam = 'de vier adressen en de naam op het beginscherm';
const traag = false;

// verwacht.manifest: welk manifestbestand in de pagina moet staan, of null voor geen.
const ADRESSEN = [
  { naam: 'kijk-link (pad)', pad: 't/geheimcode123/', verwacht: {
      status: 404, rol: 'viewer', tabs: 2, team: 'geheimcode123',
      map: '/JO18/', manifest: null, schermnaam: 'JO18-5 view-only' } },
  { naam: 'kijk-link (oud)', pad: 'index.html?team=oudestijl99&rol=kijker', verwacht: {
      status: 200, rol: 'viewer', tabs: 2, team: 'oudestijl99',
      map: '/JO18/', manifest: null, schermnaam: 'JO18-5 view-only' } },
  { naam: 'coach',           pad: 'index.html', verwacht: {
      status: 200, rol: 'editor', tabs: 5, team: '(leeg)',
      map: '/JO18/', manifest: 'manifest.webmanifest', schermnaam: 'JO18-5' } },
  { naam: 'demo',            pad: 'demo/', verwacht: {
      status: 200, rol: 'editor', tabs: 5, team: '(leeg)',
      map: '/JO18/demo/', manifest: 'manifest-demo.webmanifest', schermnaam: 'Hockeycoach' } }
];

async function draai({ basis, log }) {
  const mis = [];
  const b = await startBrowser();
  try {
    for (const a of ADRESSEN) {
      const ctx = await nieuweContext(b);
      const p = await ctx.newPage();
      const mislukt = [], paginafouten = [];
      // Een kijk-link laat de app uit zichzelf verbinden; hier wordt bewezen dat die
      // verbinding de testomgeving niet verlaat (zie nieuweContext in lib/browser.js).
      const buiten = volgBuitenverkeer(p);
      p.on('pageerror', e => { if (!/ServiceWorker/.test(String(e))) paginafouten.push(String(e).slice(0, 120)); });
      p.on('response', r => {
        // Het kijkpad geeft met opzet 404 (zo werkt GitHub Pages); de rest niet.
        if (r.status() >= 400 && !/favicon/.test(r.url()) && !r.url().endsWith('/' + a.pad)) {
          mislukt.push(r.status() + ' ' + r.url().replace(basis.replace(/\/JO18\/$/, ''), ''));
        }
      });

      const resp = await p.goto(basis + a.pad, { waitUntil: 'load' });
      await p.waitForTimeout(2300);

      const r = await p.evaluate(() => ({
        timerWordt: new URL('timer.html', document.baseURI).pathname,
        swWordt: new URL('sw.js', document.baseURI).pathname,
        team: CLOUD.team || '(leeg)',
        rol: CLOUD.role,
        tabs: document.querySelectorAll('#tabbar .tab').length,
        manifest: (document.querySelector('link[rel=manifest]') || {}).href || null,
        schermnaam: (document.querySelector('meta[name="apple-mobile-web-app-title"]') || {}).content,
        vullend: (document.querySelector('meta[name="apple-mobile-web-app-capable"]') || {}).content,
        icoon: !!document.querySelector('link[rel="apple-touch-icon"]')
      }));
      const v = a.verwacht;
      const manifestNu = r.manifest ? r.manifest.split('/').pop() : null;

      const fout = w => mis.push(`${a.naam}: ${w}`);
      if (resp.status() !== v.status) fout(`status ${resp.status()} in plaats van ${v.status}`);
      if (r.rol !== v.rol) fout(`rol '${r.rol}' in plaats van '${v.rol}'`);
      if (r.tabs !== v.tabs) fout(`${r.tabs} tabbladen in plaats van ${v.tabs}`);
      if (r.team !== v.team) fout(`team '${r.team}' in plaats van '${v.team}'`);
      if (r.timerWordt !== v.map + 'timer.html') fout(`timer.html wordt ${r.timerWordt} in plaats van ${v.map}timer.html`);
      if (r.swWordt !== v.map + 'sw.js') fout(`sw.js wordt ${r.swWordt} in plaats van ${v.map}sw.js`);
      if (manifestNu !== v.manifest) fout(`manifest ${manifestNu || 'geen'} in plaats van ${v.manifest || 'geen'}`);
      if (r.schermnaam !== v.schermnaam) fout(`naam op beginscherm '${r.schermnaam}' in plaats van '${v.schermnaam}'`);
      if (r.vullend !== 'yes') fout('start niet schermvullend');
      if (!r.icoon) fout('geen pictogram voor het beginscherm');
      mislukt.forEach(m => fout('bestand mislukt: ' + m));
      buiten.forEach(u => fout('de test ging naar buiten: ' + u));
      paginafouten.forEach(m => fout('paginafout: ' + m));

      log(`${a.naam.padEnd(16)} status ${resp.status()} · rol ${r.rol} · ${r.tabs} tabs · `
        + `bestanden uit ${v.map} · manifest ${manifestNu || 'geen'} · beginscherm "${r.schermnaam}"`);
      await ctx.close();
    }
  } finally { await b.close(); }
  return { ok: mis.length === 0, mis };
}

module.exports = { naam, traag, draai };
