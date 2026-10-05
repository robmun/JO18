// De wedstrijdstand wordt door de coach bijgehouden en is vooral bedoeld voor de
// ouders thuis, die op de kijk-link meekijken. Hij hoort dus bij het team en moet
// meereizen in de gedeelde stand. Zolang er niets is ingevuld blijft hij onzichtbaar,
// zodat een coach die geen stand bijhoudt niets extra's in beeld krijgt.
//
// Deze test controleert dat, plus de telefoonindeling waarbij het veld blijft staan
// en de gepasseerde wisselmomenten erachter wegschuiven.
const { startBrowser, nieuweContext } = require('../lib/browser');

const naam = 'wedstrijdstand en de telefoonindeling';
const traag = false;

const TELEFOON = { viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true };
const TABLET   = { viewport: { width: 1180, height: 820 }, hasTouch: true };

// Een wedstrijd met een schema, zodat het veld echt getekend wordt.
async function wedstrijdKlaar(p, basis) {
  await p.goto(basis + 'index.html', { waitUntil: 'load' });
  await p.waitForTimeout(1400);
  const ok = await p.evaluate(() => {
    state.players.forEach(x => x.present = true);
    activeTab = 'wedstrijd'; render();
    const g = [...document.querySelectorAll('button')].find(b => /genereren/i.test(b.textContent));
    if (g) g.click();
    return !!state.schedule;
  });
  await p.evaluate(() => new Promise(k => {
    window.postMessage({ ghcStand: { q: 2, sec: 412, loopt: true } }, location.origin);
    setTimeout(k, 200);
  }));
  return ok;
}

