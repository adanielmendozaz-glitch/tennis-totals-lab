export const ALLOWED_STAKES = [
  0.25,
  0.50,
  0.75,
  1.00
];

export function normalizeStakeUnits(
  value,
  fallback = null
) {
  const n =
    Number(value);

  if (!Number.isFinite(n)) {
    return fallback;
  }

  const matched =
    ALLOWED_STAKES.find(
      stake =>
        Math.abs(
          stake - n
        ) < 0.0001
    );

  return matched ??
    fallback;
}

export function decimalOdds(
  odds,
  format = null
) {
  const n =
    Number(odds);

  if (!Number.isFinite(n)) {
    return null;
  }

  const upper =
    String(format || '')
      .toUpperCase();

  if (
    upper === 'DECIMAL' ||
    (
      !upper &&
      n > 1 &&
      n < 20
    )
  ) {
    return n > 1
      ? n
      : null;
  }

  if (
    upper === 'AMERICAN' ||
    n <= -100 ||
    n >= 100
  ) {
    if (n <= -100) {
      return (
        1 +
        100 /
        Math.abs(n)
      );
    }

    if (n >= 100) {
      return (
        1 +
        n / 100
      );
    }
  }

  return null;
}

export function profitUnitsFor({
  status,
  stakeUnits,
  odds,
  oddsFormat
}) {
  const stake =
    Number(stakeUnits);

  if (
    !Number.isFinite(stake) ||
    stake <= 0
  ) {
    return null;
  }

  if (status === 'LOSS') {
    return -stake;
  }

  if (status === 'PUSH') {
    return 0;
  }

  if (status !== 'WIN') {
    return null;
  }

  const decimal =
    decimalOdds(
      odds,
      oddsFormat
    );

  if (!decimal) {
    return null;
  }

  return (
    stake *
    (
      decimal - 1
    )
  );
}

