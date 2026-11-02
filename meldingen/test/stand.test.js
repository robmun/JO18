// De berichtteksten, los van Firebase. Draaien: node meldingen/test/stand.test.js
const { bericht } = require('../functions/stand');
const s = (thuis, uit, t, u) => ({ thuis, uit, t, u });
const gevallen = [
  ['wij thuis scoren', s('Gooische', 'Amsterdam', 0, 0), s('Gooische', 'Amsterdam', 1, 0), '🏑 Gooische scoort!', 'Er is gescoord door ons team. Stand: Gooische – Amsterdam 1-0'],
  ['wij uit scoren', s('Amsterdam', 'Gooische', 0, 0), s('Amsterdam', 'Gooische', 0, 1), '🏑 Gooische scoort!', 'Er is gescoord door ons team. Stand: Amsterdam – Gooische 0-1'],
  ['tegendoelpunt', s('Gooische', 'Amsterdam', 0, 0), s('Gooische', 'Amsterdam', 0, 1), 'Tegendoelpunt', 'We hebben helaas een tegendoelpunt moeten incasseren. Stand: Gooische – Amsterdam 0-1'],
  ['ons doelpunt geannuleerd', s('Gooische', 'Amsterdam', 1, 0), s('Gooische', 'Amsterdam', 0, 0), 'Doelpunt geannuleerd', 'Het doelpunt van Gooische telt niet. De stand is weer Gooische – Amsterdam 0-0'],
  ['tegendoelpunt geannuleerd', s('Gooische', 'Amsterdam', 1, 1), s('Gooische', 'Amsterdam', 1, 0), 'Tegendoelpunt geannuleerd', 'Het doelpunt van Amsterdam telt niet. De stand is weer Gooische – Amsterdam 1-0'],
  ['hoofdletters maken niet uit', s('GOOISCHE JO18-5', 'Huizen', 2, 2), s('GOOISCHE JO18-5', 'Huizen', 3, 2), '🏑 GOOISCHE JO18-5 scoort!', null],
  ['geen Gooische: neutraal', s('Amsterdam', 'Zwolle', 0, 0), s('Amsterdam', 'Zwolle', 1, 0), '🏑 Amsterdam scoort', 'Stand: Amsterdam – Zwolle 1-0'],
  ['twee tegelijk', s('Gooische', 'Amsterdam', 0, 0), s('Gooische', 'Amsterdam', 1, 1), 'Stand bijgewerkt', 'Stand: Gooische – Amsterdam 1-1'],
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
  ['aftrap, wij thuis', 'start', s('Gooische', 'Amsterdam', 0, 0), '🏑 Aftrap tegen Amsterdam', 'De wedstrijd Gooische – Amsterdam is begonnen. Volg de stand in de app of via de notifications.'],
  ['aftrap, wij uit', 'start', s('Amsterdam', 'Gooische', 0, 0), '🏑 Aftrap tegen Amsterdam', 'De wedstrijd Amsterdam – Gooische is begonnen. Volg de stand in de app of via de notifications.'],
  ['einde gewonnen (thuis)', 'einde', s('Gooische', 'Amsterdam', 2, 0), '🏁 Afgelopen: gewonnen!', 'Uitslag: Gooische – Amsterdam 2-0'],
  ['einde verloren (uit)', 'einde', s('Amsterdam', 'Gooische', 2, 0), '🏁 Afgelopen: verloren', 'Uitslag: Amsterdam – Gooische 2-0'],
  ['einde gelijk', 'einde', s('Gooische', 'Amsterdam', 1, 1), '🏁 Afgelopen: gelijkgespeeld', 'Uitslag: Gooische – Amsterdam 1-1'],
  ['einde zonder Gooische', 'einde', s('Amsterdam', 'Zwolle', 3, 1), '🏁 Wedstrijd afgelopen', 'Uitslag: Amsterdam – Zwolle 3-1'],
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
console.log(mis ? `\n${mis} niet in orde` : '\nalles in orde');
process.exit(mis ? 1 : 0);
