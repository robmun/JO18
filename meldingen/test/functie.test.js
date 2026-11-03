// Test van de meldingen-functie zonder Firebase: de database en de verzender zijn
// nagebootst. Draaien vanuit meldingen/functions (na npm install):
//     node ../test/functie.test.js
//
// Speelt na wat er langs de lijn gebeurt:
//   1. doelpunt voor ons (uitploeg)  → 'Gooische scoort!' naar alle aangemelden
//   2. +1 en binnen 10 s weer −1     → niets
//   3. tegendoelpunt                 → 'Tegendoelpunt'
//   4. doelpunt geannuleerd          → 'Doelpunt geannuleerd', stand weer terug
//   5. alleen de klok verandert      → niets, en zonder te wachten
//   6. een aanmelding die niet meer bestaat wordt opgeruimd
//   7. nieuwe wedstrijd ingevuld     → niets; daarna doelpunt voor ons als thuisploeg
const path = require('path');
const Module = require('module');
const F = path.join(__dirname, '..', 'functions');

// ── nagebootste Firestore ──
const store = new Map();
const pad = (...d) => d.join('/');
function snap(p) {
  const d = store.get(p);
  return { exists: d !== undefined, data: () => d, get: k => d && d[k], ref: docRef(p) };
}
function docRef(p) {
  return {
    path: p,
    async get() { return snap(p); },
    async set(d) { store.set(p, JSON.parse(JSON.stringify(d))); },
    async delete() { store.delete(p); },
    collection(n) { return colRef(pad(p, n)); },
  };
}
function colRef(p) {
  return {
    doc(id) { return docRef(pad(p, id)); },
    async get() {
      return { docs: [...store.keys()].filter(k => k.startsWith(p + '/') && !k.slice(p.length + 1).includes('/')).map(snap) };
    },
  };
}
const db = {
  collection: colRef,
  async runTransaction(fn) {
    return fn({ get: r => r.get(), set: (r, d) => { store.set(r.path, JSON.parse(JSON.stringify(d))); } });
  },
};
// ── nagebootste verzender ──
const verzonden = [];
const kapot = new Set();
const messaging = {
  async sendEachForMulticast(m) {
    verzonden.push(m);
    return {
      successCount: m.tokens.filter(t => !kapot.has(t)).length,
      responses: m.tokens.map(t => kapot.has(t)
        ? { success: false, error: { code: 'messaging/registration-token-not-registered' } }
        : { success: true }),
    };
  },
};
const nep = {
  'firebase-admin/app': { initializeApp() {} },
  'firebase-admin/firestore': { getFirestore: () => db },
  'firebase-admin/messaging': { getMessaging: () => messaging },
};
const echtLaden = Module._load;
Module._load = function (req, ...rest) { return nep[req] || echtLaden.call(this, req, ...rest); };
const { standMelding } = require(path.join(F, 'index.js'));

const TEAM = 'Abc123xyz789';
let MODUS = 'aan', AANK = null;
const teamData = (score, klok) => ({ state: JSON.stringify({ score, players: [], meldingen: MODUS, aankondiging: AANK }), klok: klok || { q: 1, basis: 412, loopt: false }, rev: 1 });
let huidig = teamData({ thuis: 'Amsterdam', uit: 'Gooische', t: 0, u: 0 });
store.set(`teams/${TEAM}`, huidig);
const T1 = 'token-ouder-1-xxxxxxxxxxxxxxxxxxxx', T2 = 'token-ouder-2-xxxxxxxxxxxxxxxxxxxx';
store.set(`teams/${TEAM}/meldingen/${'a'.repeat(64)}`, { token: T1, uid: 'u1', sinds: 1, laatst: 1, test: true });
store.set(`teams/${TEAM}/meldingen/${'b'.repeat(64)}`, { token: T2, uid: 'u2', sinds: 1, laatst: 1 });

// Zet een nieuwe stand neer zoals de app dat doet, en start de functie zoals Firebase.
function wijzig(score, klok) {
  const voor = huidig;
  huidig = teamData(score, klok);
  store.set(`teams/${TEAM}`, huidig);
  const s = d => ({ data: () => d });
  return standMelding.run({ before: s(voor), after: s(huidig) }, { params: { team: TEAM }, timestamp: new Date().toISOString() });
}
const mis = [];
const laatste = () => verzonden[verzonden.length - 1] || { notification: {}, tokens: [], webpush: { fcmOptions: {} } };
const zeg = (ok, tekst) => { console.log((ok ? '✓ ' : '✗ ') + tekst); if (!ok) mis.push(tekst); };
const wacht = ms => new Promise(r => setTimeout(r, ms));
const AG = (t, u) => ({ thuis: 'Amsterdam', uit: 'Gooische', t, u });

