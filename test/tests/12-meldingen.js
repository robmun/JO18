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
      const v = document.getElementById('meldTest');
      if (!v) return k({ vinkje: false });
      _db.gezet = null; v.checked = true; v.dispatchEvent(new Event('change', { bubbles: true }));
      setTimeout(() => { activeTab = 'wedstrijd'; render(); k({ vinkje: true, test: _db.gezet && _db.gezet.d.test }); }, 300);
    }));
    if (!testvink.vinkje) mis.push('het vinkje Dit is een testtoestel ontbreekt');
    else if (testvink.test !== true) mis.push('na het aanvinken is het toestel niet als testtoestel aangemeld');
    else log('testtoestel aangevinkt: aanmelding opnieuw weggeschreven met test: true');

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
    // De kijker ziet de schakelaar niet.
    const kijkerSchakel = await p.evaluate(() => { CLOUD.role = 'viewer'; render(); const n = document.querySelectorAll('[data-meldmodus]').length; CLOUD.role = 'editor'; return n; });
    if (kijkerSchakel) mis.push('een kijker ziet de schakelaar van de coach');

    await ctx.close();
    paginafouten.forEach(f => mis.push('paginafout: ' + f));
  } finally { await b.close(); }
  return { ok: mis.length === 0, mis };
}

module.exports = { naam, traag, draai };
