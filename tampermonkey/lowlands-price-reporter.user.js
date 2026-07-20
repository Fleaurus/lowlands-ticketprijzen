// ==UserScript==
// @name         Lowlands 2026 Doorverkoopprijs Reporter
// @namespace    lowlands-ticket-tracker
// @version      1.0.0
// @description  Leest doorverkoopprijzen uit op de Ticketmaster-paginabezoek en schrijft een meting naar docs/data.json in je GitHub-repo.
// @match        https://www.ticketmaster.nl/event/lowlands-2026-festivalticket-tickets/1050736969*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      api.github.com
// @connect      ntfy.sh
// ==/UserScript==

(function () {
  'use strict';

  // ======================= CONFIG - PAS DIT AAN =======================
  const CONFIG = {
    GITHUB_OWNER: 'Fleaurus',
    GITHUB_REPO: 'lowlands-ticketprijzen',
    DATA_PATH: 'docs/data.json',
    // Fine-grained Personal Access Token met alleen "Contents: Read and write"
    // op deze ene repo. Aanmaken via https://github.com/settings/tokens?type=beta
    GITHUB_TOKEN: 'PLAK_HIER_JE_GITHUB_TOKEN',
    COOLDOWN_MINUTES: 10, // rapporteer niet vaker dan dit, ook niet bij meerdere tabbladen/herladingen
    PRICE_THRESHOLD: 300,
    NTFY_TOPIC: '', // laat leeg om ntfy-meldingen uit te schakelen
    NTFY_SERVER: 'https://ntfy.sh',
    MAX_HISTORY_POINTS: 2000,
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

  function waitForListings(timeoutMs) {
    return new Promise((resolve) => {
      const start = Date.now();
      const check = () => {
        const listings = extractListings();
        const timedOut = Date.now() - start > timeoutMs;
        if (listings.length > 0 || timedOut) {
          resolve(listings);
        } else {
          setTimeout(check, 500);
        }
      };
      check();
    });
  }

  async function sendNtfyNotification(price) {
    if (!CONFIG.NTFY_TOPIC) return;
    try {
      await gmRequest({
        method: 'POST',
        url: `${CONFIG.NTFY_SERVER}/${CONFIG.NTFY_TOPIC}`,
        headers: { Title: 'Lowlands ticket goedkoop!', Priority: 'urgent', Tags: 'moneybag,tada' },
        data: `Doorverkoopticket gevonden voor € ${price.toFixed(2)} (drempel: € ${CONFIG.PRICE_THRESHOLD}). Snel checken op Ticketmaster!`,
      });
      log('ntfy-melding verstuurd.');
    } catch (err) {
      log('ntfy-melding versturen mislukt: ' + err);
    }
  }

  function githubApiUrl() {
    return `https://api.github.com/repos/${CONFIG.GITHUB_OWNER}/${CONFIG.GITHUB_REPO}/contents/${CONFIG.DATA_PATH}`;
  }

  function githubHeaders() {
    return {
      Authorization: `Bearer ${CONFIG.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    };
  }

  async function loadHistory() {
    const res = await gmRequest({ method: 'GET', url: githubApiUrl(), headers: githubHeaders() });
    if (res.status !== 200) {
      throw new Error(`GET data.json mislukt: ${res.status} ${res.statusText}`);
    }
    const body = JSON.parse(res.responseText);
    const history = JSON.parse(decodeURIComponent(escape(atob(body.content))));
    return { history, sha: body.sha };
  }

  async function saveHistory(history, sha) {
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(history, null, 2))));
    const res = await gmRequest({
      method: 'PUT',
      url: githubApiUrl(),
      headers: githubHeaders(),
      data: JSON.stringify({
        message: 'Update ticket price data (tampermonkey)',
        content,
        sha,
      }),
    });
    if (res.status !== 200) {
      throw new Error(`PUT data.json mislukt: ${res.status} ${res.statusText} - ${res.responseText}`);
    }
  }

  async function main() {
    if (CONFIG.GITHUB_TOKEN === 'PLAK_HIER_JE_GITHUB_TOKEN') {
      showBadge('Lowlands reporter: geen GitHub-token ingesteld', '#b91c1c');
      log('GITHUB_TOKEN niet ingesteld in de userscript-config, stop.');
      return;
    }

    const lastRun = GM_getValue('lastReportTime', 0);
    const cooldownMs = CONFIG.COOLDOWN_MINUTES * 60 * 1000;
    if (Date.now() - lastRun < cooldownMs) {
      const minsAgo = Math.round((Date.now() - lastRun) / 60000);
      showBadge(`Lowlands reporter: ${minsAgo} min geleden al gerapporteerd`, '#64748b');
      return;
    }

    showBadge('Lowlands reporter: prijzen zoeken...', '#2563eb');
    const listings = await waitForListings(15000);

    const point = {
      timestamp: new Date().toISOString(),
      lowest: listings.length ? Math.min(...listings.map((l) => l.price)) : null,
      highest: listings.length ? Math.max(...listings.map((l) => l.price)) : null,
      totalTickets: listings.reduce((sum, l) => sum + l.count, 0),
      totalListings: listings.length,
    };
    log(`Meting: ${JSON.stringify(point)}`);

    try {
      showBadge('Lowlands reporter: bezig met opslaan...', '#2563eb');
      const { history, sha } = await loadHistory();
      history.points = history.points || [];
      history.points.push(point);
      if (history.points.length > CONFIG.MAX_HISTORY_POINTS) {
        history.points = history.points.slice(-CONFIG.MAX_HISTORY_POINTS);
      }

      if (point.lowest !== null && point.lowest <= CONFIG.PRICE_THRESHOLD) {
        const last = history.lastNotifiedPrice;
        if (last === null || last === undefined || point.lowest < last) {
          await sendNtfyNotification(point.lowest);
          history.lastNotifiedPrice = point.lowest;
        }
      }

      await saveHistory(history, sha);
      GM_setValue('lastReportTime', Date.now());
      showBadge(`Lowlands reporter: opgeslagen (${point.totalListings} listings)`, '#16a34a');
      log('data.json bijgewerkt via GitHub API.');
    } catch (err) {
      showBadge('Lowlands reporter: fout, zie console', '#b91c1c');
      log('Fout bij bijwerken data.json: ' + err.message);
    }
  }

  main();
})();
