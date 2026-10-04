// Playwright kan op drie plekken staan: in test/node_modules (na `npm install`),
// ergens globaal, of via de omgevingsvariabele PLAYWRIGHT_PAD. We proberen ze op
// volgorde, zodat de tests draaien zonder dat je eerst paden hoeft uit te zoeken.
const plekken = [];
if (process.env.PLAYWRIGHT_PAD) plekken.push(process.env.PLAYWRIGHT_PAD);
plekken.push('playwright', 'playwright-core', '@playwright/test');

let gevonden = null, laatsteFout = null;
for (const plek of plekken) {
  try { gevonden = require(plek); break; } catch (e) { laatsteFout = e; }
}
if (!gevonden) {
  console.error('\nPlaywright is niet gevonden. Draai eerst in de map test/:\n');
  console.error('   npm install');
  console.error('   npx playwright install chromium\n');
  console.error('(oorspronkelijke melding: ' + (laatsteFout && laatsteFout.message) + ')');
  process.exit(2);
}

const { chromium } = gevonden;

// Eén telefoonformaat voor alle tests: een iPhone staand met aanraakscherm, want
// daar wordt de app in de praktijk op bediend.
const TOESTEL = { viewport: { width: 393, height: 852 }, hasTouch: true };

async function startBrowser() {
  return chromium.launch({ args: ['--no-sandbox'] });
}

// Elke test maakt zijn vensters hiermee, en niet met browser.newContext().
//
// Reden: de app verbindt bij een kijk-link uit zichzelf met de cloud. Draait een test
// op een machine mét internet — zoals een GitHub-runner — dan laadt hij daar de echte
// Firebase en logt hij anoniem in. Dat maakt bij elke testronde echte anonieme
// gebruikers aan in het Firebase-project. Een team wordt niet aangemaakt (de app
// weigert dat voor een kijker sinds 26.10.x) en gegevens worden niet gelezen, maar
// die aanwas hoort er niet te zijn: een test mag nooit iets buiten zichzelf aanraken.
//
// Daarom gaat alles wat niet van de testserver komt eruit. De app meldt dan netjes
// 'kan Firebase niet laden' — precies wat er ook gebeurt op een veld zonder bereik,
// dus de tests blijven realistisch. Wie de cloud wél wil toetsen, gebruikt de
// nagebootste Firebase uit fbstub.js (zie de test met twee coaches).
async function nieuweContext(browser, extra) {
  const ctx = await browser.newContext(Object.assign({}, TOESTEL, extra || {}));
  await ctx.route('**/*', route => {
    const url = route.request().url();
    const binnen = url.startsWith('http://127.0.0.1:') || url.startsWith('http://localhost:')
                || url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('about:');
    return binnen ? route.continue() : route.abort();
  });
  return ctx;
}

// Houdt bij of er tóch iets naar buiten is gegaan. Een geblokkeerde aanvraag komt
// hier niet in terecht — alleen een die echt is afgerond. Blijft de lijst leeg, dan
// heeft deze test niets buiten de testserver aangeraakt.
function volgBuitenverkeer(page) {
  const buiten = [];
  page.on('requestfinished', r => {
    const u = r.url();
    if (!u.startsWith('http://127.0.0.1:') && !u.startsWith('http://localhost:')
        && !u.startsWith('data:') && !u.startsWith('blob:')) buiten.push(u.slice(0, 90));
  });
  return buiten;
}

module.exports = { chromium, startBrowser, nieuweContext, volgBuitenverkeer, TOESTEL };
