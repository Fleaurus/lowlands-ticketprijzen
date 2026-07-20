# Lowlands 2026 Doorverkoopprijs Tracker

Scrapet automatisch de Ticketmaster-doorverkooppagina, houdt een prijsgeschiedenis bij,
en toont die op een webpagina (GitHub Pages) met een grafiek.

## Installatie (eenmalig)

1. Maak een nieuwe **publieke** GitHub-repository aan (bv. `lowlands-tracker`).
2. Upload deze bestanden naar die repository (via de GitHub-website "Add file → Upload files",
   of via git as je dat gewend bent).
3. Ga naar **Settings → Pages** in je repo, en zet "Source" op de `main`-branch,
   map `/docs`. Sla op. Je krijgt een URL zoals
   `https://<jouw-gebruikersnaam>.github.io/lowlands-tracker/`.
4. (Optioneel, voor ntfy-meldingen) Ga naar **Settings → Secrets and variables → Actions**,
   en voeg een secret toe genaamd `NTFY_TOPIC` met jouw unieke ntfy-topic-naam.
5. Ga naar de **Actions**-tab en klik op "Scrape Lowlands ticket prices" → "Run workflow"
   om de eerste scrape handmatig te starten. Daarna draait hij vanzelf elke 15 minuten
   (aan te passen in `.github/workflows/scrape.yml`).

## Wat er gebeurt

- `scrape.js` opent de Ticketmaster-pagina met een headless Chrome (Playwright),
  leest de doorverkoop-listings uit, en schrijft een meting toe aan `docs/data.json`.
- GitHub Actions commit dat bestand automatisch terug naar de repo.
- `docs/index.html` leest `data.json` en tekent er een grafiek van met Chart.js.

## Beperkingen

- Ticketmaster kan geautomatiseerd (datacenter-)verkeer blokkeren. Als de scraper
  regelmatig "0 listings" teruggeeft terwijl je weet dat er wél tickets zijn, is dat
  waarschijnlijk de reden. Verlaag in dat geval de frequentie in `scrape.yml`
  (bv. elke 30-60 minuten) om minder op te vallen.
- GitHub Actions cron-schema's zijn "best effort" — bij hoge drukte kan een run een
  paar minuten later starten dan gepland.
- Pas `CONFIG.PRICE_THRESHOLD` in `scrape.js` aan naar het bedrag waarop je een
  ntfy-melding wil krijgen.

## Lokaal testen

```bash
npm install
npx playwright install --with-deps chromium
npm run scrape
```

Dit vult/update `docs/data.json`. Open `docs/index.html` lokaal in je browser
(of gebruik `npx serve docs`) om de pagina te bekijken.
