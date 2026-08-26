function clampProbability(value) {
  return Math.max(
    0.001,
    Math.min(
      0.999,
      Number(value || 0)
    )
  );
}

function round(value, digits = 3) {
  const factor =
    10 ** digits;

  return Math.round(
    Number(value || 0) *
    factor
  ) / factor;
}

export function labSampleStatus(n) {
  const count =
    Number(n || 0);

  if (count < 30) {
    return {
      code: 'VERY_LOW',
      label: 'VERY LOW SAMPLE'
    };
  }

  if (count < 100) {
    return {
      code: 'EARLY',
      label: 'EARLY SIGNAL'
    };
  }

  if (count < 200) {
    return {
      code: 'DEVELOPING',
      label: 'DEVELOPING'
    };
  }

  if (count < 500) {
    return {
      code: 'USEFUL',
      label: 'USEFUL SAMPLE'
    };
  }

  return {
    code: 'STRONGER',
    label: 'STRONGER EVIDENCE'
  };
}

export function brierScore(rows) {
  if (!rows.length) {
    return null;
  }

  const total =
    rows.reduce(
      (sum, row) => {
        const p =
          clampProbability(
            Number(row.modelPct) /
            100
          );

        const y =
          row.result?.status ===
          'WIN'
            ? 1
            : 0;

        return (
          sum +
          (
            p - y
          ) ** 2
        );
      },
      0
    );

  return round(
    total / rows.length,
    4
  );
}

export function logLoss(rows) {
  if (!rows.length) {
    return null;
  }

  const total =
    rows.reduce(
      (sum, row) => {
        const p =
          clampProbability(
            Number(row.modelPct) /
            100
          );

        const win =
          row.result?.status ===
          'WIN';

        return (
          sum -
          Math.log(
            win
              ? p
              : 1 - p
          )
        );
      },
      0
    );

  return round(
    total / rows.length,
    4
  );
}

function calibrationBucket(probabilityPct) {
  const p =
    Number(probabilityPct || 0);

  if (p < 55) return '50–54.9%';
  if (p < 60) return '55–59.9%';
  if (p < 65) return '60–64.9%';
  if (p < 70) return '65–69.9%';
  if (p < 75) return '70–74.9%';
  return '75%+';
}

export function calibrationBuckets(rows) {
  const map =
    new Map();

  for (const row of rows) {
    const key =
      calibrationBucket(
        row.modelPct
      );

    if (!map.has(key)) {
      map.set(
        key,
        {
          label: key,
          n: 0,
          probabilitySum: 0,
          wins: 0
        }
      );
    }

    const bucket =
      map.get(key);

    bucket.n++;
    bucket.probabilitySum +=
      Number(row.modelPct || 0);

    if (
      row.result?.status ===
      'WIN'
    ) {
      bucket.wins++;
    }
  }

  return [...map.values()]
    .map(bucket => ({
      label:
        bucket.label,
      n:
        bucket.n,
      modelAvgPct:
        round(
          bucket.probabilitySum /
          bucket.n,
          1
        ),
      actualPct:
        round(
          bucket.wins /
          bucket.n *
          100,
          1
        )
    }));
}

function groupRows(
  rows,
  keyFn
) {
  const map =
    new Map();

  for (const row of rows) {
    const key =
      keyFn(row) ||
      'UNKNOWN';

    if (!map.has(key)) {
      map.set(
        key,
        {
          key,
          wins: 0,
          losses: 0,
          n: 0
        }
      );
    }

    const group =
      map.get(key);

    group.n++;

    if (
      row.result?.status ===
      'WIN'
    ) {
      group.wins++;
    } else {
      group.losses++;
    }
  }

  return [...map.values()]
    .sort(
      (a, b) =>
        b.n - a.n ||
        String(a.key)
          .localeCompare(
            String(b.key)
          )
    )
    .map(group => ({
      ...group,
      hitRatePct:
        round(
          group.wins /
          group.n *
          100,
          1
        )
    }));
}

export function analyzeLab(entries) {
  const all =
    Array.isArray(entries)
      ? entries
      : [];

  const binary =
    all.filter(
      row =>
        ['WIN', 'LOSS'].includes(
          row.result?.status
        )
    );

  const wins =
    binary.filter(
      row =>
        row.result?.status ===
        'WIN'
    ).length;

  const losses =
    binary.length -
    wins;

  const pushes =
    all.filter(
      row =>
        row.result?.status ===
        'PUSH'
    ).length;

  const pending =
    all.filter(
      row =>
        row.result?.status ===
        'PENDING'
    ).length;

  const review =
    all.filter(
      row =>
        row.result?.status ===
        'REVIEW'
    ).length;

  return {
    total:
      all.length,
    settledBinary:
      binary.length,
    wins,
    losses,
    pushes,
    pending,
    review,
    hitRatePct:
      binary.length
        ? round(
            wins /
            binary.length *
            100,
            1
          )
        : null,
    brier:
      brierScore(binary),
    logLoss:
      logLoss(binary),
    sample:
      labSampleStatus(
        binary.length
      ),
    calibration:
      calibrationBuckets(
        binary
      ),
    byTour:
      groupRows(
        binary,
        row => row.tour
      ),
    bySurface:
      groupRows(
        binary,
        row => row.surface
      ),
    bySide:
      groupRows(
        binary,
        row => row.side
      ),
    byTrust:
      groupRows(
        binary,
        row =>
          row.dataTrustAudit
            ?.level ||
          'LEGACY'
      )
  };
}

