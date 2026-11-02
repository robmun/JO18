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
//   5. Versturen naar iedereen in teams/<team>/meldingen, en wie niet meer bereikbaar
//      is daaruit opruimen.
//
// Plaatsen: zie meldingen/LEESMIJ.md.

const functions = require('firebase-functions/v1');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');
const { leesStand, gelijk, bericht } = require('./stand');

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

    const nu = leesStand((await db.collection('teams').doc(team).get()).data());
    if (!gelijk(nu, na)) return null;   // er kwam nog een wijziging; die ronde neemt het over

    // Alleen één ronde mag versturen: wie de laatst verstuurde stand bijwerkt.
    const vorig = await db.runTransaction(async t => {
      const s = await t.get(stRef);
      const laatst = s.exists ? s.data().stand : null;
      if (gelijk(laatst, nu)) return undefined;
      t.set(stRef, { stand: nu, sinds: Date.now() });
      return laatst;
    });
    if (vorig === undefined) return null;

    const m = bericht(vorig, nu);
    if (!m) return null;

    const lijst = await db.collection('teams').doc(team).collection('meldingen').get();
    const docs = lijst.docs.filter(d => typeof d.get('token') === 'string');
    if (!docs.length) return null;

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
      await Promise.all(res.responses.map((r, j) => {
        if (r.success || !r.error || !WEG.has(r.error.code)) return null;
        opgeruimd++;
        return deel[j].ref.delete().catch(() => null);
      }));
    }
    functions.logger.info('stand gemeld', { team: team.slice(0, 3) + '…', soort: m.soort, verstuurd, opgeruimd });
    return null;
  });