(async () => {
  let n = verzonden.length;
  await wijzig(AG(0, 1));
  zeg(verzonden.length === n + 1 && laatste().notification.title === '🏑 Gooische scoort!'
      && laatste().notification.body === 'Amsterdam – Gooische\n0 - 1\nQ1 · 06:52',
      `1. doelpunt voor ons als uitploeg: '${laatste().notification.title}' / '${laatste().notification.body}'`);
  zeg(laatste().tokens.length === 2, '   naar beide aangemelde toestellen');
  zeg(laatste().webpush.fcmOptions.link === `https://robmun.github.io/JO18/t/${TEAM}/`, '   tik op de melding opent de kijk-link');

  n = verzonden.length;
  const r1 = wijzig(AG(0, 2));
  await wacht(4000);
  const r2 = wijzig(AG(0, 1));
  await Promise.all([r1, r2]);
  zeg(verzonden.length === n, `2. tikfout (+1 en na 4 s weer −1): ${verzonden.length - n} meldingen`);

  n = verzonden.length;
  await wijzig(AG(1, 1));
  zeg(verzonden.length === n + 1 && laatste().notification.title === '🏑 Tegendoelpunt!'
      && laatste().notification.body === 'Amsterdam – Gooische\n1 - 1\nQ1 · 06:52',
      `3. tegendoelpunt: '${laatste().notification.title}' / '${laatste().notification.body}'`);

  n = verzonden.length;
  await wijzig(AG(1, 0));
  zeg(verzonden.length === n + 1 && laatste().notification.title === 'Doelpunt afgekeurd'
      && laatste().notification.body === 'Amsterdam – Gooische\n1 - 0',
      `4. geannuleerd: '${laatste().notification.title}' / '${laatste().notification.body}'`);

  n = verzonden.length;
  const t0 = Date.now();
  await wijzig(AG(1, 0), { q: 2 });
  zeg(verzonden.length === n && Date.now() - t0 < 1000, `5. alleen de klok: ${verzonden.length - n} meldingen, klaar na ${Date.now() - t0} ms`);

  kapot.add(T2);
  await wijzig(AG(1, 1));
  zeg(!store.has(`teams/${TEAM}/meldingen/${'b'.repeat(64)}`) && store.has(`teams/${TEAM}/meldingen/${'a'.repeat(64)}`),
      '6. verlopen aanmelding opgeruimd, de andere staat er nog');

  n = verzonden.length;
  await wijzig({ thuis: 'Gooische', uit: 'Zwolle', t: 0, u: 0 });
  zeg(verzonden.length === n, '7. nieuwe wedstrijd ingevuld: geen melding');
  await wijzig({ thuis: 'Gooische', uit: 'Zwolle', t: 1, u: 0 });
  zeg(laatste().notification.title === '🏑 Gooische scoort!', '   daarna doelpunt voor ons als thuisploeg');

  // 8. Schakelaar op 'uit': niets versturen. Een doelpunt in die tijd wordt daarna niet
  //    alsnog gemeld: de laatst verstuurde stand loopt gewoon mee.
  MODUS = 'uit';
  n = verzonden.length;
  await wijzig({ thuis: 'Gooische', uit: 'Zwolle', t: 2, u: 0 });
  zeg(verzonden.length === n, `8. schakelaar uit: ${verzonden.length - n} meldingen`);

  // 9. Schakelaar op 'test': alleen het testtoestel, met [TEST] voor de tekst.
  MODUS = 'test';
  store.set(`teams/${TEAM}/meldingen/${'c'.repeat(64)}`, { token: 'token-ouder-3-xxxxxxxxxxxxxxxxxxxx', uid: 'u3', sinds: 1, laatst: 1 });
  n = verzonden.length;
  await wijzig({ thuis: 'Gooische', uit: 'Zwolle', t: 3, u: 0 });
  zeg(verzonden.length === n + 1 && laatste().tokens.length === 1 && laatste().tokens[0] === T1
      && laatste().notification.title === '🏑 Gooische scoort!' && laatste().notification.body.startsWith('[TEST] '),
      `9. alleen testtoestellen: ${laatste().tokens.length} toestel, '${laatste().notification.title}'`);

  // 10. En weer op 'aan': iedereen, zonder TEST.
  MODUS = 'aan';
  await wijzig({ thuis: 'Gooische', uit: 'Zwolle', t: 3, u: 1 });
  zeg(laatste().tokens.length === 2 && laatste().notification.title === '🏑 Tegendoelpunt!', `10. iedereen: ${laatste().tokens.length} toestellen, '${laatste().notification.title}'`);

  // 11. Aftrap melden: meteen, zonder tien seconden te wachten.
  const nuStand = JSON.parse(huidig.state).score;
  n = verzonden.length;
  AANK = { soort: 'start', nr: 1001 };
  let t1 = Date.now();
  await wijzig(nuStand);
  zeg(verzonden.length === n + 1 && laatste().notification.title === '🏑 De wedstrijd is begonnen' && Date.now() - t1 < 1000,
      `11. aftrap: '${laatste().notification.title}' na ${Date.now() - t1} ms`);
  // Dezelfde aankondiging nog eens (andere wijziging, zelfde nummer): niet opnieuw.
  n = verzonden.length;
  await wijzig(nuStand, { q: 3 });
  zeg(verzonden.length === n, '    zelfde aankondiging niet nog eens verstuurd');
  // 12. Einde melden, in de teststand.
  MODUS = 'test';
  AANK = { soort: 'einde', nr: 1002 };
  n = verzonden.length;
  await wijzig(nuStand);
  zeg(verzonden.length === n + 1 && laatste().notification.title === '🏁 Wedstrijd beëindigd'
      && laatste().notification.body === `[TEST] Gooische – Zwolle\n${nuStand.t} - ${nuStand.u}` && laatste().tokens.length === 1,
      `12. einde in de teststand: '${laatste().notification.title}' / '${laatste().notification.body}' naar ${laatste().tokens.length}`);
  // 13. Schakelaar uit: ook geen aankondiging.
  MODUS = 'uit';
  AANK = { soort: 'start', nr: 1003 };
  n = verzonden.length;
  await wijzig(nuStand);
  zeg(verzonden.length === n, '13. aankondiging met de schakelaar op uit: niets');

  console.log(mis.length ? `\n${mis.length} punt(en) niet in orde` : '\nalles in orde');
  process.exit(mis.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
