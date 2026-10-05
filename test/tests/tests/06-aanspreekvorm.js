// De app schreef overal 'hij'. Dat is nu weg: bijna alle teksten noemen geen
// voornaamwoord meer, en waar er toch één nodig is komt hij uit een teaminstelling
// (jongens, meisjes, gemengd). Deze test bewaakt drie dingen:
//
//   1. de drie standen geven de juiste woorden, ook met een hoofdletter;
//   2. de instelling reist mee met de gedeelde stand, dus de mede-coach en het
//      kijkscherm krijgen hem erbij;
//   3. er staat op geen enkel tabblad een token als {hij} in beeld — dat zou
//      betekenen dat een tekst de invulling misloopt.
const { startBrowser, nieuweContext } = require('../lib/browser');

const naam = 'hoe de app over spelers schrijft';
const traag = false;

const VERWACHT = {
  j: { hij: 'hij', hem: 'hem',  zijn: 'zijn', Hij: 'Hij', he: 'he',   his: 'his'   },
  m: { hij: 'zij', hem: 'haar', zijn: 'haar', Hij: 'Zij', he: 'she',  his: 'her'   },
  n: { hij: 'die', hem: 'die',  zijn: 'hun',  Hij: 'Die', he: 'they', his: 'their' }
};
const TABBLADEN = ['wedstrijd', 'timer', 'spelers', 'regels', 'uitleg'];

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

    // 1. beginwaarde: een bestaande app hoort te lezen zoals hij deed
    const begin = await p.evaluate(() => aanspreekvorm());
    if (begin !== 'j') mis.push(`de beginwaarde is '${begin}' in plaats van 'j'`);

    // 2. de drie standen
    for (const stand of ['j', 'm', 'n']) {
      const r = await p.evaluate(s => {
        state.aanspreek = s;
        return {
          woorden: { hij: V('hij'), hem: V('hem'), zijn: V('zijn'), Hij: V('Hij'), he: V('he'), his: V('his') },
          gevuld: vnwVul('{Hij} speelt met {zijn} ploeg; geef {hem} de bal.'),
          gedeeld: serializeState().aanspreek
        };
      }, stand);
      for (const [sleutel, woord] of Object.entries(VERWACHT[stand])) {
        if (r.woorden[sleutel] !== woord) mis.push(`stand '${stand}': V('${sleutel}') gaf '${r.woorden[sleutel]}' in plaats van '${woord}'`);
      }
      if (/\{[A-Za-z]+\}/.test(r.gevuld)) mis.push(`stand '${stand}': er bleef een token staan in "${r.gevuld}"`);
      if (r.gedeeld !== stand) mis.push(`stand '${stand}' reist niet mee in de gedeelde stand (werd '${r.gedeeld}')`);
      log(`${stand}: ${r.gevuld}`);
    }

    // 3. geen achtergebleven tokens in beeld, in geen van de drie standen,
    //    op geen van de tabbladen, in beide talen
    const tokens = /\{(Hij|hij|Hem|hem|Zijn|zijn|He|he|Him|him|His|his)\}/;
    for (const taalkeuze of ['nl', 'en']) {
      await p.evaluate(t => { try { localStorage.setItem('ghc-taal', t); } catch (e) {} }, taalkeuze);
      for (const stand of ['j', 'm', 'n']) {
        for (const tab of TABBLADEN) {
          const tekst = await p.evaluate(([s, t]) => {
            state.aanspreek = s; activeTab = t; render();
            return (document.getElementById('view') || {}).innerText || '';
          }, [stand, tab]);
          const m = tekst.match(tokens);
          if (m) mis.push(`${taalkeuze}/${stand}/${tab}: token ${m[0]} staat in beeld`);
        }
      }
    }
    await p.evaluate(() => { try { localStorage.setItem('ghc-taal', 'nl'); } catch (e) {} });

    // 4. de keuzeknoppen staan op Meer
    const knoppen = await p.evaluate(() => {
      activeTab = 'uitleg'; render();
      return [...document.querySelectorAll('[data-aanspreek]')].map(x => x.dataset.aanspreek);
    });
    if (knoppen.join(',') !== 'j,m,n') mis.push(`op Meer staan de keuzes als '${knoppen.join(',')}' in plaats van 'j,m,n'`);
    else log('de keuze staat op Meer, bij Instellingen');

    paginafouten.forEach(f => mis.push('paginafout: ' + f));
    await ctx.close();
  } finally { await b.close(); }
  return { ok: mis.length === 0, mis };
}

module.exports = { naam, traag, draai };
