# Tests voor "opstelling & wissels"

Negen tests die samen in ongeveer drie minuten nagaan of een release
veilig de lucht in kan. Ze draaien tegen de bestanden in deze repository, in een
nagebootste GitHub Pages — dus op dezelfde adressen als online, met hetzelfde
gedrag voor onbekende paden.

## Draaien

Eenmalig, in deze map:

```
npm install
npx playwright install chromium
```

Daarna:

```
node run.js           alle tests (ongeveer 2,5 minuut)
node run.js --snel    alleen de snelle vier (ongeveer 20 seconden)
node run.js 03        alleen de test waarvan het bestand met 03 begint
```

Afsluitcode 0 betekent dat alles in orde is, 1 dat er iets mis is. Daardoor kan
een GitHub Action hier later op afgaan.

## Wat de negen tests doen

**01 versienummers** — Controleert of `APP_VERSION`, `TIMER_VERSION` en
`version.json` hetzelfde getal hebben, of het label de vorm *jaar.maand.volgnummer*
heeft (26.10.8), of `404.html` een exacte kopie van `index.html` is en of de
demo-map gelijk loopt met de hoofdmap. Dit is de goedkoopste test en vangt de fout
die het makkelijkst gemaakt wordt: één van de vier vergeten, of de demo niet
meekopiëren.

**02 zelftest van de planner** — Draait de zelftest die in de app zelf zit
(`?zelftest=1`): 25 onderdelen die de planner honderden keren doorrekenen —
wisselmomenten, speeltijdverdeling, keeperregels, ongedaan maken, migratie van oude
gegevens.

**03 de vier adressen en de naam op het beginscherm** — Opent de vier adressen
waarop de app draait (kijk-link via het pad, oude kijk-link met parameters, coach,
demo) en controleert per adres: de rol, het aantal tabbladen, uit welke map de
bestanden gehaald worden, welk manifest in de pagina staat, en welke naam de iPad
voorstelt bij 'Zet op beginscherm'. Hier zijn de twee storingen van oktober 2026 in
vastgelegd: een kijker die als coachversie werd opgeslagen, en een kijk-link die
zijn bestanden een map te diep zocht.

**04 hele wedstrijd op één toestel** — Speelt vier kwarten af met uitsluitend echte
knoppen: starten, minuten verzetten, kaarten, blessures, een ad-hoc ruil, en steeds
weer de app wegleggen en terugpakken (scherm op slot, even WhatsApp, weer terug).
171 handelingen. Stopt zodra de app niet meer reageert en legt dan vast wat er op
dat moment aan de hand was, met een schermafdruk in `uitvoer/`.

**06 hoe de app over spelers schrijft** — Zet de teaminstelling achtereenvolgens op
jongens, meisjes en gemengd en controleert of de voornaamwoorden kloppen, of de keuze
meereist in de gedeelde stand, en of er op geen enkel tabblad en in geen van beide talen
een token als `{hij}` in beeld blijft staan.

**07 kaarten en een klok die springt** — Geeft een groene en een gele kaart en zet
daarna de klok terug of naar een volgend kwart. Controleert dat de resterende straftijd
behouden blijft in plaats van mee te groeien of in één klap op te zijn, dat de aftelling
nooit langer wordt dan de kaart zelf, en dat zo'n speler altijd aantikbaar blijft — ook
met een stilstaande klok op 0.

**08 wedstrijdstand en de telefoonindeling** — Controleert dat de stand nergens in
beeld komt zolang er geen teamnamen staan — ook niet als er al doelpunten zijn ingetikt — dat een ingevulde stand op de telefoon op het veld staat en op
de liggende tablet in de klokbalk in dezelfde kleur als de tijd, dat de plus- en
minknoppen binnen hun grenzen blijven, en dat op de telefoon de veldtekening blijft
staan terwijl de wisselmomenten erachter wegschuiven.

**09 gepasseerde wisselmomenten** — Zet de klok midden in een kwart en controleert dat
een wisselmoment dat geweest is van het scherm verdwijnt, dat de nadruk doorschuift naar
het eerstvolgende, en dat er aan het eind van het kwart staat dat alles geweest is.
Controleert even nadrukkelijk het omgekeerde: blader je vooruit naar een kwart dat nog
moet komen of terug naar een gespeeld kwart, dan blijft het hele plan staan. Op de
telefoon én op de liggende tablet.

**05 twee coaches tegelijk** — Twee toestellen, een hele wedstrijd lang. A bedient
de timer, B kijkt mee en wijzigt ook. Onderweg valt het bereik van B een halve
minuut weg en wijzigen ze een keer tegelijk — de twee gevallen waarin de standen uit
elkaar kunnen lopen. Aan het eind moeten klok, selectie en versienummer van de stand
op beide toestellen gelijk zijn. Alleen de database is nagebootst (`lib/fbstub.js`);
de rest is de echte app.

## Mappen

```
run.js              draait alles en geeft één uitslag
tests/              de negen tests
lib/server.js       webserver die GitHub Pages nabootst, inclusief 404.html
lib/browser.js      zoekt Playwright op en legt het toestelformaat vast
lib/fbstub.js       nagebootste Firebase voor de test met twee coaches
uitvoer/            schermafdrukken bij een mislukte test (niet in git)
```

## Twee dingen om te weten

**De tests kunnen niet naar buiten.** Elk venster wordt gemaakt met `nieuweContext()`
uit `lib/browser.js`, en die blokkeert alles wat niet van de testserver komt. Dat is
geen detail: de app verbindt bij een kijk-link uit zichzelf met de cloud, en op een
machine mét internet — zoals een GitHub-runner — zou hij daar de echte Firebase laden
en anoniem inloggen. Dan maakt elke testronde echte anonieme gebruikers aan in het
Firebase-project. Een team wordt niet aangemaakt en er worden geen gegevens gelezen,
maar een test hoort nooit iets buiten zichzelf aan te raken. Tests 03 en 05 controleren
bovendien of er werkelijk niets naar buiten is gegaan, en worden rood als dat wel zo is.
Wie het samenwerken wél wil toetsen, gebruikt de nagebootste Firebase in `lib/fbstub.js`.

Doordat Firebase en de service worker zo niet geladen worden, legt de app een paar
meldingen vast die daarover gaan. Die worden bewust genegeerd — ze zeggen niets over de
app. Alle andere fouten die de app zelf vastlegt, laten een test mislukken.

De verwachtingen in test 03 staan met opzet hard in het bestand, inclusief de naam
"JO18-5 view-only". Verandert dat bewust, dan hoort die test mee aangepast te worden
— dat is precies de bedoeling: zo kan het niet ongemerkt terugvallen.
