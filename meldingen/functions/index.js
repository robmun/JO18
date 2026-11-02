// Meldingen bij een doelpunt, voor kijkers die ze hebben aangezet.
//
// Draait bij Firebase (Cloud Functions), niet in de app: een melding moet ook
// aankomen als de app op de telefoon van een ouder dicht is.
//
// Verloop bij elke wijziging van een teamdocument:
//   1. Is de stand veranderd? Zo niet (klok, opstelling, wie er meekijkt): klaar.
//   2. Tien seconden wachten. Tikt de coach per ongeluk +1 en meteen weer −1, dan
//      gaat er niets de deur uit.
//   3. De stand opnieuw lezen. Is hij intussen alwéér veranderd, dan laat deze ronde
//      het over aan de ronde van die latere wijziging.
//   4. Vergelijken met de laatst verstuurde stand (meldstand/<team>), niet met de
//      vorige: zo telt alleen de echte verandering over die tien seconden.
//   5. Naar wie? De coach kiest het in de app (de stand 'meldingen'):
//        uit  — niets versturen (de laatst verstuurde stand wordt wél bijgewerkt,
//               zodat er na het weer aanzetten geen oude doelpunten worden gemeld);
//        test — alleen toestellen met test: true, en '[TEST]' voor de tekst;
//        aan  — iedereen in teams/<team>/meldingen.
//      Wie niet meer bereikbaar is, wordt daaruit opgeruimd.
//
// Daarnaast de aankondigingen van de coach: 'aftrap' en 'einde' (knoppen bij de
// score). Die staan in de stand als 'aankondiging' met een volgnummer; een nieuw
// volgnummer wordt meteen verstuurd, zonder te wachten. Zelfde schakelaar.
//
// Plaatsen: zie meldingen/LEESMIJ.md.

const functions = require('firebase-functions/v1');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');
const { leesStand, leesModus, leesAankondiging, aankondigBericht, gelijk, bericht } = require('./stand');

initializeApp();
const db = getFirestore();

const WACHT_MS = 10000;
const APP = 'https://robmun.github.io/JO18/';
const slaap = ms => new Promise(r => setTimeout(r, ms));

// Codes waarmee FCM zegt dat een aanmelding niet meer bestaat: app verwijderd,
// meldingen uitgezet, of het toestel is gewist.
const WEG = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

// Verstuurt een bericht volgens de schakelaar. Geeft de reden terug als er niets ging.
async function verstuur(team, m, modus, log) {
  if (modus === 'uit') { log('schakelaar staat op uit', { soort: m.soort }); return; }
  // TEST vóór de tekst en niet vóór de titel: de titel past op iOS maar op één regel.
  if (modus === 'test') m = Object.assign({}, m, { tekst: `[TEST] ${m.tekst}` });
  const lijst = await db.collection('teams').doc(team).collection('meldingen').get();
  const docs = lijst.docs.filter(d => typeof d.get('token') === 'string' && (modus === 'aan' || d.get('test') === true));
  if (!docs.length) {
    log('niemand om naar te sturen', { modus, aangemeld: lijst.size, test: lijst.docs.filter(d => d.get('test') === true).length });
    return;
  }
  const link = `${APP}t/${encodeURIComponent(team)}/`;
  let verstuurd = 0, opgeruimd = 0;
  for (let i = 0; i < docs.length; i += 500) {
    const deel = docs.slice(i, i + 500);
    const res = await getMessaging().sendEachForMulticast({
      tokens: deel.map(d => d.get('token')),
      notification: { title: m.titel, body: m.tekst },
      webpush: {
        notification: { tag: `stand-${team}`, renotify: true },
        fcmOptions: { link },
      },
    });
    verstuurd += res.successCount;
    res.responses.forEach(r => {
      if (!r.success) functions.logger.warn('versturen mislukt', { code: r.error && r.error.code, tekst: r.error && r.error.message });
    });
    await Promise.all(res.responses.map((r, j) => {
      if (r.success || !r.error || !WEG.has(r.error.code)) return null;
      opgeruimd++;
      return deel[j].ref.delete().catch(() => null);
    }));
  }
  functions.logger.info('stand gemeld', { team: team.slice(0, 3) + '…', modus, soort: m.soort, verstuurd, opgeruimd });
}

exports.standMelding = functions
  .region('europe-west1')
  .runWith({ timeoutSeconds: 60, memory: '256MB', maxInstances: 10 })
  .firestore.document('teams/{team}')
  .onUpdate(async (change, ctx) => {
    const team = ctx.params.team;
    // Bij elke ronde die niets verstuurt een regel in het logboek met de reden.
    const log = (reden, extra) => functions.logger.info('geen melding', Object.assign({ team: team.slice(0, 3) + '…', reden }, extra || {}));
    const voorData = change.before.data(), naData = change.after.data();

    // ── Aankondiging van de coach: aftrap of einde ──
    const aV = leesAankondiging(voorData), aN = leesAankondiging(naData);
    if (aN && (!aV || aV.nr !== aN.nr)) {
      const m = aankondigBericht(aN.soort, leesStand(naData));
      if (m) await verstuur(team, m, leesModus(naData), log);
      else log('aankondiging zonder ingevulde teams', { soort: aN.soort });
    }

    // ── De stand ──
    const voor = leesStand(voorData);
    const na = leesStand(naData);
    if (!na || gelijk(voor, na)) return null;

    const stRef = db.collection('meldstand').doc(team);

    // De eerste keer dat er voor dit team iets verandert, is er nog geen 'laatst
    // verstuurd'. Dan geldt de stand van vóór deze wijziging als uitgangspunt.
    await db.runTransaction(async t => {
      const s = await t.get(stRef);
      if (!s.exists && voor) t.set(stRef, { stand: voor, sinds: Date.now() });
    });

    await slaap(WACHT_MS);

    const teamNu = (await db.collection('teams').doc(team).get()).data();
    const nu = leesStand(teamNu);
    if (!gelijk(nu, na)) { log('alweer gewijzigd; de volgende ronde neemt het over'); return null; }

    // Alleen één ronde mag versturen: wie de laatst verstuurde stand bijwerkt.
    const vorig = await db.runTransaction(async t => {
      const s = await t.get(stRef);
      const laatst = s.exists ? s.data().stand : null;
      if (gelijk(laatst, nu)) return undefined;
      t.set(stRef, { stand: nu, sinds: Date.now() });
      return laatst;
    });
    if (vorig === undefined) { log('deze stand is al gemeld'); return null; }

    const m = bericht(vorig, nu);
    if (!m) { log('geen bericht bij deze verandering', { vorig, nu }); return null; }
    await verstuur(team, m, leesModus(teamNu), log);
    return null;
  });
