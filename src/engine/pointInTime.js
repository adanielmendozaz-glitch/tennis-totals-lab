/*
 * Tennis Totals Lab
 * Point-In-Time Engine v0.6.4
 *
 * Regla:
 * una predicción con cutoff YYYYMMDD
 * solo puede utilizar filas con:
 *
 * historical_date < cutoff
 *
 * Por diseño se excluye TODO el mismo día
 * del partido. El histórico Sackmann no tiene
 * hora por encuentro, así evitamos conocer
 * accidentalmente resultados posteriores.
 */

function pad2(value) {
  return String(value)
    .padStart(2, '0');
}

export function localDateKey(
  date
) {
  if (
    !(date instanceof Date) ||
    Number.isNaN(
      date.getTime()
    )
  ) {
    return null;
  }

  return (
    `${date.getFullYear()}` +
    `${pad2(date.getMonth() + 1)}` +
    `${pad2(date.getDate())}`
  );
}

export function normalizeHistoricalDateKey(
  value
) {
  const text =
    String(value ?? '')
      .replace(/[^0-9]/g, '');

  if (text.length !== 8) {
    return null;
  }

  const year =
    Number(text.slice(0, 4));

  const month =
    Number(text.slice(4, 6));

  const day =
    Number(text.slice(6, 8));

  if (
    year < 1900 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }

  return text;
}

export function asOfDateKey(
  asOf
) {
  /*
   * ESPN ya normaliza el scoreboard
   * con la fecha LOCAL del dispositivo.
   * Conservamos exactamente esa convención.
   */
  if (
    typeof asOf === 'string' &&
    /^\d{8}$/.test(asOf)
  ) {
    return normalizeHistoricalDateKey(
      asOf
    );
  }

  const date =
    asOf instanceof Date
      ? asOf
      : new Date(asOf);

  return localDateKey(date);
}

export function isDateKeyBeforeAsOf(
  historicalDate,
  asOf
) {
  const rowKey =
    normalizeHistoricalDateKey(
      historicalDate
    );

  const cutoffKey =
    asOfDateKey(
      asOf
    );

  if (
    !rowKey ||
    !cutoffKey
  ) {
    /*
     * Fail closed:
     * si no podemos demostrar
     * que la fila es anterior,
     * no se utiliza.
     */
    return false;
  }

  return rowKey < cutoffKey;
}

export function filterRowsBeforeAsOf(
  rows,
  asOf
) {
  if (!Array.isArray(rows)) {
    return [];
  }

  return rows.filter(
    row =>
      isDateKeyBeforeAsOf(
        row?.tourney_date,
        asOf
      )
  );
}

export function pointInTimeAudit(
  rows,
  asOf
) {
  const total =
    Array.isArray(rows)
      ? rows.length
      : 0;

  const cutoffKey =
    asOfDateKey(asOf);

  const eligible =
    filterRowsBeforeAsOf(
      rows,
      asOf
    );

  return {
    status:
      cutoffKey
        ? 'ACTIVE'
        : 'INVALID_CUTOFF',

    cutoffKey,

    strictBefore:
      true,

    sameDayExcluded:
      true,

    totalRows:
      total,

    eligibleRows:
      eligible.length,

    excludedRows:
      Math.max(
        0,
        total - eligible.length
      )
  };
}

