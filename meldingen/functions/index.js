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
//        test — alleen toestellen met test: true, en 'TEST ·' voor de titel;
//        aan  — iedereen in teams/<team>/meldingen.
//      Wie niet meer bereikbaar is, wordt daaruit opgeruimd.
//
// Plaatsen: zie meldingen/LEESMIJ.md.

const functions = require('firebase-functions/v1');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');
const { leesStand, leesModus, gelijk, bericht } = require('./stand');

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

exports.standMelding = functions
  .region('europe-west1')
  .runWith({ timeoutSeconds: 60, memory: '256MB', maxInstances: 10 })
  .firestore.document('teams/{team}')
  .onUpdate(async (change, ctx) => {
    const team = ctx.params.team;
    const voor = leesStand(change.before.data());
    const na = leesStand(change.after.data());
    if (!na || gelijk(voor, na)) return null;

    const stRef = db.collection('meldstand').doc(team);

    // De eerste keer dat er voor dit team iets verandert, is er nog geen 'laatst
    // verstuurd'. Dan geldt de stand van vóór deze wijziging als uitgangspunt.
    await db.runTransaction(async t => {
      const s = await t.get(stRef);
      if (!s.exists && voor) t.set(stRef, { stand: voor, sinds: Date.now() });
    });

    await slaap(WACHT_MS);

    // Bij elke ronde die niets verstuurt een regel in het logboek met de reden. Zonder
    // die regels zag je bij de eerste test alleen 'started' en 'ok', en was niet te
    // zien wáár hij afhaakte.
    const log = (reden, extra) => functions.logger.info('geen melding', Object.assign({ team: team.slice(0, 3) + '…', reden }, extra || {}));
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
    const modus = leesModus(teamNu);
    if (modus === 'uit') { log('schakelaar staat op uit', { nu }); return null; }
    if (modus === 'test') m.titel = `TEST · ${m.titel}`;

    const lijst = await db.collection('teams').doc(team).collection('meldingen').get();
    const docs = lijst.docs.filter(d => typeof d.get('token') === 'string' && (modus === 'aan' || d.get('test') === true));
    if (!docs.length) {
      log('niemand om naar te sturen', { modus, aangemeld: lijst.size, test: lijst.docs.filter(d => d.get('test') === true).length });
      return null;
    }

    const link = `${APP}t/${encodeURIComponent(team)}/`;
    let verstuurd = 0, opgeruimd = 0;
    for (let i = 0; i < docs.length; i += 500) {
      const deel = docs.slice(i, i + 500);
      const res = await getMessaging().sendEachForMulticast({
        tokens: deel.map(d => d.get('token')),
        notification: { title: m.titel, body: m.tekst },
        webpush: {
          notification: {
            icon: `${APP}icon-ghc-navy.png`,
            tag: `stand-${team}`,
            renotify: true,
          },
          fcmOptions: { link },
        },
      });
      verstuurd += res.successCount;
      res.responses.forEach((r, j) => {
        if (!r.success) functions.logger.warn('versturen mislukt', { code: r.error && r.error.code, tekst: r.error && r.error.message });
      });
      await Promise.all(res.responses.map((r, j) => {
        if (r.success || !r.error || !WEG.has(r.error.code)) return null;
        opgeruimd++;
        return deel[j].ref.delete().catch(() => null);
      }));
    }
    functions.logger.info('stand gemeld', { team: team.slice(0, 3) + '…', modus, soort: m.soort, verstuurd, opgeruimd });
    return null;
  });
