// scrape.js
// Bezoekt de Lowlands 2026 doorverkooppagina met een echte headless browser,
// leest de listings uit, en voegt een meting toe aan docs/data.json.
// Stuurt optioneel een ntfy-melding als de laagste prijs onder de drempel komt.

import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

// ======================= CONFIG - PAS DIT AAN =======================
const CONFIG = {
  URL: 'https://www.ticketmaster.nl/event/lowlands-2026-festivalticket-tickets/1050736969',
  PRICE_THRESHOLD: 300, // stuur een ntfy-melding als de laagste prijs hieronder komt
  NTFY_TOPIC: process.env.NTFY_TOPIC || '', // laat leeg om ntfy uit te schakelen
  NTFY_SERVER: 'https://ntfy.sh',
  DATA_FILE: path.join(process.cwd(), 'docs', 'data.json'),
  MAX_HISTORY_POINTS: 2000, // voorkomt dat het bestand oneindig groeit
};
// ======================================================================

function log(msg) {
  console.log(`[scrape] ${msg}`);
}

function countResaleNodes(nodes) {
  return nodes.filter((n) => (n.innerText || '').includes('Verified Resale Ticket')).length;
}

async function waitForListingsToStabilize(page, { timeoutMs = 20000, stabilizeMs = 1500, pollMs = 500 } = {}) {
  // De hoofdwidget (het reguliere ticket, bv. "Regulier € 365,00 per stuk") deelt
  // dezelfde data-testid als de doorverkoop-listings, en verschijnt eerder. Wachten
  // tot het aantal "Verified Resale Ticket"-blokjes even niet meer verandert, in
  // plaats van te stoppen zodra er één blokje is, voorkomt dat we alleen die
  // hoofdwidget te zien krijgen terwijl de listings daaronder nog laden.
  const start = Date.now();
  let lastCount = -1;
  let lastChangeAt = Date.now();
  while (Date.now() - start < timeoutMs) {
    const count = await page.$$eval('[data-testid="ticketTypeInfo"]', countResaleNodes);
    if (count !== lastCount) {
      lastCount = count;
      lastChangeAt = Date.now();
    } else if (Date.now() - lastChangeAt >= stabilizeMs) {
      break;
    }
    await page.waitForTimeout(pollMs);
  }
  return lastCount;
}

async function extractListings(page) {
  const stableCount = await waitForListingsToStabilize(page);
  if (stableCount <= 0) {
    log('Geen "Verified Resale Ticket"-listings gevonden (mogelijk uitverkocht of geblokkeerd).');
  }

  return page.$$eval('[data-testid="ticketTypeInfo"]', (nodes) => {
    const results = [];
    for (const node of nodes) {
      const text = node.innerText || node.textContent || '';
      if (!text.includes('Verified Resale Ticket')) continue;

      const priceMatch = text.match(/€\s*([\d.,]+)\s*per stuk/i);
      if (!priceMatch) continue;
      const normalized = priceMatch[1].replace(/\./g, '').replace(',', '.');
      const price = parseFloat(normalized);
      if (isNaN(price) || price <= 0) continue;

      const countMatch = text.match(/(\d+)\s*beschikbaar/i);
      const count = countMatch ? parseInt(countMatch[1], 10) : 1;

      results.push({ price, count });
    }
    return results;
  });
}

async function sendNtfyNotification(price) {
  if (!CONFIG.NTFY_TOPIC) {
    log('NTFY_TOPIC niet ingesteld, geen melding verstuurd.');
    return;
  }
  const url = `${CONFIG.NTFY_SERVER}/${CONFIG.NTFY_TOPIC}`;
  try {
    await fetch(url, {
      method: 'POST',
      headers: {
        Title: 'Lowlands ticket goedkoop!',
        Priority: 'urgent',
        Tags: 'moneybag,tada',
      },
      body: `Doorverkoopticket gevonden voor € ${price.toFixed(2)} (drempel: € ${CONFIG.PRICE_THRESHOLD}). Snel checken op Ticketmaster!`,
    });
    log('ntfy-melding verstuurd.');
  } catch (err) {
    log('ntfy-melding versturen mislukt: ' + err.message);
  }
}

async function loadHistory() {
  try {
    const raw = await fs.readFile(CONFIG.DATA_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return { points: [], lastNotifiedPrice: null };
  }
}

async function saveHistory(history) {
  await fs.mkdir(path.dirname(CONFIG.DATA_FILE), { recursive: true });
  await fs.writeFile(CONFIG.DATA_FILE, JSON.stringify(history, null, 2), 'utf-8');
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'nl-NL',
  });
  const page = await context.newPage();

  log(`Navigeren naar ${CONFIG.URL}`);
  await page.goto(CONFIG.URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

  const listings = await extractListings(page);
  await browser.close();

  const history = await loadHistory();
  const timestamp = new Date().toISOString();

  const point = {
    timestamp,
    lowest: listings.length ? Math.min(...listings.map((l) => l.price)) : null,
    highest: listings.length ? Math.max(...listings.map((l) => l.price)) : null,
    totalTickets: listings.reduce((sum, l) => sum + l.count, 0),
    totalListings: listings.length,
  };

  history.points.push(point);
  if (history.points.length > CONFIG.MAX_HISTORY_POINTS) {
    history.points = history.points.slice(-CONFIG.MAX_HISTORY_POINTS);
  }

  log(`Meting: ${JSON.stringify(point)}`);

  if (point.lowest !== null && point.lowest <= CONFIG.PRICE_THRESHOLD) {
    const last = history.lastNotifiedPrice;
    if (last === null || point.lowest < last) {
      await sendNtfyNotification(point.lowest);
      history.lastNotifiedPrice = point.lowest;
    } else {
      log('Al eerder gemeld voor dit prijsniveau, geen nieuwe melding.');
    }
  }

  await saveHistory(history);
  log('data.json bijgewerkt.');
}

main().catch((err) => {
  console.error('[scrape] Fout:', err);
  process.exit(1);
});
