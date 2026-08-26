import {
  summarizeDirectionBias
} from './engine/directionBias.js';

function ensurePanel() {
  let panel =
    document.querySelector(
      '#directionBiasPanel'
    );

  if (panel) {
    return panel;
  }

  const totals =
    document.querySelector(
      '#totalsEnginePanel'
    );

  if (!totals) {
    return null;
  }

  totals.insertAdjacentHTML(
    'afterend',
    `
      <section
        id="directionBiasPanel"
        class="direction-bias-panel waiting">

        <div class="direction-bias-head">
          <div>
            <span>DIRECTION BIAS AUDIT</span>
            <strong>Esperando mercados...</strong>
          </div>

          <b id="directionBiasBadge">WAIT</b>
        </div>

        <div class="direction-bias-metrics">
          <div>
            <span>ANALYZED</span>
            <strong id="biasAnalyzed">0</strong>
          </div>

          <div>
            <span>OVER</span>
            <strong id="biasOver">0</strong>
          </div>

          <div>
            <span>UNDER</span>
            <strong id="biasUnder">0</strong>
          </div>

          <div>
            <span>AVG Δ</span>
            <strong id="biasGap">—</strong>
          </div>
        </div>

        <div
          id="directionBiasDetail"
          class="direction-bias-detail">
        </div>
      </section>
    `
  );

  return document.querySelector(
    '#directionBiasPanel'
  );
}

export function renderDirectionAudit(
  matches
) {
  const panel =
    ensurePanel();

  if (!panel) {
    return;
  }

  const audit =
    summarizeDirectionBias(
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

  set('#biasAnalyzed', audit.n);

  set(
    '#biasOver',
    `${audit.over} · ${audit.overPct.toFixed(0)}%`
  );

  set(
    '#biasUnder',
    `${audit.under} · ${audit.underPct.toFixed(0)}%`
  );

  set(
    '#biasGap',
    audit.avgExpectedMinusLine === null
      ? '—'
      : `${
          audit.avgExpectedMinusLine >= 0
            ? '+'
            : ''
        }${audit.avgExpectedMinusLine.toFixed(2)}`
  );

  panel.className =
    `direction-bias-panel ${
      audit.status.toLowerCase()
    }`;

  const badge =
    panel.querySelector(
      '#directionBiasBadge'
    );

  if (badge) {
    badge.textContent =
      audit.status === 'AUDIT'
        ? 'AUDIT'
        : audit.status === 'NORMAL'
          ? 'OK'
          : audit.status === 'EARLY_SAMPLE'
            ? 'EARLY'
            : 'WAIT';
  }

  const title =
    panel.querySelector(
      '.direction-bias-head strong'
    );

  if (title) {
    title.textContent =
      audit.status === 'AUDIT'
        ? 'Sesgo/compresión detectado'
        : audit.status === 'NORMAL'
          ? 'Dirección dentro de rango'
          : audit.status === 'EARLY_SAMPLE'
            ? 'Muestra temprana'
            : 'Esperando mercados...';
  }

  const detail =
    panel.querySelector(
      '#directionBiasDetail'
    );

  if (detail) {
    const range =
      audit.expectedRange === null
        ? '—'
        : audit.expectedRange.toFixed(2);

    detail.innerHTML = `
      <span>
        PLAY
        <strong>
          O ${audit.play.over}
          · U ${audit.play.under}
        </strong>
      </span>

      <span>
        LEAN
        <strong>
          O ${audit.lean.over}
          · U ${audit.lean.under}
        </strong>
      </span>

      <span>
        EXPECTED RANGE
        <strong>${range}</strong>
      </span>

      <span>
        GAP BLOCKS
        <strong>${audit.blocked}</strong>
      </span>

      ${
        audit.directionSkew
          ? `
            <em>
              DIRECTION SKEW:
              ≥80% hacia un mismo lado.
            </em>
          `
          : ''
      }

      ${
        audit.compression
          ? `
            <em>
              EXPECTED COMPRESSION:
              Expected Games demasiado agrupados.
            </em>
          `
          : ''
      }
    `;
  }
}

