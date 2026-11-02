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
      const knop = kaart && kaart.querySelector('[data-meld]');
      const uit = { balk, staat: meldStaat(), kaart: !!kaart, knop: knop ? knop.dataset.meld : null, tekst: kaart ? kaart.innerText : '' };
      activeTab = 'wedstrijd'; render();
      return uit;
    });

    // ── 1. Zonder sleutel: niets ──
    const zonder = await kijk();
    if (zonder.balk || zonder.kaart) mis.push('zonder Web Push-sleutel staat de vraag of de kaart er toch');
    else log('zonder sleutel: geen vraag en geen kaart');

    // ── 2. Met sleutel: vraag en kaart ──
    await p.evaluate(() => { VAPID_KEY = 'test-sleutel'; render(); });
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
      if (velden !== 'laatst,sinds,token,uid') mis.push(`de aanmelding heeft de velden ${velden}; de regels staan alleen laatst,sinds,token,uid toe`);
      if (aan.db.d.token !== TOKEN || aan.db.d.uid !== 'kijker-uid') mis.push('token of uid klopt niet in de aanmelding');
      if (!Number.isInteger(aan.db.d.sinds) || !Number.isInteger(aan.db.d.laatst)) mis.push('sinds/laatst zijn geen gehele getallen; de regels weigeren dat');
    }
    if (aan.staat !== 'aan') mis.push(`na Aanzetten staat meldingen op '${aan.staat}'`);
    if (aan.balk) mis.push('na Aanzetten staat de vraag er nog');
    const naAan = await kijk();
    if (naAan.knop !== 'uit') mis.push('na Aanzetten staat er geen knop Uitzetten op Meer');
    if (aan.db && aan.db.id === id && aan.staat === 'aan' && naAan.knop === 'uit') log('aanzetten: aanmelding onder de vingerafdruk van het token, met de vier toegestane velden');

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

    await ctx.close();
    paginafouten.forEach(f => mis.push('paginafout: ' + f));
  } finally { await b.close(); }
  return { ok: mis.length === 0, mis };
}

module.exports = { naam, traag, draai };
