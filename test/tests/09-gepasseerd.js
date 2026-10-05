// Wat al geweest is, hoort van het scherm af.
//
// Op de telefoon blijft onder de vastgezette veldtekening maar een strook over. Stond
// daar het wisselmoment van zes minuten geleden, dan schoof het moment dat eraan komt
// achter het veld weg voordat je het kon lezen — en dan lijkt het alsof de wisselteksten
// helemaal verdwenen zijn. Daarom laat een lopend kwart alleen nog tonen wat nog komt.
//
// Even belangrijk is wat er níet weggelaat wordt: blader je vooruit naar een kwart dat
// nog moet komen, dan hoor je het hele plan te zien, en blader je terug naar een gespeeld
// kwart, dan kijk je bewust naar wat er gebeurd is. Die twee staan hier ook in, want een
// te gretige filter is net zo goed stuk.
//
// Coach en kijker lopen door dezelfde opbouw (wisselTekst); de rol vertakt daar niet.
// Getoetst wordt op de telefoon én op de liggende tablet, de twee indelingen.
const { startBrowser, nieuweContext } = require('../lib/browser');

const naam = 'gepasseerde wisselmomenten verdwijnen';
const traag = false;

const TELEFOON = { viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true };
const TABLET   = { viewport: { width: 1180, height: 820 }, hasTouch: true };

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

// De klok zetten zoals de timer dat doet, en daarna het getoonde kwart kiezen.
// klok.q telt vanaf 1, toonQ vanaf 0 — vandaar de twee verschillende getallen.
async function zet(p, kwart, sec, toon) {
  await p.evaluate(({ kwart, sec, toon }) => new Promise(k => {
    window.postMessage({ ghcStand: { q: kwart, sec, loopt: true } }, location.origin);
    setTimeout(() => { toonQ = (toon === undefined ? null : toon); render(); k(); }, 200);
  }), { kwart, sec, toon });
  return await p.evaluate(() => ({
    momenten: [...document.querySelectorAll('.wmoment[data-min]')].map(e => Number(e.dataset.min)),
    nu: [...document.querySelectorAll('.wmoment.nu')].map(e => Number(e.dataset.min)),
    startkaart: !!document.querySelector('.card.startq'),
    alles_geweest: /zijn geweest|have passed/.test(document.body.innerText)
  }));
}

async function toetsIndeling(p, basis, waar, mis, log) {
  if (!await wedstrijdKlaar(p, basis)) { mis.push(`${waar}: er kwam geen wisselschema tot stand`); return; }
  const blok = await p.evaluate(() => 17.5 / state.schedule.perQ);
  const alle = (await zet(p, 2, 5, 1)).momenten;   // Q2 net begonnen: het hele plan
  if (alle.length < 2) { mis.push(`${waar}: er staan maar ${alle.length} wisselmomenten in een kwart; te weinig om iets te meten`); return; }

  // Net begonnen kwart: alles staat er nog, inclusief de kaart 'Bij start van Q2'.
  if (!alle.length) mis.push(`${waar}: aan het begin van het kwart staat er geen enkel wisselmoment`);

  // Twintig seconden voorbij het eerste moment: dat hoort weg, de rest blijft.
  const na1 = await zet(p, 2, Math.round(blok * 60) + 20, 1);
  if (na1.momenten.includes(alle[0]))
    mis.push(`${waar}: het moment van minuut ${alle[0]} staat er na afloop nog`);
  if (na1.momenten.length !== alle.length - 1)
    mis.push(`${waar}: na één gepasseerd moment staan er ${na1.momenten.length} in plaats van ${alle.length - 1}`);
  if (na1.nu[0] !== alle[1])
    mis.push(`${waar}: minuut ${alle[1]} krijgt niet de nadruk als eerstvolgende (nadruk staat op ${na1.nu.join(',') || 'niets'})`);
  if (na1.startkaart)
    mis.push(`${waar}: de kaart 'Bij start van Q2' staat er midden in het kwart nog`);

  // Eind van het kwart: niets meer te wisselen, en dat hoort er te staan.
  const eind = await zet(p, 2, 17 * 60, 1);
  if (eind.momenten.length) mis.push(`${waar}: aan het eind van het kwart staan er nog ${eind.momenten.length} momenten`);
  if (!eind.alles_geweest) mis.push(`${waar}: aan het eind van het kwart ontbreekt de regel dat alles geweest is`);

  // Vooruitbladeren naar Q3: dat kwart moet nog komen, dus het hele plan.
  const vooruit = await zet(p, 2, 17 * 60, 2);
  if (vooruit.momenten.length !== alle.length)
    mis.push(`${waar}: in het volgende kwart staan er ${vooruit.momenten.length} momenten in plaats van het hele plan (${alle.length})`);
  if (!vooruit.startkaart) mis.push(`${waar}: in het volgende kwart ontbreekt de kaart bij de start`);

  // Terugbladeren naar Q1: daar kijk je bewust naar wat er gebeurd is.
  const terug = await zet(p, 2, 17 * 60, 0);
  if (terug.momenten.length !== alle.length)
    mis.push(`${waar}: in een gespeeld kwart staan er ${terug.momenten.length} momenten in plaats van alle ${alle.length}`);

  log(`${waar}: ${alle.length} gepland, na het eerste moment nog ${na1.momenten.length}, aan het eind 0 — vooruit en terug blijft alles staan`);
}

async function draai({ basis, log }) {
  const mis = [];
  const b = await startBrowser();
  const fouten = [];
  try {
    for (const [waar, toestel] of [['telefoon', TELEFOON], ['tablet', TABLET]]) {
      const ctx = await nieuweContext(b, toestel);
      const p = await ctx.newPage();
      p.on('pageerror', e => { if (!/ServiceWorker/.test(String(e))) fouten.push(String(e).slice(0, 160)); });
      await toetsIndeling(p, basis, waar, mis, log);
      await ctx.close();
    }
    fouten.forEach(f => mis.push('paginafout: ' + f));
  } finally { await b.close(); }
  return { ok: mis.length === 0, mis };
}

module.exports = { naam, traag, draai };
