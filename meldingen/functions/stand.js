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

// De titel staat op iOS op één regel en wordt daarna afgekapt ('Doelpunt voor Gooisc…'),
// dus titels zijn kort en de details staan in de tekst eronder, die wel doorloopt.
// Een regelovergang (\n) in de tekst toont iOS als een nieuwe regel.
//
// Bericht bij een aankondiging. Tegenstander = de ploeg die niet Gooische is.
function aankondigBericht(soort, nu) {
  if (!nu || !nu.thuis || !nu.uit) return null;
  const onsZijde = ONS.test(nu.thuis) ? 't' : ONS.test(nu.uit) ? 'u' : null;
  const tegen = onsZijde === 't' ? nu.uit : onsZijde === 'u' ? nu.thuis : null;
  const wedstrijd = `${nu.thuis} – ${nu.uit}`;
  if (soort === 'start') {
    return {
      titel: '🏑 De wedstrijd is begonnen',
      tekst: wedstrijd,
      soort: 'aftrap',
    };
  }
  if (soort === 'einde') {
    return {
      titel: '🏁 Wedstrijd beëindigd',
      tekst: eindRegels(nu),
      soort: 'einde',
    };
  }
  return null;
}

function gelijk(a, b) {
  return !!a && !!b && a.thuis === b.thuis && a.uit === b.uit && a.t === b.t && a.u === b.u;
}

// Indeling van Robert (3 november 2026): de wedstrijd op de ene regel, de stand op
// de volgende, en bij een doelpunt de speeltijd daaronder. iOS bepaalt kleur,
// uitlijning en lettergrootte; een app geeft alleen titel en tekst mee.
//
// 'Vet': een melding kent geen opmaak, dus de cijfers van de stand zijn de vette
// cijfertekens uit Unicode (𝟬 𝟭 𝟮 …, U+1D7EC e.v.). iPhones tonen ze goed; VoiceOver
// leest ze mogelijk niet als gewone cijfers voor. Afspraak met Robert, 3 nov 2026.
function vet(tekst) {
  return String(tekst).replace(/[0-9]/g, c => String.fromCodePoint(0x1D7EC + Number(c)));
}
function standRegels(s) {
  return `${s.thuis} – ${s.uit}\n${vet(`${s.t} - ${s.u}`)}`;
}
function eindRegels(s) {
  return `${s.thuis} – ${s.uit}\neinduitslag ${vet(`${s.t} - ${s.u}`)}`;
}

// Speeltijd uit de gedeelde klok: { q, basis (s), sinds (ms), loopt }. Verstreken
// tijd in het kwart, zoals op de klok: 'Q1 - 02:24'. Null als er geen klok loopt.
function speeltijd(klok, op) {
  if (!klok || !Number.isFinite(klok.q)) return null;
  let sec = Number(klok.basis) || 0;
  if (klok.loopt && Number.isFinite(klok.sinds)) sec += Math.max(0, ((op || Date.now()) - klok.sinds) / 1000);
  sec = Math.max(0, Math.min(17.5 * 60, Math.floor(sec)));
  if (!sec && !klok.loopt) return null;
  return `Q${klok.q} - ${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
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

  const stand = standRegels(nu);
  const onsZijde = ONS.test(nu.thuis) ? 't' : ONS.test(nu.uit) ? 'u' : null;
  const naam = z => (z === 't' ? nu.thuis : nu.uit);
  const ander = z => (z === 't' ? 'u' : 't');

  let zijde = null, soort = null;
  if (dt === 1 && du === 0) { zijde = 't'; soort = 'doelpunt'; }
  else if (dt === 0 && du === 1) { zijde = 'u'; soort = 'doelpunt'; }
  else if (dt === -1 && du === 0) { zijde = 't'; soort = 'geannuleerd'; }
  else if (dt === 0 && du === -1) { zijde = 'u'; soort = 'geannuleerd'; }

  if (!soort) return { titel: 'Stand bijgewerkt', tekst: stand, soort: 'anders' };

  if (soort === 'doelpunt') {
    if (onsZijde === zijde)
      return { titel: `🏑 ${naam(zijde)} scoort!`, tekst: stand, soort: 'voor' };
    if (onsZijde)
      return { titel: '🏑 Tegendoelpunt!', tekst: stand, soort: 'tegen' };
    return { titel: `🏑 ${naam(zijde)} scoort`, tekst: stand, soort: 'neutraal' };
  }
  // geannuleerd
  if (onsZijde === zijde)
    return { titel: 'Doelpunt afgekeurd', tekst: stand, soort: 'voor-geannuleerd' };
  if (onsZijde && onsZijde === ander(zijde))
    return { titel: 'Tegendoelpunt afgekeurd', tekst: stand, soort: 'tegen-geannuleerd' };
  return { titel: 'Doelpunt afgekeurd', tekst: stand, soort: 'neutraal-geannuleerd' };
}

module.exports = { leesStand, leesModus, leesAankondiging, aankondigBericht, gelijk, bericht, standTekst, standRegels, speeltijd, vet };
