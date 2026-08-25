import './style.css';
import { getTodayMatches } from './data/espn.js';

const app = document.querySelector('#app');

let matches = [];
let activeTour = 'ALL';
let activeTab = 'today';
let loading = false;
let lastUpdated = null;

app.innerHTML = `
  <main class="shell">

    <header class="topbar">
      <div>
        <div class="eyebrow">DIRECT DATA ENGINE</div>
        <h1>Tennis Totals Lab</h1>
        <div class="version">ATP + WTA · v0.1.2</div>
      </div>

      <button
        id="refreshBtn"
        class="refresh-btn"
        type="button"
        aria-label="Actualizar partidos">
        ↻
      </button>
    </header>

    <section id="todayView" class="view active">

      <div class="status-row">
        <div class="source">
          <span id="connectionDot" class="dot loading"></span>
          <span id="connectionText">Conectando ESPN...</span>
        </div>

        <div id="updatedText" class="updated">
          —
        </div>
      </div>

      <section class="metrics">
        <article>
          <span>PARTIDOS</span>
          <strong id="metricTotal">—</strong>
        </article>

        <article>
          <span>LIVE</span>
          <strong id="metricLive">—</strong>
        </article>

        <article>
          <span>ATP</span>
          <strong id="metricATP">—</strong>
        </article>

        <article>
          <span>WTA</span>
          <strong id="metricWTA">—</strong>
        </article>
      </section>

      <div class="tour-filter" role="group" aria-label="Filtro de tour">
        <button type="button" data-filter="ALL" class="selected">
          TODOS
        </button>

        <button type="button" data-filter="ATP">
          ATP
        </button>

        <button type="button" data-filter="WTA">
          WTA
        </button>

        <button type="button" data-filter="LIVE">
          ● LIVE
        </button>
      </div>

      <section id="dataHealthPanel" class="data-health">

        <div class="health-head">
          <div>
            <span>DATA HEALTH</span>
            <strong id="healthTitle">Auditando feed...</strong>
          </div>

          <span
            id="healthBadge"
            class="health-badge checking">
            CHECK
          </span>
        </div>

        <div class="health-metrics">

          <div>
            <span>ENTRADA</span>
            <strong id="healthReceived">—</strong>
          </div>

          <div>
            <span>VÁLIDOS</span>
            <strong id="healthValid">—</strong>
          </div>

          <div>
            <span>ÚNICOS</span>
            <strong id="healthUnique">—</strong>
          </div>

          <div>
            <span>TORNEOS</span>
            <strong id="healthTournaments">—</strong>
          </div>

        </div>

        <div
          id="healthChecks"
          class="health-checks">
          Esperando auditoría...
        </div>

        <div
          id="healthRejected"
          class="health-rejected">
        </div>

      </section>

      <div id="loadingPanel" class="loading-panel">
        <div class="loader"></div>
        <div>
          <strong>Consultando ATP + WTA</strong>
          <span>ESPN Direct Data</span>
        </div>
      </div>

      <div id="errorPanel" class="error-panel hidden"></div>

      <section id="matches" class="matches"></section>
    </section>

    <section id="rankingView" class="view empty-view">
      <div class="empty-icon">🏆</div>
      <h2>Ranking</h2>
      <p>
        Aquí vivirá el ranking diario de Over / Under
        cuando activemos el Totals Engine.
      </p>
      <span class="coming">ENGINE PENDIENTE · v0.3</span>
    </section>

    <section id="censoView" class="view empty-view">
      <div class="empty-icon">◎</div>
      <h2>Censo</h2>
      <p>
        Predicciones congeladas, resultados,
        liquidación automática y control histórico.
      </p>
      <span class="coming">DATABASE LAYER · v0.2</span>
    </section>

    <section id="labView" class="view empty-view">
      <div class="empty-icon">⌁</div>
      <h2>Lab</h2>
      <p>
        Brier, calibración, superficies,
        sesgo Over / Under y análisis por jugador.
      </p>
      <span class="coming">CALIBRATION LAB · v0.4</span>
    </section>

    <section id="bankView" class="view empty-view">
      <div class="empty-icon">$</div>
      <h2>Bank</h2>
      <p>
        Bankroll, unidades, ROI,
        drawdown y rendimiento real.
      </p>
      <span class="coming">BANK ENGINE · v0.4</span>
    </section>

    <nav class="bottom-nav" aria-label="Navegación principal">
      <button type="button" data-tab="today" class="selected">
        <span>🎾</span>
        <small>HOY</small>
      </button>

      <button type="button" data-tab="ranking">
        <span>◆</span>
        <small>RANKING</small>
      </button>

      <button type="button" data-tab="censo">
        <span>◎</span>
        <small>CENSO</small>
      </button>

      <button type="button" data-tab="lab">
        <span>⌁</span>
        <small>LAB</small>
      </button>

      <button type="button" data-tab="bank">
        <span>$</span>
        <small>BANK</small>
      </button>
    </nav>

  </main>
`;

