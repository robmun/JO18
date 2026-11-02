// Wat moet er in de melding staan? Alleen rekenwerk, geen Firebase: zo is het in een
// test na te lopen zonder server.
//
// Afspraken (Robert, 2 november 2026):
//   • De thuisploeg staat altijd links: bij 'Amsterdam – Zwolle' speelt Amsterdam thuis.
//     In de stand van de app is dat 'thuis' met 't' doelpunten, rechts 'uit' met 'u'.
//   • Wij zijn Gooische. Komt er aan de kant van Gooische een doelpunt bij, dan is dat
//     een doelpunt voor ons, ongeacht of we thuis of uit spelen.
//   • Staat Gooische niet in de wedstrijd (een ander team gebruikt de app), dan krijgen
//     kijkers een neutrale melding: 'Doelpunt voor Amsterdam'.

const ONS = /gooische/i;

function geheel(x) {
  const n = Math.round(Number(x) || 0);
  return Math.max(0, Math.min(99, n));
}

// De stand uit het teamdocument. De app bewaart zijn hele toestand als één JSON-tekst
// in het veld 'state'; de stand staat daarin onder 'score'.
function leesStand(data) {
  try {
    const st = typeof (data && data.state) === 'string' ? JSON.parse(data.state) : ((data && data.state) || {});
    const s = (st && st.score) || {};
    return {
      thuis: String(s.thuis || '').trim().slice(0, 20),
      uit: String(s.uit || '').trim().slice(0, 20),
      t: geheel(s.t),
      u: geheel(s.u),
    };
  } catch (e) {
    return null;
  }
}

// Naar wie gaan de meldingen? De coach kiest het in de app; het staat in de gedeelde
// stand als 'meldingen'. Zonder waarde: uit, zodat er nooit per ongeluk iets gaat.
function leesModus(data) {
  try {
    const st = typeof (data && data.state) === 'string' ? JSON.parse(data.state) : ((data && data.state) || {});
    return ['uit', 'test', 'aan'].includes(st && st.meldingen) ? st.meldingen : 'uit';
  } catch (e) {
    return 'uit';
  }
}

// De laatste aankondiging van de coach (aftrap of einde), of null.
function leesAankondiging(data) {
  try {
    const st = typeof (data && data.state) === 'string' ? JSON.parse(data.state) : ((data && data.state) || {});
    const a = st && st.aankondiging;
    return a && ['start', 'einde'].includes(a.soort) && Number.isFinite(a.nr) ? { soort: a.soort, nr: a.nr } : null;
  } catch (e) {
    return null;
  }
}

// Bericht bij een aankondiging. Tegenstander = de ploeg die niet Gooische is.
function aankondigBericht(soort, nu) {
  if (!nu || !nu.thuis || !nu.uit) return null;
  const onsZijde = ONS.test(nu.thuis) ? 't' : ONS.test(nu.uit) ? 'u' : null;
  const tegen = onsZijde === 't' ? nu.uit : onsZijde === 'u' ? nu.thuis : null;
  const wedstrijd = `${nu.thuis} – ${nu.uit}`;
  if (soort === 'start') {
    return {
      titel: tegen ? `🏑 De wedstrijd tegen ${tegen} is begonnen` : `🏑 ${wedstrijd} is begonnen`,
      tekst: `${wedstrijd}. Volg de stand in de app.`,
      soort: 'aftrap',
    };
  }
  if (soort === 'einde') {
    const wij = onsZijde === 't' ? nu.t : onsZijde === 'u' ? nu.u : null;
    const zij = onsZijde === 't' ? nu.u : onsZijde === 'u' ? nu.t : null;
    const uitkomst = wij == null ? null : wij > zij ? 'gewonnen!' : wij < zij ? 'verloren' : 'gelijkgespeeld';
    return {
      titel: uitkomst ? `🏁 Wedstrijd afgelopen: ${uitkomst}` : '🏁 Wedstrijd afgelopen',
      tekst: `Uitslag: ${standTekst(nu)}`,
      soort: 'einde',
    };
  }
  return null;
}

function gelijk(a, b) {
  return !!a && !!b && a.thuis === b.thuis && a.uit === b.uit && a.t === b.t && a.u === b.u;
}

function standTekst(s) {
  return `${s.thuis} – ${s.uit} ${s.t}-${s.u}`;
}

// Vergelijkt de laatst verstuurde stand met de stand van nu en geeft de melding terug,
// of null als er niets te melden valt.
function bericht(vorig, nu) {
  if (!nu || !nu.thuis || !nu.uit) return null;              // geen wedstrijd ingevuld
  if (!vorig) return null;                                   // geen vergelijking mogelijk
  // Andere namen: een nieuwe wedstrijd, of een naam die net is ingetypt. Niets melden.
  if (vorig.thuis !== nu.thuis || vorig.uit !== nu.uit) return null;
  const dt = nu.t - vorig.t, du = nu.u - vorig.u;
  if (!dt && !du) return null;
  // Teruggezet naar 0-0 vanaf een stand met meer dan één doelpunt: dat is opnieuw
  // beginnen, geen geannuleerd doelpunt.
  if (nu.t === 0 && nu.u === 0 && vorig.t + vorig.u > 1) return null;

  const stand = standTekst(nu);
  const onsZijde = ONS.test(nu.thuis) ? 't' : ONS.test(nu.uit) ? 'u' : null;
  const naam = z => (z === 't' ? nu.thuis : nu.uit);
  const ander = z => (z === 't' ? 'u' : 't');

  let zijde = null, soort = null;
  if (dt === 1 && du === 0) { zijde = 't'; soort = 'doelpunt'; }
  else if (dt === 0 && du === 1) { zijde = 'u'; soort = 'doelpunt'; }
  else if (dt === -1 && du === 0) { zijde = 't'; soort = 'geannuleerd'; }
  else if (dt === 0 && du === -1) { zijde = 'u'; soort = 'geannuleerd'; }

  if (!soort) return { titel: 'Stand bijgewerkt', tekst: `Stand: ${stand}`, soort: 'anders' };

  if (soort === 'doelpunt') {
    if (onsZijde === zijde)
      return { titel: `🏑 Doelpunt voor ${naam(zijde)}!`, tekst: `Er is gescoord door ons team. Stand: ${stand}`, soort: 'voor' };
    if (onsZijde)
      return { titel: 'Tegendoelpunt', tekst: `We hebben helaas een tegendoelpunt moeten incasseren. Stand: ${stand}`, soort: 'tegen' };
    return { titel: `🏑 Doelpunt voor ${naam(zijde)}`, tekst: `Stand: ${stand}`, soort: 'neutraal' };
  }
  // geannuleerd
  if (onsZijde === zijde)
    return { titel: 'Doelpunt geannuleerd', tekst: `Het doelpunt van ${naam(zijde)} telt niet. De stand is weer ${stand}`, soort: 'voor-geannuleerd' };
  if (onsZijde && onsZijde === ander(zijde))
    return { titel: 'Tegendoelpunt geannuleerd', tekst: `Het doelpunt van ${naam(zijde)} telt niet. De stand is weer ${stand}`, soort: 'tegen-geannuleerd' };
  return { titel: 'Doelpunt geannuleerd', tekst: `De stand is weer ${stand}`, soort: 'neutraal-geannuleerd' };
}

module.exports = { leesStand, leesModus, leesAankondiging, aankondigBericht, gelijk, bericht, standTekst };
