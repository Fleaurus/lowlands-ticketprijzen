// ==UserScript==
// @name         Lowlands 2026 Doorverkoopprijs Reporter
// @namespace    lowlands-ticket-tracker
// @version      2.0.0
// @description  Leest doorverkoopprijzen uit op de Ticketmaster-paginabezoek en stuurt een meting naar de Festileaks Ticket Watch-pagina.
// @match        https://www.ticketmaster.nl/event/lowlands-2026-festivalticket-tickets/1050736969*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      festileaks.com
// ==/UserScript==

(function () {
  'use strict';

  // ======================= CONFIG - PAS DIT AAN =======================
  const CONFIG = {
    REPORT_URL: 'https://festileaks.com/wp-content/themes/festileaks/ticketwatch-report.php',
    // Zelfde secret als REPORT_SECRET in ticketwatch-report.php.
    REPORT_SECRET: 'RIJlyg3UdcYTmWc0sZZ1k1o9PN1YhVMx_kGWCfGqROk',
    AUTO_REFRESH_MINUTES: 5, // herlaadt de pagina automatisch met dit interval
    COOLDOWN_MINUTES: 4, // rapporteer niet vaker dan dit (moet < AUTO_REFRESH_MINUTES zijn)
  };
  // ======================================================================

  function log(msg) {
    console.log(`[lowlands-reporter] ${msg}`);
  }

  function showBadge(text, color) {
    let badge = document.getElementById('lowlands-reporter-badge');
    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'lowlands-reporter-badge';
      badge.style.cssText =
        'position:fixed;bottom:12px;right:12px;z-index:999999;padding:6px 10px;' +
        'font:12px/1.4 sans-serif;border-radius:6px;color:#fff;box-shadow:0 2px 6px rgba(0,0,0,.3)';
      document.body.appendChild(badge);
    }
    badge.textContent = text;
    badge.style.background = color;
  }

  function showForceButton() {
    if (document.getElementById('lowlands-reporter-force-btn')) return;
    const btn = document.createElement('button');
    btn.id = 'lowlands-reporter-force-btn';
    btn.textContent = '🔄 Nu verversen';
    btn.style.cssText =
      'position:fixed;bottom:44px;right:12px;z-index:999999;padding:6px 10px;' +
      'font:12px/1.4 sans-serif;border-radius:6px;color:#fff;background:#334155;' +
      'border:none;cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,.3)';
    btn.onclick = () => {
      GM_setValue('forcePending', true);
      location.reload();
    };
    document.body.appendChild(btn);
  }

  function gmRequest(options) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        ...options,
        onload: resolve,
        onerror: reject,
        ontimeout: reject,
      });
    });
  }

  function extractListings() {
    const nodes = document.querySelectorAll('[data-testid="ticketTypeInfo"]');
    const results = [];
    for (const node of nodes) {
      const text = node.innerText || node.textContent || '';
      // De hoofdwidget (het reguliere ticket, bv. "Regulier € 365,00 per stuk") deelt
      // dezelfde data-testid als de doorverkoop-listings; alleen de listings zelf
      // bevatten deze tekst, dus dat is hoe we ze onderscheiden.
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
  }

  function waitForListingsToStabilize(timeoutMs) {
    // Wacht tot het aantal gevonden listings even niet meer verandert, in plaats
    // van te stoppen zodra er één is - de resale-lijst laadt geleidelijk.
    return new Promise((resolve) => {
      const start = Date.now();
      const stabilizeMs = 1500;
      let lastCount = -1;
      let lastChangeAt = Date.now();
      const check = () => {
        const listings = extractListings();
        const timedOut = Date.now() - start > timeoutMs;
        if (listings.length !== lastCount) {
          lastCount = listings.length;
          lastChangeAt = Date.now();
        }
        if (timedOut || (lastCount >= 0 && Date.now() - lastChangeAt >= stabilizeMs)) {
          resolve(listings);
        } else {
          setTimeout(check, 500);
        }
      };
      check();
    });
  }

  async function reportPoint(point) {
    const res = await gmRequest({
      method: 'POST',
      url: CONFIG.REPORT_URL,
      headers: {
        Authorization: `Bearer ${CONFIG.REPORT_SECRET}`,
        'Content-Type': 'application/json',
      },
      data: JSON.stringify(point),
    });
    if (res.status !== 200) {
      throw new Error(`Report mislukt: ${res.status} ${res.statusText} - ${res.responseText}`);
    }
  }

  async function main() {
    if (CONFIG.REPORT_SECRET === 'PLAK_HIER_JE_SECRET') {
      showBadge('Lowlands reporter: geen secret ingesteld', '#b91c1c');
      log('REPORT_SECRET niet ingesteld in de userscript-config, stop.');
      return;
    }

    const forced = GM_getValue('forcePending', false);
    if (forced) GM_setValue('forcePending', false);

    const lastRun = GM_getValue('lastReportTime', 0);
    const cooldownMs = CONFIG.COOLDOWN_MINUTES * 60 * 1000;
    if (!forced && Date.now() - lastRun < cooldownMs) {
      const minsAgo = Math.round((Date.now() - lastRun) / 60000);
      showBadge(`Lowlands reporter: ${minsAgo} min geleden al gerapporteerd`, '#64748b');
      return;
    }

    showBadge('Lowlands reporter: prijzen zoeken...', '#2563eb');
    const listings = await waitForListingsToStabilize(20000);

    const totalTickets = listings.reduce((sum, l) => sum + l.count, 0);
    const point = {
      timestamp: new Date().toISOString(),
      lowest: listings.length ? Math.min(...listings.map((l) => l.price)) : null,
      highest: listings.length ? Math.max(...listings.map((l) => l.price)) : null,
      average: totalTickets ? listings.reduce((sum, l) => sum + l.price * l.count, 0) / totalTickets : null,
      totalTickets,
      totalListings: listings.length,
    };
    log(`Meting: ${JSON.stringify(point)}`);

    try {
      showBadge('Lowlands reporter: bezig met versturen...', '#2563eb');
      await reportPoint(point);
      GM_setValue('lastReportTime', Date.now());
      showBadge(`Lowlands reporter: verstuurd (${point.totalListings} listings)`, '#16a34a');
      log('Meting verstuurd naar Festileaks.');
    } catch (err) {
      showBadge('Lowlands reporter: fout, zie console', '#b91c1c');
      log('Fout bij versturen: ' + err.message);
    }
  }

  showForceButton();
  main();

  if (CONFIG.AUTO_REFRESH_MINUTES > 0) {
    setInterval(() => location.reload(), CONFIG.AUTO_REFRESH_MINUTES * 60 * 1000);
  }
})();
