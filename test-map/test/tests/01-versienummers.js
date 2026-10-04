// Controleert of de vier versienummers bij elkaar passen en of de demo-map gelijk
// loopt met de hoofdmap. Dit is de goedkoopste test en vangt de fout die het vaakst
// gemaakt wordt: één van de vier vergeten op te hogen, of de demo niet meekopiëren.
const fs = require('fs');
const path = require('path');

const naam = 'versienummers';
const traag = false;

async function draai({ repo, log }) {
  const mis = [];
  const lees = p => fs.readFileSync(path.join(repo, p), 'utf8');
  const bestaat = p => fs.existsSync(path.join(repo, p));

  const index = lees('index.html');
  const app = (index.match(/const APP_VERSION\s*=\s*(\d+)/) || [])[1];
  const label = (index.match(/const VERSIE_LABEL\s*=\s*'([^']+)'/) || [])[1];
  const timer = (lees('timer.html').match(/TIMER_VERSION\s*=\s*(\d+)/) || [])[1];
  const json = JSON.parse(lees('version.json'));

  if (!app || !label || !timer) { mis.push('kon een versienummer niet vinden in index.html of timer.html'); }
  log(`hoofdmap: APP_VERSION ${app} · TIMER_VERSION ${timer} · version.json ${json.version} · label ${label}`);

  if (String(app) !== String(timer)) mis.push(`APP_VERSION (${app}) en TIMER_VERSION (${timer}) lopen uiteen`);
  if (String(app) !== String(json.version)) mis.push(`version.json (${json.version}) past niet bij APP_VERSION (${app})`);
  if (label !== json.label) mis.push(`label in version.json (${json.label}) past niet bij VERSIE_LABEL (${label})`);

  // Het label hoort jaar.maand.volgnummer te zijn, bijvoorbeeld 26.10.7.
  if (!/^\d{2}\.\d{1,2}\.\d+$/.test(label || '')) mis.push(`label '${label}' heeft niet de vorm jaar.maand.volgnummer`);
  else {
    const maand = Number(label.split('.')[1]);
    if (maand < 1 || maand > 12) mis.push(`maand ${maand} in label '${label}' bestaat niet`);
  }

  // 404.html is de kopie van index.html waarop de kijk-link /t/<teamcode>/ leunt.
  if (!bestaat('404.html')) mis.push('404.html ontbreekt — dan werkt de kijk-link niet');
  else if (lees('404.html') !== index) mis.push('404.html is geen exacte kopie van index.html');
  else log('404.html is gelijk aan index.html');

  // De demo moet dezelfde drie bestanden hebben, anders kijk je daar naar een oude app.
  for (const b of ['index.html', 'timer.html', 'version.json']) {
    if (!bestaat('demo/' + b)) { mis.push(`demo/${b} ontbreekt`); continue; }
    if (lees('demo/' + b) !== lees(b)) mis.push(`demo/${b} verschilt van de hoofdmap`);
  }
  if (!mis.some(m => /demo\//.test(m))) log('demo-map loopt gelijk met de hoofdmap');

  return { ok: mis.length === 0, mis };
}

module.exports = { naam, traag, draai };
