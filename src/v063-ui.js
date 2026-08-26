import {
  getMarketDiagnostic
} from './data/espnOdds.js';

const MANUAL_KEY =
  'tennis_totals_lab_manual_markets_v1';

let selectedMatchId =
  null;

let scheduled =
  false;

function readManualMarkets() {
  try {
    return JSON.parse(
      localStorage.getItem(
        MANUAL_KEY
      ) || '{}'
    );
  } catch {
    return {};
  }
}

function writeManualMarkets(store) {
  localStorage.setItem(
    MANUAL_KEY,
    JSON.stringify(store)
  );
}

function finiteOrNull(value) {
  const text =
    String(
      value ?? ''
    ).trim();

  if (!text) {
    return null;
  }

  const n =
    Number(text);

  return Number.isFinite(n)
    ? n
    : null;
}

function validOdds(value) {
  if (value === null) {
    return true;
  }

  return (
    (
      value > 1 &&
      value < 20
    ) ||
    value <= -100 ||
    value >= 100
  );
}

function escapeAttr(value) {
  return String(
    value ?? ''
  )
    .replace(
      /&/g,
      '&amp;'
    )
    .replace(
      /"/g,
      '&quot;'
    )
    .replace(
      /</g,
      '&lt;'
    )
    .replace(
      />/g,
      '&gt;'
    );
}

function ensureStyles() {
  if (
    document.querySelector(
      '#v063AuditStyles'
    )
  ) {
    return;
  }

  const style =
    document.createElement(
      'style'
    );

  style.id =
    'v063AuditStyles';

  style.textContent = `
    .v063-market-diagnostic {
      padding: 12px 20px 0;
      font-size: 12px;
      opacity: .78;
      line-height: 1.45;
    }

    .v063-manual-actions {
      display: flex;
      gap: 10px;
      padding: 14px 20px 18px;
      border-top: 1px solid rgba(255,255,255,.07);
    }

    .v063-manual-actions button,
    .v063-manual-editor button {
      appearance: none;
      border: 1px solid rgba(103, 232, 168, .25);
      background: rgba(19, 74, 48, .45);
      color: #8df0b8;
      border-radius: 10px;
      padding: 10px 12px;
      font-weight: 800;
      font-size: 11px;
    }

    .v063-manual-actions button[data-v063-delete] {
      color: #efaa94;
      border-color: rgba(239, 170, 148, .22);
      background: rgba(95, 35, 25, .28);
    }

    .v063-manual-editor {
      margin: 0 20px 18px;
      padding: 14px;
      border: 1px solid rgba(103, 232, 168, .18);
      border-radius: 12px;
      background: rgba(4, 19, 12, .72);
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
    }

    .v063-manual-editor label {
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-size: 10px;
      opacity: .9;
    }

    .v063-manual-editor input {
      width: 100%;
      box-sizing: border-box;
      border: 1px solid rgba(255,255,255,.12);
      background: #0b1b13;
      color: #f2f7f4;
      border-radius: 9px;
      padding: 10px;
      font-size: 14px;
    }

    .v063-manual-editor button {
      grid-column: 1 / -1;
    }
  `;

  document.head.appendChild(
    style
  );
}

function patchDiagnostic() {
  if (!selectedMatchId) {
    return;
  }

  const overlay =
    document.querySelector(
      '#matchDetailOverlay'
    );

  if (
    !overlay ||
    overlay.classList.contains(
      'hidden'
    )
  ) {
    return;
  }

  const status =
    overlay.querySelector(
      '.market-status.no-market'
    );

  if (!status) {
    return;
  }

  const diagnostic =
    getMarketDiagnostic(
      selectedMatchId
    );

  if (!diagnostic) {
    return;
  }

  if (
    diagnostic.status ===
    'ODDS_ERROR'
  ) {
    status.textContent =
      'ODDS ERROR';
  } else if (
    diagnostic.status ===
    'PARSE_ERROR'
  ) {
    status.textContent =
      'PARSE ERROR';
  } else if (
    diagnostic.status ===
    'NO_MARKET'
  ) {
    status.textContent =
      'NO MARKET';
  }

  const box =
    status.closest(
      '.market-box'
    );

  if (!box) {
    return;
  }

  let note =
    box.querySelector(
      '.v063-market-diagnostic'
    );

  if (!note) {
    note =
      document.createElement(
        'div'
      );

    note.className =
      'v063-market-diagnostic';

    box.appendChild(
      note
    );
  }

  note.textContent =
    `AUDIT · ${diagnostic.message}`;
}

