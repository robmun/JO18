// Strafcorner: wie kan welke rol, en de regel dat er altijd een complete ploeg staat.
//
//   1. op Spelers per rol iemand erbij zetten en weghalen, hoogstens vijf per rol;
//   2. de regel op Regels kan pas als elke rol iemand heeft, en daarna mag de laatste
//      van een rol niet meer weg;
//   3. in elk blok van het schema staan een aangever, een stopper en een inslaander —
//      drie verschillende spelers, ook als iemand twee rollen kan; voor 2, 3 en 4
//      blokken per kwart en een reeks willekeurige selecties;
//   4. afwezig of geblesseerd telt niet mee; is er maar één stopper, dan staat die
//      steeds in het veld, met een melding erbij;
//   5. kan het niet (de enige aangever is ook de enige inslaander), dan zegt de app het;
//   6. een kaart voor de stopper in het veld: een balk met wie er op de bank klaarzit;
//   7. zonder de regel verandert de vingerafdruk van het schema niet (bestaande
//      schema's blijven actueel), en een onzinwaarde in p.pc wordt opgeruimd.
const { startBrowser, nieuweContext } = require('../lib/browser');

const naam = 'strafcorner: rollen op Spelers en de regel in de planner';
const traag = false;

async function draai({ basis, log }) {
  const mis = [];
  const b = await startBrowser();
  const paginafouten = [];
  try {
    const ctx = await nieuweContext(b);
    const p = await ctx.newPage();
    p.on('pageerror', e => { if (!/ServiceWorker/.test(String(e))) paginafouten.push(String(e).slice(0, 160)); });
    await p.goto(basis + 'index.html', { waitUntil: 'load' });
    await p.waitForTimeout(1400);

    // Een selectie van zestien, iedereen aanwezig, geen regels.
    const namen = await p.evaluate(() => {
      state.players.forEach(x => { x.present = true; delete x.pc; });
      state.rules = [];
      state.schedule = null;
      save();
      activeTab = 'spelers'; render();
      return state.players.filter(x => !x.guest && x.prefs[0] !== 'keeper').map(x => ({ id: x.id, name: x.name }));
    });
    const hashZonder = await p.evaluate(() => inputHash(state));

    // ── 1. Rollen via de keuzelijsten ──
    const kies = (rol, id) => p.evaluate(([rol, id]) => {
      const sel = document.querySelector(`[data-pcerbij="${rol}"]`);
      if (!sel) return false;
      sel.value = id; sel.dispatchEvent(new Event('change'));
      return true;
    }, [rol, id]);
    const [A, B, C, D, E] = namen.map(n => n.id);
    await kies('aangever', A); await kies('aangever', B);
    await kies('stopper', C);
    await kies('inslaan', A); await kies('inslaan', D);
    const rollen = await p.evaluate(() => Object.fromEntries(state.players.filter(x => x.pc).map(x => [x.id, x.pc])));
    const verwacht = { [A]: ['aangever', 'inslaan'], [B]: ['aangever'], [C]: ['stopper'], [D]: ['inslaan'] };
    if (JSON.stringify(Object.keys(rollen).sort().map(k => [k, rollen[k].slice().sort()])) !==
        JSON.stringify(Object.keys(verwacht).sort().map(k => [k, verwacht[k].slice().sort()])))
      mis.push('rollen na het kiezen: ' + JSON.stringify(rollen));
    else log('rollen gekozen via de keuzelijsten op Spelers, iemand mag twee rollen hebben');
    if ((await p.evaluate(() => inputHash(state))) !== hashZonder)
      mis.push('zonder de regel verandert het aanwijzen van rollen de vingerafdruk van het schema');

    // hoogstens vijf
    for (const n of namen.slice(5, 10)) await kies('stopper', n.id);
    const max = await p.evaluate(() => ({
      n: state.players.filter(x => (x.pc || []).includes('stopper')).length,
      lijst: !!document.querySelector('[data-pcerbij="stopper"]')
    }));
    if (max.n !== 5 || max.lijst) mis.push(`stoppers na zes keer kiezen: ${max.n}, keuzelijst nog zichtbaar: ${max.lijst}`);
    // weer terug naar één stopper (C), via de kruisjes
    for (const n of namen.slice(5, 9)) await p.click(`[data-pcweg="stopper|${n.id}"]`);
    const stoppers = await p.evaluate(() => state.players.filter(x => (x.pc || []).includes('stopper')).map(x => x.id));
    if (stoppers.length !== 1 || stoppers[0] !== C) mis.push('weghalen met het kruisje werkt niet: ' + stoppers.join(','));
    else log('hoogstens vijf per rol; weghalen met het kruisje');

    // ── 2. De regel ──
    const regelToevoegen = () => p.evaluate(() => {
      activeTab = 'regels'; newRule = { type: 'strafcorner' }; render();
      document.getElementById('addRule').click();
      return state.rules.filter(r => r.type === 'strafcorner').length;
    });
    // eerst zonder stopper: moet geweigerd worden
    await p.evaluate(c => { delete byId(c).pc; }, C);
    if ((await regelToevoegen()) !== 0) mis.push('de regel kon erbij zonder stopper');
    await p.evaluate(c => { byId(c).pc = ['stopper']; save(); }, C);
    if ((await regelToevoegen()) !== 1) mis.push('de regel kon er niet bij terwijl elke rol iemand heeft');
    const zin = await p.evaluate(() => document.querySelector('.rule span') ? [...document.querySelectorAll('.rule span')].map(x => x.textContent).join(' | ') : '');
    if (!/Strafcorner altijd uitvoerbaar/.test(zin)) mis.push('de regel staat niet in de lijst: ' + zin);
    if ((await regelToevoegen()) !== 1) mis.push('de regel kon er twee keer in');
    // laatste stopper weghalen mag nu niet
    await p.evaluate(() => { activeTab = 'spelers'; render(); });
    await p.click(`[data-pcweg="stopper|${C}"]`);
    if (!(await p.evaluate(c => (byId(c).pc || []).includes('stopper'), C)))
      mis.push('de laatste stopper kon weg terwijl de regel aan staat');
    else log('regel pas mogelijk met iemand per rol; de laatste van een rol blijft staan');
    if ((await p.evaluate(() => inputHash(state))) === hashZonder) mis.push('met de regel aan telt de vingerafdruk de rollen niet mee');

    // ── 3. Elk blok een complete ploeg ──
    // Twee spelers per rol, deels overlappend; dan voor 2, 3 en 4 blokken per kwart.
    await p.evaluate(([A, B, C, D, E]) => {
      byId(A).pc = ['aangever', 'inslaan']; byId(B).pc = ['aangever'];
      byId(C).pc = ['stopper']; byId(E).pc = ['stopper', 'inslaan'];
      byId(D).pc = ['inslaan']; save();
    }, [A, B, C, D, E]);
    const controle = () => p.evaluate(() => {
      const uit = [];
      for (const perQ of [2, 3, 4]) {
        const sch = buildSchedule(state, { forcePerQ: perQ });
        const gr = pcGroepen(state.players);
        for (let b = 0; b < perQ * 4; b++) {
          const veld = new Set(Object.values(sch.assignments[b] || {}));
          if (pcTekort(gr, veld)) uit.push(`perQ ${perQ} blok ${b}: ${pcOntbreekt(gr, veld).join('+')}`);
        }
      }
      return uit;
    });
    let gaten = await controle();
    if (gaten.length) mis.push('blokken zonder complete ploeg: ' + gaten.slice(0, 4).join('; '));
    else log('2, 3 en 4 blokken per kwart: in elk blok een aangever, stopper en inslaander, drie verschillende spelers');

    // Willekeurige selecties: wisselende afwezigen, steeds minstens twee per rol inzetbaar.
    const willekeur = await p.evaluate(() => {
      let zaad = 7; const r = () => (zaad = (zaad * 16807) % 2147483647) / 2147483647;
      const veld = state.players.filter(x => !x.guest && x.prefs[0] !== 'keeper');
      const fouten = []; let rondes = 0;
      for (let i = 0; i < 40; i++) {
        state.players.forEach(x => { x.present = true; delete x.pc; });
        const rol = () => veld[Math.floor(r() * veld.length)];
        for (const naam of PC_ROLLEN) for (let k = 0; k < 2 + Math.floor(r() * 2); k++) {
          const x = rol(); x.pc = [...new Set((x.pc || []).concat(naam))];
        }
        // één tot drie afwezigen die geen rol hebben
        const zonder = veld.filter(x => !x.pc);
        for (let k = 0; k < 1 + Math.floor(r() * 3) && zonder.length; k++) zonder.splice(Math.floor(r() * zonder.length), 1)[0].present = false;
        const gr = pcGroepen(state.players.filter(x => x.present));
        if (pcTekort(gr, state.players.filter(x => x.present).map(x => x.id))) continue;   // kan sowieso niet
        rondes++;
        const perQ = 2 + (i % 3);
        const sch = buildSchedule(state, { forcePerQ: perQ });
        for (let b = 0; b < perQ * 4; b++) {
          const v = new Set(Object.values(sch.assignments[b] || {}));
          if (pcTekort(gr, v)) { fouten.push(`ronde ${i} perQ ${perQ} blok ${b}`); break; }
        }
        const stuk = schemaKlopt(sch); if (stuk) fouten.push(`ronde ${i}: ${stuk}`);
      }
      return { fouten, rondes };
    });
    if (willekeur.fouten.length) mis.push('willekeurige selecties: ' + willekeur.fouten.slice(0, 4).join('; '));
    else log(`${willekeur.rondes} willekeurige selecties: steeds een complete ploeg en een geldig schema`);

    // ── 4. Afwezig en geblesseerd tellen niet; één stopper staat steeds in het veld ──
    const een = await p.evaluate(([A, B, C, D, E]) => {
      state.players.forEach(x => { x.present = true; delete x.pc; delete x.uit; });
      byId(A).pc = ['aangever']; byId(B).pc = ['aangever'];
      byId(C).pc = ['stopper']; byId(E).pc = ['stopper'];
      byId(D).pc = ['inslaan']; byId(namen5()).pc = ['inslaan'];
      function namen5() { return state.players.filter(x => !x.guest && x.prefs[0] !== 'keeper' && ![A, B, C, D, E].includes(x.id))[0].id; }
      byId(E).present = false;          // tweede stopper afwezig
      save(); regenerate();
      const sch = state.schedule, B_ = sch.perQ * 4;
      let inVeld = 0; for (let b = 0; b < B_; b++) if (Object.values(sch.assignments[b]).includes(C)) inVeld++;
      activeTab = 'wedstrijd'; render();
      const meld = [...document.querySelectorAll('.warnbox .wt')].map(x => x.textContent).join(' | ');
      return { inVeld, B: B_, meld };
    }, [A, B, C, D, E]);
    if (een.inVeld !== een.B) mis.push(`de enige stopper staat ${een.inVeld} van de ${een.B} blokken in het veld`);
    else if (!/enige stopper/.test(een.meld)) mis.push('geen melding dat er maar één stopper is: ' + een.meld.slice(0, 160));
    else log('tweede stopper afwezig: de enige stopper staat elk blok in het veld, met een melding');

    // ── 5. Kan het niet: dan zegt de app het ──
    const kanNiet = await p.evaluate(([A, B, C, D, E]) => {
      state.players.forEach(x => { x.present = true; delete x.pc; });
      byId(A).pc = ['aangever', 'inslaan']; byId(C).pc = ['stopper'];
      save(); standGewijzigd();
      const tekst = pcProblemen(state.schedule).fout.join(' | ');
      return tekst;
    }, [A, B, C, D, E]);
    if (!/twee rollen tegelijk/.test(kanNiet) || !/(aangever|inslaander)/.test(kanNiet))
      mis.push('geen melding als één speler twee rollen zou moeten doen: ' + kanNiet);
    else log('de enige aangever is ook de enige inslaander: de app zegt dat er nog iemand bij moet');

    // ── 6. Kaart voor de stopper in het veld ──
    const kaart = await p.evaluate(([A, B, C, D, E]) => {
      state.players.forEach(x => { x.present = true; delete x.pc; delete x.uit; delete x.kaart; });
      byId(A).pc = ['aangever']; byId(B).pc = ['aangever'];
      byId(C).pc = ['stopper']; byId(E).pc = ['stopper'];
      byId(D).pc = ['inslaan']; byId(B).pc = ['aangever', 'inslaan'];
      save(); regenerate();
      // Een blok waarin precies één stopper in het veld staat: die krijgt een groene
      // kaart. De andere stopper zit dan op de bank, en de balk hoort hem te noemen.
      const sch = state.schedule;
      let b = -1, st = null, bank = null;
      for (let i = 0; i < sch.perQ * 4 && b < 0; i++) {
        const veld = Object.values(sch.assignments[i]);
        const in_ = [C, E].filter(x => veld.includes(x));
        if (in_.length === 1) { b = i; st = in_[0]; bank = [C, E].find(x => x !== st); }
      }
      if (b < 0) return { overslaan: 'geen blok met precies één stopper' };
      byId(st).kaart = { soort: 'groen', terug: 120 };
      const balk = (pcLiveHTML(sch.assignments[b]) || '').replace(/<[^>]+>/g, '');
      // En in beeld: Q1 met de kaart, zonder kaart geen balk.
      delete byId(st).kaart;
      const naKaart = !!pcLiveHTML(sch.assignments[b]);
      return { balk, bank: pKort(bank), naKaart };
    }, [A, B, C, D, E]);
    if (kaart.overslaan) mis.push('kaart: ' + kaart.overslaan);
    else if (!/geen stopper/.test(kaart.balk) || !kaart.balk.includes(kaart.bank)) mis.push(`kaart voor de stopper: balk '${kaart.balk}' noemt ${kaart.bank} niet`);
    else if (kaart.naKaart) mis.push('de strafcorner-balk blijft staan als de kaart voorbij is');
    else log(`kaart voor de stopper in het veld: balk "${kaart.balk.trim()}"`);

    // ── 7. Opruimen bij binnenkomst ──
    const schoon = await p.evaluate(() => {
      const s = JSON.parse(JSON.stringify(serializeState()));
      s.players[0].pc = ['aangever', 'onzin', 'aangever']; s.players[1].pc = 'stopper'; s.players[2].pc = [];
      valideerStand(s);
      return [s.players[0].pc, s.players[1].pc, s.players[2].pc];
    });
    if (JSON.stringify(schoon) !== JSON.stringify([['aangever'], null, null].map(x => x === null ? undefined : x)))
      mis.push('onzin in p.pc niet opgeruimd: ' + JSON.stringify(schoon));
    else log('onzin in de rollen wordt bij binnenkomst opgeruimd');

    // De zelftest van de app zelf mag niets vinden.
    const zt = await p.evaluate(() => { try { return zelftest(); } catch (e) { return ['zelftest: ' + e.message]; } });
    const ztf = Array.isArray(zt) ? zt : (zt && zt.fouten) || [];
    if (ztf.length) mis.push('zelftest: ' + ztf.slice(0, 3).join('; '));
    else log('zelftest van de app: in orde, met de nieuwe toets voor de strafcorner');
    await ctx.close();
  } finally { await b.close(); }
  paginafouten.forEach(m => mis.push('paginafout: ' + m));
  return { ok: mis.length === 0, mis };
}

module.exports = { naam, traag, draai };
