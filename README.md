# Lowlands 2026 Doorverkoopprijs Tracker

Houdt een prijsgeschiedenis bij van de Ticketmaster-doorverkooppagina en toont die op een
webpagina (GitHub Pages) met een grafiek. De metingen komen van een Tampermonkey-userscript
dat in je eigen browser draait wanneer je de ticketpagina bezoekt — een losstaande headless
scraper werd door Ticketmaster als bot herkend en kreeg geen listings te zien.

## Installatie (eenmalig)

1. Maak een nieuwe **publieke** GitHub-repository aan (bv. `lowlands-tracker`).
2. Upload deze bestanden naar die repository (via de GitHub-website "Add file → Upload files",
   of via git as je dat gewend bent).
3. Ga naar **Settings → Pages** in je repo, en zet "Source" op de `main`-branch,
   map `/docs`. Sla op. Je krijgt een URL zoals
   `https://<jouw-gebruikersnaam>.github.io/lowlands-tracker/`.
4. Maak een **fine-grained Personal Access Token** aan via
   `https://github.com/settings/tokens?type=beta`, met toegang tot alleen deze ene
   repository en permissie **Contents: Read and write**. Bewaar hem veilig (je ziet 'm
   maar één keer) — dit token gaat zo in je eigen userscript, niet ergens anders.
5. Installeer de [Tampermonkey](https://www.tampermonkey.net/)-browserextensie, en
   installeer daarin het script uit
   [`tampermonkey/lowlands-price-reporter.user.js`](tampermonkey/lowlands-price-reporter.user.js)
   (Tampermonkey-dashboard → "+" → plak de inhoud van het bestand).
6. Open het script in Tampermonkey en vul in het `CONFIG`-blok bovenin je
   `GITHUB_TOKEN` in (en `GITHUB_OWNER`/`GITHUB_REPO` als je andere namen gebruikte).
7. Bezoek de [Lowlands-ticketpagina](https://www.ticketmaster.nl/event/lowlands-2026-festivalticket-tickets/1050736969).
   Rechtsonder verschijnt een balkje dat laat zien of de meting is opgeslagen.

## Wat er gebeurt

- `tampermonkey/lowlands-price-reporter.user.js` draait in je eigen, ingelogde browser
  zodra je de Ticketmaster-pagina opent, leest de doorverkoop-listings uit, en schrijft
  een meting rechtstreeks naar `docs/data.json` via de GitHub API (met je eigen token).
- Er zit een cooldown in (standaard 10 minuten) zodat herhaalde bezoeken/herladingen niet
  voor dubbele commits zorgen.
- `docs/index.html` leest `data.json` en tekent er een grafiek van met Chart.js.
- Zolang je het tabblad open laat staan, herlaadt de userscript de pagina zelf elke
  `CONFIG.AUTO_REFRESH_MINUTES` (standaard 5) en rapporteert daarna opnieuw. Rechtsonder
  staat ook een "🔄 Nu verversen"-knop om direct te herladen en te forceren, ook binnen
  de cooldown.

## Beperkingen

- Er komt alleen een meting bij zolang jij de pagina open hebt staan (of via de
  "Nu verversen"-knop) — dit is geen achtergrond-monitoring zonder open tabblad.
- `.github/workflows/scrape.yml` (de oude headless-Playwright-aanpak) staat nog in de
  repo als handmatige noodgreep via de Actions-tab, maar gaf structureel "0 listings"
  terug omdat Ticketmaster geautomatiseerde browsers herkent en blokkeert, ongeacht
  frequentie of IP.
- Pas `CONFIG.PRICE_THRESHOLD` in de userscript aan naar het bedrag waarop je een
  ntfy-melding wil krijgen, en vul `CONFIG.NTFY_TOPIC` in om dat te activeren.

## Bezoekersstatistieken (optioneel)

`docs/index.html` bevat een [GoatCounter](https://www.goatcounter.com/)-scriptje (gratis,
geen cookies, geen consent-banner nodig):

1. Maak gratis een account aan op <https://www.goatcounter.com/signup> en kies een site-code
   (bv. `lowlands-tracker` → `lowlands-tracker.goatcounter.com`).
2. Vervang in `docs/index.html` `PLAK_HIER_JE_GOATCOUNTER_CODE` door die site-code.
3. Bezoekersaantallen zie je terug op `https://<jouw-site-code>.goatcounter.com`.

Zonder deze stap doet het scriptje niets (het telt gewoon niet mee, breekt de pagina niet).

## Lokaal testen van de userscript-logica

```bash
node --check tampermonkey/lowlands-price-reporter.user.js
```

Voor een echte test: installeer de userscript in Tampermonkey zoals hierboven, bezoek de
ticketpagina, en controleer het balkje rechtsonder plus de Tampermonkey-console-logs.
