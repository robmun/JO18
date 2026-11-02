# Meldingen bij een doelpunt

Kijkers die het aanzetten, krijgen een melding op hun vergrendelscherm als de stand
verandert:

- **⚽ Doelpunt voor Gooische!** — Er is gescoord door ons team. Stand: Gooische – Amsterdam 1-0
- **Tegendoelpunt** — We hebben helaas een tegendoelpunt moeten incasseren. Stand: …
- **Doelpunt geannuleerd** / **Tegendoelpunt geannuleerd** — De stand is weer …

De thuisploeg staat altijd links. Een doelpunt aan de kant van Gooische is altijd een
doelpunt voor ons, thuis of uit. Speelt Gooische niet mee, dan is de melding neutraal.
De meldingen-code wacht 10 seconden: +1 en meteen weer −1 geeft geen melding.

## Wat er waar staat

| Wat | Waar |
|---|---|
| Aanmelden (knop voor kijkers) | `index.html`, zoek op `Meldingen bij een doelpunt` |
| Ontvangen en tonen | `sw.js` |
| Versturen | `meldingen/functions/` — draait bij Firebase |
| Beveiligingsregels | `meldingen/firestore.rules` — worden mee geplaatst |
| Tests | `meldingen/test/` en `test/tests/12-meldingen.js` |

De beveiligingsregels staan sinds november 2026 hier en niet meer alleen in de console.
Wijzig ze voortaan in `firestore.rules`; bij elke plaatsing gaan ze mee.

## Plaatsen of bijwerken (Google Cloud Shell)

1. Open <https://console.cloud.google.com/?cloudshell=true> en kies bovenin project
   **hockey-app-teaming**.
2. Plak in de terminal onderin:

   ```
   rm -rf JO18 && git clone --depth 1 https://github.com/robmun/JO18.git
   cd JO18/meldingen
   npm --prefix functions install
   npx firebase-tools login --no-localhost
   npx firebase-tools deploy --only functions,firestore:rules --project hockey-app-teaming
   ```

3. Klaar bij `Deploy complete!`.

Voorwaarde: het project staat op het Blaze-abonnement.

## Testen zonder Firebase

```
node meldingen/test/stand.test.js
cd meldingen/functions && npm install && node ../test/functie.test.js
```
