import './style.css';
import { getTodayMatches } from './data/espn.js';
import { enrichMatchesWithStats } from './engine/playerStats.js';
import { enrichMatchesWithMatchup } from './engine/matchup.js';
import { getMatchMarkets } from './data/espnOdds.js';
import { evaluateMarket } from './engine/market.js';

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


app.innerHTML = `
  <main class="shell">

    <header class="topbar">
      <div>
        <div class="eyebrow">DIRECT DATA ENGINE</div>
        <h1>Tennis Totals Lab</h1>
        <div class="version">ATP + WTA · v0.5.0</div>
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
    return `
      <div class="profile-line missing">
        <div class="profile-id">
          <strong>${player.shortName || player.name}</strong>
          <span>SIN PERFIL HISTÓRICO</span>
        </div>
      </div>
    `;
  }

  return `
    <div class="profile-line">

      <div class="profile-id">
        <strong>${player.shortName || player.name}</strong>
        <span>
          ${p.rank ? `#${p.rank} · ` : ''}
          ${p.sampleType}
          · n=${p.sample}
          · L10 ${p.last10Wins}-${p.last10Losses}
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
          <strong>80K ENS</strong>
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

        <div class="market-empty">
          ESPN no publicó total utilizable para este partido.
        </div>

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

      <div class="market-reason">
        ${
          m.reason === 'VALUE'
            ? 'VALOR DETECTADO · candidato para Ranking'
            : m.reason === 'NO_PRICE'
              ? 'LÍNEA DISPONIBLE · PRECIO NO DISPONIBLE'
              : 'SIN EDGE SUFICIENTE'
        }
      </div>

    </div>
  `;
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
      ? `Procesando ${pending} partidos FULL · 30K Markov + 30K Bayes + 20K Elo`
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
    document.querySelector('#playerDataBadge');

  const pct =
    Number(
      coverage.percentage || 0
    );

  const quality =
    pct >= 80
      ? 'good'
      : pct >= 60
        ? 'partial'
        : 'low';

  badge.className =
    `player-data-badge ${quality}`;

  badge.textContent =
    `${pct.toFixed(1)}%`;

  document.querySelector(
    '#playerDataTitle'
  ).textContent =
    'Perfiles estadísticos cargados';

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
      Number(coverage.atpRows || 0) +
      Number(coverage.wtaRows || 0)
    ).toLocaleString();

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
      Base:
      ATP ${coverage.atpPlayers}
      · WTA ${coverage.wtaPlayers}
    </span>
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
