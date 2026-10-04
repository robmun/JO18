// De zelftest die in de app zelf zit (?zelftest=1). Die rekent de planner honderden
// keren door: wisselmomenten, speeltijdverdeling, keeperregels, ongedaan maken.
// Hier wordt alleen de uitslag opgehaald en omgezet in goed of fout.
const { startBrowser, TOESTEL } = require('../lib/browser');

const naam = 'zelftest van de planner';
const traag = false;

async function draai({ basis, log }) {
  const mis = [];
  const b = await startBrowser();
  try {
    const ctx = await b.newContext(TOESTEL);
    const p = await ctx.newPage();
    const paginafouten = [];
    p.on('pageerror', e => { if (!/ServiceWorker/.test(String(e))) paginafouten.push(String(e).slice(0, 160)); });

    await p.goto(basis + 'index.html?zelftest=1', { waitUntil: 'load' });
    await p.waitForSelector('#view .card h2', { timeout: 60000 });

    const r = await p.evaluate(() => ({
      kop: document.querySelector('#view .card h2').textContent.trim(),
      hint: (document.querySelector('#view .card .hint') || {}).textContent || '',
      regels: [...document.querySelectorAll('#view .card .rule span')].map(s => s.textContent.trim()),
      problemen: [...document.querySelectorAll('#view .card p.hint')].map(s => s.textContent.trim())
    }));

    const goed = r.regels.filter(x => x.startsWith('✓')).length;
    const slecht = r.regels.filter(x => x.startsWith('✗'));
    log(`${goed} van de ${r.regels.length} onderdelen in orde · ${r.hint}`);
    slecht.forEach(x => mis.push('onderdeel mislukt: ' + x.replace(/^✗\s*/, '')));
    if (!r.regels.length) mis.push('de zelftest gaf geen enkel onderdeel terug');
    if (!/alles in orde/.test(r.kop) && !slecht.length) mis.push('kop zegt: ' + r.kop);
    paginafouten.forEach(x => mis.push('paginafout: ' + x));

    await ctx.close();
  } finally { await b.close(); }
  return { ok: mis.length === 0, mis };
}

module.exports = { naam, traag, draai };
