// Alles rond 'de app loopt vast'.
//
// Op 31 oktober bleek uit Diagnose dat het scherm ongemerkt inzoomde: 1,07x bij het
// typen in een veld van 15 pixels (iOS zoomt dan zelf in en zoomt niet terug), en 1,6x
// na twee snelle tikken. Een paar procent ingezoomd ziet er normaal uit, maar alles
// schuift onder de titelbalk en tikken komen verkeerd aan: een app die vast lijkt.
//
// Deze test controleert de vijf maatregelen:
//   1. elk invulveld is minstens 16 pixels, zodat iOS niet inzoomt bij het typen;
//   2. zoomen staat uit (viewport-regel) en dubbeltik-zoom ook (touch-action);
//   3. de zwarte doos: een stilstand binnen de sessie en een vastgelopen vorige sessie
//      komen allebei in de foutenlijst, met de stap waarin het gebeurde;
//   4. bij een wisselmoment wordt het scherm niet vernieuwd zolang er een vinger op ligt;
//   5. twee tikken op de tabbalk zonder resultaat zetten de app vanzelf recht.
const { startBrowser, nieuweContext } = require('../lib/browser');

const naam = 'vastloper: zoom, zwarte doos, uitstel en zelfherstel';
const traag = false;

const TELEFOON = { viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true };

async function wedstrijdKlaar(p, basis) {
  await p.goto(basis + 'index.html', { waitUntil: 'load' });
  await p.waitForTimeout(1400);
  return await p.evaluate(() => {
    state.players.forEach(x => x.present = true);
    activeTab = 'wedstrijd'; render();
    const g = [...document.querySelectorAll('button')].find(b => /genereren/i.test(b.textContent));
    if (g) g.click();
    return !!state.schedule;
  });
}
const fouten = p => p.evaluate(() => _fouten.map(f => f.waar + ' · ' + f.wat));

