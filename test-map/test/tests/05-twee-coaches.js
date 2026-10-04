// Twee coaches op twee toestellen, een hele wedstrijd lang. A bedient de timer,
// B kijkt mee en wijzigt ook. Onderweg valt het bereik van B een halve minuut weg
// en wijzigen ze een keer tegelijk — de twee gevallen waarin de standen uit elkaar
// kunnen lopen. Alleen de database is nagebootst; de rest is de echte app.
const path = require('path');
const { startBrowser, TOESTEL } = require('../lib/browser');
const maakStub = require('../lib/fbstub.js')();

const naam = 'twee coaches tegelijk';
const traag = true;

async function draai({ basis, log, uitvoer }) {
  const mis = [];
  const TEAM = 'testteam' + Math.floor(Math.random() * 99999);
  const b = await startBrowser();
  try {
    const fouten = { A: [], B: [] }, paginas = [];
    let stap = 0;

    async function maakPagina(nm, uid) {
      const ctx = await b.newContext(TOESTEL);
      const p = await ctx.newPage(); p._naam = nm;
      p.on('pageerror', e => { if (!/ServiceWorker/.test(String(e))) fouten[nm].push(String(e).slice(0, 150)); });
      // Twee aparte browseromgevingen kunnen geen BroadcastChannel delen (elk heeft een
      // eigen opslag en dus een eigen toestel-id). De koppeling loopt daarom via Node.
      await p.exposeFunction('__fbSend', async t => {
        for (const q of paginas) { if (q === p) continue; try { await q.evaluate(x => window.__fbRecv && window.__fbRecv(x), t); } catch (e) {} }
      });
      await p.addInitScript(maakStub, uid);
      await p.goto(basis + 'index.html', { waitUntil: 'load' });
      await p.waitForTimeout(1500);
      paginas.push(p);
      return p;
    }
    const A = await maakPagina('A', 'uid-a'), B = await maakPagina('B', 'uid-b');
    const verbind = (p, rol) => p.evaluate(async ([t, r]) => {
      CLOUD.cfg = FB_CONFIG; CLOUD.team = t; CLOUD.role = r;
      CLOUD.name = r === 'viewer' ? 'speler' : 'coach';
      const ok = await cloudConnect(); render();
      return { ok, rol: CLOUD.rol };
    }, [TEAM, rol]);

    const vA = await verbind(A, 'editor');
    if (!vA.ok) mis.push('A kon geen team maken');
    await A.evaluate(() => koppelvensterOpen()); await A.waitForTimeout(400);
    const vB = await verbind(B, 'editor');
    if (!vB.ok) mis.push('B kon niet aansluiten bij het team van A');
    log(`A sluit aan als ${vA.rol} · B sluit aan als ${vB.rol}`);
    await A.waitForTimeout(600);

    const frame = p => p.frames().find(f => f.url().includes('timer.html'));
    const klik = (p, s) => frame(p).evaluate(x => {
      const e = document.querySelector(x);
      if (e) e.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    }, s);
    const venster = p => p.evaluate(async () => {
      const mh = document.getElementById('modalHost');
      if (!mh || !mh.innerHTML.trim()) return 'geen';
      const kn = [...mh.querySelectorAll('button')];
      const an = mh.querySelector('#mcancel');
      const d = kn.filter(x => x !== an).pop();
      if (d) d.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise(r => setTimeout(r, 280));
      return 'beantwoord';
    });
    async function tab(p, id, wat) {
      stap++; await venster(p);
      let tikfout = null;
      try { await p.click(`#tabbar .tab[data-tab="${id}"]`, { timeout: 2500 }); }
      catch (e) { tikfout = String(e.message).split('\n')[0]; }
      await p.waitForTimeout(170);
      const r = await p.evaluate(() => ({ tab: activeTab, tabs: document.querySelectorAll('#tabbar .tab').length }));
      if (r.tab !== id) mis.push(`stap ${stap} ${p._naam} ${wat}: tab bleef '${r.tab}' in plaats van '${id}'${tikfout ? ' · ' + tikfout : ''}`);
      if (r.tabs < 5) mis.push(`stap ${stap} ${p._naam} ${wat}: tabbalk kwijt (${r.tabs})`);
    }
    async function weglegen(p, ms) {
      stap++;
      await p.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { get: () => 'hidden', configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
        window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
      });
      await p.waitForTimeout(ms);
      await p.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
        window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
        window.dispatchEvent(new Event('focus'));
      });
      await p.waitForTimeout(320);
    }
    async function speleractie(p, act, wat) {
      stap++;
      const r = await p.evaluate(async a => {
        const chips = [...document.querySelectorAll('.chip[data-chip]')];
        if (!chips.length) return 'geen veldspelers';
        chips[2].dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await new Promise(r => setTimeout(r, 160));
        const k = document.querySelector(`[data-act2="${a}"]`);
        if (!k) { const c = document.getElementById('mcancel'); if (c) c.click(); return 'knop ontbreekt'; }
        k.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await new Promise(r => setTimeout(r, 350));
        return true;
      }, act);
      await venster(p); await p.waitForTimeout(400);
      if (r !== true) mis.push(`stap ${stap} ${p._naam} ${wat}: ${act} → ${r}`);
    }
    async function wisselAanwezig(p, wat) {
      stap++;
      const r = await p.evaluate(async () => {
        activeTab = 'spelers'; render();
        await new Promise(r => setTimeout(r, 120));
        const aan = [...document.querySelectorAll('[data-act="present"]')].filter(x => x.checked);
        if (aan.length < 13) return 'te weinig aanwezig';
        const s = aan[aan.length - 1];
        s.checked = false; s.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise(r => setTimeout(r, 400));
        return true;
      });
      await venster(p); await p.waitForTimeout(500);
      if (r !== true) mis.push(`stap ${stap} ${p._naam} ${wat}: afmelden → ${r}`);
    }

    // Vanaf hier: trage verbinding, zoals langs een veld.
    const bereik = (p, vertraging, storing) => p.evaluate(([v, s]) => {
      window.__fbVertraging = v; window.__fbStoring = s;
    }, [vertraging, storing]);
    await bereik(A, 700, false); await bereik(B, 700, false);
    await tab(A, 'timer', 'opstart'); await A.waitForTimeout(1200);
    await tab(B, 'timer', 'opstart'); await B.waitForTimeout(1300);
    await tab(B, 'wedstrijd', 'B kijkt mee');

    for (let q = 1; q <= 4; q++) {
      await tab(A, 'timer', `Q${q}`);
      if (q > 1) { stap++; await klik(A, `.qbtn[data-q="${q}"]`); await A.waitForTimeout(250); }
      stap++; await klik(A, '#start'); await A.waitForTimeout(400); await venster(A); await A.waitForTimeout(500);
      for (let i = 0; i < 5; i++) {
        stap++; await klik(A, '#plusMin'); await A.waitForTimeout(150);
        await tab(A, 'wedstrijd', `Q${q} A kijkt`);
        await tab(A, 'timer', `Q${q} A terug`);
        await tab(B, i % 3 === 0 ? 'spelers' : (i % 3 === 1 ? 'wedstrijd' : 'uitleg'), `Q${q} B bladert`);
        if (i === 2) { await weglegen(B, 900); await tab(B, 'wedstrijd', `Q${q} B terug na weglegen`); }
      }
      if (q === 1) { await tab(B, 'wedstrijd', 'B'); await speleractie(B, 'groen', 'B geeft een groene kaart'); }
      if (q === 2) {
        await tab(A, 'wedstrijd', 'A'); await speleractie(A, 'blessure', 'A meldt een blessure');
        await tab(B, 'wedstrijd', 'B ziet de blessure');
        // het bereik valt weg bij B, een halve minuut lang
        log('   … het bereik van B valt weg');
        await bereik(B, 700, true);
        await tab(B, 'wedstrijd', 'B zonder bereik');
        await speleractie(B, 'groen', 'B wijzigt zonder bereik');
        for (let k = 0; k < 3; k++) { stap++; await klik(A, '#plusMin'); await A.waitForTimeout(400); }
        await B.waitForTimeout(4000);
        await bereik(B, 700, false);
        log('   … het bereik van B is terug');
        await B.waitForTimeout(6000);
        const herstel = await B.evaluate(() => ({ status: CLOUD.status, rev: CLOUD.rev, q: klok.q, sec: klok.sec }));
        log('   B na herstel: ' + JSON.stringify(herstel));
        if (herstel.status !== 'verbonden') mis.push('B kwam na het wegvallen van het bereik niet terug (status ' + herstel.status + ')');
      }
      if (q === 3) {
        // allebei tegelijk, het klassieke botsingsgeval
        stap++;
        await Promise.all([wisselAanwezig(A, 'A tegelijk'), speleractie(B, 'groen', 'B tegelijk')]);
        await A.waitForTimeout(1200);
      }
      // de rust: A pauzeert, B wijzigt de selectie
      stap++; await tab(A, 'timer', `Q${q} pauze`); await klik(A, '#start'); await A.waitForTimeout(350);
      if (q < 4) {
        await wisselAanwezig(B, `B wijzigt in de rust na Q${q}`);
        await weglegen(A, 1500);
        await tab(A, 'wedstrijd', 'A terug na de rust');
      }
    }

    // Even wachten: met 700 ms vertraging is de laatste pauze nog onderweg.
    await A.waitForTimeout(3500);
    const eind = p => p.evaluate(() => ({
      q: klok.q, sec: klok.sec, rev: CLOUD.rev, status: CLOUD.status,
      aanwezig: state.players.filter(x => x.present).length,
      schema: !!state.schedule,
      fouten: _fouten.filter(f => !/Firebase|ServiceWorker|techniekteller/i.test(f.wat)).map(f => f.waar + ' · ' + f.wat)
    }));
    const eA = await eind(A), eB = await eind(B);

    log(`${stap} handelingen · A: Q${eA.q} rev ${eA.rev} ${eA.aanwezig} aanwezig · B: Q${eB.q} rev ${eB.rev} ${eB.aanwezig} aanwezig`);
    if (!(eA.q === eB.q && Math.abs(eA.sec - eB.sec) < 3)) mis.push(`de klokken lopen uiteen (A Q${eA.q}/${eA.sec}s · B Q${eB.q}/${eB.sec}s)`);
    if (eA.rev !== eB.rev) mis.push(`de twee toestellen hebben een andere versie van de stand (A ${eA.rev} · B ${eB.rev})`);
    if (eA.aanwezig !== eB.aanwezig) mis.push(`de selecties lopen uiteen (A ${eA.aanwezig} · B ${eB.aanwezig})`);
    if (!eA.schema || !eB.schema) mis.push('het wisselschema is onderweg verdwenen');
    eA.fouten.forEach(f => mis.push('A legde een fout vast: ' + f));
    eB.fouten.forEach(f => mis.push('B legde een fout vast: ' + f));
    fouten.A.forEach(f => mis.push('paginafout A: ' + f));
    fouten.B.forEach(f => mis.push('paginafout B: ' + f));

    if (mis.length) {
      try {
        await A.screenshot({ path: path.join(uitvoer, 'twee-coaches-A.png') });
        await B.screenshot({ path: path.join(uitvoer, 'twee-coaches-B.png') });
        mis.push('schermafdrukken staan in ' + uitvoer);
      } catch (e) {}
    }
  } finally { await b.close(); }
  return { ok: mis.length === 0, mis };
}

module.exports = { naam, traag, draai };
