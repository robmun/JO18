// Een webserver die zich gedraagt zoals GitHub Pages: hij bedient de hele map onder
// hetzelfde pad als online (/JO18/...) en stuurt onbekende paden naar 404.html met
// status 404. Dat laatste is precies wat de kijk-link /JO18/t/<teamcode>/ nodig heeft,
// dus zonder die nabootsing zou de test iets anders toetsen dan wat er live gebeurt.
const http = require('http');
const fs = require('fs');
const path = require('path');

const SOORT = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
  '.txt': 'text/plain; charset=utf-8'
};

// wortel: de map van de repository. voorvoegsel: het pad waarop GitHub Pages hem zet.
function startServer(wortel, voorvoegsel = '/JO18') {
  const server = http.createServer((req, res) => {
    let pad = decodeURIComponent((req.url || '/').split('?')[0]);

    // Alles buiten het voorvoegsel bestaat online ook niet.
    if (!pad.startsWith(voorvoegsel)) { res.writeHead(404); res.end('buiten ' + voorvoegsel); return; }
    pad = pad.slice(voorvoegsel.length) || '/';

    let bestand = path.join(wortel, path.normalize(pad).replace(/^(\.\.[/\\])+/, ''));
    if (fs.existsSync(bestand) && fs.statSync(bestand).isDirectory()) bestand = path.join(bestand, 'index.html');

    if (!fs.existsSync(bestand) || fs.statSync(bestand).isDirectory()) {
      // Onbekend pad: GitHub Pages geeft 404.html mét status 404.
      const vier = path.join(wortel, '404.html');
      if (fs.existsSync(vier)) {
        const inhoud = fs.readFileSync(vier);
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': inhoud.length });
        res.end(inhoud);
        return;
      }
      res.writeHead(404); res.end('niet gevonden'); return;
    }

    const inhoud = fs.readFileSync(bestand);
    res.writeHead(200, {
      'Content-Type': SOORT[path.extname(bestand).toLowerCase()] || 'application/octet-stream',
      'Content-Length': inhoud.length,
      'Cache-Control': 'no-store'
    });
    res.end(inhoud);
  });

  return new Promise(klaar => {
    server.listen(0, '127.0.0.1', () => {
      const poort = server.address().port;
      klaar({
        poort,
        basis: `http://127.0.0.1:${poort}${voorvoegsel}/`,
        stop: () => new Promise(r => server.close(r))
      });
    });
  });
}

module.exports = { startServer };
