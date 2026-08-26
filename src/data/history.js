import { CapacitorHttp } from '@capacitor/core';

const SOURCES = {
  ATP:
    'https://raw.githubusercontent.com/Aneeshers/tennis-sackmann-archive/main/atp',

  WTA:
    'https://raw.githubusercontent.com/Aneeshers/tennis-sackmann-archive/main/wta'
};

const coreCache =
  new Map();

const coverageCache =
  new Map();

export function normalizeName(
  value = ''
) {
  return String(value)
    .normalize('NFD')
    .replace(
      /[\u0300-\u036f]/g,
      ''
    )
    .toLowerCase()
    .replace(
      /[^a-z0-9]+/g,
      ' '
    )
    .trim()
    .replace(
      /\s+/g,
      ' '
    );
}

async function requestText(url) {
  try {
    const response =
      await CapacitorHttp.get({
        url,
        headers: {
          Accept:
            'text/plain,text/csv,*/*'
        }
      });

    if (
      response.status < 200 ||
      response.status >= 300
    ) {
      throw new Error(
        `Historical HTTP ${response.status}`
      );
    }

    if (
      typeof response.data ===
      'string'
    ) {
      return response.data;
    }

    throw new Error(
      'Respuesta histórica inválida'
    );

  } catch (nativeError) {
    const response =
      await fetch(url);

    if (!response.ok) {
      throw nativeError;
    }

    return response.text();
  }
}

function parseCsvLine(line) {
  const result = [];
  let value = '';
  let quoted = false;

  for (
    let i = 0;
    i < line.length;
    i++
  ) {
    const char =
      line[i];

    if (char === '"') {
      if (
        quoted &&
        line[i + 1] === '"'
      ) {
        value += '"';
        i++;
      } else {
        quoted =
          !quoted;
      }

      continue;
    }

    if (
      char === ',' &&
      !quoted
    ) {
      result.push(value);
      value = '';
      continue;
    }

    value += char;
  }

  result.push(value);

  return result;
}

function parseCSV(text) {
  const lines =
    text
      .replace(/\r/g, '')
      .split('\n')
      .filter(
        line =>
          line.trim()
      );

  if (!lines.length) {
    return [];
  }

  const headers =
    parseCsvLine(
      lines[0]
    );

  const rows = [];

  for (
    let i = 1;
    i < lines.length;
    i++
  ) {
    const values =
      parseCsvLine(
        lines[i]
      );

    const row = {};

    for (
      let j = 0;
      j < headers.length;
      j++
    ) {
      row[headers[j]] =
        values[j] ?? '';
    }

    rows.push(row);
  }

  return rows;
}

function prefixFor(tour) {
  return tour === 'ATP'
    ? 'atp'
    : 'wta';
}

function coreFileName(
  tour,
  year
) {
  const prefix =
    prefixFor(tour);

  return (
    `${prefix}_matches_${year}.csv`
  );
}

function extendedFileName(
  tour,
  year
) {
  const prefix =
    prefixFor(tour);

  return tour === 'ATP'
    ? `${prefix}_matches_qual_chall_${year}.csv`
    : `${prefix}_matches_qual_itf_${year}.csv`;
}

function annotateRows(
  rows,
  source
) {
  return rows.map(
    row => ({
      ...row,

      __historySource:
        source
    })
  );
}

async function loadFile(
  tour,
  year,
  kind
) {
  const source =
    SOURCES[tour];

  if (!source) {
    throw new Error(
      `Tour no soportado: ${tour}`
    );
  }

  const file =
    kind === 'EXTENDED'
      ? extendedFileName(
          tour,
          year
        )
      : coreFileName(
          tour,
          year
        );

  const url =
    `${source}/${file}`;

  const text =
    await requestText(url);

  return annotateRows(
    parseCSV(text),
    kind
  );
}

function rowKey(row) {
  return [
    row.tourney_id || '',
    row.tourney_date || '',
    row.match_num || '',
    row.round || '',
    normalizeName(
      row.winner_name
    ),
    normalizeName(
      row.loser_name
    )
  ].join('|');
}

function dedupeRows(rows) {
  const seen =
    new Set();

  const out = [];

  for (const row of rows) {
    const key =
      rowKey(row);

    if (
      seen.has(key)
    ) {
      continue;
    }

    seen.add(key);
    out.push(row);
  }

  return out;
}

/*
 * CORE:
 * sigue siendo la fuente de baselines
 * ATP/WTA y evita que Challenger/ITF
 * altere la referencia del tour principal.
 */
export async function loadTourHistory(
  tour,
  years = [2025, 2026]
) {
  const upper =
    String(tour)
      .toUpperCase();

  const key =
    `${upper}:${years.join('-')}`;

  if (
    coreCache.has(key)
  ) {
    return coreCache.get(
      key
    );
  }

  const promise =
    Promise.all(
      years.map(
        year =>
          loadFile(
            upper,
            year,
            'MAIN'
          )
      )
    )
      .then(
        groups =>
          dedupeRows(
            groups.flat()
          )
      );

  coreCache.set(
    key,
    promise
  );

  return promise;
}

/*
 * COVERAGE:
 * añade qual/challenger/125/ITF
 * únicamente como evidencia histórica
 * de jugador. Si la capa extendida falla,
 * nunca tumba la app: continúa con CORE.
 */
export async function loadTourCoverageHistory(
  tour,
  years = [2025, 2026]
) {
  const upper =
    String(tour)
      .toUpperCase();

  const key =
    `${upper}:${years.join('-')}`;

  if (
    coverageCache.has(key)
  ) {
    return coverageCache.get(
      key
    );
  }

  const promise =
    Promise.all([
      loadTourHistory(
        upper,
        years
      ),

      Promise.all(
        years.map(
          async year => {
            try {
              return await loadFile(
                upper,
                year,
                'EXTENDED'
              );

            } catch (error) {
              console.warn(
                'Historical coverage fallback',
                upper,
                year,
                error
              );

              return [];
            }
          }
        )
      )
        .then(
          groups =>
            groups.flat()
        )
    ])
      .then(
        ([
          core,
          extended
        ]) =>
          dedupeRows([
            /*
             * CORE primero:
             * si una fila está repetida,
             * conservamos la versión MAIN.
             */
            ...core,
            ...extended
          ])
      );

  coverageCache.set(
    key,
    promise
  );

  return promise;
}

