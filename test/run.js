// Draait alle tests achter elkaar en geeft één uitslag terug.
// Afsluitcode 0 = alles in orde, 1 = er is iets mis. Die code is wat een
// GitHub Action leest, dus die bepaalt of een release door mag.
//
//   node test/run.js            alle tests
//   node test/run.js --snel     alleen de snelle (geen wedstrijdsimulaties)
//   node test/run.js 03         alleen de tests waarvan de naam hiermee begint
const fs = require('fs');
const path = require('path');
const { startServer } = require('./lib/server');

const REPO = path.resolve(__dirname, '..');
const UITVOER = path.join(__dirname, 'uitvoer');

(async () => {
  const args = process.argv.slice(2);
  const snel = args.includes('--snel');
  const filters = args.filter(a => !a.startsWith('--'));

  fs.mkdirSync(UITVOER, { recursive: true });

  let bestanden = fs.readdirSync(path.join(__dirname, 'tests')).filter(f => f.endsWith('.js')).sort();
  if (filters.length) bestanden = bestanden.filter(f => filters.some(x => f.startsWith(x)));

  const server = await startServer(REPO, '/JO18');
  console.log(`testserver op ${server.basis} (bedient ${REPO} zoals GitHub Pages dat doet)\n`);

  const uitslagen = [];
  for (const bestand of bestanden) {
    const test = require(path.join(__dirname, 'tests', bestand));
    if (snel && test.traag) { console.log(`— ${test.naam} (overgeslagen met --snel)\n`); continue; }

    const regels = [];
    const log = r => regels.push('   ' + r);
    const begin = Date.now();
    let uitslag;
    try {
      uitslag = await test.draai({ basis: server.basis, repo: REPO, uitvoer: UITVOER, log });
    } catch (e) {
      uitslag = { ok: false, mis: ['de test zelf liep stuk: ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e)] };
    }
    const sec = ((Date.now() - begin) / 1000).toFixed(1);

    console.log(`${uitslag.ok ? '✓' : '✗'} ${test.naam}  (${sec}s)`);
    regels.forEach(r => console.log(r));
    (uitslag.mis || []).forEach(m => console.log('   ✗ ' + m));
    console.log('');
    uitslagen.push({ naam: test.naam, ok: uitslag.ok, aantal: (uitslag.mis || []).length });
  }

  await server.stop();

  const stuk = uitslagen.filter(u => !u.ok);
  console.log('─'.repeat(60));
  if (!uitslagen.length) { console.log('geen enkele test gedraaid — klopt de filter?'); process.exit(2); }
  if (stuk.length) {
    console.log(`${stuk.length} van de ${uitslagen.length} tests is niet in orde:`);
    stuk.forEach(u => console.log(`   ✗ ${u.naam} (${u.aantal} ${u.aantal === 1 ? 'punt' : 'punten'})`));
    process.exit(1);
  }
  console.log(`alle ${uitslagen.length} tests in orde`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(2); });
