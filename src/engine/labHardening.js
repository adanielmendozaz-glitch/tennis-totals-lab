export const LAB_WINDOWS = ['7D', '30D', 'ALL'];

function rowDate(row) {
  const value =
    row?.result?.settledAt ||
    row?.capturedAt ||
    row?.scheduledAt ||
    null;

  const date = value ? new Date(value) : null;

  return (
    date &&
    !Number.isNaN(date.getTime())
  )
    ? date
    : null;
}

function normalized(value) {
  return String(value || '')
    .trim()
    .toUpperCase();
}

export function filterLabEntries(
  entries,
  filters = {},
  now = new Date()
) {
  const all =
    Array.isArray(entries)
      ? entries
      : [];

  const windowKey =
    LAB_WINDOWS.includes(filters.window)
      ? filters.window
      : 'ALL';

  const tour =
    normalized(filters.tour || 'ALL');

  const surface =
    normalized(filters.surface || 'ALL');

  const trust =
    normalized(filters.trust || 'ALL');

  const nowDate =
    now instanceof Date
      ? now
      : new Date(now);

  const days =
    windowKey === '7D'
      ? 7
      : windowKey === '30D'
        ? 30
        : null;

  return all.filter(row => {
    if (
      tour !== 'ALL' &&
      normalized(row.tour) !== tour
    ) {
      return false;
    }

    if (
      surface !== 'ALL' &&
      normalized(row.surface) !== surface
    ) {
      return false;
    }

    const rowTrust =
      normalized(
        row.dataTrustAudit?.level ||
        'LEGACY'
      );

    if (
      trust !== 'ALL' &&
      rowTrust !== trust
    ) {
      return false;
    }

    if (!days) {
      return true;
    }

    const date = rowDate(row);

    if (!date) {
      return false;
    }

    const age =
      nowDate.getTime() -
      date.getTime();

    return (
      age >= 0 &&
      age <=
        days * 86400000
    );
  });
}

export function calibrationStrength(n) {
  const count = Number(n || 0);

  if (count < 5) {
    return {
      code: 'TOO_SMALL',
      label: 'N<5 · NO CONCLUSION'
    };
  }

  if (count < 20) {
    return {
      code: 'LOW',
      label: 'LOW SAMPLE'
    };
  }

  if (count < 50) {
    return {
      code: 'EARLY',
      label: 'EARLY SIGNAL'
    };
  }

  return {
    code: 'USEFUL',
    label: 'USEFUL'
  };
}

export function integritySummary(entries) {
  const all =
    Array.isArray(entries)
      ? entries
      : [];

  let verified = 0;
  let review = 0;
  let legacy = 0;
  let pending = 0;
  let settled = 0;

  for (const entry of all) {
    if (
      entry.stakeIntegrity?.status ===
      'REVIEW'
    ) {
      review++;
    } else if (
      entry.stakeIntegrity?.status ===
      'VERIFIED'
    ) {
      verified++;
    } else {
      legacy++;
    }

    if (
      entry.result?.status ===
      'PENDING'
    ) {
      pending++;
    }

    if (
      ['WIN', 'LOSS', 'PUSH']
        .includes(entry.result?.status)
    ) {
      settled++;
    }
  }

  return {
    total: all.length,
    verified,
    review,
    legacy,
    pending,
    settled
  };
}
