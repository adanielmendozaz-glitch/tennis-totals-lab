import {
  getTodayMatches
} from '../data/espn.js';

import {
  getCensoEntries,
  settleCensoFromMatches
} from './censo.js';

const MIN_INTERVAL =
  15 * 60 * 1000;

let lastRun = 0;
let runningPromise = null;

function localDateKey(
  date = new Date()
) {
  const year =
    date.getFullYear();

  const month =
    String(
      date.getMonth() + 1
    ).padStart(2, '0');

  const day =
    String(
      date.getDate()
    ).padStart(2, '0');

  return (
    `${year}${month}${day}`
  );
}

function dateKeyFromIso(iso) {
  if (!iso) {
    return null;
  }

  const date =
    new Date(iso);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return null;
  }

  return localDateKey(date);
}

function dateFromKey(key) {
  if (
    !key ||
    key.length !== 8
  ) {
    return null;
  }

  const year =
    Number(
      key.slice(0, 4)
    );

  const month =
    Number(
      key.slice(4, 6)
    );

  const day =
    Number(
      key.slice(6, 8)
    );

  if (
    !year ||
    !month ||
    !day
  ) {
    return null;
  }

  /*
   * Mediodía local evita que
   * cambios de timezone muevan
   * accidentalmente la fecha.
   */
  return new Date(
    year,
    month - 1,
    day,
    12,
    0,
    0
  );
}

function shiftDateKey(
  key,
  days
) {
  const date =
    dateFromKey(key);

  if (!date) {
    return null;
  }

  date.setDate(
    date.getDate() +
    days
  );

  return localDateKey(date);
}

function pendingDateKeys() {
  const entries =
    getCensoEntries();

  const today =
    localDateKey();

  const keys =
    new Set();

  for (const entry of entries) {

    if (
      entry.result?.status !==
      'PENDING'
    ) {
      continue;
    }

    const key =
      dateKeyFromIso(
        entry.scheduledAt
      ) ||
      dateKeyFromIso(
        entry.capturedAt
      );

    if (
      !key ||
      key === today
    ) {
      continue;
    }

    /*
     * Fecha original.
     */
    keys.add(key);

    /*
     * También revisamos el día
     * posterior por si ESPN movió
     * el partido o hubo retraso.
     */
    const next =
      shiftDateKey(
        key,
        1
      );

    if (
      next &&
      next !== today
    ) {
      keys.add(next);
    }
  }

  return [
    ...keys
  ].sort();
}

async function runBackfill() {
  const keys =
    pendingDateKeys();

  if (!keys.length) {
    return {
      checkedDates: 0,
      changed: 0,
      errors: []
    };
  }

  let checkedDates = 0;
  let changed = 0;

  const errors = [];

  for (const key of keys) {

    const date =
      dateFromKey(key);

    if (!date) {
      continue;
    }

    try {
      const result =
        await getTodayMatches(
          date
        );

      checkedDates++;

      changed +=
        settleCensoFromMatches(
          result.matches
        );

    } catch (error) {

      console.warn(
        'Censo Backfill',
        key,
        error
      );

      errors.push({
        date: key,
        message:
          error?.message ||
          'ESPN history error'
      });
    }
  }

  return {
    checkedDates,
    changed,
    errors
  };
}

export async function backfillPendingCenso({
  force = false
} = {}) {

  /*
   * Evitamos consultar ESPN
   * históricamente cada minuto.
   */
  if (
    !force &&
    Date.now() - lastRun <
      MIN_INTERVAL
  ) {
    return {
      skipped: true,
      checkedDates: 0,
      changed: 0,
      errors: []
    };
  }

  if (runningPromise) {
    return runningPromise;
  }

  runningPromise =
    runBackfill()
      .finally(() => {
        lastRun =
          Date.now();

        runningPromise =
          null;
      });

  return runningPromise;
}
