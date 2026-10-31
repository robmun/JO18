// Komt er op een kijkscherm nog echt iets binnen?
//
// Op 31 oktober hing de iPad langs de lijn aan de hotspot van een iPhone. Op een gegeven
// moment werd het beeld niet meer bijgewerkt, terwijl de app niets meldde: Firestore had
// niet door dat de verbinding half open hing. Sindsdien vraagt de app elke dertig
// seconden zelf de stand op bij de server, en staat er voor kijkers een regel boven het
// veld: 'live · bijgewerkt 14:32', of in oranje 'geen verbinding sinds 14:30'.
//
// Deze test zet een nep-server in de plaats van Firestore en speelt drie gevallen na:
//   1. de server antwoordt, met dezelfde stand: live, en de tijd van nu erbij;
//   2. de server antwoordt met een nieuwere stand: het scherm liep achter, dus opnieuw
//      luisteren;
//   3. de server antwoordt niet: na tien seconden 'geen verbinding', en na de tweede
//      keer wordt de verbinding helemaal opnieuw opgebouwd.
// Plus: bij de coach komt de regel er niet.
const { startBrowser, nieuweContext } = require('../lib/browser');

const naam = 'verbinding: eigen controle en de regel voor kijkers';
const traag = false;

const TELEFOON = { viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true };

async function draai({ basis, log }) {
  const mis = [];
  const b = await startBrowser();
  const paginafouten = [];
  try {
    const ctx = await nieuweContext(b, TELEFOON);
    const p = await ctx.newPage();
    p.on('pageerror', e => { if (!/ServiceWorker/.test(String(e))) paginafouten.push(String(e).slice(0, 160)); });
    await p.goto(basis + 'index.html', { waitUntil: 'load' });
    await p.waitForTimeout(1400);
    const klaar = await p.evaluate(() => {
      state.players.forEach(x => x.present = true);
      activeTab = 'wedstrijd'; render();
      const g = [...document.querySelectorAll('button')].find(b => /genereren/i.test(b.textContent));
      if (g) g.click();
      // Nep-server. 'antwoord' bepaalt wat get() doet: een stand, of nooit antwoorden.
      window._nep = { antwoord: { rev: 5 }, opnieuw: 0, netUit: 0, netAan: 0 };
      CLOUD.on = true; CLOUD.role = 'viewer'; CLOUD.rev = 5;
      CLOUD.ref = {
        get: () => _nep.antwoord === 'stil' ? new Promise(() => {})
          : Promise.resolve({ exists: true, data: () => ({ rev: _nep.antwoord.rev }) }),
        firestore: { disableNetwork: async () => { _nep.netUit++; }, enableNetwork: async () => { _nep.netAan++; } }
      };
      cloudListen = () => { _nep.opnieuw++; };
      render();
      return !!state.schedule;
    });
    if (!klaar) { mis.push('er kwam geen wisselschema tot stand'); return { ok: false, mis }; }
    const regel = () => p.evaluate(() => {
      const e = document.getElementById('kijkStatus');
      return e ? { tekst: e.textContent, soort: e.className.replace('kijkstatus', '').trim() } : null;
    });
    const nu = await p.evaluate(() => hhmm(Date.now()));

    // ── 1. De server antwoordt, zelfde stand ──
    await p.evaluate(() => verbindingControleren());
    const een = await regel();
    const opnieuw1 = await p.evaluate(() => _nep.opnieuw);
    if (!een || een.soort !== 'live' || een.tekst !== `live · bijgewerkt ${nu}`)
      mis.push(`na een antwoord van de server staat er '${een ? een.tekst : 'niets'}' in plaats van 'live · bijgewerkt ${nu}'`);
    if (opnieuw1) mis.push('bij dezelfde stand werd er toch opnieuw geluisterd');
    if (een && een.soort === 'live' && !opnieuw1) log(`server antwoordt: '${een.tekst}'`);

    // ── 2. De server heeft een nieuwere stand ──
    await p.evaluate(() => { _nep.antwoord = { rev: 9 }; return verbindingControleren(); });
    const twee = await p.evaluate(() => ({ opnieuw: _nep.opnieuw, fout: _fouten.some(f => /scherm liep achter \(stand 5, server 9\)/.test(f.wat)) }));
    if (twee.opnieuw !== 1) mis.push(`bij een nieuwere stand op de server werd er ${twee.opnieuw} keer opnieuw geluisterd in plaats van 1 keer`);
    if (!twee.fout) mis.push('dat het scherm achterliep staat niet in de foutenlijst');
    if (twee.opnieuw === 1 && twee.fout) log('nieuwere stand op de server: opnieuw geluisterd, en genoteerd');

    // ── 3. De server antwoordt niet ──
    await p.evaluate(() => { _nep.antwoord = 'stil'; CLOUD.rev = 9; _nep.opnieuw = 0; });
    await p.evaluate(() => verbindingControleren());           // wacht tien seconden op niets
    await p.waitForTimeout(5300);                               // plus de speling van vijf seconden
    const drie = await regel();
    if (!drie || drie.soort !== 'weg' || !/^geen verbinding sinds \d\d:\d\d — beeld kan achterlopen$/.test(drie.tekst))
      mis.push(`zonder antwoord staat er '${drie ? drie.tekst : 'niets'}' (${drie ? drie.soort : '-'})`);
    else log(`server zwijgt: '${drie.tekst}'`);
    await p.evaluate(() => verbindingControleren());
    const vier = await p.evaluate(() => ({ uit: _nep.netUit, aan: _nep.netAan, opnieuw: _nep.opnieuw }));
    if (vier.uit !== 1 || vier.aan !== 1 || vier.opnieuw !== 1)
      mis.push(`na twee keer geen antwoord werd de verbinding niet opnieuw opgebouwd (${JSON.stringify(vier)})`);
    else log('twee keer geen antwoord: verbinding opnieuw opgebouwd');

    // En weer terug: één antwoord zet het op live.
    await p.evaluate(() => { _nep.antwoord = { rev: 9 }; return verbindingControleren(); });
    await p.waitForTimeout(3300);
    const terug = await regel();
    if (!terug || terug.soort !== 'live') mis.push(`na herstel staat er '${terug ? terug.tekst : 'niets'}'`);

    // ── Bij de coach geen regel ──
    const coach = await p.evaluate(() => { CLOUD.role = 'editor'; render(); return !!document.getElementById('kijkStatus'); });
    if (coach) mis.push('bij de coach staat de verbindingsregel ook boven het veld');
    await p.evaluate(() => { CLOUD.on = false; CLOUD.ref = null; });

    await ctx.close();
    paginafouten.forEach(f => mis.push('paginafout: ' + f));
  } finally { await b.close(); }
  return { ok: mis.length === 0, mis };
}

module.exports = { naam, traag, draai };
