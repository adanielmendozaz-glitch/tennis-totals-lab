import './style.css';
import './v063-ui.js';
import { getTodayMatches } from './data/espn.js';
import { enrichMatchesWithStats } from './engine/playerStats.js';
import { enrichMatchesWithMatchup } from './engine/matchup.js';
import { getMatchMarkets } from './data/espnOdds.js';
import { evaluateMarket } from './engine/market.js';
import { getMarketReadiness } from './engine/readiness.js';
import { buildRanking } from './engine/ranking.js';

import {
  getCensoEntries,
  hasCenso,
  captureCenso,
  settleCensoFromMatches
} from './engine/censo.js';

import {
  backfillPendingCenso
} from './engine/censoBackfill.js';

const app = document.querySelector('#app');

let matches = [];
let activeTour = 'ALL';
let activeTab = 'today';
let loading = false;
let lastUpdated = null;
let statsGeneration = 0;

let totalsWorker = null;

const totalsCache = new Map();

const TOTALS_SIMULATIONS = 40000;

const MANUAL_MARKETS_KEY =
  'tennis_totals_lab_manual_markets_v1';

function loadManualMarkets() {
  try {
    return JSON.parse(
      localStorage.getItem(
        MANUAL_MARKETS_KEY
      ) || '{}'
    );
  } catch {
    return {};
  }
}

let manualMarkets =
  loadManualMarkets();

function saveManualMarkets() {
  localStorage.setItem(
    MANUAL_MARKETS_KEY,
    JSON.stringify(
      manualMarkets
    )
  );
}

function manualMarketFor(match) {
  return (
    manualMarkets[
      String(match.id)
    ] ||
    null
  );
}

function setManualMarket(
  match,
  market
) {
  manualMarkets[
    String(match.id)
  ] = market;

  saveManualMarkets();

  match.marketDecision =
    evaluateMarket(
      match,
      market
    );

  match.marketChecked =
    true;

  match.marketLoading =
    false;
}

function removeManualMarket(
  match
) {
  delete manualMarkets[
    String(match.id)
  ];

  saveManualMarkets();

  match.marketDecision =
    null;
}



