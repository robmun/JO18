// Meldingen bij een doelpunt: de kant van de app.
//
// Het versturen zelf gebeurt bij Firebase en wordt getest in meldingen/test (de
// berichtteksten en de functie met een nagebootste database). Hier gaat het om wat een
// kijker ziet en doet:
//   1. zonder Web Push-sleutel staat de functie uit: geen kaart, geen vraag;
//   2. een kijker die het kan, krijgt één keer de vraag op het wedstrijdscherm en een
//      kaart op Meer;
//   3. aanzetten legt een aanmelding vast onder de vingerafdruk van het token, met
//      precies de velden die de beveiligingsregels toestaan;
//   4. uitzetten haalt die aanmelding weer weg, en de vraag komt niet terug;
//   5. op een iPhone in Safari (geen beginscherm) staat er uitleg in plaats van een knop;
//   6. een coach krijgt niets van dit alles te zien.
const crypto = require('crypto');
const { startBrowser, nieuweContext } = require('../lib/browser');

const naam = 'meldingen bij een doelpunt: aanmelden als kijker';
const traag = false;
const TELEFOON = { viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true };
const TOKEN = 'nep-token-voor-de-test-0123456789abcdefghijklmnopqrstuvwxyz';

// Draait sw.js in een nagebootste worker-omgeving en stuurt er één push naar.
async function zwToetsen(ua) {
  const fs = require('fs'), path = require('path'), vm = require('vm');
  const code = fs.readFileSync(path.join(__dirname, '..', '..', 'sw.js'), 'utf8');
  const luisteraars = {};
  const uit = { importScripts: false, getoond: null, geopend: null };
  const self = {
    location: new URL('https://robmun.github.io/JO18/sw.js'),
    addEventListener: (soort, f) => { luisteraars[soort] = f; },
    registration: { showNotification: async (titel, opties) => { uit.getoond = { titel, opties }; } },
    clients: { matchAll: async () => [], openWindow: async u => { uit.geopend = u; }, claim: async () => {} },
    skipWaiting: async () => {},
    navigator: { userAgent: ua || 'Mozilla/5.0 (Linux; Android 14) Chrome/130' },
  };
  const ctx = { self, caches: { open: async () => ({}), keys: async () => [] }, fetch: async () => ({}), URL, console,
    importScripts: () => { uit.importScripts = true; } };
  try { vm.runInNewContext(code, ctx); } catch (e) { return { fout: 'laden mislukt: ' + e.message }; }
  if (!luisteraars.push || !luisteraars.notificationclick) return { fout: 'geen luisteraar voor push of notificationclick' };
  let wacht;
  luisteraars.push({ data: { json: () => ({
    notification: { title: 'TEST · 🏑 Doelpunt voor Gooische!', body: 'Stand: 1-0', tag: 'stand-abc' },
    fcmOptions: { link: 'https://robmun.github.io/JO18/t/abc/' } }) }, waitUntil: p => { wacht = p; } });
  await wacht;
  luisteraars.notificationclick({ notification: { close() {}, data: uit.getoond && uit.getoond.opties.data }, waitUntil: p => { wacht = p; } });
  await wacht;
  return uit;
}