function patchManualActions() {
  if (!selectedMatchId) {
    return;
  }

  const overlay =
    document.querySelector(
      '#matchDetailOverlay'
    );

  if (
    !overlay ||
    overlay.classList.contains(
      'hidden'
    )
  ) {
    return;
  }

  const manual =
    readManualMarkets()[
      String(
        selectedMatchId
      )
    ];

  if (!manual) {
    return;
  }

  const boxes =
    [
      ...overlay.querySelectorAll(
        '.market-box'
      )
    ];

  const box =
    boxes.find(item =>
      item.querySelector(
        '.market-box-head span'
      )?.textContent
        ?.toUpperCase()
        .includes(
          'MANUAL'
        )
    );

  if (
    !box ||
    box.querySelector(
      '.v063-manual-actions'
    )
  ) {
    return;
  }

  const actions =
    document.createElement(
      'div'
    );

  actions.className =
    'v063-manual-actions';

  actions.innerHTML = `
    <button
      type="button"
      data-v063-edit>
      EDITAR MERCADO
    </button>

    <button
      type="button"
      data-v063-delete>
      BORRAR MANUAL
    </button>
  `;

  box.appendChild(
    actions
  );
}

function patch() {
  scheduled =
    false;

  ensureStyles();
  patchDiagnostic();
  patchManualActions();
}

function schedulePatch() {
  if (scheduled) {
    return;
  }

  scheduled =
    true;

  requestAnimationFrame(
    patch
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
      selectedMatchId =
        opener.getAttribute(
          'data-open-match'
        );

      schedulePatch();
      return;
    }

    if (
      event.target.closest(
        '[data-close-detail]'
      )
    ) {
      selectedMatchId =
        null;

      return;
    }

    const edit =
      event.target.closest(
        '[data-v063-edit]'
      );

    if (edit) {
      const store =
        readManualMarkets();

      const market =
        store[
          String(
            selectedMatchId
          )
        ];

      if (!market) {
        return;
      }

      const box =
        edit.closest(
          '.market-box'
        );

      if (
        !box ||
        box.querySelector(
          '.v063-manual-editor'
        )
      ) {
        return;
      }

      const editor =
        document.createElement(
          'div'
        );

      editor.className =
        'v063-manual-editor';

      editor.innerHTML = `
        <label>
          LINE
          <input
            data-v063-line
            inputmode="decimal"
            type="number"
            step="0.5"
            value="${escapeAttr(market.line)}"
          />
        </label>

        <label>
          OVER
          <input
            data-v063-over
            inputmode="decimal"
            type="number"
            step="0.01"
            value="${escapeAttr(market.overOdds ?? '')}"
          />
        </label>

        <label>
          UNDER
          <input
            data-v063-under
            inputmode="decimal"
            type="number"
            step="0.01"
            value="${escapeAttr(market.underOdds ?? '')}"
          />
        </label>

        <button
          type="button"
          data-v063-save>
          GUARDAR Y RECALCULAR
        </button>
      `;

      box.appendChild(
        editor
      );

      return;
    }

    const remove =
      event.target.closest(
        '[data-v063-delete]'
      );

    if (remove) {
      if (!selectedMatchId) {
        return;
      }

      const store =
        readManualMarkets();

      delete store[
        String(
          selectedMatchId
        )
      ];

      writeManualMarkets(
        store
      );

      location.reload();
      return;
    }

    const save =
      event.target.closest(
        '[data-v063-save]'
      );

    if (save) {
      if (!selectedMatchId) {
        return;
      }

      const editor =
        save.closest(
          '.v063-manual-editor'
        );

      const line =
        finiteOrNull(
          editor?.querySelector(
            '[data-v063-line]'
          )?.value
        );

      const overOdds =
        finiteOrNull(
          editor?.querySelector(
            '[data-v063-over]'
          )?.value
        );

      const underOdds =
        finiteOrNull(
          editor?.querySelector(
            '[data-v063-under]'
          )?.value
        );

      if (
        line === null ||
        line < 10.5 ||
        line > 60.5
      ) {
        alert(
          'Línea O/U inválida.'
        );

        return;
      }

      if (
        !validOdds(overOdds) ||
        !validOdds(underOdds)
      ) {
        alert(
          'Momio inválido. Usa decimal (ej. 1.80) o americano (ej. -110 / +105).'
        );

        return;
      }

      if (
        overOdds === null &&
        underOdds === null
      ) {
        alert(
          'Captura al menos un precio.'
        );

        return;
      }

      const store =
        readManualMarkets();

      store[
        String(
          selectedMatchId
        )
      ] = {
        provider:
          'MANUAL',

        source:
          'MANUAL',

        line,
        overOdds,
        underOdds
      };

      writeManualMarkets(
        store
      );

      location.reload();
    }
  },
  true
);

new MutationObserver(
  schedulePatch
).observe(
  document.documentElement,
  {
    childList: true,
    subtree: true
  }
);

if (
  document.readyState ===
  'loading'
) {
  document.addEventListener(
    'DOMContentLoaded',
    schedulePatch,
    {
      once: true
    }
  );
} else {
  schedulePatch();
}