app.innerHTML = `
  <main class="shell">

    <header class="topbar">
      <div>
        <div class="eyebrow">DIRECT DATA ENGINE</div>
        <h1>Tennis Totals Lab</h1>
        <div class="version">ATP + WTA · v0.6.6</div>
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

      <section id="playerDataPanel" class="player-data">

        <div class="player-data-head">
          <div>
            <span>PLAYER DATA ENGINE</span>
            <strong id="playerDataTitle">
              Esperando históricos...
            </strong>
          </div>

          <span
            id="playerDataBadge"
            class="player-data-badge loading">
            LOAD
          </span>
        </div>

        <div class="player-data-metrics">

          <div>
            <span>COBERTURA</span>
            <strong id="playerCoverage">—</strong>
          </div>

          <div>
            <span>PERFILES</span>
            <strong id="playerProfiles">—</strong>
          </div>

          <div>
            <span>SUPERFICIE</span>
            <strong id="surfaceCoverage">—</strong>
          </div>

          <div>
            <span>HISTÓRICOS</span>
            <strong id="historyRows">—</strong>
          </div>

        </div>

        <div
          id="playerDataDetail"
          class="player-data-detail">
          ATP/WTA 2025–2026
        </div>

      </section>

      <section
        id="matchupEnginePanel"
        class="matchup-engine">

        <div class="matchup-engine-head">
          <div>
            <span>MATCHUP ENGINE</span>
            <strong id="matchupEngineTitle">
              Esperando perfiles...
            </strong>
          </div>

          <span
            id="matchupEngineBadge"
            class="matchup-engine-badge loading">
            WAIT
          </span>
        </div>

        <div class="matchup-engine-metrics">

          <div>
            <span>FULL DATA</span>
            <strong id="matchupFull">—</strong>
          </div>

          <div>
            <span>PARTIAL</span>
            <strong id="matchupPartial">—</strong>
          </div>

          <div>
            <span>NO DATA</span>
            <strong id="matchupNone">—</strong>
          </div>

          <div>
            <span>MARKOV READY</span>
            <strong id="matchupReady">—</strong>
          </div>

        </div>

        <div
          id="matchupEngineDetail"
          class="matchup-engine-detail">
          Surface-adjusted baselines
        </div>

      </section>

      <section
        id="totalsEnginePanel"
        class="totals-engine">

        <div class="totals-engine-head">

          <div>
            <span>TOTALS ENGINE</span>

            <strong id="totalsEngineTitle">
              Esperando Matchup Engine...
            </strong>
          </div>

          <span
            id="totalsEngineBadge"
            class="totals-engine-badge waiting">
            WAIT
          </span>

        </div>

        <div class="totals-engine-metrics">

          <div>
            <span>READY</span>
            <strong id="totalsReady">—</strong>
          </div>

          <div>
            <span>QUEUE</span>
            <strong id="totalsQueue">—</strong>
          </div>

          <div>
            <span>SIM / MATCH</span>
            <strong>100K</strong>
          </div>

          <div>
            <span>MODE</span>
            <strong>PRE</strong>
          </div>

        </div>

        <div
          id="totalsEngineProgress"
          class="totals-engine-progress">
          Markov → Set → Match → Total Games
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

    <section
      id="rankingView"
      class="view ranking-view">

      <div class="ranking-header">
        <div>
          <span>VALUE ENGINE</span>
          <h2>Ranking del día</h2>
        </div>

        <strong>PRE-MATCH</strong>
      </div>

      <div class="ranking-metrics">

        <div>
          <span>PLAY</span>
          <strong id="rankingPlay">0</strong>
        </div>

        <div>
          <span>LEAN</span>
          <strong id="rankingLean">0</strong>
        </div>

        <div>
          <span>MODEL READY</span>
          <strong id="rankingReady">0</strong>
        </div>

      </div>

      <div
        id="rankingList"
        class="ranking-list">

        <div class="ranking-empty">
          Calculando candidatos...
        </div>

      </div>

    </section>

    <section
      id="censoView"
      class="view censo-view">

      <div class="censo-header">
        <div>
          <span>MODEL AUDIT</span>
          <h2>Censo</h2>
        </div>

        <strong>FROZEN PICKS</strong>
      </div>

      <div class="censo-metrics">

        <div>
          <span>TOTAL</span>
          <strong id="censoTotal">0</strong>
        </div>

        <div>
          <span>PENDING</span>
          <strong id="censoPending">0</strong>
        </div>

        <div>
          <span>W - L</span>
          <strong id="censoRecord">0-0</strong>
        </div>

        <div>
          <span>REVIEW</span>
          <strong id="censoReview">0</strong>
        </div>

      </div>

      <div
        id="censoList"
        class="censo-list">

        <div class="censo-empty">
          Todavía no hay predicciones congeladas.
        </div>

      </div>

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


    <div
      id="matchDetailOverlay"
      class="match-detail-overlay hidden">

      <div class="match-detail-toolbar">

        <button
          type="button"
          data-close-detail>
          ‹
        </button>

        <div>
          <span>PARTIDO</span>
          <strong id="matchDetailTitle">
            Detalle
          </strong>
        </div>

      </div>

      <div
        id="matchDetailContent"
        class="match-detail-content">
      </div>

    </div>

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

function statValue(value) {
  return value === null ||
    value === undefined
      ? '—'
      : `${value.toFixed(1)}%`;
}

function profileLine(player) {
  const p =
    player.profile;

  if (!p) {
    const identity =
      player.identity;

    let message =
      'SIN PERFIL HISTÓRICO';

    if (
      identity?.status ===
      'PLACEHOLDER'
    ) {
      message =
        'SIN IDENTIDAD · PLACEHOLDER';

    } else if (
      identity &&
      !identity.resolved
    ) {
      message =
        identity.status ===
        'AMBIGUOUS'
          ? 'IDENTIDAD AMBIGUA · NO FORZADA'
          : 'IDENTITY MISS · NO FORZADO';
    }

    return `
      <div class="profile-line missing">
        <div class="profile-id">
          <strong>${player.shortName || player.name}</strong>
          <span>${message}</span>
        </div>
      </div>
    `;
  }

  const identityTag =
    p.identity?.method &&
    p.identity.method !==
      'EXACT'
      ? ` · ID ${p.identity.method} ${p.identity.confidencePct}%`
      : '';

  const extTag =
    Number(
      p.historyMix
        ?.extended ||
      0
    ) > 0
      ? ` · EXT ${p.historyMix.extended}`
      : '';

  return `
    <div class="profile-line">

      <div class="profile-id">
        <strong>${player.shortName || player.name}</strong>
        <span>
          ${p.rank ? `#${p.rank} · ` : ''}
          ${p.sampleType}
          · n=${p.sample}
          · eff=${Number(p.effectiveSample ?? p.sample).toFixed(1)}
          · L10 ${p.last10Wins}-${p.last10Losses}
          ${identityTag}
          ${extTag}
        </span>
      </div>

      <div>
        <span>HLD</span>
        <b>${statValue(p.holdPct)}</b>
      </div>

      <div>
        <span>BRK</span>
        <b>${statValue(p.breakPct)}</b>
      </div>

      <div>
        <span>SPW</span>
        <b>${statValue(p.servePointsWonPct)}</b>
      </div>

      <div>
        <span>RPW</span>
        <b>${statValue(p.returnPointsWonPct)}</b>
      </div>

    </div>
  `;
}

function statsPanel(match) {
  const hasStats =
    match.playerA.profile ||
    match.playerB.profile;

  if (!hasStats) {
    return '';
  }

  return `
    <div class="match-stats">

      <div class="match-stats-head">
        <span>PLAYER STATS</span>

        <strong class="surface-badge">
          ${match.surface || 'UNKNOWN'}
          ${
            match.surfaceMeta?.confidencePct
              ? ` · ${match.surfaceMeta.confidencePct}%`
              : ''
          }
        </strong>
      </div>

      ${profileLine(match.playerA)}
      ${profileLine(match.playerB)}

    </div>
  `;
}

function signedPct(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return '—';
  }

  const n =
    Number(value);

  if (!Number.isFinite(n)) {
    return '—';
  }

  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
}

function coverageReasonLabel(
  value
) {
  const labels = {
    READY:
      'READY',

    IDENTITY_MISS:
      'IDENTITY MISS',

    PLACEHOLDER:
      'SIN IDENTIDAD',

    NO_PROFILE:
      'SIN PERFIL',

    LOW_EFFECTIVE_SAMPLE:
      'MUESTRA EFECTIVA BAJA',

    LOW_SAMPLE:
      'MUESTRA BAJA',

    SERVE_SUPPORT_LOW:
      'POCOS PUNTOS DE SAQUE',

    RETURN_SUPPORT_LOW:
      'POCOS PUNTOS DE RESTO',

    STAT_GAP:
      'STATS INCOMPLETOS',

    SURFACE_UNKNOWN:
      'SUPERFICIE DESCONOCIDA',

    BASELINE_MISSING:
      'BASELINE FALTANTE'
  };

  return (
    labels[value] ||
    value ||
    '—'
  );
}

function matchupPlayerLine(
  player,
  projection
) {
  return `
    <div class="matchup-player-line">

      <div class="matchup-player-name">
        <strong>${player.shortName || player.name}</strong>
        <span>
          Reliability ${projection.reliabilityPct?.toFixed(1) || '—'}%
        </span>
      </div>

      <div>
        <span>pSRV</span>
        <b>${projection.servePointPct?.toFixed(1) || '—'}%</b>
      </div>

      <div>
        <span>pHOLD</span>
        <b>${projection.holdPct?.toFixed(1) || '—'}%</b>
      </div>

      <div>
        <span>ΔBASE</span>
        <b>${signedPct(projection.serveDeltaPct)}</b>
      </div>

    </div>
  `;
}

function matchupPanel(match) {
  const m =
    match.matchup;

  if (!m) {
    return '';
  }

  const statusClass =
    m.status === 'FULL'
      ? 'full'
      : m.status === 'PARTIAL'
        ? 'partial'
        : 'none';

  if (
    m.status === 'NO_DATA'
  ) {
    return `
      <div class="matchup-box">

        <div class="matchup-box-head">
          <span>MATCHUP ENGINE</span>

          <strong class="matchup-status none">
            NO DATA
          </strong>
        </div>

        <div class="matchup-empty">
          Excluido del Markov hasta tener perfiles suficientes.
        </div>

      </div>
    `;
  }

  return `
    <div class="matchup-box">

      <div class="matchup-box-head">
        <span>
          MATCHUP ENGINE · PRE-MATCH
        </span>

        <strong class="matchup-status ${statusClass}">
          ${m.status}
        </strong>
      </div>

      ${matchupPlayerLine(
        match.playerA,
        m.playerA
      )}

      ${matchupPlayerLine(
        match.playerB,
        m.playerB
      )}

      ${
        m.dataTrust
          ? `
            <div class="data-trust-strip ${m.dataTrust.level.toLowerCase()}">
              <div>
                <span>DATA TRUST</span>
                <strong>${m.dataTrust.level} · ${Number(m.dataTrust.score).toFixed(1)}</strong>
              </div>
              <div>
                <span>A</span>
                <strong>${m.dataTrust.playerA?.provenance?.label || 'NO_DATA'}</strong>
              </div>
              <div>
                <span>B</span>
                <strong>${m.dataTrust.playerB?.provenance?.label || 'NO_DATA'}</strong>
              </div>
            </div>
          `
          : ''
      }

      ${
        m.status !== 'FULL' &&
        m.coverageAudit
          ? `
            <div class="coverage-audit">
              <strong>
                COVERAGE DIAGNOSTIC
              </strong>

              <span>
                ${match.playerA.shortName || match.playerA.name}:
                ${coverageReasonLabel(m.coverageAudit.playerA)}
              </span>

              <span>
                ${match.playerB.shortName || match.playerB.name}:
                ${coverageReasonLabel(m.coverageAudit.playerB)}
              </span>

              ${
                m.coverageAudit.surface !== 'READY'
                  ? `
                    <span>
                      ${coverageReasonLabel(m.coverageAudit.surface)}
                    </span>
                  `
                  : ''
              }
            </div>
          `
          : ''
      }

      <div class="matchup-baseline">
        <span>
          ${match.tour}
          ${m.baselineSurface}
          BASE
        </span>

        <span>
          SPW
          <strong>${m.baseline.servePointPct?.toFixed(1)}%</strong>
        </span>

        <span>
          HOLD
          <strong>${m.baseline.holdPct?.toFixed(1)}%</strong>
        </span>

        <span>
          AVG pHOLD
          <strong>${m.averageHoldPct?.toFixed(1)}%</strong>
        </span>
      </div>

    </div>
  `;
}

function totalsFingerprint(match) {
  return [
    match.id,
    match.tour,
    match.tournament,
    match.round,
    match.surface,

    /*
     * Evita reutilizar una simulación
     * calculada con otro corte histórico.
     */
    match.pointInTime?.cutoffKey,
    match.matchup?.dataTrust?.score,
    match.matchup?.shadowCore?.playerA?.servePointPct,
    match.matchup?.shadowCore?.playerB?.servePointPct,

    match.matchup?.playerA?.servePointPct,
    match.matchup?.playerB?.servePointPct,
    match.matchup?.playerA?.holdPct,
    match.matchup?.playerB?.holdPct,
    TOTALS_SIMULATIONS
  ].join('|');
}

function curveForDisplay(totals) {
  const target =
    Math.floor(totals.medianGames) - 0.5;

  return [...totals.curve]
    .sort(
      (a, b) =>
        Math.abs(a.line - target) -
        Math.abs(b.line - target)
    )
    .slice(0, 5)
    .sort(
      (a, b) =>
        a.line - b.line
    );
}

function totalsPanel(match) {
  if (!match.matchup?.markovReady) {
    return '';
  }

  const totals = match.totals;

  if (!totals) {
    return `
      <div class="totals-box pending">

        <div class="totals-box-head">
          <span>TOTALS ENGINE</span>
          <strong>100K ENS</strong>
        </div>

        <div class="totals-pending">
          Monte Carlo en cola...
        </div>

      </div>
    `;
  }

  const curve =
    curveForDisplay(totals);

  const liveNotice =
    match.state === 'in'
      ? `
        <div class="totals-live-warning">
          PRE-MATCH BASELINE
          · todavía no ajustado al marcador LIVE
        </div>
      `
      : '';

  return `
    <div class="totals-box">

      <div class="totals-box-head">

        <span>
          TOTALS ENGINE · ${totals.mode}
        </span>

        <strong class="totals-ready-badge">
          ${(totals.simulations / 1000).toFixed(0)}K ENS
        </strong>

      </div>

      ${liveNotice}

      <div class="totals-summary">

        <div>
          <span>EXPECTED</span>
          <strong>
            ${totals.expectedGames.toFixed(2)}
          </strong>
        </div>

        <div>
          <span>MEDIAN</span>
          <strong>
            ${totals.medianGames}
          </strong>
        </div>

        <div>
          <span>DECIDING SET</span>
          <strong>
            ${totals.decidingSetPct.toFixed(1)}%
          </strong>
        </div>

        <div>
          <span>TIEBREAK</span>
          <strong>
            ${totals.tiebreakPct.toFixed(1)}%
          </strong>
        </div>

      </div>

      <div class="totals-curve">

        <div class="totals-curve-head">
          <span>LINE</span>
          <span>OVER</span>
          <span>UNDER</span>
        </div>

        ${curve.map(row => `
          <div class="totals-curve-row">

            <strong>
              ${row.line.toFixed(1)}
            </strong>

            <span>
              ${row.overPct.toFixed(1)}%
            </span>

            <span>
              ${row.underPct.toFixed(1)}%
            </span>

          </div>
        `).join('')}

      </div>

      <div class="ensemble-models">

        <span>
          MARKOV
          <strong>
            ${totals.models?.structural?.expectedGames?.toFixed(2) || '—'}
          </strong>
        </span>

        <span>
          BAYES
          <strong>
            ${totals.models?.bayesian?.expectedGames?.toFixed(2) || '—'}
          </strong>
        </span>

        <span>
          ELO
          <strong>
            ${totals.models?.elo?.expectedGames?.toFixed(2) || '—'}
          </strong>
        </span>

        <span>
          QUALITY
          <strong>
            ${totals.diagnostics?.qualityPct?.toFixed(1) || '—'}%
          </strong>
        </span>

        <span>
          DISAG
          <strong>
            ${totals.diagnostics?.disagreementPct?.toFixed(1) || '—'} pp
          </strong>
        </span>

        <span class="consensus-cell ${
          (totals.diagnostics?.consensusStatus || '')
            .toLowerCase()
        }">
          CONSENSUS
          <strong>
            ${totals.diagnostics?.consensusStatus || '—'}
          </strong>
        </span>

      </div>

      ${
        totals.shadowAudit?.available
          ? `
            <div class="shadow-audit ${totals.shadowAudit.status.toLowerCase()}">
              <div><span>CORE SHADOW</span><strong>${totals.shadowAudit.coreExpectedGames.toFixed(2)}</strong></div>
              <div><span>COVERAGE</span><strong>${totals.shadowAudit.coverageExpectedGames.toFixed(2)}</strong></div>
              <div><span>Δ EXPECTED</span><strong>${totals.shadowAudit.expectedDelta >= 0 ? '+' : ''}${totals.shadowAudit.expectedDelta.toFixed(2)}</strong></div>
              <div><span>MAX P Δ</span><strong>${totals.shadowAudit.maxProbabilityDeltaPct.toFixed(1)} pp</strong></div>
              <div class="shadow-status">SHADOW ${totals.shadowAudit.status} · 5K CORE</div>
            </div>
          `
          : `
            <div class="shadow-audit unavailable">
              SHADOW CORE · NO DISPONIBLE · ${totals.shadowAudit?.reason || 'CORE_SAMPLE_NOT_READY'}
            </div>
          `
      }

      <div class="totals-foot">

        <span>
          BO${totals.bestOf}
          · σ ${totals.sdGames.toFixed(2)}
          · Sets ${totals.expectedSets.toFixed(2)}
        </span>

        <span>
          MC SE ≤ ±${totals.maxProbabilitySePct.toFixed(2)}%
        </span>

      </div>

      <div class="totals-no-pick ${
        (totals.diagnostics?.consensusStatus || '')
          .toLowerCase()
      }">
        ${
          totals.diagnostics?.consensusStatus === 'UNSTABLE'
            ? 'CONSENSUS INESTABLE · PASS AUTOMÁTICO'
            : totals.diagnostics?.consensusStatus === 'WATCH'
              ? 'CONSENSUS EN OBSERVACIÓN · SIN PICK TODAVÍA'
              : 'CONSENSUS ESTABLE · LISTO PARA MARKET ENGINE'
        }
      </div>

    </div>
  `;
}

function marketOddsText(value) {
  const n =
    Number(value);

  if (!Number.isFinite(n)) {
    return '—';
  }

  if (
    n > 1 &&
    n < 20
  ) {
    return n.toFixed(2);
  }

  return n > 0
    ? `+${n}`
    : `${n}`;
}

function marketNumber(value) {
  const n =
    Number(value);

  return Number.isFinite(n)
    ? n
    : null;
}

function marketPanel(match) {
  if (!match.totals) {
    return '';
  }

  const readiness =
    getMarketReadiness(
      match
    );

  /*
   * El Market Engine es exclusivamente
   * PRE-MATCH en esta fase.
   */
  if (match.state !== 'pre') {
    return '';
  }

  const consensus =
    match.totals
      ?.diagnostics
      ?.consensusStatus;

  if (
    consensus !== 'STABLE'
  ) {
    return `
      <div class="market-box blocked">

        <div class="market-box-head">
          <span>MARKET ENGINE</span>

          <strong class="market-status pass">
            PASS
          </strong>
        </div>

        <div class="market-empty">
          Mercado bloqueado · Consensus ${consensus || '—'}
        </div>

      </div>
    `;
  }

  if (match.marketLoading) {
    return `
      <div class="market-box">

        <div class="market-box-head">
          <span>MARKET ENGINE</span>
          <strong>BUSCANDO...</strong>
        </div>

        <div class="market-empty">
          Consultando línea O/U real
        </div>

      </div>
    `;
  }

  if (
    match.marketChecked &&
    !match.marketDecision
  ) {
    return `
      <div class="market-box">

        <div class="market-box-head">
          <span>MARKET ENGINE</span>

          <strong class="market-status no-market">
            NO MARKET
          </strong>
        </div>

        <div class="market-readiness">

          <span>
            MODEL READINESS
          </span>

          <strong class="${
            readiness.status.toLowerCase()
          }">
            ${readiness.score.toFixed(1)}%
            · ${readiness.status}
          </strong>

        </div>

        <div class="market-empty">
          ${
            readiness.status === 'READY'
              ? 'MODELO LISTO · esperando línea de mercado'
              : 'ESPN no publicó total utilizable para este partido.'
          }
        </div>

        ${
          readiness.status === 'READY'
            ? `
              <div
                class="manual-market"
                data-match-id="${match.id}">

                <div class="manual-market-title">
                  INGRESAR MERCADO MANUAL
                </div>

                <div class="manual-market-grid">

                  <label>
                    <span>LINE</span>
                    <input
                      type="number"
                      step="0.5"
                      inputmode="decimal"
                      data-manual-line
                      placeholder="22.5"
                    />
                  </label>

                  <label>
                    <span>OVER</span>
                    <input
                      type="number"
                      inputmode="decimal"
                      step="0.01"
                      data-manual-over
                      placeholder="1.90 / -110"
                    />
                  </label>

                  <label>
                    <span>UNDER</span>
                    <input
                      type="number"
                      inputmode="decimal"
                      step="0.01"
                      data-manual-under
                      placeholder="1.90 / -110"
                    />
                  </label>

                  <button
                    type="button"
                    data-manual-apply="${match.id}">
                    ANALIZAR
                  </button>

                </div>

              </div>
            `
            : ''
        }

      </div>
    `;
  }

  const m =
    match.marketDecision;

  if (!m) {
    return '';
  }

  const recommendation =
    m.recommendation ||
    'PASS';

  const side =
    m.bestSide ||
    '—';

  const modelProbability =
    side === 'OVER'
      ? marketNumber(
          m.model?.overPct
        )
      : side === 'UNDER'
        ? marketNumber(
            m.model?.underPct
          )
        : null;

  const breakEven =
    side === 'OVER'
      ? marketNumber(
          m.market
            ?.overBreakEvenPct
        )
      : side === 'UNDER'
        ? marketNumber(
            m.market
              ?.underBreakEvenPct
          )
        : null;

  return `
    <div class="market-box">

      <div class="market-box-head">

        <span>
          MARKET ENGINE · ${m.provider || 'ESPN'}
        </span>

        <strong class="market-status ${recommendation.toLowerCase()}">
          ${recommendation}
        </strong>

      </div>

      <div class="market-summary">

        <div>
          <span>LINE</span>
          <strong>
            O/U ${Number(m.line).toFixed(1)}
          </strong>
        </div>

        <div>
          <span>BEST SIDE</span>
          <strong>
            ${side}
          </strong>
        </div>

        <div>
          <span>MODEL</span>
          <strong>
            ${
              modelProbability !== null
                ? `${modelProbability.toFixed(1)}%`
                : '—'
            }
          </strong>
        </div>

        <div>
          <span>EDGE</span>
          <strong>
            ${
              m.bestEdgePct !== null &&
              Number.isFinite(
                Number(m.bestEdgePct)
              )
                ? `${Number(m.bestEdgePct) >= 0 ? '+' : ''}${Number(m.bestEdgePct).toFixed(1)} pp`
                : 'NO PRICE'
            }
          </strong>
        </div>

      </div>

      <div class="market-prices">

        <span>
          OVER
          <strong>
            ${marketOddsText(m.market?.overOdds)}
          </strong>
        </span>

        <span>
          UNDER
          <strong>
            ${marketOddsText(m.market?.underOdds)}
          </strong>
        </span>

        <span>
          BREAK-EVEN
          <strong>
            ${
              breakEven !== null
                ? `${breakEven.toFixed(1)}%`
                : '—'
            }
          </strong>
        </span>

        <span>
          FAIR
          <strong>
            ${marketOddsText(m.fairOdds)}
          </strong>
        </span>

      </div>

      <div class="market-readiness">

        <span>
          MODEL READINESS
        </span>

        <strong class="${
          readiness.status.toLowerCase()
        }">
          ${readiness.score.toFixed(1)}%
          · ${readiness.status}
        </strong>

      </div>

      <div class="market-reason">

        <span>
          ${
            m.reason === 'VALUE'
              ? 'VALOR DETECTADO · candidato para Ranking'
              : m.reason === 'NO_PRICE'
                ? 'LÍNEA DISPONIBLE · PRECIO NO DISPONIBLE'
                : 'SIN EDGE SUFICIENTE'
          }
        </span>

        ${
          ['PLAY', 'LEAN'].includes(
            recommendation
          )
            ? `
              <button
                type="button"
                class="censo-capture-btn"
                data-censo-capture="${match.id}"
                ${
                  hasCenso(match.id)
                    ? 'disabled'
                    : ''
                }>
                ${
                  hasCenso(match.id)
                    ? '✓ EN CENSO'
                    : 'REGISTRAR CENSO'
                }
              </button>
            `
            : ''
        }

      </div>

    </div>
  `;
}

function matchDetailContent(match) {
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

      ${statsPanel(match)}

      ${matchupPanel(match)}

      ${totalsPanel(match)}

      ${marketPanel(match)}

      <div class="model-strip">
        <span>Totals Engine</span>

        <strong>
          ${
            match.matchup?.markovReady
              ? 'Entrada Markov lista'
              : match.matchup?.status === 'PARTIAL'
                ? 'Datos parciales'
                : 'Sin entrada suficiente'
          }
        </strong>

        <span
          class="pending-badge ${
            match.matchup?.markovReady
              ? 'ready'
              : ''
          }">
          ${
            match.matchup?.markovReady
              ? 'MATCHUP READY'
              : match.matchup?.status === 'PARTIAL'
                ? 'PARTIAL'
                : 'PASS DATA'
          }
        </span>
      </div>

    </article>
  `;
}