async function draai({ basis, log }) {
  const mis = [];
  const b = await startBrowser();
  try {
    // ── telefoon ──
    const ctxT = await nieuweContext(b, TELEFOON);
    const pT = await ctxT.newPage();
    const fouten = [];
    pT.on('pageerror', e => { if (!/ServiceWorker/.test(String(e))) fouten.push(String(e).slice(0, 160)); });
    if (!await wedstrijdKlaar(pT, basis)) { mis.push('er kwam geen wisselschema tot stand'); return { ok: false, mis }; }

    // leeg: niets in beeld
    const leeg = await pT.evaluate(() => ({ actief: scoreActief(), opVeld: !!document.querySelector('.veldstand') }));
    if (leeg.actief) mis.push('een lege stand telt als in gebruik');
    if (leeg.opVeld) mis.push('een lege stand staat tóch op het veld');

    // Wél doelpunten, geen teamnamen: de wedstrijd is niet ingevuld, dus er hoort
    // niets in beeld te komen. Een 0-0 zonder tegenstander is geen stand.
    const zonderNamen = await pT.evaluate(() => {
      state.score = { thuis: '', uit: '', t: 3, u: 2 }; render();
      return { actief: scoreActief(), opVeld: !!document.querySelector('.veldstand') };
    });
    if (zonderNamen.actief) mis.push('doelpunten zonder teamnamen tellen als in gebruik');
    if (zonderNamen.opVeld) mis.push('doelpunten zonder teamnamen staan tóch op het veld');

    // Wél namen, maar nog 0-0: ook dan nog niets. Dat vak zou de hele eerste helft
    // op nul staan en alleen plek innemen.
    const nulnul = await pT.evaluate(() => {
      state.score = { thuis: 'Gooische', uit: 'Naarden', t: 0, u: 0 }; render();
      return { actief: scoreActief(), opVeld: !!document.querySelector('.veldstand') };
    });
    if (nulnul.actief || nulnul.opVeld) mis.push('bij 0-0 staat de stand al in beeld');

    // Eerste doelpunt: vanaf nu wél.
    const eerste = await pT.evaluate(() => {
      state.score = { thuis: 'Gooische', uit: 'Naarden', t: 1, u: 0 }; render();
      return { actief: scoreActief(), opVeld: !!document.querySelector('.veldstand') };
    });
    if (!eerste.actief || !eerste.opVeld) mis.push('na het eerste doelpunt blijft de stand verborgen');
    else log('verborgen zonder namen, verborgen bij 0-0, zichtbaar vanaf het eerste doelpunt');

    // ingevuld: wél in beeld, en mee in de gedeelde stand
    const gevuld = await pT.evaluate(() => {
      state.score = { thuis: 'Gooische', uit: 'Naarden', t: 5, u: 1 };
      save(); render();
      const el = document.querySelector('.veldstand');
      return { opVeld: !!el, tekst: el ? el.innerText.replace(/\s+/g, ' ').trim() : '',
               gedeeld: serializeState().score };
    });
    if (!gevuld.opVeld) mis.push('een ingevulde stand staat niet op het veld');
    if (!/Gooische/.test(gevuld.tekst) || !/5/.test(gevuld.tekst) || !/1/.test(gevuld.tekst))
      mis.push(`de stand op het veld leest als "${gevuld.tekst}"`);
    if (!gevuld.gedeeld || gevuld.gedeeld.t !== 5 || gevuld.gedeeld.uit !== 'Naarden')
      mis.push('de stand reist niet mee in de gedeelde stand');
    log('op het veld: ' + gevuld.tekst.replace(/\n/g, ' '));

    // de knoppen op Meer
    const knoppen = await pT.evaluate(() => {
      activeTab = 'uitleg'; render();
      const d = document.querySelector('details[data-klap="score"]'); if (d) d.open = true;
      const plus = document.querySelector('[data-score-plus="t"]');
      const min = document.querySelector('[data-score-min="u"]');
      if (plus) { plus.click(); plus.click(); }
      if (min) min.click();
      return { t: scoreNu().t, u: scoreNu().u, velden: !!document.querySelector('[data-score-naam="t"]') };
    });
    if (knoppen.t !== 7) mis.push(`twee keer plus bracht de thuisstand op ${knoppen.t} in plaats van 7`);
    if (knoppen.u !== 0) mis.push(`een keer min bracht de uitstand op ${knoppen.u} in plaats van 0`);
    if (!knoppen.velden) mis.push('de naamvelden ontbreken op de kaart');

    // grenzen: nooit onder nul, nooit boven het maximum
    const grens = await pT.evaluate(() => {
      zetScore('u', -3); const laag = scoreNu().u;
      zetScore('t', 999); const hoog = scoreNu().t;
      zetScore('thuis', 'x'.repeat(80)); const lang = scoreNu().thuis.length;
      return { laag, hoog, lang };
    });
    if (grens.laag !== 0) mis.push(`een stand van -3 werd ${grens.laag} in plaats van 0`);
    if (grens.hoog !== SCORE_MAX_VERWACHT) mis.push(`een stand van 999 werd ${grens.hoog} in plaats van ${SCORE_MAX_VERWACHT}`);
    if (grens.lang > 20) mis.push(`een naam van 80 tekens bleef ${grens.lang} tekens lang`);
    log(`grenzen: niet onder 0, niet boven ${grens.hoog}, naam hoogstens ${grens.lang} tekens`);

    // De telefoonindeling: de wisseltekst staat direct onder de veldtekening en is in
    // zijn geheel te lezen.
    //
    // Hier is eerder een vastgezet veld (position:sticky) geprobeerd, naar het voorbeeld
    // van de liggende tablet. Dat liep mis: de tekening is op een telefoon 564 tot 646 px
    // hoog en het scrollvenster 524 tot 818 px, dus op een kleine iPhone was het veld
    // hoger dan het venster en schoof álle wisseltekst er voorgoed achter. Daarom toetst
    // deze test nu het omgekeerde: het veld mag níet vastgezet zijn, en elke regel van
    // het eerstvolgende moment moet in beeld te krijgen zijn.
    const indeling = await pT.evaluate(() => {
      state.score = { thuis: 'Gooische', uit: 'Naarden', t: 5, u: 1 };
      activeTab = 'wedstrijd'; render();
      const pv = document.querySelector('.plakveld'), pz = document.querySelector('.plakzone');
      if (!pv || !pz) return { fout: 'geen veldblok of wisselzone' };
      const mo = pz.querySelector('.wmoment[data-min]');
      if (!mo) return { fout: 'geen wisselmoment onder het veld' };
      const v = document.getElementById('view');
      mo.scrollIntoView({ block: 'center' });
      const bak = v.getBoundingClientRect();
      const regels = [...mo.querySelectorAll('.wline')];
      const inBeeld = regels.filter(e => {
        const r = e.getBoundingClientRect();
        return r.top >= bak.top - 1 && r.bottom <= bak.bottom + 1;
      });
      // Staat de wisseltekst wel echt tussen de tekening en de rest van de veldkaart?
      const kinderen = [...pz.children];
      return {
        positie: getComputedStyle(pv).position,
        veldIn: !!pv.querySelector('#field'),
        veldEerst: kinderen[0] === pv,
        tekstOnderVeld: kinderen.indexOf(mo.closest('.card')) > 0,
        regels: regels.length,
        leesbaar: inBeeld.length,
        lettergrootte: regels.length ? getComputedStyle(regels[0]).fontSize : ''
      };
    });
    if (indeling.fout) mis.push(indeling.fout);
    else {
      if (indeling.positie === 'sticky' || indeling.positie === 'fixed')
        mis.push(`het veld staat weer vast (position:${indeling.positie}); op een telefoon verdwijnt de wisseltekst daarachter`);
      if (!indeling.veldIn) mis.push('de veldtekening zit niet in het veldblok');
      if (!indeling.veldEerst) mis.push('de veldtekening staat niet bovenaan de wisselzone');
      if (!indeling.tekstOnderVeld) mis.push('de wisseltekst staat niet direct onder de veldtekening');
      if (!indeling.regels) mis.push('het eerstvolgende moment heeft geen enkele wisselregel');
      else if (indeling.leesbaar !== indeling.regels)
        mis.push(`van de ${indeling.regels} wisselregels zijn er maar ${indeling.leesbaar} in beeld te krijgen`);
      else log(`wisseltekst direct onder het veld, alle ${indeling.regels} regels leesbaar op ${indeling.lettergrootte}`);
    }
    await ctxT.close();

    // ── liggende tablet: de stand hoort in de klokbalk, naast de tijd ──
    const ctxB = await nieuweContext(b, TABLET);
    const pB = await ctxB.newPage();
    pB.on('pageerror', e => { if (!/ServiceWorker/.test(String(e))) fouten.push(String(e).slice(0, 160)); });
    await wedstrijdKlaar(pB, basis);
    const tablet = await pB.evaluate(() => {
      state.score = { thuis: 'Gooische', uit: 'Naarden', t: 5, u: 1 }; render();
      const st = document.querySelector('.klokbalk .kb-stand');
      const tijd = document.getElementById('gkTijd');
      return { inBalk: !!st,
               tekst: st ? st.innerText.replace(/\s+/g, ' ').trim() : '',
               kleurStand: st ? getComputedStyle(st.querySelector('.kbs-cijfers')).color : '',
               kleurTijd: tijd ? getComputedStyle(tijd).color : '',
               opVeld: !!document.querySelector('.veldstand') };
    });
    if (!tablet.inBalk) mis.push('de stand staat niet in de klokbalk van de tablet');
    if (tablet.opVeld) mis.push('op de tablet staat de stand ook nog op het veld; dat hoort alleen op de telefoon');
    if (tablet.kleurStand !== tablet.kleurTijd)
      mis.push(`de stand heeft kleur ${tablet.kleurStand}, de tijd ${tablet.kleurTijd}`);
    else log(`in de klokbalk: ${tablet.tekst} — zelfde kleur als de tijd (${tablet.kleurTijd})`);
    await ctxB.close();

    fouten.forEach(f => mis.push('paginafout: ' + f));
  } finally { await b.close(); }
  return { ok: mis.length === 0, mis };
}

// Staat ook in de app; hier apart zodat de test zegt wat hij verwacht.
const SCORE_MAX_VERWACHT = 99;

module.exports = { naam, traag, draai };
