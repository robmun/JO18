// Wat al geweest is, klapt weg — maar blijft op zijn plek in de tijd.
//
// Op de telefoon blijft onder de vastgezette veldtekening maar een strook over. Stond
// daar het wisselmoment van zes minuten geleden, dan schoof het moment dat eraan komt
// achter het veld weg voordat je het kon lezen — en dan lijkt het alsof de wisselteksten
// helemaal verdwenen zijn. Daarom staat in een lopend kwart bovenaan alleen wat nog komt.
//
// Wat geweest is, staat boven het moment dat eraan komt, op volgorde van de klok
// (start van het kwart, 6 min, 12 min), maar ingeklapt. Op 31 oktober werd er te laat
// gewisseld en was nergens meer te zien wie met wie moest. Sinds 26.11.1 trek je het
// tevoorschijn door je vinger op de grote tekst te leggen en omlaag te trekken; bij
// loslaten veert het terug. Dat gebaar wordt hier met echte aanraakbewegingen getoetst.
//
// Even belangrijk is wat er níet weggelaat wordt: blader je vooruit naar een kwart dat
// nog moet komen, dan hoor je het hele plan te zien, en blader je terug naar een gespeeld
// kwart, dan kijk je bewust naar wat er gebeurd is. Die twee staan hier ook in, want een
// te gretige filter is net zo goed stuk.
//
// Coach en kijker lopen door dezelfde opbouw (wisselTekst); de rol vertakt daar niet.
// Getoetst wordt op de telefoon én op de liggende tablet, de twee indelingen.
const { startBrowser, nieuweContext } = require('../lib/browser');

