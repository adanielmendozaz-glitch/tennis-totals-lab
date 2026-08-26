import {
  profitUnitsFor
} from './wager.js';

function round(value, digits = 2) {
  const factor =
    10 ** digits;

  return Math.round(
    Number(value || 0) *
    factor
  ) / factor;
}

function entryProfit(entry) {
  const storedRaw =
    entry.result?.profitUnits;

  if (
    storedRaw !== null &&
    storedRaw !== undefined &&
    Number.isFinite(
      Number(storedRaw)
    )
  ) {
    return Number(storedRaw);
  }

  return profitUnitsFor({
    status:
      entry.result?.status,
    stakeUnits:
      entry.stakeUnits,
    odds:
      entry.odds,
    oddsFormat:
      entry.oddsFormat
  });
}

export function analyzeBank(
  entries,
  settings = {}
) {
  const initialBankUnits =
    Number.isFinite(
      Number(
        settings.initialBankUnits
      )
    )
      ? Number(
          settings.initialBankUnits
        )
      : 100;

  const unitValue =
    Number.isFinite(
      Number(
        settings.unitValue
      )
    )
      ? Math.max(
          0,
          Number(
            settings.unitValue
          )
        )
      : 0;

  const validStake =
    (entries || [])
      .filter(
        entry =>
          Number.isFinite(
            Number(
              entry.stakeUnits
            )
          ) &&
          Number(
            entry.stakeUnits
          ) > 0
      );

  const settled =
    validStake.filter(
      entry =>
        ['WIN', 'LOSS', 'PUSH']
          .includes(
            entry.result?.status
          )
    );

  const pending =
    validStake.filter(
      entry =>
        entry.result?.status ===
        'PENDING'
    );

  const profitRows =
    settled
      .map(entry => ({
        entry,
        profit:
          entryProfit(entry)
      }))
      .filter(
        row =>
          Number.isFinite(
            Number(row.profit)
          )
      );

  const totalStaked =
    profitRows.reduce(
      (sum, row) =>
        sum +
        Number(
          row.entry.stakeUnits
        ),
      0
    );

  const profitUnits =
    profitRows.reduce(
      (sum, row) =>
        sum +
        Number(row.profit),
      0
    );

  const pendingExposure =
    pending.reduce(
      (sum, entry) =>
        sum +
        Number(
          entry.stakeUnits
        ),
      0
    );

  const chronological =
    [...profitRows]
      .sort(
        (a, b) =>
          new Date(
            a.entry.result?.settledAt ||
            a.entry.capturedAt ||
            0
          ) -
          new Date(
            b.entry.result?.settledAt ||
            b.entry.capturedAt ||
            0
          )
      );

  let cumulative = 0;
  let peak = 0;
  let maxDrawdown = 0;

  for (const row of chronological) {
    cumulative +=
      Number(row.profit);

    peak =
      Math.max(
        peak,
        cumulative
      );

    maxDrawdown =
      Math.max(
        maxDrawdown,
        peak - cumulative
      );
  }

  return {
    initialBankUnits:
      round(initialBankUnits),
    currentBankUnits:
      round(
        initialBankUnits +
        profitUnits
      ),
    unitValue:
      round(unitValue),
    stakedPicks:
      validStake.length,
    settledStakedPicks:
      profitRows.length,
    pendingStakedPicks:
      pending.length,
    totalStakedUnits:
      round(totalStaked),
    pendingExposureUnits:
      round(pendingExposure),
    profitUnits:
      round(profitUnits),
    roiPct:
      totalStaked > 0
        ? round(
            profitUnits /
            totalStaked *
            100,
            1
          )
        : null,
    maxDrawdownUnits:
      round(maxDrawdown),
    profitMoney:
      unitValue > 0
        ? round(
            profitUnits *
            unitValue
          )
        : null,
    currentBankMoney:
      unitValue > 0
        ? round(
            (
              initialBankUnits +
              profitUnits
            ) *
            unitValue
          )
        : null
  };
}