function matchCard(match) {
  const live =
    match.state === 'in';

  const final =
    match.state === 'post';

  const totals =
    match.totals;

  const decision =
    match.marketDecision;

  const readiness =
    totals
      ? getMarketReadiness(match)
      : null;

  const consensus =
    totals
      ?.diagnostics
      ?.consensusStatus ||
    match.matchup?.status ||
    'WAIT';

  const badge =
    decision?.recommendation === 'PLAY'
      ? 'PLAY'
      : decision?.recommendation === 'LEAN'
        ? 'LEAN'
        : consensus;

  const badgeClass =
    String(badge)
      .toLowerCase();

  const statusText =
    live
      ? `● LIVE · ${match.status}`
      : final
        ? 'FINAL'
        : formatTime(match.date);

  const maxSets =
    Math.max(
      match.playerA.sets.length,
      match.playerB.sets.length,
      2
    );

  return `
    <article
      class="compact-match-card ${live ? 'live' : ''}"
      data-open-match="${match.id}">

      <div class="compact-head">

        <div>
          <span class="tour ${match.tour.toLowerCase()}">
            ${match.tour}
          </span>

          <strong>
            ${match.tournament}
          </strong>
        </div>

        <span class="compact-time">
          ${statusText}
        </span>

      </div>

      <div class="compact-player">

        ${flag(match.playerA)}

        <strong>
          ${match.playerA.name}
        </strong>

        <div class="compact-score">
          ${scoreCells(
            match.playerA,
            maxSets
          )}
        </div>

      </div>

      <div class="compact-player">

        ${flag(match.playerB)}

        <strong>
          ${match.playerB.name}
        </strong>

        <div class="compact-score">
          ${scoreCells(
            match.playerB,
            maxSets
          )}
        </div>

      </div>

      <div class="compact-footer">

        <span>
          ${match.surface || '—'}
        </span>

        <span>
          ${
            totals
              ? `${live ? 'PRE ' : ''}EXP ${totals.expectedGames.toFixed(2)}`
              : match.matchup?.status || 'WAIT'
          }
        </span>

        <strong class="${badgeClass}">
          ${badge}
        </strong>

        ${
          readiness?.status === 'READY'
            ? `<b>${readiness.score.toFixed(0)}%</b>`
            : ''
        }

        <i>›</i>

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

function rankingOdds(value) {
  const n =
    Number(value);

  if (!Number.isFinite(n)) {
    return '—';
  }

  return n > 0
    ? `+${n}`
    : `${n}`;
}

function rankingCard(
  item,
  position
) {
  const valueMarket =
    item.category !== 'READY';

  return `
    <article
      class="ranking-card ${item.category.toLowerCase()}"
      data-open-match="${item.id}">

      <div class="ranking-card-top">

        <div class="ranking-position">
          #${position}
        </div>

        <div class="ranking-event">
          <span>
            ${item.tour}
            · ${item.surface}
          </span>

          <strong>
            ${item.tournament}
          </strong>
        </div>

        <div class="ranking-badge ${item.category.toLowerCase()}">
          ${item.category}
        </div>

      </div>

      <div class="ranking-players">

        <strong>
          ${item.playerA}
        </strong>

        <span>vs</span>

        <strong>
          ${item.playerB}
        </strong>

      </div>

      ${
        valueMarket
          ? `
            <div class="ranking-market">

              <div>
                <span>PICK</span>
                <strong>
                  ${item.side}
                  ${Number(item.line).toFixed(1)}
                </strong>
              </div>

              <div>
                <span>MODEL</span>
                <strong>
                  ${item.probabilityPct.toFixed(1)}%
                </strong>
              </div>

              <div>
                <span>EDGE</span>
                <strong>
                  +${item.edgePct.toFixed(1)} pp
                </strong>
              </div>

              <div>
                <span>EDGE AJ.</span>
                <strong>
                  +${item.adjustedEdgePct.toFixed(1)} pp
                </strong>
              </div>

            </div>

            <div class="ranking-details">

              <span>
                FAIR
                <strong>
                  ${rankingOdds(item.fairOdds)}
                </strong>
              </span>

              <span>
                READINESS
                <strong>
                  ${item.readiness.toFixed(1)}%
                </strong>
              </span>

              <span>
                QUALITY
                <strong>
                  ${item.quality.toFixed(1)}%
                </strong>
              </span>

              <span>
                DISAG
                <strong>
                  ${item.disagreement.toFixed(1)} pp
                </strong>
              </span>

            </div>

            <div class="ranking-source">
              MARKET · ${item.provider}
            </div>
          `
          : `
            <div class="ranking-waiting">

              <strong>
                ${
                  item.hasMarket
                    ? 'MODEL READY · NO EDGE'
                    : 'MODEL READY'
                }
              </strong>

              <span>
                ${
                  item.hasMarket
                    ? `Mercado analizado · ${item.provider} · Readiness ${item.readiness.toFixed(1)}%`
                    : `Readiness ${item.readiness.toFixed(1)}% · esperando línea O/U`
                }
              </span>

            </div>

            <div class="ranking-details">

              <span>
                QUALITY
                <strong>
                  ${item.quality.toFixed(1)}%
                </strong>
              </span>

              <span>
                DISAG
                <strong>
                  ${item.disagreement.toFixed(1)} pp
                </strong>
              </span>

              <span>
                CONSENSUS
                <strong>
                  ${item.consensus}
                </strong>
              </span>

            </div>
          `
      }

    </article>
  `;
}

function renderRanking() {
  const ranking =
    buildRanking(
      matches
    );

  const list =
    document.querySelector(
      '#rankingList'
    );

  const play =
    document.querySelector(
      '#rankingPlay'
    );

  const lean =
    document.querySelector(
      '#rankingLean'
    );

  const ready =
    document.querySelector(
      '#rankingReady'
    );

  if (
    !list ||
    !play ||
    !lean ||
    !ready
  ) {
    return;
  }

  play.textContent =
    ranking.counts.play;

  lean.textContent =
    ranking.counts.lean;

  ready.textContent =
    ranking.counts.ready;

  if (!ranking.items.length) {
    list.innerHTML = `
      <div class="ranking-empty">

        <strong>
          Sin candidatos todavía
        </strong>

        <span>
          PLAY / LEAN aparecerán aquí
          cuando exista edge válido.
        </span>

      </div>
    `;

    return;
  }

  list.innerHTML =
    ranking.items
      .map(
        (item, index) =>
          rankingCard(
            item,
            index + 1
          )
      )
      .join('');
}


function censoDate(value) {
  if (!value) {
    return '—';
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return '—';
  }

  return new Intl.DateTimeFormat(
    'es-MX',
    {
      day: '2-digit',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit'
    }
  ).format(date);
}

function censoCard(entry) {
  const status =
    entry.result?.status ||
    'PENDING';

  const statusClass =
    status.toLowerCase();

  return `
    <article class="censo-card ${statusClass}">

      <div class="censo-card-head">

        <div>
          <span>
            ${entry.tour}
            · ${entry.surface}
          </span>

          <strong>
            ${entry.tournament}
          </strong>
        </div>

        <b class="censo-result ${statusClass}">
          ${status}
        </b>

      </div>

      <div class="censo-players">
        <strong>
          ${entry.playerA}
        </strong>

        <span>vs</span>

        <strong>
          ${entry.playerB}
        </strong>
      </div>

      <div class="censo-pick">

        <div>
          <span>PICK</span>
          <strong>
            ${entry.side}
            ${Number(entry.line).toFixed(1)}
          </strong>
        </div>

        <div>
          <span>ODDS</span>
          <strong>
            ${marketOddsText(entry.odds)}
          </strong>
        </div>

        <div>
          <span>MODEL</span>
          <strong>
            ${Number(entry.modelPct).toFixed(1)}%
          </strong>
        </div>

        <div>
          <span>EDGE</span>
          <strong>
            ${Number(entry.edgePct) >= 0 ? '+' : ''}
            ${Number(entry.edgePct).toFixed(1)} pp
          </strong>
        </div>

      </div>

      <div class="censo-details">

        <span>
          ${entry.recommendation}
        </span>

        <span>
          READINESS
          <strong>
            ${Number(entry.readiness).toFixed(1)}%
          </strong>
        </span>

        <span>
          QUALITY
          <strong>
            ${Number(entry.quality).toFixed(1)}%
          </strong>
        </span>

        <span>
          DISAG
          <strong>
            ${Number(entry.disagreement).toFixed(1)} pp
          </strong>
        </span>

      </div>

      ${
        status !== 'PENDING'
          ? `
            <div class="censo-settlement">
              TOTAL FINAL
              <strong>
                ${
                  entry.result?.totalGames ??
                  '—'
                }
              </strong>

              ${
                entry.result?.note
                  ? `<span>${entry.result.note}</span>`
                  : ''
              }
            </div>
          `
          : `
            <div class="censo-settlement pending">
              Congelado
              ${censoDate(entry.capturedAt)}
              · esperando resultado
            </div>
          `
      }

    </article>
  `;
}

function renderCenso() {
  /*
   * Solo modifica registros PENDING
   * cuando ESPN ya presenta resultado final.
   */
  settleCensoFromMatches(
    matches
  );

  const entries =
    getCensoEntries();

  const list =
    document.querySelector(
      '#censoList'
    );

  if (!list) {
    return;
  }

  const wins =
    entries.filter(
      entry =>
        entry.result?.status ===
        'WIN'
    ).length;

  const losses =
    entries.filter(
      entry =>
        entry.result?.status ===
        'LOSS'
    ).length;

  const pending =
    entries.filter(
      entry =>
        entry.result?.status ===
        'PENDING'
    ).length;

  const review =
    entries.filter(
      entry =>
        entry.result?.status ===
        'REVIEW'
    ).length;

  document.querySelector(
    '#censoTotal'
  ).textContent =
    entries.length;

  document.querySelector(
    '#censoPending'
  ).textContent =
    pending;

  document.querySelector(
    '#censoRecord'
  ).textContent =
    `${wins}-${losses}`;

  document.querySelector(
    '#censoReview'
  ).textContent =
    review;

  if (!entries.length) {
    list.innerHTML = `
      <div class="censo-empty">
        <strong>
          Censo vacío
        </strong>

        <span>
          Registra un PLAY o LEAN
          desde el detalle del partido.
        </span>
      </div>
    `;

    return;
  }

  list.innerHTML =
    entries
      .map(censoCard)
      .join('');
}

function renderMatches() {
  renderRanking();
  renderCenso();

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

function renderTotalsEngineStart({
  eligible,
  cached,
  pending
}) {
  const badge =
    document.querySelector(
      '#totalsEngineBadge'
    );

  badge.className =
    'totals-engine-badge running';

  badge.textContent =
    pending > 0
      ? 'RUN'
      : 'READY';

  document.querySelector(
    '#totalsEngineTitle'
  ).textContent =
    pending > 0
      ? 'Ensamble procesando...'
      : 'Distribuciones en caché';

  document.querySelector(
    '#totalsReady'
  ).textContent =
    `${cached}/${eligible}`;

  document.querySelector(
    '#totalsQueue'
  ).textContent =
    pending;

  document.querySelector(
    '#totalsEngineProgress'
  ).textContent =
    pending > 0
      ? `Procesando ${pending} partidos FULL · 40K Markov + 40K Bayes + 20K Elo`
      : 'Todos los partidos elegibles ya calculados';
}

function renderTotalsProgress(
  completed,
  total,
  cached,
  eligible
) {
  document.querySelector(
    '#totalsReady'
  ).textContent =
    `${cached + completed}/${eligible}`;

  document.querySelector(
    '#totalsQueue'
  ).textContent =
    Math.max(
      0,
      total - completed
    );

  const pct =
    total
      ? (
          completed /
          total *
          100
        )
      : 100;

  document.querySelector(
    '#totalsEngineProgress'
  ).textContent =
    `Monte Carlo ${completed}/${total} · ${pct.toFixed(0)}% · UI disponible`;
}

function renderTotalsComplete(eligible) {
  const badge =
    document.querySelector(
      '#totalsEngineBadge'
    );

  badge.className =
    'totals-engine-badge ready';

  badge.textContent =
    'READY';

  document.querySelector(
    '#totalsEngineTitle'
  ).textContent =
    'Distribuciones calculadas';

  document.querySelector(
    '#totalsReady'
  ).textContent =
    `${eligible}/${eligible}`;

  document.querySelector(
    '#totalsQueue'
  ).textContent =
    '0';

  document.querySelector(
    '#totalsEngineProgress'
  ).textContent =
    `${eligible} partidos modelados · Ensemble · 3 modelos`;
}

function renderTotalsError(message) {
  const badge =
    document.querySelector(
      '#totalsEngineBadge'
    );

  badge.className =
    'totals-engine-badge error';

  badge.textContent =
    'ERROR';

  document.querySelector(
    '#totalsEngineTitle'
  ).textContent =
    'Totals Engine detenido';

  document.querySelector(
    '#totalsEngineProgress'
  ).textContent =
    message ||
    'Monte Carlo Worker Error';
}

function startTotalsEngine(
  snapshot,
  generation
) {
  if (totalsWorker) {
    totalsWorker.terminate();
    totalsWorker = null;
  }

  const eligible =
    snapshot.filter(
      match =>
        match.matchup?.markovReady &&
        match.state !== 'post'
    );

  let cached = 0;

  const pending = [];

  for (const match of eligible) {
    const key =
      totalsFingerprint(match);

    const saved =
      totalsCache.get(key);

    if (saved) {
      match.totals = saved;
      cached++;
    } else {
      pending.push(match);
    }
  }

  renderMatches();

  renderTotalsEngineStart({
    eligible:
      eligible.length,

    cached,

    pending:
      pending.length
  });

  if (pending.length === 0) {
    renderTotalsComplete(
      eligible.length
    );

    void startMarketEngine(
      snapshot,
      generation
    );

    return;
  }

  try {
    totalsWorker =
      new Worker(
        new URL(
          './workers/totals.worker.js',
          import.meta.url
        ),
        {
          type: 'module'
        }
      );

  } catch (error) {
    renderTotalsError(
      error?.message
    );

    return;
  }

  let renderedAt = 0;

  totalsWorker.onmessage =
    event => {

      const data =
        event.data || {};

      if (
        data.generation !==
        generation
      ) {
        return;
      }

      if (
        data.type === 'RESULT'
      ) {
        const match =
          matches.find(
            item =>
              String(item.id) ===
              String(data.matchId)
          );

        if (match) {
          match.totals =
            data.result;

          totalsCache.set(
            totalsFingerprint(match),
            data.result
          );
        }

        renderTotalsProgress(
          data.completed,
          data.total,
          cached,
          eligible.length
        );

        if (
          data.completed -
          renderedAt >= 4 ||
          data.completed ===
          data.total
        ) {
          renderedAt =
            data.completed;

          renderMatches();
        }
      }

      if (
        data.type ===
        'MATCH_ERROR'
      ) {
        console.warn(
          'Totals match error',
          data.matchId,
          data.error
        );

        renderTotalsProgress(
          data.completed,
          data.total,
          cached,
          eligible.length
        );
      }

      if (
        data.type ===
        'COMPLETE'
      ) {
        renderMatches();

        renderTotalsComplete(
          eligible.length
        );

        if (totalsWorker) {
          totalsWorker.terminate();
          totalsWorker = null;
        }

        void startMarketEngine(
          matches,
          generation
        );
      }
    };

  totalsWorker.onerror =
    error => {
      renderTotalsError(
        error?.message ||
        'Worker failure'
      );
    };

  totalsWorker.postMessage({
    type: 'RUN',

    generation,

    simulations:
      TOTALS_SIMULATIONS,

    matches:
      pending
  });
}

async function startMarketEngine(
  snapshot,
  generation
) {
  const candidates =
    snapshot.filter(
      match =>
        match.state === 'pre' &&
        match.matchup?.markovReady &&
        match.totals &&
        match.totals
          ?.diagnostics
          ?.consensusStatus ===
          'STABLE'
    );

  if (!candidates.length) {
    return;
  }

  for (
    const match
    of candidates
  ) {
    match.marketLoading = true;
    match.marketChecked = false;
    match.marketDecision = null;
  }

  renderMatches();

  /*
   * Máximo cuatro requests
   * simultáneos contra ESPN.
   */
  let cursor = 0;

  async function runner() {
    while (
      cursor <
      candidates.length
    ) {
      const index =
        cursor++;

      const match =
        candidates[index];

      try {
        const manual =
          manualMarketFor(
            match
          );

        if (manual) {
          match.markets =
            [manual];

          match.marketDecision =
            evaluateMarket(
              match,
              manual
            );

          match.marketLoading =
            false;

          match.marketChecked =
            true;

          renderMatches();

          continue;
        }

        const markets =
          await getMatchMarkets(
            match
          );

        if (
          generation !==
          statsGeneration
        ) {
          return;
        }

        /*
         * Preferimos un mercado
         * con precios para ambos lados.
         */
        const preferred =
          markets.find(
            market =>
              market.overOdds !== null &&
              market.underOdds !== null
          ) ||
          markets[0] ||
          null;

        match.markets =
          markets;

        match.marketDecision =
          preferred
            ? evaluateMarket(
                match,
                preferred
              )
            : null;

      } catch (error) {
        console.warn(
          'Market Engine',
          match.id,
          error
        );

        match.marketDecision =
          null;

      } finally {
        match.marketLoading =
          false;

        match.marketChecked =
          true;
      }

      if (
        generation !==
        statsGeneration
      ) {
        return;
      }

      renderMatches();
    }
  }

  const workers =
    Math.min(
      4,
      candidates.length
    );

  await Promise.all(
    Array.from(
      {
        length: workers
      },
      () => runner()
    )
  );

  if (
    generation ===
    statsGeneration
  ) {
    renderMatches();
  }
}

function renderMatchupLoading() {
  const badge =
    document.querySelector(
      '#matchupEngineBadge'
    );

  badge.className =
    'matchup-engine-badge loading';

  badge.textContent =
    'WAIT';

  document.querySelector(
    '#matchupEngineTitle'
  ).textContent =
    'Calculando cruces y baselines...';
}

function renderMatchupData(summary) {
  const badge =
    document.querySelector(
      '#matchupEngineBadge'
    );

  const pct =
    summary.total
      ? (
          summary.markovReady /
          summary.total *
          100
        )
      : 0;

  badge.className =
    `matchup-engine-badge ${
      pct >= 50
        ? 'good'
        : 'partial'
    }`;

  badge.textContent =
    `${pct.toFixed(1)}%`;

  document.querySelector(
    '#matchupEngineTitle'
  ).textContent =
    'Cross-matchup calculado';

  document.querySelector(
    '#matchupFull'
  ).textContent =
    summary.full;

  document.querySelector(
    '#matchupPartial'
  ).textContent =
    summary.partial;

  document.querySelector(
    '#matchupNone'
  ).textContent =
    summary.noData;

  document.querySelector(
    '#matchupReady'
  ).textContent =
    summary.markovReady;

  const atpHard =
    summary.atp?.hard;

  const wtaHard =
    summary.wta?.hard;

  const pctText = value =>
    value === null ||
    value === undefined
      ? '—'
      : `${(value * 100).toFixed(1)}%`;

  document.querySelector(
    '#matchupEngineDetail'
  ).innerHTML = `
    <span>
      ATP HARD:
      SPW <strong>${pctText(atpHard?.spw)}</strong>
      · HOLD <strong>${pctText(atpHard?.hold)}</strong>
    </span>

    <span>
      WTA HARD:
      SPW <strong>${pctText(wtaHard?.spw)}</strong>
      · HOLD <strong>${pctText(wtaHard?.hold)}</strong>
    </span>

    ${
      summary.pointInTime
        ? `
          <span>
            POINT-IN-TIME
            <strong>STRICT</strong>
            · ATP ${summary.atp?.cutoffKey || '—'}
            · WTA ${summary.wta?.cutoffKey || '—'}
          </span>
        `
        : ''
    }

    <span>
      DATA TRUST:
      HIGH <strong>${summary.trustHigh || 0}</strong>
      · MED <strong>${summary.trustMedium || 0}</strong>
      · CAUTION <strong>${summary.trustCaution || 0}</strong>
      · SHADOW <strong>${summary.shadowEligible || 0}</strong>
    </span>
  `;
}

function renderMatchupError(error) {
  const badge =
    document.querySelector(
      '#matchupEngineBadge'
    );

  badge.className =
    'matchup-engine-badge low';

  badge.textContent =
    'ERROR';

  document.querySelector(
    '#matchupEngineTitle'
  ).textContent =
    'Matchup Engine detenido';

  document.querySelector(
    '#matchupEngineDetail'
  ).textContent =
    error?.message ||
    'Matchup Engine Error';
}

function renderPlayerDataLoading() {
  const badge =
    document.querySelector('#playerDataBadge');

  badge.className =
    'player-data-badge loading';

  badge.textContent =
    'LOAD';

  document.querySelector(
    '#playerDataTitle'
  ).textContent =
    'Cargando ATP/WTA históricos...';
}

function renderPlayerData(coverage) {
  const badge =
    document.querySelector(
      '#playerDataBadge'
    );

  const pct =
    Number(
      coverage.percentage ||
      0
    );

  const quality =
    pct >= 88
      ? 'good'
      : pct >= 70
        ? 'partial'
        : 'low';

  badge.className =
    `player-data-badge ${quality}`;

  badge.textContent =
    `${pct.toFixed(1)}%`;

  document.querySelector(
    '#playerDataTitle'
  ).textContent =
    coverage.pointInTime
      ? 'Coverage + Identity point-in-time'
      : 'Coverage + Identity';

  document.querySelector(
    '#playerCoverage'
  ).textContent =
    `${pct.toFixed(1)}%`;

  document.querySelector(
    '#playerProfiles'
  ).textContent =
    `${coverage.foundPlayers}/${coverage.totalPlayers}`;

  document.querySelector(
    '#surfaceCoverage'
  ).textContent =
    `${coverage.surfaceResolvedMatches}/${coverage.totalMatches}`;

  document.querySelector(
    '#historyRows'
  ).textContent =
    (
      Number(
        coverage.atpRows ||
        0
      ) +
      Number(
        coverage.wtaRows ||
        0
      )
    ).toLocaleString();

  const resolvedByAlias =
    Number(
      coverage.identityAlias ||
      0
    ) +
    Number(
      coverage.identityFuzzy ||
      0
    );

  const unresolved =
    Number(
      coverage.identityUnresolved ||
      0
    ) +
    Number(
      coverage.identityAmbiguous ||
      0
    );

  const extendedRows =
    Number(
      coverage.atpExtendedRows ||
      0
    ) +
    Number(
      coverage.wtaExtendedRows ||
      0
    );

  const coreRows =
    Number(
      coverage.atpCoreRows ||
      0
    ) +
    Number(
      coverage.wtaCoreRows ||
      0
    );

  document.querySelector(
    '#playerDataDetail'
  ).innerHTML = `
    <span>
      Ambos perfiles:
      <strong>${coverage.bothProfiles}</strong>
    </span>

    <span>
      Uno:
      <strong>${coverage.oneProfile}</strong>
    </span>

    <span>
      Sin perfil:
      <strong>${coverage.noProfiles}</strong>
    </span>

    <span>
      ID:
      exact <strong>${coverage.identityExact || 0}</strong>
      · alias/fuzzy <strong>${resolvedByAlias}</strong>
      · miss <strong>${unresolved}</strong>
    </span>

    <span>
      Model-ready players:
      <strong>${coverage.modelReadyPlayers || 0}/${coverage.totalPlayers}</strong>
    </span>

    <span>
      Perfiles con soporte EXT:
      <strong>${coverage.extendedSupportedProfiles || 0}</strong>
    </span>

    <span>
      Históricos:
      CORE <strong>${coreRows.toLocaleString()}</strong>
      · EXT <strong>${extendedRows.toLocaleString()}</strong>
    </span>

    <span>
      Base IDs:
      ATP ${coverage.atpPlayers}
      · WTA ${coverage.wtaPlayers}
    </span>

    ${
      coverage.pointInTime
        ? `
          <span>
            PIT:
            <strong>ACTIVO</strong>
            · cutoff ${coverage.cutoffs?.join(', ') || '—'}
            · mismo día excluido
          </span>
        `
        : ''
    }
  `;
}

function renderPlayerDataError(error) {
  const badge =
    document.querySelector('#playerDataBadge');

  badge.className =
    'player-data-badge low';

  badge.textContent =
    'ERROR';

  document.querySelector(
    '#playerDataTitle'
  ).textContent =
    'No se pudieron cargar históricos';

  document.querySelector(
    '#playerDataDetail'
  ).textContent =
    error?.message || 'Historical Data Error';
}

async function loadPlayerStats(
  snapshot,
  generation
) {
  renderPlayerDataLoading();
  renderMatchupLoading();

  try {
    const statsResult =
      await enrichMatchesWithStats(
        snapshot
      );

    const matchupResult =
      await enrichMatchesWithMatchup(
        statsResult.matches
      );

    if (
      generation !==
      statsGeneration
    ) {
      return;
    }

    matches =
      matchupResult.matches;

    renderMatches();

    renderPlayerData(
      statsResult.coverage
    );

    renderMatchupData(
      matchupResult.summary
    );

    startTotalsEngine(
      matches,
      generation
    );

  } catch (error) {

    if (
      generation !==
      statsGeneration
    ) {
      return;
    }

    renderPlayerDataError(
      error
    );

    renderMatchupError(
      error
    );
  }
}

function setConnection(mode, text) {
  const dot = document.querySelector('#connectionDot');
  const label = document.querySelector('#connectionText');

  dot.className = `dot ${mode}`;
  label.textContent = text;
}

document.addEventListener(
  'click',
  event => {

    const button =
      event.target.closest(
        '[data-manual-apply]'
      );

    if (!button) {
      return;
    }

    const matchId =
      button.getAttribute(
        'data-manual-apply'
      );

    const match =
      matches.find(
        item =>
          String(item.id) ===
          String(matchId)
      );

    if (!match) {
      return;
    }

    const container =
      button.closest(
        '.manual-market'
      );

    const line =
      Number(
        container
          ?.querySelector(
            '[data-manual-line]'
          )
          ?.value
      );

    const overOdds =
      Number(
        container
          ?.querySelector(
            '[data-manual-over]'
          )
          ?.value
      );

    const underOdds =
      Number(
        container
          ?.querySelector(
            '[data-manual-under]'
          )
          ?.value
      );

    if (
      !Number.isFinite(line) ||
      line < 10.5 ||
      line > 60.5
    ) {
      alert(
        'Línea O/U inválida'
      );

      return;
    }

    const market = {
      provider:
        'MANUAL',

      source:
        'MANUAL',

      line,

      overOdds:
        Number.isFinite(overOdds) &&
        overOdds !== 0
          ? overOdds
          : null,

      underOdds:
        Number.isFinite(underOdds) &&
        underOdds !== 0
          ? underOdds
          : null
    };

    setManualMarket(
      match,
      market
    );

    renderMatches();

    if (
      selectedMatchId ===
      String(match.id)
    ) {
      openMatchDetail(
        match.id
      );
    }
  }
);

document.addEventListener(
  'click',
  event => {

    const button =
      event.target.closest(
        '[data-censo-capture]'
      );

    if (!button) {
      return;
    }

    const matchId =
      button.getAttribute(
        'data-censo-capture'
      );

    const match =
      matches.find(
        item =>
          String(item.id) ===
          String(matchId)
      );

    if (!match) {
      return;
    }

    const result =
      captureCenso(
        match
      );

    if (!result.ok) {
      if (
        result.reason ===
        'ALREADY_CAPTURED'
      ) {
        alert(
          'Este partido ya está congelado en el Censo.'
        );
      } else {
        alert(
          'Este partido todavía no puede registrarse en el Censo.'
        );
      }

      return;
    }

    renderMatches();

    if (
      selectedMatchId ===
      String(match.id)
    ) {
      openMatchDetail(
        match.id
      );
    }
  }
);


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

    const statsToken =
      ++statsGeneration;

    renderMetrics();
    renderMatches();
    renderDataHealth(result.health);

    /*
     * Liquidación histórica:
     * corre en segundo plano y
     * NO bloquea la interfaz.
     */
    void backfillPendingCenso()
      .then(summary => {

        if (
          summary.changed > 0
        ) {
          renderCenso();
        }

        if (
          summary.errors?.length
        ) {
          console.warn(
            'Censo Backfill partial',
            summary.errors
          );
        }
      })
      .catch(error => {
        console.warn(
          'Censo Backfill failure',
          error
        );
      });

    void loadPlayerStats(
      result.matches,
      statsToken
    );

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


let selectedMatchId = null;

function openMatchDetail(matchId) {
  const match =
    matches.find(
      item =>
        String(item.id) ===
        String(matchId)
    );

  if (!match) {
    return;
  }

  selectedMatchId =
    String(match.id);

  const overlay =
    document.querySelector(
      '#matchDetailOverlay'
    );

  const content =
    document.querySelector(
      '#matchDetailContent'
    );

  const title =
    document.querySelector(
      '#matchDetailTitle'
    );

  title.textContent =
    `${match.playerA.name} vs ${match.playerB.name}`;

  content.innerHTML =
    matchDetailContent(match);

  overlay.classList.remove(
    'hidden'
  );

  document.body.classList.add(
    'detail-open'
  );

  overlay.scrollTop = 0;
}

function closeMatchDetail() {
  selectedMatchId = null;

  document
    .querySelector(
      '#matchDetailOverlay'
    )
    ?.classList.add(
      'hidden'
    );

  document.body.classList.remove(
    'detail-open'
  );
}

document.addEventListener(
  'click',
  event => {

    const opener =
      event.target.closest(
        '[data-open-match]'
      );

    if (opener) {
      openMatchDetail(
        opener.getAttribute(
          'data-open-match'
        )
      );

      return;
    }

    if (
      event.target.closest(
        '[data-close-detail]'
      )
    ) {
      closeMatchDetail();
    }
  }
);

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