const matchesEl = document.querySelector('#matches');
const loadingPanel = document.querySelector('#loadingPanel');
const errorPanel = document.querySelector('#errorPanel');

function formatTime(iso) {
  if (!iso) return '—';

  const d = new Date(iso);

  if (Number.isNaN(d.getTime())) return '—';

  return new Intl.DateTimeFormat('es-MX', {
    hour: 'numeric',
    minute: '2-digit'
  }).format(d);
}

function flag(player) {
  if (!player.flag) {
    return `<div class="flag-fallback">•</div>`;
  }

  return `
    <img
      class="flag"
      src="${player.flag}"
      alt="${player.country || ''}"
    />
  `;
}

function scoreCells(player, sets) {
  const cells = [];

  for (let i = 0; i < sets; i++) {
    cells.push(
      `<span class="set-score">${player.sets[i] ?? '—'}</span>`
    );
  }

  return cells.join('');
}

function matchCard(match) {
  const maxSets = Math.max(
    match.playerA.sets.length,
    match.playerB.sets.length,
    2
  );

  const live = match.state === 'in';
  const final = match.state === 'post';

  const stateClass =
    live ? 'live' :
    final ? 'final' :
    'scheduled';

  const statusText =
    live ? `● LIVE · ${match.status}` :
    final ? 'FINAL' :
    formatTime(match.date);

  return `
    <article class="match-card ${live ? 'live-card' : ''}">

      <div class="match-head">
        <div>
          <div class="tour-line">
            <span class="tour ${match.tour.toLowerCase()}">
              ${match.tour}
            </span>

            <span>${match.tournament}</span>
          </div>

          <div class="round">
            ${match.round || 'Singles'}
            ${match.court ? ` · ${match.court}` : ''}
          </div>
        </div>

        <span class="match-state ${stateClass}">
          ${statusText}
        </span>
      </div>

      <div class="player-row">
        ${flag(match.playerA)}

        <div class="player-name">
          <strong>${match.playerA.name}</strong>
          <small>${match.playerA.country || ''}</small>
        </div>

        <div class="set-grid">
          ${scoreCells(match.playerA, maxSets)}
        </div>
      </div>

      <div class="player-row">
        ${flag(match.playerB)}

        <div class="player-name">
          <strong>${match.playerB.name}</strong>
          <small>${match.playerB.country || ''}</small>
        </div>

        <div class="set-grid">
          ${scoreCells(match.playerB, maxSets)}
        </div>
      </div>

      <div class="model-strip">
        <span>Totals Engine</span>
        <strong>Esperando modelo</strong>
        <span class="pending-badge">NO ANALIZADO</span>
      </div>

    </article>
  `;
}

function filteredMatches() {
  if (activeTour === 'ATP') {
    return matches.filter(m => m.tour === 'ATP');
  }

  if (activeTour === 'WTA') {
    return matches.filter(m => m.tour === 'WTA');
  }

  if (activeTour === 'LIVE') {
    return matches.filter(m => m.state === 'in');
  }

  return matches;
}

function renderMatches() {
  const list = filteredMatches();

  if (!list.length) {
    matchesEl.innerHTML = `
      <div class="no-games">
        <strong>No hay partidos en este filtro.</strong>
        <span>
          El scoreboard se actualizará cuando ESPN publique eventos.
        </span>
      </div>
    `;
    return;
  }

  let currentTournament = '';

  matchesEl.innerHTML = list.map(match => {
    const tournamentHeader =
      match.tournament !== currentTournament
        ? `<div class="tournament-title">${match.tournament}</div>`
        : '';

    currentTournament = match.tournament;

    return tournamentHeader + matchCard(match);
  }).join('');
}

function renderMetrics() {
  document.querySelector('#metricTotal').textContent =
    matches.length;

  document.querySelector('#metricLive').textContent =
    matches.filter(m => m.state === 'in').length;

  document.querySelector('#metricATP').textContent =
    matches.filter(m => m.tour === 'ATP').length;

  document.querySelector('#metricWTA').textContent =
    matches.filter(m => m.tour === 'WTA').length;
}

