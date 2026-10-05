// Een kaart geeft een straftijd die meeloopt met de wedstrijdklok. Die klok kan
// springen — een kwart dat teruggezet wordt, een kwart dat vroeg wordt afgesloten —
// en dan klopte de aftelling niet meer. Op een echte wedstrijd stond er 4:17 achter
// een groene kaart van twee minuten, en was de speler niet meer aan te tikken om hem
// terug het veld in te sturen.
//
// Deze test speelt die situaties na met echte klokberichten, zoals de timer ze stuurt.
const { startBrowser, nieuweContext } = require('../lib/browser');

const naam = 'kaarten en een klok die springt';
const traag = false;

async function draai({ basis, log }) {
  const mis = [];
  const b = await startBrowser();
  try {
    const ctx = await nieuweContext(b);
    const p = await ctx.newPage();
    const paginafouten = [];
    p.on('pageerror', e => { if (!/ServiceWorker/.test(String(e))) paginafouten.push(String(e).slice(0, 160)); });
    await p.goto(basis + 'index.html', { waitUntil: 'load' });
    await p.waitForTimeout(1500);

    // De klok zetten zoals de timer dat doet: via een bericht, niet door de variabele
    // te overschrijven. Anders zou de test het herankeren overslaan.
    const klok = (q, sec, loopt) => p.evaluate(([q, sec, loopt]) => new Promise(k => {
      window.postMessage({ ghcStand: { q, sec, loopt } }, location.origin);
      setTimeout(k, 120);
    }), [q, sec, loopt]);
    const rest = pid => p.evaluate(i => kaartResterend(byId(i)), pid);

    const klaar = await p.evaluate(() => {
      state.players.forEach(x => x.present = true);
      activeTab = 'wedstrijd'; render();
      const gen = [...document.querySelectorAll('button')].find(b => /genereren/i.test(b.textContent));
      if (gen) gen.click();
      return !!state.schedule;
    });
    if (!klaar) { mis.push('er kwam geen wisselschema tot stand'); return { ok: false, mis }; }

    // ── 1. groene kaart, klok loopt door, kwart wordt teruggezet ──
    await klok(1, 137, true);
    const pid = await p.evaluate(() => {
      const id = Object.values(state.schedule.assignments[0])[3];
      byId(id).kaart = { soort: 'groen', terug: totaalSec() + KAARTEN.groen.min * 60 };
      return id;
    });
    if (await rest(pid) !== 120) mis.push(`een groene kaart begint op ${await rest(pid)} sec in plaats van 120`);

    await klok(1, 180, true);                       // 43 seconden verder
    const lopend = await rest(pid);
    if (lopend !== 77) mis.push(`na 43 seconden spelen staat de aftelling op ${lopend} in plaats van 77`);

    await klok(1, 0, false);                        // het kwart wordt teruggezet
    const naReset = await rest(pid);
    if (naReset !== lopend) mis.push(`na het terugzetten van het kwart staat de aftelling op ${naReset} in plaats van ${lopend}`);
    log(`groene kaart: 120 → ${lopend} na 43 sec spelen → ${naReset} na het terugzetten van het kwart`);

    // ── 2. de speler moet aantikbaar blijven, ook met een stilstaande klok op 0 ──
    const tik = await p.evaluate(i => {
      selChip = null; document.getElementById('modalHost').innerHTML = '';
      activeTab = 'wedstrijd'; render();
      chipTap(i);
      const mh = document.getElementById('modalHost');
      return { bezig: wedstrijdBezig(), menu: !!mh.innerHTML.trim(), selChip,
               knoppen: [...mh.querySelectorAll('[data-act2]')].map(x => x.dataset.act2) };
    }, pid);
    if (tik.bezig) mis.push('de klok telt hier als lopend; dan toetst deze test niet wat hij moet toetsen');
    if (!tik.menu) mis.push('een tik op de speler met een kaart opent geen keuzevenster');
    if (tik.selChip) mis.push(`een tik op de speler met een kaart begon een ruil (${tik.selChip})`);
    for (const knop of ['kaartterug', 'weg']) {
      if (!tik.knoppen.includes(knop)) mis.push(`de knop '${knop}' ontbreekt in het keuzevenster`);
    }
    if (tik.menu && !tik.selChip) log('met een stilstaande klok op 0 opent het menu met: ' + tik.knoppen.join(', '));
    await p.evaluate(() => { document.getElementById('modalHost').innerHTML = ''; });

    // ── 3. gele kaart laat in Q3, daarna Q3 teruggezet en Q4 gestart ──
    const pid2 = await p.evaluate(() => Object.values(state.schedule.assignments[0])[5]);
    await klok(3, 1040, true);
    await p.evaluate(i => { byId(i).kaart = { soort: 'geel', terug: totaalSec() + KAARTEN.geel.min * 60 }; }, pid2);
    const geel = await rest(pid2);
    if (geel !== 300) mis.push(`een gele kaart begint op ${geel} sec in plaats van 300`);
    await klok(3, 0, false);
    const naResetQ3 = await rest(pid2);
    if (naResetQ3 !== geel) mis.push(`na het terugzetten van Q3 staat de aftelling op ${naResetQ3} in plaats van ${geel}`);
    await klok(4, 0, false);
    const inQ4 = await rest(pid2);
    if (inQ4 !== geel) mis.push(`bij de start van Q4 staat de aftelling op ${inQ4} in plaats van ${geel}`);
    log(`gele kaart in Q3: ${geel} → ${naResetQ3} na het terugzetten → ${inQ4} bij de start van Q4`);

    // ── 4. de aftelling kan nooit langer worden dan de kaart zelf ──
    const geklemd = await p.evaluate(i => {
      byId(i).kaart = { soort: 'groen', terug: totaalSec() + 99999 };   // onmogelijke stand
      return kaartResterend(byId(i));
    }, pid2);
    if (geklemd > 120) mis.push(`een onmogelijke straftijd wordt niet afgekapt (${geklemd} sec)`);
    else log('een onmogelijke straftijd wordt afgekapt op de lengte van de kaart');

    paginafouten.forEach(f => mis.push('paginafout: ' + f));
    await ctx.close();
  } finally { await b.close(); }
  return { ok: mis.length === 0, mis };
}

module.exports = { naam, traag, draai };
