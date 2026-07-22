<?php
/**
 * Template Name: Ticket Watch
 *
 * Toont de doorverkoopprijs-tracker. Data komt van ticketwatch-data.json
 * in deze zelfde themamap, gevuld door ticketwatch-report.php (aangeroepen
 * door de Tampermonkey-userscript in de browser van de beheerder).
 */
get_header();

$ticketwatch_data_url = esc_url( get_stylesheet_directory_uri() . '/ticketwatch-data.json' );
?>

<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js"></script>
<style>
  .ticketwatch, .ticketwatch *, .ticketwatch *::before, .ticketwatch *::after { box-sizing: border-box; }
  .ticketwatch {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: #0d0d0d;
    color: #eee;
    max-width: 900px;
    margin: 0 auto;
    padding: 24px 16px 60px;
    border-radius: 12px;
  }
  .ticketwatch h1 { font-size: 2.2rem; margin: 0 0 4px; color: #fff; }
  .ticketwatch .subtitle { color: #999; margin-bottom: 16px; font-size: 0.9rem; }
  .ticketwatch .banner {
    background: linear-gradient(135deg, rgba(74,222,128,0.16), rgba(74,222,128,0.04));
    border: 1px solid rgba(74,222,128,0.35);
    border-radius: 10px;
    padding: 14px 18px;
    margin-bottom: 20px;
    font-size: 0.95rem;
    line-height: 1.5;
  }
  .ticketwatch .banner.sold-out {
    background: rgba(248,113,113,0.08);
    border-color: rgba(248,113,113,0.3);
  }
  .ticketwatch .banner a { color: #4ade80; font-weight: 600; }
  .ticketwatch .banner.sold-out a { color: #f87171; }
  .ticketwatch .stats {
    display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 24px;
  }
  .ticketwatch .stat-card {
    background: #1a1a1a; border-radius: 10px; padding: 14px 18px;
    flex: 1; min-width: 130px;
  }
  .ticketwatch .stat-label { color: #999; font-size: 0.75rem; text-transform: uppercase; letter-spacing: .04em; }
  .ticketwatch .stat-label.expensive { color: #f87171; }
  .ticketwatch .stat-label.cheap { color: #4ade80; }
  .ticketwatch .stat-value { font-size: 1.5rem; font-weight: 600; margin-top: 4px; }
  .ticketwatch .stat-value.cheap { color: #4ade80; }
  .ticketwatch .stat-value.expensive { color: #f87171; }
  .ticketwatch .stat-sub { color: #888; font-size: 0.75rem; margin-top: 4px; }
  .ticketwatch .chart-container {
    position: relative; height: 280px;
    background: #111; border-radius: 10px; padding: 10px 10px 4px;
    margin-bottom: 16px;
  }
  .ticketwatch .updated { color: #666; font-size: 0.8rem; margin-top: 16px; }
  .ticketwatch a { color: #7dd3fc; }

  @media (max-width: 600px) {
    .ticketwatch { padding: 16px 10px 40px; }
    .ticketwatch .stats { gap: 10px; }
    .ticketwatch .stat-card { min-width: 44%; padding: 10px 12px; }
    .ticketwatch .stat-value { font-size: 1.25rem; }
    .ticketwatch .chart-container { height: 280px; padding: 10px 6px 4px; }
  }
</style>

<div class="ticketwatch">
  <h1>🎪 LLowPrice-tickets 2026</h1>
  <p class="subtitle">Hoe duur zijn de tickets voor Lowlands 2026?</p>

  <div class="banner" id="tw-banner"></div>
  <div class="stats" id="tw-stats"></div>
  <div class="chart-container"><canvas id="tw-chart"></canvas></div>
  <div class="chart-container"><canvas id="tw-ticketsChart"></canvas></div>
  <p class="updated" id="tw-updated"></p>
</div>

<script>
(function () {
  const DATA_URL = <?php echo json_encode( $ticketwatch_data_url ); ?>;
  const TICKET_URL = 'https://www.ticketmaster.nl/event/lowlands-2026-festivalticket-tickets/1050736969';
  const ORIGINAL_PRICE = 365; // reguliere ticketprijs, pas aan als Ticketmaster deze wijzigt

  function closestAtOrBefore(points, targetMs) {
    let best = null;
    for (const p of points) {
      const t = new Date(p.timestamp).getTime();
      if (t <= targetMs && (!best || t > new Date(best.timestamp).getTime())) best = p;
    }
    return best;
  }

  async function load() {
    const res = await fetch(DATA_URL + '?_=' + Date.now(), { cache: 'no-store' });
    const data = await res.json();
    const points = data.points || [];

    if (!points.length) {
      document.getElementById('tw-stats').innerHTML = '<p>Nog geen data. Wacht tot de eerste meting is gedraaid.</p>';
      return;
    }

    const latest = points[points.length - 1];
    const allLowest = points.map(p => p.lowest).filter(v => v !== null);
    const cheapestEver = allLowest.length ? Math.min(...allLowest) : null;
    const isMobile = window.innerWidth < 600;
    const labels = points.map(p => isMobile
      ? new Date(p.timestamp).toLocaleString('nl-NL', { hour: '2-digit', minute: '2-digit' })
      : new Date(p.timestamp).toLocaleString('nl-NL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }));

    const bannerEl = document.getElementById('tw-banner');
    if (latest.lowest !== null) {
      bannerEl.classList.remove('sold-out');
      bannerEl.innerHTML =
        `Lowlands is nog <strong>NIET</strong> uitverkocht. Wil je gaan, dan betaal je op dit moment ` +
        `<strong>€ ${latest.lowest.toFixed(2)}</strong> voor een kaartje.<br>` +
        `<a href="${TICKET_URL}" target="_blank">Klik hier om er ééntje te kopen 🎟️</a>`;
    } else {
      bannerEl.classList.add('sold-out');
      bannerEl.innerHTML =
        `Er zijn op dit moment geen doorverkooptickets gevonden. ` +
        `<a href="${TICKET_URL}" target="_blank">Check Ticketmaster →</a>`;
    }

    const latestMs = new Date(latest.timestamp).getTime();
    const dayAgo = closestAtOrBefore(points, latestMs - 24 * 60 * 60 * 1000);
    const threeDaysAgo = closestAtOrBefore(points, latestMs - 3 * 24 * 60 * 60 * 1000);
    const deltaParts = [];
    if (dayAgo) {
      const diff = latest.totalTickets - dayAgo.totalTickets;
      deltaParts.push(`${diff > 0 ? '+' : ''}${diff} vs gisteren`);
    }
    if (threeDaysAgo) {
      const diff = latest.totalTickets - threeDaysAgo.totalTickets;
      deltaParts.push(`${diff > 0 ? '+' : ''}${diff} vs 3 dagen geleden`);
    }

    document.getElementById('tw-stats').innerHTML = `
      <div class="stat-card">
        <div class="stat-label cheap">Laagste nu 🔻</div>
        <div class="stat-value cheap">${latest.lowest !== null ? '€ ' + latest.lowest.toFixed(2) : '–'}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label expensive">Hoogste nu 🔺</div>
        <div class="stat-value expensive">${latest.highest !== null ? '€ ' + latest.highest.toFixed(2) : '–'}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Gemiddelde prijs ⚖️</div>
        <div class="stat-value">${latest.average != null ? '€ ' + latest.average.toFixed(2) : '–'}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Tickets beschikbaar 🎫</div>
        <div class="stat-value">${latest.totalTickets}</div>
        <div class="stat-sub">in ${latest.totalListings} listing${latest.totalListings === 1 ? '' : 's'}${deltaParts.length ? ' · ' + deltaParts.join(' · ') : ''}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Goedkoopste tot nu toe 🤑</div>
        <div class="stat-value cheap">${cheapestEver !== null ? '€ ' + cheapestEver.toFixed(2) : '–'}</div>
      </div>
    `;

    const tooltipEuro = {
      mode: 'index',
      intersect: false,
      callbacks: {
        label: (item) => `${item.dataset.label}: € ${Number(item.parsed.y).toFixed(2)}`,
      },
    };

    const ctx = document.getElementById('tw-chart').getContext('2d');
    new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Laagste prijs',
            data: points.map(p => p.lowest),
            borderColor: '#4ade80',
            backgroundColor: 'rgba(74,222,128,0.1)',
            tension: 0.2,
            pointRadius: 0,
            spanGaps: true,
          },
          {
            label: 'Gemiddelde prijs',
            data: points.map(p => p.average ?? null),
            borderColor: '#facc15',
            backgroundColor: 'rgba(250,204,21,0.05)',
            tension: 0.2,
            pointRadius: 0,
            borderDash: [4, 3],
            spanGaps: true,
          },
          {
            label: 'Normale prijs',
            data: points.map(() => ORIGINAL_PRICE),
            borderColor: 'rgba(160,160,160,0.5)',
            borderDash: [3, 4],
            borderWidth: 1,
            pointRadius: 0,
            tension: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: '#ccc', boxWidth: 10, font: { size: isMobile ? 10 : 12 }, padding: isMobile ? 8 : 10 },
          },
          tooltip: tooltipEuro,
        },
        scales: {
          x: {
            ticks: {
              color: '#888',
              maxTicksLimit: isMobile ? 4 : 10,
              maxRotation: 0,
              minRotation: 0,
              font: { size: isMobile ? 10 : 12 },
            },
            grid: { color: '#222' },
          },
          y: { ticks: { color: '#888' }, grid: { color: '#222' } },
        },
      },
    });

    const ticketsCtx = document.getElementById('tw-ticketsChart').getContext('2d');
    new Chart(ticketsCtx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            // Een mislukte meting (bv. even geblokkeerd) komt binnen als
            // totalListings: 0 — dat is geen echte 0, dus behandel het als
            // ontbrekende data in plaats van een dip naar nul te tekenen.
            label: 'Tickets beschikbaar',
            data: points.map(p => p.totalListings > 0 ? p.totalTickets : null),
            borderColor: '#7dd3fc',
            backgroundColor: 'rgba(125,211,252,0.1)',
            tension: 0.2,
            pointRadius: 0,
            fill: true,
            spanGaps: true,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: '#ccc', boxWidth: 10, font: { size: isMobile ? 10 : 12 }, padding: isMobile ? 8 : 10 },
          },
        },
        scales: {
          x: {
            ticks: {
              color: '#888',
              maxTicksLimit: isMobile ? 4 : 10,
              maxRotation: 0,
              minRotation: 0,
              font: { size: isMobile ? 10 : 12 },
            },
            grid: { color: '#222' },
          },
          y: { ticks: { color: '#888' }, grid: { color: '#222' }, beginAtZero: true },
        },
      },
    });

    document.getElementById('tw-updated').textContent =
      'Laatste meting: ' + new Date(latest.timestamp).toLocaleString('nl-NL');
  }

  load().catch(err => {
    document.getElementById('tw-stats').innerHTML = '<p>Kon data niet laden: ' + err.message + '</p>';
  });
})();
</script>

<?php get_footer(); ?>
