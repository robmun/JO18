# Meldingen bij een doelpunt

Kijkers die het aanzetten, krijgen een melding op hun vergrendelscherm. Titel op één
regel, daaronder de wedstrijd, de stand en bij een doelpunt de speeltijd:

| Wanneer | Titel | Tekst |
|---|---|---|
| Aftrap (knop) | 🏑 De wedstrijd is begonnen | Amsterdam – Gooische |
| Doelpunt voor ons | 🏑 Gooische scoort! | Amsterdam – Gooische / 0 - 1 / Q1 · 02:24 |
| Tegendoelpunt | 🏑 Tegendoelpunt! | Amsterdam – Gooische / 1 - 1 / Q3 · 16:10 |
| Afgekeurd | Doelpunt afgekeurd / Tegendoelpunt afgekeurd | Amsterdam – Gooische / 0 - 1 |
| Einde (knop) | 🏁 Wedstrijd beëindigd | Amsterdam – Gooische / 1 - 1 |

Kleur, uitlijning en lettergrootte bepaalt iOS; een app geeft alleen titel en tekst mee.

De thuisploeg staat altijd links. Een doelpunt aan de kant van Gooische is altijd een
doelpunt voor ons, thuis of uit. Speelt Gooische niet mee, dan is de melding neutraal.
De meldingen-code wacht 10 seconden: +1 en meteen weer −1 geeft geen melding.

**Aftrap en einde.** Onder de schakelaar staan twee knoppen voor de coach: *Aftrap melden*
en *Einde melden*. Pas de tweede tik verstuurt; ze volgen dezelfde schakelaar.

**Naar wie?** De coach kiest het bij Meer → Wedstrijdscore → *Meldingen naar kijkers*:
**Uit** (begint hierop), **Alleen testtoestellen** of **Iedereen**. Een testtoestel is
een kijk-app waarin bij Meer → Meldingen *Dit is een testtoestel* is aangevinkt; in de
teststand krijgen alleen die een melding, met `[TEST]` voor de tekst.

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