function renderDataHealth(health) {
  const badge =
    document.querySelector('#healthBadge');

  const title =
    document.querySelector('#healthTitle');

  if (!health) {
    badge.className =
      'health-badge warning';

    badge.textContent =
      'SIN DATA';

    title.textContent =
      'Auditoría no disponible';

    return;
  }

  const issues =
    health.outputIssues || {};

  const outputIssues =
    Object.values(issues)
      .reduce(
        (sum, value) =>
          sum + Number(value || 0),
        0
      );

  const clean =
    health.status === 'clean' &&
    outputIssues === 0;

  badge.className =
    `health-badge ${clean ? 'clean' : 'warning'}`;

  badge.textContent =
    clean ? 'LIMPIO' : 'REVISAR';

  title.textContent =
    clean
      ? 'Dataset validado'
      : 'Se detectaron anomalías';

  document.querySelector(
    '#healthReceived'
  ).textContent =
    health.received ?? '—';

  document.querySelector(
    '#healthValid'
  ).textContent =
    health.acceptedBeforeDedupe ?? '—';

  document.querySelector(
    '#healthUnique'
  ).textContent =
    health.unique ?? '—';

  document.querySelector(
    '#healthTournaments'
  ).textContent =
    health.tournaments ?? '—';

  const duplicateOutput =
    Number(issues.duplicateIds || 0) +
    Number(issues.duplicateMatchups || 0);

  const checks = [
    [
      'Duplicados en salida',
      duplicateOutput
    ],
    [
      'Dobles en salida',
      Number(issues.nonSingles || 0)
    ],
    [
      'Fuera de fecha',
      Number(issues.outsideDate || 0)
    ],
    [
      'Tour inválido',
      Number(issues.invalidTour || 0)
    ]
  ];

  document.querySelector(
    '#healthChecks'
  ).innerHTML =
    checks.map(([label, count]) => `
      <div class="health-check ${count === 0 ? 'ok' : 'bad'}">
        <span>${count === 0 ? '✓' : '!'}</span>
        <strong>${label}</strong>
        <b>${count}</b>
      </div>
    `).join('');

  const r =
    health.rejected || {};

  const blocked =
    Number(r.doubles || 0) +
    Number(r.otherGroups || 0) +
    Number(r.outsideDate || 0) +
    Number(r.missingDate || 0) +
    Number(r.unknownTour || 0) +
    Number(r.invalidCompetitors || 0) +
    Number(r.duplicateIds || 0) +
    Number(r.duplicateMatchups || 0);

  document.querySelector(
    '#healthRejected'
  ).innerHTML = `
    <span>Bloqueados antes del modelo: <strong>${blocked}</strong></span>
    <span>
      Dobles ${r.doubles || 0}
      · otras fechas ${r.outsideDate || 0}
      · duplicados ${
        Number(r.duplicateIds || 0) +
        Number(r.duplicateMatchups || 0)
      }
    </span>
  `;
}

function setConnection(mode, text) {
  const dot = document.querySelector('#connectionDot');
  const label = document.querySelector('#connectionText');

  dot.className = `dot ${mode}`;
  label.textContent = text;
}

async function refresh() {
  if (loading) return;

  loading = true;

  document.querySelector('#refreshBtn').classList.add('spinning');

  loadingPanel.classList.remove('hidden');
  errorPanel.classList.add('hidden');

  setConnection('loading', 'Conectando ESPN...');

  try {
    const result = await getTodayMatches();

    matches = result.matches;
    lastUpdated = new Date();

    renderMetrics();
    renderMatches();
    renderDataHealth(result.health);

    setConnection(
      result.errors.length ? 'warning' : 'online',
      result.errors.length
        ? 'Conexión parcial'
        : 'ESPN conectado'
    );

    document.querySelector('#updatedText').textContent =
      `Actualizado ${formatTime(lastUpdated.toISOString())}`;

    if (result.errors.length) {
      errorPanel.textContent = result.errors.join(' · ');
      errorPanel.classList.remove('hidden');
    }

  } catch (error) {

    setConnection('offline', 'Sin conexión');

    errorPanel.textContent =
      `No fue posible cargar ESPN: ${error.message}`;

    errorPanel.classList.remove('hidden');

  } finally {
    loading = false;

    loadingPanel.classList.add('hidden');

    document
      .querySelector('#refreshBtn')
      .classList.remove('spinning');
  }
}

document.querySelector('#refreshBtn')
  .addEventListener('click', refresh);

document.querySelectorAll('[data-filter]')
  .forEach(button => {
    button.addEventListener('click', () => {

      activeTour = button.dataset.filter;

      document.querySelectorAll('[data-filter]')
        .forEach(b => b.classList.remove('selected'));

      button.classList.add('selected');

      renderMatches();
    });
  });

const viewMap = {
  today: '#todayView',
  ranking: '#rankingView',
  censo: '#censoView',
  lab: '#labView',
  bank: '#bankView'
};

document.querySelectorAll('[data-tab]')
  .forEach(button => {
    button.addEventListener('click', () => {

      activeTab = button.dataset.tab;

      document.querySelectorAll('.view')
        .forEach(v => v.classList.remove('active'));

      document.querySelector(viewMap[activeTab])
        .classList.add('active');

      document.querySelectorAll('[data-tab]')
        .forEach(b => b.classList.remove('selected'));

      button.classList.add('selected');
    });
  });

refresh();

setInterval(() => {
  if (document.visibilityState === 'visible') {
    refresh();
  }
}, 60000);
