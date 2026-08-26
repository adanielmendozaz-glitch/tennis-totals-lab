import {
  profitUnitsFor
} from './wager.js';

function validStake(entry) {
  return (
    Number.isFinite(
      Number(entry?.stakeUnits)
    ) &&
    Number(entry.stakeUnits) > 0
  );
}

function eventDate(entry) {
  const value =
    entry?.result?.settledAt ||
    entry?.settledAt ||
    entry?.capturedAt ||
    null;

  const date =
    value
      ? new Date(value)
      : null;

  return (
    date &&
    !Number.isNaN(date.getTime())
  )
    ? date
    : new Date(0);
}

export function bankEntryProfit(entry) {
  const stored =
    entry?.result?.profitUnits;

  if (
    stored !== null &&
    stored !== undefined &&
    Number.isFinite(Number(stored))
  ) {
    return Number(stored);
  }

  return profitUnitsFor({
    status:
      entry?.result?.status,
    stakeUnits:
      entry?.stakeUnits,
    odds:
      entry?.odds,
    oddsFormat:
      entry?.oddsFormat
  });
}

export function bankEquitySeries(
  entries,
  initialBankUnits = 100
) {
  const initial =
    Number.isFinite(
      Number(initialBankUnits)
    )
      ? Number(initialBankUnits)
      : 100;

  const settled =
    (entries || [])
      .filter(
        entry =>
          validStake(entry) &&
          ['WIN', 'LOSS', 'PUSH']
            .includes(
              entry.result?.status
            )
      )
      .map(entry => ({
        entry,
        profit:
          bankEntryProfit(entry)
      }))
      .filter(
        row =>
          Number.isFinite(
            Number(row.profit)
          )
      )
      .sort(
        (a, b) =>
          eventDate(a.entry) -
          eventDate(b.entry)
      );

  let cumulative = 0;

  const points = [{
    index: 0,
    cumulativeUnits: 0,
    bankUnits: initial,
    status: 'START',
    at: null
  }];

  settled.forEach(
    (row, index) => {
      cumulative +=
        Number(row.profit);

      points.push({
        index: index + 1,
        cumulativeUnits:
          Math.round(
            cumulative * 100
          ) / 100,
        bankUnits:
          Math.round(
            (
              initial +
              cumulative
            ) * 100
          ) / 100,
        status:
          row.entry.result?.status,
        at:
          row.entry.result?.settledAt ||
          row.entry.capturedAt ||
          null
      });
    }
  );

  return points;
}

export function bankHistory(entries) {
  return (entries || [])
    .filter(validStake)
    .map(entry => ({
      matchId:
        entry.matchId,
      playerA:
        entry.playerA,
      playerB:
        entry.playerB,
      side:
        entry.side,
      line:
        Number(entry.line),
      odds:
        entry.odds,
      oddsFormat:
        entry.oddsFormat,
      stakeUnits:
        Number(entry.stakeUnits),
      status:
        entry.result?.status ||
        'PENDING',
      profitUnits:
        bankEntryProfit(entry),
      capturedAt:
        entry.capturedAt,
      settledAt:
        entry.result?.settledAt ||
        null
    }))
    .sort(
      (a, b) =>
        eventDate(b) -
        eventDate(a)
    );
}