const naam = 'gepasseerde wisselmomenten klappen weg en zijn tevoorschijn te trekken';
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
    geweest: [...document.querySelectorAll('.wmoment.geweest')].map(e => Number(e.dataset.geweest)),
    geweestVoorKomend: (() => {
      const g = document.querySelector('.verleden'), k = document.querySelector('.wmoment[data-min]');
      return !g || !k || !!(g.compareDocumentPosition(k) & Node.DOCUMENT_POSITION_FOLLOWING);
    })(),
    ingeklapt: (() => { const g = document.querySelector('.verleden'); return !g || g.getBoundingClientRect().height < 1; })(),
    hint: (document.querySelector('.trekvlak .trekhint') || {}).textContent || '',
    geweestTekst: (document.querySelector('.verleden .wmoment') || {}).textContent || '',
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
    mis.push(`${waar}: de kaart 'Bij start van Q2' staat er midden in het kwart nog bovenaan`);
  // Maar terughalen moet kunnen: de start van het kwart en het gepasseerde moment
  // staan ingeklapt boven het komende moment, op volgorde van de klok.
  if (na1.geweest.join(',') !== `0,${alle[0]}`)
    mis.push(`${waar}: wat geweest is staat als [${na1.geweest.join(', ')}] in plaats van [0, ${alle[0]}]`);
  if (!na1.geweestVoorKomend) mis.push(`${waar}: wat geweest is staat niet boven het moment dat eraan komt`);
  if (!na1.ingeklapt) mis.push(`${waar}: wat geweest is staat niet ingeklapt`);
  if (na1.hint !== '▾ trek omlaag · 2 wissels geweest') mis.push(`${waar}: de hint luidt '${na1.hint}'`);
  if (!/erin|eruit|Geen wissels/.test(na1.geweestTekst)) mis.push(`${waar}: het gepasseerde moment laat niet zien wie er wisselt`);

  // Het gebaar: omlaag trekken op de grote tekst haalt het tevoorschijn, loslaten
  // klapt het in. Omhoog vegen op dezelfde tekst, of omlaag vegen elders, doet niets.
  const gebaar = await p.evaluate(() => new Promise(klaar => {
    const ver = document.querySelector('.verleden'), vlak = document.querySelector('.trekvlak');
    const view = document.getElementById('view');
    const r = vlak.getBoundingClientRect(), x = r.left + 30, y = r.top + 20;
    const tik = (soort, el, yy) => {
      const t = new Touch({ identifier: 1, target: el, clientX: x, clientY: yy });
      el.dispatchEvent(new TouchEvent(soort, { bubbles: true, cancelable: true,
        touches: soort === 'touchend' ? [] : [t], targetTouches: soort === 'touchend' ? [] : [t], changedTouches: [t] }));
    };
    const vol = ver.scrollHeight, uit = {};
    tik('touchstart', vlak, y); tik('touchmove', vlak, y + 10); tik('touchmove', vlak, y + 60);
    uit.na60 = ver.getBoundingClientRect().height;
    tik('touchmove', vlak, y + vol + 200);
    uit.ver = ver.getBoundingClientRect().height; uit.vol = vol;
    tik('touchend', vlak, y + vol + 200);
    setTimeout(() => {
      uit.los = ver.getBoundingClientRect().height;
      // omhoog op de grote tekst
      tik('touchstart', vlak, y + 100); tik('touchmove', vlak, y + 90); tik('touchmove', vlak, y + 20);
      uit.omhoog = ver.getBoundingClientRect().height; tik('touchend', vlak, y + 20);
      // omlaag elders (de kop van de kaart)
      const kop = vlak.closest('.card').querySelector('h2');
      tik('touchstart', kop, y); tik('touchmove', kop, y + 10); tik('touchmove', kop, y + 80);
      uit.elders = ver.getBoundingClientRect().height; tik('touchend', kop, y + 80);
      klaar(uit);
    }, 450);
  }));
  if (Math.abs(gebaar.na60 - 60) > 2) mis.push(`${waar}: na 60 pixels trekken is er ${gebaar.na60} pixels zichtbaar`);
  if (gebaar.ver < gebaar.vol || gebaar.ver > gebaar.vol + 60) mis.push(`${waar}: ver doortrekken toont ${Math.round(gebaar.ver)} van de ${gebaar.vol} pixels`);
  if (gebaar.los > 1) mis.push(`${waar}: na loslaten blijft er ${gebaar.los} pixels zichtbaar`);
  if (gebaar.omhoog > 1) mis.push(`${waar}: omhoog vegen op de grote tekst haalt het verleden tevoorschijn`);
  if (gebaar.elders > 1) mis.push(`${waar}: omlaag vegen buiten de grote tekst haalt het verleden tevoorschijn`);

  // Eind van het kwart: niets meer te wisselen, en dat hoort er te staan.
  const eind = await zet(p, 2, 17 * 60, 1);
  if (eind.momenten.length) mis.push(`${waar}: aan het eind van het kwart staan er nog ${eind.momenten.length} momenten`);
  const verwacht = '0,' + alle.join(',');
  if (eind.geweest.join(',') !== verwacht)
    mis.push(`${waar}: aan het eind staat als geweest [${eind.geweest.join(', ')}] in plaats van [${verwacht}]`);
  if (!eind.ingeklapt) mis.push(`${waar}: aan het eind staat wat geweest is niet ingeklapt`);
  if (!/trek omlaag/.test(eind.hint)) mis.push(`${waar}: aan het eind is er niets om aan te trekken`);
  if (!eind.alles_geweest) mis.push(`${waar}: aan het eind van het kwart ontbreekt de regel dat alles geweest is`);

  // Vooruitbladeren naar Q3: dat kwart moet nog komen, dus het hele plan.
  const vooruit = await zet(p, 2, 17 * 60, 2);
  if (vooruit.momenten.length !== alle.length)
    mis.push(`${waar}: in het volgende kwart staan er ${vooruit.momenten.length} momenten in plaats van het hele plan (${alle.length})`);
  if (!vooruit.startkaart) mis.push(`${waar}: in het volgende kwart ontbreekt de kaart bij de start`);
  if (vooruit.geweest.length) mis.push(`${waar}: in een kwart dat nog moet komen staat al iets als geweest`);

  // Terugbladeren naar Q1: daar kijk je bewust naar wat er gebeurd is.
  const terug = await zet(p, 2, 17 * 60, 0);
  if (terug.momenten.length !== alle.length)
    mis.push(`${waar}: in een gespeeld kwart staan er ${terug.momenten.length} momenten in plaats van alle ${alle.length}`);

  if (terug.geweest.length) mis.push(`${waar}: in een gespeeld kwart klapt er iets weg`);

  log(`${waar}: na het eerste moment ingeklapt erboven [${na1.geweest.join(', ')}] · trekken ${Math.round(gebaar.na60)}px → ${Math.round(gebaar.ver)}px → los ${gebaar.los}px · omhoog en elders niets · aan het eind [${eind.geweest.join(', ')}]`);
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
