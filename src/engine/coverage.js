export const COVERAGE_LIMITS = {
  surfaceFull:
    8,

  surfaceBlend:
    3,

  effectiveReady:
    6.5,

  minServePoints:
    300,

  minReturnPoints:
    300
};

export function historyRowWeight(
  row
) {
  if (
    row?.__historySource !==
    'EXTENDED'
  ) {
    return 1;
  }

  const level =
    String(
      row?.tourney_level ||
      ''
    )
      .trim()
      .toUpperCase();

  /*
   * Qualifying de torneos grandes/main:
   * casi equivalente a ATP/WTA.
   */
  if (
    [
      'G',
      'M',
      'A',
      'F'
    ].includes(level)
  ) {
    return 0.92;
  }

  /*
   * Challenger / WTA125.
   */
  if (
    level === 'C'
  ) {
    return 0.80;
  }

  /*
   * ITF / otros niveles.
   * Aporta evidencia, pero con
   * shrinkage mucho más fuerte.
   */
  return 0.68;
}

export function sourceMix(
  records
) {
  let main = 0;
  let extended = 0;

  let weightedMain = 0;
  let weightedExtended = 0;

  for (
    const record
    of records || []
  ) {
    const weight =
      Number(
        record?.historyWeight ??
        1
      );

    if (
      record?.historySource ===
      'EXTENDED'
    ) {
      extended++;
      weightedExtended +=
        weight;
    } else {
      main++;
      weightedMain +=
        weight;
    }
  }

  return {
    main,
    extended,

    weightedMain:
      Math.round(
        weightedMain * 100
      ) / 100,

    weightedExtended:
      Math.round(
        weightedExtended * 100
      ) / 100
  };
}

export function effectiveSampleForMode(
  mode,
  surfaceEffective,
  allEffective
) {
  const surface =
    Math.max(
      0,
      Number(
        surfaceEffective || 0
      )
    );

  const all =
    Math.max(
      0,
      Number(
        allEffective || 0
      )
    );

  if (
    mode === 'SURFACE'
  ) {
    return surface;
  }

  if (
    mode === 'BLEND'
  ) {
    /*
     * La superficie pesa completa;
     * lo ocurrido fuera de ella
     * solo aporta 45% de soporte.
     */
    return Math.min(
      all,
      surface +
      Math.max(
        0,
        all - surface
      ) *
      0.45
    );
  }

  /*
   * ALL:
   * sin muestra de superficie suficiente,
   * aplicamos penalización explícita.
   */
  return all * 0.82;
}

export function coverageReadiness({
  effectiveSample,
  servePoints,
  returnPoints,
  servePointsWonPct,
  returnPointsWonPct
}) {
  if (
    !Number.isFinite(
      Number(
        servePointsWonPct
      )
    ) ||
    !Number.isFinite(
      Number(
        returnPointsWonPct
      )
    )
  ) {
    return {
      ready: false,
      reason:
        'STAT_GAP'
    };
  }

  if (
    Number(
      effectiveSample || 0
    ) <
    COVERAGE_LIMITS
      .effectiveReady
  ) {
    return {
      ready: false,
      reason:
        'LOW_EFFECTIVE_SAMPLE'
    };
  }

  if (
    Number(
      servePoints || 0
    ) <
    COVERAGE_LIMITS
      .minServePoints
  ) {
    return {
      ready: false,
      reason:
        'SERVE_SUPPORT_LOW'
    };
  }

  if (
    Number(
      returnPoints || 0
    ) <
    COVERAGE_LIMITS
      .minReturnPoints
  ) {
    return {
      ready: false,
      reason:
        'RETURN_SUPPORT_LOW'
    };
  }

  return {
    ready: true,
    reason:
      'READY'
  };
}

