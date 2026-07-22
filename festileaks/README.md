# Ticket Watch op Festileaks

Zelfde tracker als de GitHub Pages-versie, maar dan draaiend op festileaks.com in plaats
van op GitHub. De userscript-gegevens gaan niet meer naar GitHub, maar naar een klein
PHP-endpoint in het Festileaks-thema.

## Bestanden en waar ze naartoe moeten (via SFTP)

Upload deze drie bestanden naar `/home/festileaks.com/public_html/wp-content/themes/festileaks/`:

- `page-ticketwatch.php` — de pagina-template (hoort al gekoppeld te zijn aan
  `festileaks.com/ticketwatch/`).
- `ticketwatch-report.php` — het endpoint waar de userscript naar rapporteert.
- `ticketwatch-data.json` — de dataset, al gevuld met de bestaande geschiedenis
  (318 metingen) zodat je niks verliest bij de overstap.

## Wat je zelf nog moet checken/doen

1. **Bestandsrechten**: `ticketwatch-report.php` moet `ticketwatch-data.json` kunnen
   overschrijven. Als je na de eerste rapportage een 500-fout krijgt, zet het bestand
   (of de map) op schrijfbaar voor de webserver, bv. `chmod 664 ticketwatch-data.json`.
2. **WP-pagina**: als `festileaks.com/ticketwatch/` nog niet aan dit template-bestand
   hangt, ga naar **Pagina's → (de ticketwatch-pagina) → Pagina-attributen → Template**
   en kies "Ticket Watch".
3. **Chart.js-conflict**: de pagina laadt Chart.js via een CDN-`<script>`-tag. Als het
   Festileaks-thema zelf al een andere versie van Chart.js gebruikt, kan dat botsen —
   laat het weten als de grafieken niet verschijnen.
4. **Userscript bijwerken**: kopieer de nieuwe inhoud van
   [`tampermonkey/lowlands-price-reporter.user.js`](../tampermonkey/lowlands-price-reporter.user.js)
   over je bestaande Tampermonkey-script (deze praat nu met Festileaks in plaats van
   GitHub — er is geen GitHub-token meer nodig).

## Beveiliging

`ticketwatch-report.php` accepteert alleen POST-requests met een `Authorization: Bearer
<secret>`-header die moet matchen met `REPORT_SECRET` in dat bestand — dezelfde string
staat al ingevuld in de userscript (`CONFIG.REPORT_SECRET`). Wil je 'm ooit vervangen,
pas 'm op beide plekken tegelijk aan.

## De oude GitHub Pages-versie

Die blijft intact en werkt gewoon door (docs/data.json op GitHub raakt alleen niet meer
bijgewerkt zodra je de userscript hierop omzet). Zeg het als je die wil laten staan als
backup, of wil laten verwijderen.
