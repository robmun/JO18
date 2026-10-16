// De gebruiksteller schrijft één keer per dag per toestel een paar anonieme tellers
// weg: soort toestel, iOS-versie, schermmaat, app-versie. Geen teamgegevens, niets
// van een wedstrijd. Dat het onbelangrijk is, is juist de reden om er een test op te
// zetten: als het misgaat merkt niemand het, behalve dat er elke dag een regel
// 'Missing or insufficient permissions' in de diagnosekaart bij komt.
//
// Wat hier vastligt is de volgorde van de twee schrijfacties, en waaróm die zo is:
//
//   1. set({laatst}, {merge:true}) — zorgt dat het weekdocument bestaat. Bestaat het
//      niet, dan is dit het aanmaken; bestaat het wel, dan is het een wijziging van
//      één veld. Allebei toegestaan onder de beveiligingsregels.
//   2. update({'soort.iphone': increment, …}) — alleen update() leest een punt in een
//      sleutel als een pad binnen een groepje. Bij set() zou er een veld ontstaan dat
//      letterlijk 'soort.iphone' heet, en dat weigeren de regels.
//
// Eerder stond alleen de update er, met een terugval op 'not-found' om het document
// alsnog aan te maken. Die terugval werd nooit bereikt: update() op een ontbrekend
// document geeft 'permission-denied', omdat de regel die naar het bestaande document
// kijkt stukloopt. Het document ontstond dus nooit en de teller heeft nooit gewerkt.
//
// Er wordt tegen een nagebootste Firestore geschreven; de tests mogen niet naar buiten.
const { startBrowser, nieuweContext } = require('../lib/browser');

const naam = 'de gebruiksteller';
const traag = false;

const TELEFOON = { viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true };

// De zeven onderwerpen die de beveiligingsregels kennen. Komt er een achtste bij,
// dan hoort die regel mee aangepast te worden — en dan hoort deze test te klagen.
const ONDERWERPEN = ['soort', 'ios', 'scherm', 'standalone', 'appversie', 'omgeving', 'fouten'];

async function draai({ basis, log }) {
  const mis = [];
  const b = await startBrowser();
  try {
    const ctx = await nieuweContext(b, TELEFOON);
    const p = await ctx.newPage();
    await p.goto(basis + 'index.html', { waitUntil: 'load' });
    await p.waitForTimeout(1400);

    const uit = await p.evaluate(async () => {
      // Een nagebootste Firestore die alleen onthoudt wat eraan gevraagd wordt.
      const acties = [];
      const doc = {
        set: (d, o) => { acties.push({ wat: 'set', sleutels: Object.keys(d), merge: !!(o && o.merge) }); return Promise.resolve(); },
        update: d => { acties.push({ wat: 'update', sleutels: Object.keys(d) }); return Promise.resolve(); }
      };
      let gevraagdeCollectie = null, gevraagdDoc = null;
      const fs = () => ({ collection: c => { gevraagdeCollectie = c; return { doc: n => { gevraagdDoc = n; return doc; } }; } });
      fs.FieldValue = { increment: n => ({ _ophogen: n }) };
      window.firebase = {
        apps: [{}],
        initializeApp() {},
        auth: () => ({ currentUser: { uid: 'test' }, signInAnonymously: () => Promise.resolve() }),
        firestore: fs
      };
      _fbBelofte = null; _telBezig = false;
      // De echte dagelijkse aanroep, met de echte toestelgegevens van dit venster.
      try { localStorage.removeItem(SLEUTEL('gw_tech')); } catch (e) {}
      techniekTel();
      await new Promise(k => setTimeout(k, 300));
      return { acties, collectie: gevraagdeCollectie, document: gevraagdDoc, week: week() };
    });

    if (uit.collectie !== 'techniek') mis.push(`er wordt naar verzameling '${uit.collectie}' geschreven in plaats van 'techniek'`);
    if (!/^\d{4}-W\d{2}$/.test(String(uit.document)))
      mis.push(`de documentnaam '${uit.document}' heeft niet de vorm jaar-Wweek; de regels weigeren alles wat daar niet aan voldoet`);

    const a = uit.acties;
    if (a.length !== 2) {
      mis.push(`er werden ${a.length} schrijfacties gedaan in plaats van twee: ${JSON.stringify(a)}`);
    } else {
      if (a[0].wat !== 'set') mis.push(`de eerste actie is een ${a[0].wat}; dat hoort de set te zijn die het weekdocument laat bestaan`);
      else {
        if (!a[0].merge) mis.push('de eerste set voegt niet samen; dan wist hij de tellers van eerdere toestellen');
        if (a[0].sleutels.length !== 1 || a[0].sleutels[0] !== 'laatst')
          mis.push(`de eerste set schrijft ${JSON.stringify(a[0].sleutels)} in plaats van alleen 'laatst'`);
      }
      if (a[1].wat !== 'update') mis.push(`de tweede actie is een ${a[1].wat}; de tellers moeten met update omhoog`);
      else {
        // De tellers staan als pad geschreven — 'soort.iphone' — want alleen zo wordt
        // het een teller binnen een groepje in plaats van een veld met een punt erin.
        const tellers = a[1].sleutels.filter(k => k !== 'laatst');
        if (!tellers.length) mis.push('de update hoogt geen enkele teller op');
        const zonderPad = tellers.filter(k => !k.includes('.'));
        if (zonderPad.length) mis.push(`deze tellers staan niet als pad geschreven: ${zonderPad.join(', ')}`);
        const vreemd = tellers.map(k => k.split('.')[0]).filter(g => !ONDERWERPEN.includes(g));
        if (vreemd.length) mis.push(`deze onderwerpen kennen de beveiligingsregels niet: ${[...new Set(vreemd)].join(', ')}`);
        // De regels staan hoogstens acht gewijzigde velden per schrijfactie toe.
        if (a[1].sleutels.length > 8) mis.push(`de update raakt ${a[1].sleutels.length} velden; de regels staan er acht toe`);
        log(`${uit.collectie}/${uit.document}: set{laatst, merge} → update{${tellers.join(', ')}}`);
      }
    }
    await ctx.close();
  } finally { await b.close(); }
  return { ok: mis.length === 0, mis };
}

module.exports = { naam, traag, draai };