async function draai({ basis, log }) {
  const mis = [];
  const b = await startBrowser();
  const paginafouten = [];
  try {
    const ctx = await nieuweContext(b, TELEFOON);
    const p = await ctx.newPage();
    p.on('pageerror', e => { if (!/ServiceWorker/.test(String(e))) paginafouten.push(String(e).slice(0, 160)); });
    if (!await wedstrijdKlaar(p, basis)) { mis.push('er kwam geen wisselschema tot stand'); return { ok: false, mis }; }

    // ── 1. Invulvelden ──
    const klein = await p.evaluate(() => {
      const uit = [];
      const meet = waar => document.querySelectorAll('input,textarea,select').forEach(e => {
        if (['checkbox', 'radio', 'range', 'hidden', 'file'].includes(e.type)) return;
        const fs = parseFloat(getComputedStyle(e).fontSize);
        if (fs < 16) uit.push(`${waar}: ${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}.${String(e.className).trim().split(/\s+/).join('.')} ${fs}px`);
      });
      for (const t of ['timer', 'spelers', 'regels', 'wedstrijd', 'uitleg']) { activeTab = t; render(); meet(t); }
      // Ook het invulvenster dat de app zelf opent (naam, notitie).
      inputDialog({ title: 'test', enkel: true, onOk: () => {} }); meet('venster (regel)');
      inputDialog({ title: 'test', onOk: () => {} }); meet('venster (tekstvak)');
      document.getElementById('modalHost').innerHTML = '';
      activeTab = 'wedstrijd'; render();
      return uit;
    });
    klein.forEach(k => mis.push('invulveld kleiner dan 16 pixels — ' + k));
    if (!klein.length) log('alle invulvelden minstens 16 pixels');

    // ── 2. Zoomen uit ──
    const zoom = await p.evaluate(() => ({
      meta: document.querySelector('meta[name="viewport"]').getAttribute('content'),
      touch: getComputedStyle(document.documentElement).touchAction
    }));
    if (!/maximum-scale=1\b/.test(zoom.meta) || !/user-scalable=no/.test(zoom.meta)) mis.push(`zoomen staat niet uit: '${zoom.meta}'`);
    if (zoom.touch !== 'manipulation') mis.push(`dubbeltik-zoom staat niet uit (touch-action: ${zoom.touch})`);
    if (!mis.some(m => /zoom/.test(m))) log('zoomen uit, dubbeltik-zoom uit');

    // ── 3a. Stilstand binnen de sessie ──
    await p.evaluate(() => { stap('test: zware klus'); const t = Date.now(); while (Date.now() - t < 7000) {} });
    await p.waitForTimeout(2600);
    const naStil = (await fouten(p)).find(f => /^stilstand/.test(f));
    if (!naStil) mis.push('een stilstand van 7 seconden staat niet in de foutenlijst');
    else if (!/test: zware klus/.test(naStil)) mis.push(`de stilstand noemt de stap niet: '${naStil}'`);
    else log('stilstand binnen de sessie: ' + naStil.replace(/^stilstand · /, ''));

    // ── 3b. Vastgelopen vorige sessie ──
    // Een normale herstart meldt zich netjes af: dan hoort er níets te staan.
    await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(1200);
    if ((await fouten(p)).some(f => /^vastloper/.test(f) && !/test-stap/.test(f)))
      mis.push('na een gewone herstart staat er toch een vastloper in de lijst');
    // Een sessie die ophield zonder afmelden: dat is wat wegswipen na een vastloper achterlaat.
    await p.evaluate(() => {
      localStorage.setItem(SLEUTEL('gw_hartslag'), JSON.stringify({ t: Date.now() - 60000, s: 'test-stap', st: Date.now() - 90000, tab: 'wedstrijd', weg: false }));
      // Het afmelden bij het herladen hieronder mag deze regel niet overschrijven.
      hartslag = () => {};
    });
    await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(1200);
    const vast = (await fouten(p)).find(f => /^vastloper/.test(f));
    if (!vast || !/test-stap/.test(vast) || !/30 s/.test(vast)) mis.push(`een vastgelopen vorige sessie staat er niet goed in: '${vast || 'niets'}'`);
    else log('vorige sessie: ' + vast.replace(/^vastloper · /, ''));

    // ── 4. Niet vernieuwen onder de vinger ──
    if (!await wedstrijdKlaar(p, basis)) { mis.push('na herladen geen schema'); return { ok: false, mis }; }
    const blok = await p.evaluate(() => 17.5 / state.schedule.perQ);
    const zetKlok = sec => p.evaluate(sec => new Promise(k => {
      window.postMessage({ ghcStand: { q: 2, sec, loopt: true } }, location.origin); setTimeout(k, 250);
    }), sec);
    await zetKlok(30);
    const voor = await p.evaluate(() => _getoond.blok);
    await p.evaluate(() => { _vingers = 1; });
    await zetKlok(Math.round(blok * 60) + 10);
    const tijdens = await p.evaluate(() => _getoond.blok);
    await p.evaluate(() => { _vingers = 0; });
    await p.waitForTimeout(700);
    const na = await p.evaluate(() => _getoond.blok);
    if (tijdens !== voor) mis.push('het scherm werd vernieuwd terwijl er een vinger op lag');
    if (na === voor) mis.push('na het loslaten van de vinger bleef het oude wisselmoment staan');
    // Een duim die blijft liggen mag het wisselmoment niet eindeloos tegenhouden.
    await zetKlok(Math.round(2 * blok * 60) + 10);
    await p.evaluate(() => { _vingers = 1; });
    const lang = await p.evaluate(() => new Promise(k => setTimeout(() => k(_getoond.blok), 5600)));
    await p.evaluate(() => { _vingers = 0; });
    if (lang !== 2) mis.push(`met een vinger die blijft liggen kwam het wisselmoment na 5 seconden niet (blok ${lang})`);
    if (tijdens === voor && na !== voor && lang === 2) log(`wisselmoment: wacht tot de vinger los is (blok ${voor} → ${tijdens} → ${na}), na 5 s toch vernieuwd`);

    // ── 5. Zelfherstel ──
    // Een tabbalk die niet reageert nabootsen: het tikken komt binnen, maar de klik
    // doet niets.
    const herstel = await p.evaluate(() => new Promise(k => {
      activeTab = 'wedstrijd'; render();
      const knop = document.querySelector('.tabbar [data-tab="regels"]');
      const echt = knop.onclick; knop.onclick = null;
      const tik = () => knop.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      tik();
      setTimeout(() => {
        const naEen = activeTab;
        tik();
        setTimeout(() => k({ naEen, naTwee: activeTab, echt: !!echt }), 600);
      }, 500);
    }));
    const herstelRegel = (await fouten(p)).find(f => /^herstel/.test(f));
    if (herstel.naEen !== 'wedstrijd') mis.push(`na één dode tik greep het herstel al in (tab ${herstel.naEen})`);
    if (herstel.naTwee !== 'regels') mis.push(`na twee dode tikken op Regels staat de app nog op ${herstel.naTwee}`);
    if (!herstelRegel) mis.push('het zelfherstel staat niet in de foutenlijst');
    if (herstel.naEen === 'wedstrijd' && herstel.naTwee === 'regels' && herstelRegel) log('zelfherstel: twee dode tikken op Regels → app hersteld en op Regels');

    // En een tik op een leeg stuk scherm zonder klik zet niets in gang.
    const leeg = await p.evaluate(() => new Promise(k => {
      const voor = _fouten.length, tab = activeTab;
      for (let i = 0; i < 4; i++) document.getElementById('view').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      setTimeout(() => k({ nieuw: _fouten.length - voor, tab: activeTab === tab }), 600);
    }));
    if (leeg.nieuw || !leeg.tab) mis.push('tikken op een leeg stuk scherm zetten het zelfherstel in gang');

    await ctx.close();
    paginafouten.forEach(f => mis.push('paginafout: ' + f));
  } finally { await b.close(); }
  return { ok: mis.length === 0, mis };
}

module.exports = { naam, traag, draai };