async function draai({ basis, log }) {
  const mis = [];
  const b = await startBrowser();
  const paginafouten = [];
  try {
    const ctx = await nieuweContext(b, TELEFOON);
    const p = await ctx.newPage();
    p.on('pageerror', e => { if (!/ServiceWorker/.test(String(e))) paginafouten.push(String(e).slice(0, 160)); });
    await p.goto(basis + 'index.html', { waitUntil: 'load' });
    await p.waitForTimeout(1400);
    await p.evaluate(TOKEN => {
      state.players.forEach(x => x.present = true);
      activeTab = 'wedstrijd'; render();
      const g = [...document.querySelectorAll('button')].find(b => /genereren/i.test(b.textContent));
      if (g) g.click();
      CLOUD.on = true; CLOUD.role = 'viewer'; CLOUD.team = 'testteam12345'; document.body.classList.add('viewer');
      // De echte sleutel staat er sinds 26.11.3 in; voor stap 1 even weg.
      window._echteSleutel = VAPID_KEY; VAPID_KEY = '';
      // Nagebootst: toestemming, het token van Firebase en de database.
      let toestemming = 'default';
      Object.defineProperty(Notification, 'permission', { get: () => toestemming, configurable: true });
      Notification.requestPermission = async () => (toestemming = 'granted');
      window._db = { gezet: null, weg: null };
      firebaseKlaar = async () => {};
      meldToken = async () => TOKEN;
      meldRef = id => ({ set: async d => { _db.gezet = { id, d }; }, delete: async () => { _db.weg = id; } });
      window.firebase = Object.assign(window.firebase || {}, { auth: () => ({ currentUser: { uid: 'kijker-uid' } }) });
      render();
    }, TOKEN);
    const kijk = () => p.evaluate(() => {
      const balk = !!document.querySelector('.meldbalk');
      activeTab = 'uitleg'; render();
      const kaart = document.querySelector('details[data-klap="meldingen"]');
      const knop = kaart && kaart.querySelector('[data-meld="aan"],[data-meld="uit"]');
      const uit = { balk, staat: meldStaat(), kaart: !!kaart, knop: knop ? knop.dataset.meld : null, tekst: kaart ? kaart.innerText : '' };
      activeTab = 'wedstrijd'; render();
      return uit;
    });

    // ── 1. Zonder sleutel: niets ──
    const zonder = await kijk();
    if (zonder.balk || zonder.kaart) mis.push('zonder Web Push-sleutel staat de vraag of de kaart er toch');
    else log('zonder sleutel: geen vraag en geen kaart');

    // ── 2. Met sleutel: vraag en kaart ──
    await p.evaluate(() => { VAPID_KEY = _echteSleutel || 'test-sleutel'; render(); });
    const met = await kijk();
    if (met.staat !== 'kan') mis.push(`met sleutel staat meldingen op '${met.staat}' in plaats van 'kan'`);
    if (!met.balk) mis.push('de vraag op het wedstrijdscherm ontbreekt');
    if (!met.kaart || met.knop !== 'aan') mis.push('de kaart op Meer met de knop Aanzetten ontbreekt');
    if (met.balk && met.kaart && met.knop === 'aan') log('kijker: vraag op het wedstrijdscherm en kaart op Meer');

    // ── 3. Aanzetten ──
    await p.click('.meldbalk [data-meld="aan"]');
    await p.waitForTimeout(400);
    const aan = await p.evaluate(() => ({ db: _db.gezet, staat: meldStaat(), balk: !!document.querySelector('.meldbalk') }));
    const id = crypto.createHash('sha256').update(TOKEN).digest('hex');
    if (!aan.db) mis.push('na Aanzetten is er niets vastgelegd');
    else {
      if (aan.db.id !== id) mis.push(`de aanmelding staat onder '${aan.db.id}' in plaats van de vingerafdruk van het token`);
      const velden = Object.keys(aan.db.d).sort().join(',');
      if (velden !== 'laatst,sinds,test,token,uid') mis.push(`de aanmelding heeft de velden ${velden}; de regels staan alleen laatst,sinds,test,token,uid toe`);
      if (aan.db.d.test !== false) mis.push('een gewoon toestel is als testtoestel aangemeld');
      if (aan.db.d.token !== TOKEN || aan.db.d.uid !== 'kijker-uid') mis.push('token of uid klopt niet in de aanmelding');
      if (!Number.isInteger(aan.db.d.sinds) || !Number.isInteger(aan.db.d.laatst)) mis.push('sinds/laatst zijn geen gehele getallen; de regels weigeren dat');
    }
    if (aan.staat !== 'aan') mis.push(`na Aanzetten staat meldingen op '${aan.staat}'`);
    if (aan.balk) mis.push('na Aanzetten staat de vraag er nog');
    const naAan = await kijk();
    if (naAan.knop !== 'uit') mis.push('na Aanzetten staat er geen knop Uitzetten op Meer');
    if (aan.db && aan.db.id === id && aan.staat === 'aan' && naAan.knop === 'uit') log('aanzetten: aanmelding onder de vingerafdruk van het token, met de vijf toegestane velden');

    // ── 3b. Testtoestel aanvinken: de aanmelding wordt opnieuw weggeschreven, met test ──
    const testvink = await p.evaluate(() => new Promise(k => {
      activeTab = 'uitleg'; render();
      document.querySelector('details[data-klap="meldingen"]').open = true;
      const v = document.querySelector('[data-meld="test-aan"]');
      if (!v) return k({ vinkje: false });
      _db.gezet = null; v.click();
      setTimeout(() => {
        const d = document.querySelector('details[data-klap="meldingen"]');
        const tekst = d ? d.innerText : '';
        const terug = !!document.querySelector('[data-meld="test-uit"]');
        activeTab = 'wedstrijd'; render();
        k({ vinkje: true, test: _db.gezet && _db.gezet.d.test, zichtbaar: /✓ Testtoestel/.test(tekst) && terug });
      }, 300);
    }));
    if (!testvink.vinkje) mis.push('de knop Maak dit een testtoestel ontbreekt');
    else if (!testvink.zichtbaar) mis.push('na de knop staat er niet duidelijk ✓ Testtoestel met een knop om het terug te zetten');
    else if (testvink.test !== true) mis.push('na het aanvinken is het toestel niet als testtoestel aangemeld');
    else log('knop Maak dit een testtoestel: aanmelding opnieuw weggeschreven met test: true, en ✓ Testtoestel in beeld');

    // ── 4. Uitzetten ──
    await p.evaluate(() => { activeTab = 'uitleg'; render(); document.querySelector('details[data-klap="meldingen"]').open = true; });
    await p.click('[data-meld="uit"]');
    await p.waitForTimeout(400);
    const uit = await p.evaluate(() => ({ weg: _db.weg }));
    const naUit = await kijk();
    if (uit.weg !== id) mis.push('na Uitzetten is de aanmelding niet weggehaald');
    if (naUit.balk) mis.push('na Uitzetten komt de vraag op het wedstrijdscherm terug');
    if (uit.weg === id && !naUit.balk) log('uitzetten: aanmelding weggehaald, vraag komt niet terug');

    // ── 5. iPhone in Safari ──
    const safari = await p.evaluate(() => {
      isIOS = () => true; opBeginscherm = () => false;
      const pm = window.PushManager; delete window.PushManager;
      const st = meldStaat();
      activeTab = 'uitleg'; render();
      const k = document.querySelector('details[data-klap="meldingen"]');
      const r = { st, tekst: k ? k.innerText : '', knop: !!(k && k.querySelector('[data-meld]')) };
      window.PushManager = pm; activeTab = 'wedstrijd'; render();
      return r;
    });
    if (safari.st !== 'beginscherm' || !/Zet op beginscherm/.test(safari.tekst) || safari.knop)
      mis.push(`iPhone in Safari: staat '${safari.st}', knop ${safari.knop}, tekst '${safari.tekst.slice(0, 80)}'`);
    else log('iPhone in Safari: uitleg om de app op het beginscherm te zetten, geen knop');

    // ── 6. Coach ──
    const coach = await p.evaluate(() => {
      CLOUD.role = 'editor'; document.body.classList.remove('viewer');
      meldBewaar({}); render();
      const balk = !!document.querySelector('.meldbalk');
      activeTab = 'uitleg'; render();
      return { balk, kaart: !!document.querySelector('details[data-klap="meldingen"]'), staat: meldStaat() };
    });
    if (coach.balk || coach.kaart) mis.push('een coach krijgt de vraag of de kaart over meldingen te zien');

    // ── 7. De schakelaar van de coach ──
    const schakel = await p.evaluate(() => {
      delete state.meldingen; activeTab = 'uitleg'; render();
      const knoppen = [...document.querySelectorAll('[data-meldmodus]')];
      const begin = (knoppen.find(k => k.classList.contains('aan')) || {}).dataset;
      const uit = { aantal: knoppen.length, begin: begin && begin.meldmodus, gedeeld0: serializeState().meldingen };
      document.querySelector('[data-meldmodus="test"]').click();
      uit.naTest = state.meldingen; uit.gedeeld = serializeState().meldingen;
      uit.knopAan = (document.querySelector('[data-meldmodus].aan') || {}).dataset;
      uit.knopAan = uit.knopAan && uit.knopAan.meldmodus;
      // Een rare waarde van buiten wordt eruit gehaald.
      const rommel = Object.assign(JSON.parse(JSON.stringify(serializeState())), { meldingen: 'iedereen!' });
      valideerStand(rommel);
      uit.rommelWeg = !('meldingen' in rommel);
      return uit;
    });
    if (schakel.aantal !== 3) mis.push(`de coach ziet ${schakel.aantal} knoppen voor meldingen in plaats van 3`);
    if (schakel.begin !== 'uit' || schakel.gedeeld0 !== 'uit') mis.push(`de schakelaar begint op '${schakel.begin}' / gedeeld '${schakel.gedeeld0}' in plaats van uit`);
    if (schakel.naTest !== 'test' || schakel.gedeeld !== 'test' || schakel.knopAan !== 'test') mis.push(`na Alleen testtoestellen: stand '${schakel.naTest}', gedeeld '${schakel.gedeeld}', knop '${schakel.knopAan}'`);
    if (!schakel.rommelWeg) mis.push('een onbekende waarde voor meldingen uit een binnenkomende stand blijft staan');
    if (schakel.aantal === 3 && schakel.begin === 'uit' && schakel.gedeeld === 'test') log('coach: schakelaar Uit · Alleen testtoestellen · Iedereen, begint op Uit en reist mee in de gedeelde stand');
    // ── 7b. Aftrap en einde melden: twee tikken, en alleen met namen en schakelaar aan ──
    const aank = await p.evaluate(() => new Promise(k => {
      const u = {};
      state.score = { thuis: '', uit: '', t: 0, u: 0 }; render();
      u.zonderNamen = document.querySelector('[data-aankondig="start"]').disabled;
      state.score = { thuis: 'Gooische', uit: 'Amsterdam', t: 0, u: 0 }; state.meldingen = 'uit'; render();
      u.schakelaarUit = document.querySelector('[data-aankondig="start"]').disabled;
      state.meldingen = 'test'; delete state.aankondiging; render();
      document.querySelector('[data-aankondig="start"]').click();
      u.naEen = state.aankondiging || null;
      u.vraag = document.querySelector('[data-aankondig="start"]').textContent;
      document.querySelector('[data-aankondig="start"]').click();
      u.naTwee = state.aankondiging || null;
      u.gedeeld = serializeState().aankondiging;
      // Na vier seconden zonder tweede tik vervalt de vraag.
      document.querySelector('[data-aankondig="einde"]').click();
      setTimeout(() => {
        u.vervallen = document.querySelector('[data-aankondig="einde"]').textContent;
        u.nogStart = state.aankondiging && state.aankondiging.soort;
        k(u);
      }, 4300);
    }));
    if (!aank.zonderNamen) mis.push('Aftrap melden kan zonder ingevulde teams');
    if (!aank.schakelaarUit) mis.push('Aftrap melden kan met de schakelaar op uit');
    if (aank.naEen) mis.push('één tik op Aftrap melden verstuurt al');
    if (!/nogmaals/.test(aank.vraag)) mis.push(`na één tik staat er '${aank.vraag}' in plaats van de vraag om nogmaals te tikken`);
    if (!aank.naTwee || aank.naTwee.soort !== 'start' || !aank.gedeeld || aank.gedeeld.nr !== aank.naTwee.nr) mis.push('na twee tikken staat de aankondiging niet in de gedeelde stand');
    if (/nogmaals/.test(aank.vervallen) || aank.nogStart !== 'start') mis.push('de vraag bij Einde melden vervalt niet na vier seconden');
    if (!mis.some(m => /Aftrap|Einde|aankondiging/.test(m))) log('aftrap en einde: pas na een tweede tik, alleen met teams en schakelaar aan, vraag vervalt na 4 s');

    // ── 7c. Overzicht voor de eigenaar: kijkers met beginscherm en meldingen ──
    const ov = await p.evaluate(() => {
      const nu = Date.now();
      CLOUD.coaches = {
        a: { naam: 'Robert', rol: 'eigenaar', laatst: nu, sinds: nu },
        k1: { naam: 'Ouder Faas', rol: 'kijker', laatst: nu, beginscherm: true, meldingen: true },
        k2: { naam: 'Oma', rol: 'kijker', laatst: nu - 3 * 864e5, beginscherm: true, meldingen: false },
        k3: { naam: 'speler', rol: 'kijker', laatst: nu, beginscherm: false, meldingen: false },
      };
      const h = document.createElement('div'); h.innerHTML = coachOverzichtHTML();
      CLOUD.laatsteMelding = { titel: '🏑 Gooische scoort!', verstuurd: 5, modus: 'aan', op: nu };
      return { tekst: h.innerText.replace(/\s+/g, ' '), melding: (() => { const e = document.createElement('div'); e.innerHTML = laatsteMeldingTekst(); return e.textContent; })() };
    });
    if (!/Kijkers: 3 · 📱 2 op beginscherm · 🔔 1 met meldingen · 2 actief vandaag/.test(ov.tekst)) mis.push(`telling van kijkers: '${ov.tekst.slice(0, 160)}'`);
    if (/Oma[^·]*·[^G]*nog niet toegelaten/.test(ov.tekst) || /kijkt mee — nog niet toegelaten/.test(ov.tekst)) mis.push('een gewone kijker staat nog als "nog niet toegelaten" in het overzicht');
    if (!/Gekoppelde toestellen Robert/.test(ov.tekst)) mis.push('de coaches staan niet apart onder Gekoppelde toestellen');
    if (!/Laatste melding: 🏑 Gooische scoort! · aangekomen op 5 toestellen/.test(ov.melding)) mis.push(`laatste melding: '${ov.melding}'`);
    if (!mis.some(m => /telling|toegelaten|Gekoppelde|laatste melding/.test(m))) log('eigenaar: "Kijkers: 3 · 📱 2 op beginscherm · 🔔 1 met meldingen", en de laatste melding met het aantal toestellen');

    // De kijker ziet de schakelaar niet.
    const kijkerSchakel = await p.evaluate(() => { CLOUD.role = 'viewer'; render(); const n = document.querySelectorAll('[data-meldmodus]').length; CLOUD.role = 'editor'; return n; });
    if (kijkerSchakel) mis.push('een kijker ziet de schakelaar van de coach');

    await ctx.close();
    paginafouten.forEach(f => mis.push('paginafout: ' + f));

    // ── 8. De service worker toont de melding zelf, altijd ──
    // Nagebootst zoals Firebase hem aflevert. Zie sw.js: de Firebase-bibliotheek toonde
    // niets als de app in beeld stond, en een stille push kan iOS de meldingen laten
    // intrekken.
    const sw = await zwToetsen();
    // Op een iPhone geen eigen plaatje: met een plaatje zet iOS er 'from JO18-5
    // view-only' onder en behandelt hij de melding als een bericht van een persoon.
    const swIos = await zwToetsen('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)');
    if (!swIos.getoond || 'icon' in swIos.getoond.opties) mis.push('sw.js geeft op een iPhone toch een eigen plaatje mee');
    if (!sw.getoond || !sw.getoond.opties.icon) mis.push('sw.js geeft op Android geen plaatje mee');
    if (sw.fout) mis.push('sw.js: ' + sw.fout);
    else {
      if (!sw.getoond || sw.getoond.titel !== 'TEST · 🏑 Doelpunt voor Gooische!' || sw.getoond.opties.body !== 'Stand: 1-0')
        mis.push(`sw.js toont de melding niet goed: ${JSON.stringify(sw.getoond)}`);
      if (!sw.getoond || sw.getoond.opties.data.link !== 'https://robmun.github.io/JO18/t/abc/')
        mis.push('sw.js geeft de kijk-link niet mee aan de melding');
      if (sw.geopend !== 'https://robmun.github.io/JO18/t/abc/') mis.push(`tik op de melding opent '${sw.geopend}'`);
      if (sw.importScripts) mis.push('sw.js laadt nog de Firebase-bibliotheek; die toont geen melding als de app in beeld is');
      if (!mis.some(m => /sw\.js|tik op de melding/.test(m))) log('service worker: toont de melding zelf en opent bij een tik de kijk-link');
    }
  } finally { await b.close(); }
  return { ok: mis.length === 0, mis };
}

module.exports = { naam, traag, draai };
