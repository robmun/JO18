// De berichtteksten, los van Firebase. Draaien: node meldingen/test/stand.test.js
const { bericht } = require('../functions/stand');
const s = (thuis, uit, t, u) => ({ thuis, uit, t, u });
const gevallen = [
  ['wij thuis scoren', s('Gooische', 'Amsterdam', 0, 0), s('Gooische', 'Amsterdam', 1, 0), '🏑 Gooische scoort!', 'Gooische – Amsterdam\n1 - 0'],
  ['wij uit scoren', s('Amsterdam', 'Gooische', 0, 0), s('Amsterdam', 'Gooische', 0, 1), '🏑 Gooische scoort!', 'Amsterdam – Gooische\n0 - 1'],
  ['tegendoelpunt', s('Gooische', 'Amsterdam', 0, 0), s('Gooische', 'Amsterdam', 0, 1), '🏑 Tegendoelpunt!', 'Gooische – Amsterdam\n0 - 1'],
  ['ons doelpunt geannuleerd', s('Gooische', 'Amsterdam', 1, 0), s('Gooische', 'Amsterdam', 0, 0), 'Doelpunt afgekeurd', 'Gooische – Amsterdam\n0 - 0'],
  ['tegendoelpunt geannuleerd', s('Gooische', 'Amsterdam', 1, 1), s('Gooische', 'Amsterdam', 1, 0), 'Tegendoelpunt afgekeurd', 'Gooische – Amsterdam\n1 - 0'],
  ['hoofdletters maken niet uit', s('GOOISCHE JO18-5', 'Huizen', 2, 2), s('GOOISCHE JO18-5', 'Huizen', 3, 2), '🏑 GOOISCHE JO18-5 scoort!', null],
  ['geen Gooische: neutraal', s('Amsterdam', 'Zwolle', 0, 0), s('Amsterdam', 'Zwolle', 1, 0), '🏑 Amsterdam scoort', 'Amsterdam – Zwolle\n1 - 0'],
  ['twee tegelijk', s('Gooische', 'Amsterdam', 0, 0), s('Gooische', 'Amsterdam', 1, 1), 'Stand bijgewerkt', 'Gooische – Amsterdam\n1 - 1'],
  ['terug naar 0-0 vanaf 2-1', s('Gooische', 'Amsterdam', 2, 1), s('Gooische', 'Amsterdam', 0, 0), null, null],
  ['andere tegenstander', s('Gooische', 'Amsterdam', 1, 0), s('Gooische', 'Zwolle', 0, 0), null, null],
  ['naam nog leeg', s('Gooische', '', 0, 0), s('Gooische', '', 1, 0), null, null],
];
let mis = 0;
for (const [naam, vorig, nu, titel, tekst] of gevallen) {
  const b = bericht(vorig, nu);
  const ok = titel === null ? b === null : (b && b.titel === titel && (tekst === null || b.tekst === tekst));
  console.log((ok ? '✓ ' : '✗ ') + naam + (ok ? '' : `: kreeg ${JSON.stringify(b)}`));
  if (!ok) mis++;
}
// Aankondigingen van de coach: aftrap en einde.
const { aankondigBericht } = require('../functions/stand');
const ank = [
  ['aftrap, wij thuis', 'start', s('Gooische', 'Amsterdam', 0, 0), '🏑 De wedstrijd is begonnen', 'Gooische – Amsterdam'],
  ['aftrap, wij uit', 'start', s('Amsterdam', 'Gooische', 0, 0), '🏑 De wedstrijd is begonnen', 'Amsterdam – Gooische'],
  ['einde gewonnen (thuis)', 'einde', s('Gooische', 'Amsterdam', 2, 0), '🏁 Wedstrijd beëindigd', 'Gooische – Amsterdam\n2 - 0'],
  ['einde verloren (uit)', 'einde', s('Amsterdam', 'Gooische', 2, 0), '🏁 Wedstrijd beëindigd', 'Amsterdam – Gooische\n2 - 0'],
  ['einde gelijk', 'einde', s('Gooische', 'Amsterdam', 1, 1), '🏁 Wedstrijd beëindigd', 'Gooische – Amsterdam\n1 - 1'],
  ['einde zonder Gooische', 'einde', s('Amsterdam', 'Zwolle', 3, 1), '🏁 Wedstrijd beëindigd', 'Amsterdam – Zwolle\n3 - 1'],
  ['zonder namen', 'start', s('Gooische', '', 0, 0), null, null],
];
for (const [naam, soort, nu, titel, tekst] of ank) {
  const b = aankondigBericht(soort, nu);
  const ok = titel === null ? b === null : (b && b.titel === titel && b.tekst === tekst);
  console.log((ok ? '✓ ' : '✗ ') + naam + (ok ? '' : `: kreeg ${JSON.stringify(b)}`));
  if (!ok) mis++;
}
// Titels moeten op één regel passen (iOS kapt ze af). Ruim: hoogstens 28 tekens met
// teamnamen van gewone lengte.
for (const [naam, soort, nu] of ank) {
  const b = aankondigBericht(soort, nu);
  if (b && [...b.titel].length > 28) { console.log(`✗ titel te lang (${[...b.titel].length}): ${b.titel}`); mis++; }
}
for (const [naam, vorig, nu] of gevallen) {
  const b = bericht(vorig, nu);
  if (b && [...b.titel].length > 28) { console.log(`✗ titel te lang (${[...b.titel].length}): ${b.titel}`); mis++; }
}
// Speeltijd bij een doelpunt.
const { speeltijd } = require('../functions/stand');
const T0 = 1800000000000;
const tijden = [
  ['klok loopt', { q: 1, basis: 120, sinds: T0 - 24000, loopt: true }, T0, 'Q1 - 02:24'],
  ['klok stil', { q: 3, basis: 970, loopt: false }, T0, 'Q3 - 16:10'],
  ['niet langer dan een kwart', { q: 2, basis: 1000, sinds: T0 - 600000, loopt: true }, T0, 'Q2 - 17:30'],
  ['geen klok', null, T0, null],
  ['klok nog niet gestart', { q: 1, basis: 0, loopt: false }, T0, null],
];
for (const [naam, klok, op, verwacht] of tijden) {
  const t = speeltijd(klok, op);
  const ok = t === verwacht;
  console.log((ok ? '✓ ' : '✗ ') + 'speeltijd, ' + naam + (ok ? '' : `: kreeg ${t}`));
  if (!ok) mis++;
}
console.log(mis ? `\n${mis} niet in orde` : '\nalles in orde');
process.exit(mis ? 1 : 0);
