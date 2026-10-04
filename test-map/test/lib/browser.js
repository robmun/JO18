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

module.exports = { chromium, startBrowser, TOESTEL };
