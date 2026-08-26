import {
  summarizeMatchLength
} from './engine/matchLength.js';

function ensurePanel() {
  let panel =
    document.querySelector(
      '#matchLengthAuditPanel'
    );

  if (panel) {
    return panel;
  }

  const direction =
    document.querySelector(
      '#directionBiasPanel'
    );

  const totals =
    document.querySelector(
      '#totalsEnginePanel'
    );

  const anchor =
    direction ||
    totals;

  if (!anchor) {
    return null;
  }

  anchor.insertAdjacentHTML(
    'afterend',
    `
      <section
        id="matchLengthAuditPanel"
        class="match-length-global wait">

        <div class="match-length-global-head">
          <div>
            <span>MATCH LENGTH AUDIT</span>
            <strong>Esperando distribuciones...</strong>
          </div>

          <b id="matchLengthGlobalBadge">
            WAIT
          </b>
        </div>

        <div class="match-length-global-grid">
          <div>
            <span>MODELED</span>
            <strong id="mlModeled">0</strong>
          </div>

          <div>
            <span>EXPECTED RANGE</span>
            <strong id="mlExpectedRange">—</strong>
          </div>

          <div>
            <span>DECIDING RANGE</span>
            <strong id="mlDecidingRange">—</strong>
          </div>

          <div>
            <span>FAIR RANGE</span>
            <strong id="mlFairRange">—</strong>
          </div>
        </div>

        <div class="match-length-global-foot">
          <span>
            47.5–50% DECIDING
            <strong id="mlFlatPct">—</strong>
          </span>

          <span>
            COMPRESSION
            <strong id="mlCompression">0</strong>
          </span>

          <span>
            AVG DECIDING
            <strong id="mlAvgDeciding">—</strong>
          </span>
        </div>
      </section>
    `
  );

  return document.querySelector(
    '#matchLengthAuditPanel'
  );
}

export function renderMatchLengthAudit(
  matches
) {
  const panel =
    ensurePanel();

  if (!panel) {
    return;
  }

  const audit =
    summarizeMatchLength(
      matches
    );

  const set = (
    selector,
    value
  ) => {
    const el =
      panel.querySelector(
        selector
      );

    if (el) {
      el.textContent =
        String(value);
    }
  };

  set(
    '#mlModeled',
    audit.n
  );

  set(
    '#mlExpectedRange',
    audit.expectedRange === null
      ? '—'
      : `${audit.expectedMin.toFixed(2)}–${audit.expectedMax.toFixed(2)} · Δ${audit.expectedRange.toFixed(2)}`
  );

  set(
    '#mlDecidingRange',
    audit.decidingMin === null
      ? '—'
      : `${audit.decidingMin.toFixed(1)}–${audit.decidingMax.toFixed(1)}%`
  );

  set(
    '#mlFairRange',
    audit.fairMin === null
      ? '—'
      : `${audit.fairMin.toFixed(1)}–${audit.fairMax.toFixed(1)}`
  );

  set(
    '#mlFlatPct',
    audit.n
      ? `${audit.flatDecidingPct.toFixed(1)}%`
      : '—'
  );

  set(
    '#mlCompression',
    audit.compressionCount
  );

  set(
    '#mlAvgDeciding',
    audit.avgDeciding === null
      ? '—'
      : `${audit.avgDeciding.toFixed(1)}%`
  );

  panel.className =
    `match-length-global ${audit.status.toLowerCase()}`;

  const badge =
    panel.querySelector(
      '#matchLengthGlobalBadge'
    );

  if (badge) {
    badge.textContent =
      audit.status;
  }

  const title =
    panel.querySelector(
      '.match-length-global-head strong'
    );

  if (title) {
    title.textContent =
      audit.status === 'AUDIT'
        ? 'Compresión de longitud detectada'
        : audit.status === 'WATCH'
          ? 'Dispersión todavía estrecha'
          : audit.status === 'OK'
            ? 'Longitud diferenciada por partido'
            : audit.status === 'EARLY'
              ? 'Muestra temprana'
              : 'Esperando distribuciones...';
  }
}

