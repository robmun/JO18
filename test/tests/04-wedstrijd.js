// Een hele wedstrijd van vier kwarten, uitsluitend via echte knoppen: starten,
// minuten verzetten, kaarten, blessures, een ad-hoc ruil, en steeds weer de app
// wegleggen en terugpakken (scherm op slot, even WhatsApp, weer terug). Dat laatste
// is wat er langs het veld het vaakst gebeurt en wat een vastloper zou verklaren.
// De test stopt zodra de app niet meer reageert en legt dan vast wat er aan de hand is.
const fs = require('fs');
const path = require('path');
const { startBrowser, TOESTEL } = require('../lib/browser');

const naam = 'hele wedstrijd op één toestel';
const traag = true;

async function draai({ basis, log, uitvoer }) {
  const mis = [];
  const b = await startBrowser();
  try {
    const ctx = await b.newContext(TOESTEL);
    const p = await ctx.newPage();
    const paginafouten = [];
    p.on('pageerror', e => { if (!/ServiceWorker/.test(String(e))) paginafouten.push(String(e).slice(0, 160)); });
    await p.goto(basis + 'index.html', { waitUntil: 'load' });
    await p.waitForTimeout(1600);

    const frame = () => p.frames().find(f => f.url().includes('timer.html'));
    let stap = 0, gestopt = null;

    async function vastgelopen(wat, extra) {
      const g = await p.evaluate(() => {
        const tb = document.querySelector('.tabbar').getBoundingClientRect();
        const th = document.getElementById('timerHost');
        const knop = document.querySelector('#tabbar .tab[data-tab="wedstrijd"]');
        const k = knop ? knop.getBoundingClientRect() : null;
        const el = k ? document.elementFromPoint(k.left + k.width / 2, k.top + k.height / 2) : null;
        const mh = document.getElementById('modalHost');
        return {
          activeTab, klok,
          tabbarTop: Math.round(tb.top),
          timerHostZichtbaar: th.classList.contains('show'),
          timermode: document.body.classList.contains('timermode'),
          knopAanwezig: !!knop,
          opDeTikplek: el ? el.tagName + ' ' + (typeof el.className === 'string' ? el.className : '') : null,
          modaalOpen: !!(mh && mh.innerHTML.trim()),
          fouten: _fouten.map(f => f.waar + ' · ' + f.wat),
          aantalTabs: document.querySelectorAll('#tabbar .tab').length
        };
      });
      try { await p.screenshot({ path: path.join(uitvoer, 'wedstrijd-vastgelopen.png') }); } catch (e) {}
      gestopt = { wat, extra, g };
    }

    // Staat er een venster open, dan beantwoordt een coach dat eerst.
    async function venster(keuze) {
      return p.evaluate(async k => {
        const mh = document.getElementById('modalHost');
        if (!mh || !mh.innerHTML.trim()) return 'geen venster';
        const knoppen = [...mh.querySelectorAll('button')];
        const annu = mh.querySelector('#mcancel') || knoppen.find(b => /annuleren|cancel/i.test(b.textContent));
        const doel = k === 'nee' ? annu : (knoppen.filter(b => b !== annu).pop() || annu);
        if (!doel) return 'geen knop';
        const tekst = doel.textContent.trim().slice(0, 40);
        doel.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await new Promise(r => setTimeout(r, 320));
        return document.getElementById('modalHost').innerHTML.trim() === ''
          ? 'gekozen: ' + tekst : 'venster bleef open na ' + tekst;
      }, keuze);
    }
    async function tikTab(id, wat) {
      if (gestopt) return;
      await venster('ja'); stap++;
      let fout = null;
      try { await p.click(`#tabbar .tab[data-tab="${id}"]`, { timeout: 2500 }); }
      catch (e) { fout = String(e.message).split('\n')[0]; }
      await p.waitForTimeout(160);
      const nu = await p.evaluate(() => activeTab);
      if (nu !== id) await vastgelopen(`stap ${stap}: ${wat} — tik op tab '${id}' had geen effect`, fout || 'de tik zelf lukte wel');
    }
    async function tikTimer(sel, wat) {
      if (gestopt) return;
      await venster('ja'); stap++;
      const f = frame();
      if (!f) { await vastgelopen(`stap ${stap}: ${wat}`, 'geen timervenster'); return; }
      try { await f.click(sel, { timeout: 2500 }); }
      catch (e) { await vastgelopen(`stap ${stap}: ${wat} — knop ${sel} niet aantikbaar`, String(e.message).split('\n')[0]); }
      await p.waitForTimeout(170);
    }
    // De app wegleggen en terugpakken.
    async function weglegen(hoelang) {
      if (gestopt) return; stap++;
      await p.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { get: () => 'hidden', configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
        window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
      });
      await p.waitForTimeout(hoelang);
      await p.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
        window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
        window.dispatchEvent(new Event('focus'));
        window.dispatchEvent(new Event('resize'));
      });
      await p.waitForTimeout(350);
      const leeft = await p.evaluate(() => {
        const v = document.getElementById('view');
        return { tab: activeTab, tabs: document.querySelectorAll('#tabbar .tab').length, inhoud: v ? v.innerHTML.length : 0 };
      });
      if (leeft.tabs < 5) await vastgelopen(`stap ${stap}: na weglegen`, JSON.stringify(leeft));
    }
    async function minuten(n) {
      const opTimer = await p.evaluate(() => activeTab === 'timer');
      if (!opTimer) await tikTab('timer', 'naar de timer om de klok te verzetten');
      for (let i = 0; i < n && !gestopt; i++) await tikTimer('#plusMin', '+1 min');
    }
    async function actie(act, wat) {
      if (gestopt) return; stap++;
      const r = await p.evaluate(async a => {
        const chips = [...document.querySelectorAll('.chip[data-chip]')];
        if (!chips.length) return 'geen veldspelers';
        chips[2].dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await new Promise(r => setTimeout(r, 150));
        const k = document.querySelector(`[data-act2="${a}"]`);
        if (!k) { const c = document.getElementById('mcancel'); if (c) c.click(); return 'knop ' + a + ' ontbreekt'; }
        k.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await new Promise(r => setTimeout(r, 250));
        return document.getElementById('modalHost').innerHTML.trim() === '' ? true : 'venster bleef open';
      }, act);
      if (r !== true) {
        const v = await venster('ja');
        if (/gekozen/.test(v)) return;          // het was een vervolgvraag, netjes beantwoord
        await vastgelopen(`stap ${stap}: ${wat} (${act})`, String(r) + ' · ' + v);
      }
    }

    await tikTab('timer', 'opstart'); await p.waitForTimeout(1300);
    for (let q = 1; q <= 4 && !gestopt; q++) {
      await tikTab('timer', `Q${q} naar de timer`);
      if (q > 1) {
        stap++; const f = frame();
        try { await f.click(`.qbtn[data-q="${q}"]`, { timeout: 2500 }); }
        catch (e) { await vastgelopen(`stap ${stap}: Q${q} kiezen`, String(e.message).split('\n')[0]); }
        await p.waitForTimeout(260);
        const v = await venster('ja');
        if (/bleef open/.test(v)) await vastgelopen(`stap ${stap}: Q${q} bevestigen`, v);
      }
      await tikTimer('#start', `Q${q} starten`);
      await minuten(4);
      await tikTab('wedstrijd', `Q${q} na de aftrap`);
      for (let i = 0; i < 2 && !gestopt; i++) {
        await tikTab('timer', `Q${q} kijk ${i + 1}`); await minuten(3);
        await weglegen(600); await tikTab('wedstrijd', `Q${q} terug ${i + 1}`); await weglegen(1200);
      }
      if (q === 1) await actie('groen', 'groene kaart');
      if (q === 2) {
        await actie('ruil', 'ad-hoc ruil begint');
        await p.evaluate(async () => {
          const bk = document.querySelector('.brow[data-chip]');
          if (bk) bk.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          await new Promise(r => setTimeout(r, 200));
        });
        await tikTab('timer', 'na de ruil'); await tikTimer('#start', 'pauzeren');
        await tikTab('wedstrijd', 'tijdens de pauze');
        await tikTab('timer', 'terug'); await tikTimer('#start', 'hervatten');
      }
      if (q === 3) { await actie('blessure', 'blessure'); await tikTab('timer', 'voor -1 min'); await tikTimer('#minusMin', '-1 min'); }
      if (q === 4) await actie('groen', 'tweede groene kaart');
      await tikTab('timer', `Q${q} uitspelen`);
      await minuten(10);
      await weglegen(2000);
      await tikTab('wedstrijd', `Q${q} einde`);
      await tikTab('spelers', `Q${q} spelers`);
      await tikTab('uitleg', `Q${q} meer`);
      await tikTab('wedstrijd', `Q${q} terug`);
      await tikTab('timer', `Q${q} afsluiten`);
      await tikTimer('#start', `Q${q} pauzeren`);
    }

    if (gestopt) {
      mis.push('VASTGELOPEN bij ' + gestopt.wat);
      mis.push('   melding: ' + gestopt.extra);
      mis.push('   toestand: ' + JSON.stringify(gestopt.g));
      mis.push('   schermafdruk: ' + path.join(uitvoer, 'wedstrijd-vastgelopen.png'));
    } else {
      const slot = await p.evaluate(() => ({
        tab: activeTab, q: klok.q, seconden: klok.sec,
        gebeurtenissen: (state.gebeurtenissen || []).length,
        // Firebase en de service worker bestaan in de testomgeving niet; die meldingen
        // horen erbij en zeggen niets over de app zelf.
        fouten: _fouten.filter(f => !/Firebase|ServiceWorker/i.test(f.wat)).map(f => f.waar + ' · ' + f.wat)
      }));
      log(`hele wedstrijd doorlopen zonder vastloper · ${stap} handelingen`);
      log(`eindstand: Q${slot.q} op ${slot.seconden}s · ${slot.gebeurtenissen} gebeurtenissen vastgelegd`);
      slot.fouten.forEach(f => mis.push('de app legde een fout vast: ' + f));
    }
    paginafouten.forEach(f => mis.push('paginafout: ' + f));
    await ctx.close();
  } finally { await b.close(); }
  return { ok: mis.length === 0, mis };
}

module.exports = { naam, traag, draai };
