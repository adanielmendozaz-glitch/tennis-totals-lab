import {
  loadTourHistory,
  loadTourCoverageHistory,
  normalizeName
} from '../data/history.js';

import {
  resolveSurface
} from './surfaceResolver.js';

import {
  asOfDateKey,
  isDateKeyBeforeAsOf,
  filterRowsBeforeAsOf
} from './pointInTime.js';

import {
  buildIdentityCatalog,
  resolvePlayerIdentity
} from './identity.js';

import {
  COVERAGE_LIMITS,
  coverageReadiness,
  effectiveSampleForMode,
  historyRowWeight,
  sourceMix
} from './coverage.js';


const indexCache = new Map();

function num(value) {
  if (
    value === null ||
    value === undefined ||
    String(value).trim() === ''
  ) {
    return null;
  }

  const n = Number(value);

  return Number.isFinite(n)
    ? n
    : null;
}

function clamp(value) {
  return Math.max(
    0,
    Math.min(1, value)
  );
}

function percent(value) {
  if (
    value === null ||
    !Number.isFinite(value)
  ) {
    return null;
  }

  return Math.round(
    value * 1000
  ) / 10;
}

function cleanSurface(value) {
  const s =
    String(value || '')
      .trim()
      .toUpperCase();

  if (s === 'HARD') return 'HARD';
  if (s === 'CLAY') return 'CLAY';
  if (s === 'GRASS') return 'GRASS';
  if (s === 'CARPET') return 'CARPET';

  return 'UNKNOWN';
}

function tournamentKey(value) {
  return normalizeName(value)
    .replace(
      /\b(atp|wta|tennis|championship|championships|presented|by)\b/g,
      ' '
    )
    .replace(/\s+/g, ' ')
    .trim();
}

function makePlayerRecord(
  row,
  winner
) {
  const p =
    winner ? 'w' : 'l';

  const opp =
    winner ? 'l' : 'w';

  return {
    won: winner,

    date:
      String(
        row.tourney_date || ''
      ),

    tournament:
      row.tourney_name || '',

    surface:
      cleanSurface(
        row.surface
      ),

    rank:
      num(
        row[`${p}_rank`]
      ),

    svGms:
      num(
        row[`${p}_SvGms`]
      ),

    bpFaced:
      num(
        row[`${p}_bpFaced`]
      ),

    bpSaved:
      num(
        row[`${p}_bpSaved`]
      ),

    svpt:
      num(
        row[`${p}_svpt`]
      ),

    firstWon:
      num(
        row[`${p}_1stWon`]
      ),

    secondWon:
      num(
        row[`${p}_2ndWon`]
      ),

    oppSvGms:
      num(
        row[`${opp}_SvGms`]
      ),

    oppBpFaced:
      num(
        row[`${opp}_bpFaced`]
      ),

    oppBpSaved:
      num(
        row[`${opp}_bpSaved`]
      ),

    oppSvpt:
      num(
        row[`${opp}_svpt`]
      ),

    oppFirstWon:
      num(
        row[`${opp}_1stWon`]
      ),

    oppSecondWon:
      num(
        row[`${opp}_2ndWon`]
      ),

    historySource:
      row.__historySource ||
      'MAIN',

    historyWeight:
      historyRowWeight(
        row
      ),

    tourneyLevel:
      String(
        row.tourney_level ||
        ''
      )
  };
}

function addRecord(
  index,
  name,
  record
) {
  const key =
    normalizeName(name);

  if (!key) {
    return;
  }

  if (!index.has(key)) {
    index.set(
      key,
      []
    );
  }

  index
    .get(key)
    .push(record);
}


function eloState(
  map,
  key
) {
  if (!map.has(key)) {
    map.set(
      key,
      {
        rating: 1500,
        matches: 0
      }
    );
  }

  return map.get(key);
}

function eloExpected(
  ratingA,
  ratingB
) {
  return 1 /
    (
      1 +
      Math.pow(
        10,
        (
          ratingB -
          ratingA
        ) / 400
      )
    );
}

function updateElo(
  map,
  winnerKey,
  loserKey,
  baseK = 20
) {
  if (
    !winnerKey ||
    !loserKey
  ) {
    return;
  }

  const winner =
    eloState(
      map,
      winnerKey
    );

  const loser =
    eloState(
      map,
      loserKey
    );

  const expected =
    eloExpected(
      winner.rating,
      loser.rating
    );

  const early =
    Math.min(
      winner.matches,
      loser.matches
    ) < 20;

  const k =
    early
      ? baseK + 12
      : baseK;

  const delta =
    k *
    (
      1 -
      expected
    );

  winner.rating +=
    delta;

  loser.rating -=
    delta;

  winner.matches++;
  loser.matches++;
}

function buildElo(rows) {
  const overall =
    new Map();

  const surfaces = {
    HARD: new Map(),
    CLAY: new Map(),
    GRASS: new Map(),
    CARPET: new Map()
  };

  const ordered =
    [...rows].sort(
      (a, b) => {

        const dateDiff =
          String(
            a.tourney_date || ''
          ).localeCompare(
            String(
              b.tourney_date || ''
            )
          );

        if (dateDiff !== 0) {
          return dateDiff;
        }

        return (
          Number(
            a.match_num || 0
          ) -
          Number(
            b.match_num || 0
          )
        );
      }
    );

  for (const row of ordered) {

    const winner =
      normalizeName(
        row.winner_name
      );

    const loser =
      normalizeName(
        row.loser_name
      );

    if (
      !winner ||
      !loser
    ) {
      continue;
    }

    updateElo(
      overall,
      winner,
      loser,
      20
    );

    const surface =
      cleanSurface(
        row.surface
      );

    if (
      surfaces[surface]
    ) {
      updateElo(
        surfaces[surface],
        winner,
        loser,
        24
      );
    }
  }

  return {
    overall,
    surfaces
  };
}

function eloProfile(
  name,
  surface,
  elo
) {
  const key =
    normalizeName(name);

  const overall =
    elo.overall.get(key) ||
    {
      rating: 1500,
      matches: 0
    };

  const surfaceState =
    elo.surfaces?.[surface]
      ?.get(key) ||
    {
      rating: 1500,
      matches: 0
    };

  let blended =
    overall.rating;

  if (
    surfaceState.matches >= 12
  ) {
    blended =
      0.75 *
      surfaceState.rating +
      0.25 *
      overall.rating;

  } else if (
    surfaceState.matches >= 5
  ) {
    blended =
      0.55 *
      surfaceState.rating +
      0.45 *
      overall.rating;
  }

  return {
    overall:
      Math.round(
        overall.rating
      ),

    surface:
      Math.round(
        surfaceState.rating
      ),

    blended:
      Math.round(
        blended
      ),

    matches:
      overall.matches,

    surfaceMatches:
      surfaceState.matches
  };
}

function buildIndex(rows, eloRows = rows) {
  const players =
    new Map();

  const tournaments =
    new Map();

  for (const row of rows) {

    if (
      row.winner_name &&
      row.loser_name
    ) {
      addRecord(
        players,
        row.winner_name,
        makePlayerRecord(
          row,
          true
        )
      );

      addRecord(
        players,
        row.loser_name,
        makePlayerRecord(
          row,
          false
        )
      );
    }

    const key =
      tournamentKey(
        row.tourney_name
      );

    const surface =
      cleanSurface(
        row.surface
      );

    if (
      key &&
      surface !== 'UNKNOWN'
    ) {
      tournaments.set(
        key,
        surface
      );
    }
  }

  for (
    const records
    of players.values()
  ) {
    records.sort(
      (a, b) =>
        String(b.date)
          .localeCompare(
            String(a.date)
          )
    );
  }

  const identityCatalog =
    buildIdentityCatalog(
      rows
    );

  /*
   * Elo se mantiene MAIN TOUR.
   * Coverage Extended NO altera el
   * tercer modelo hasta que LAB lo valide.
   */
  const elo =
    buildElo(
      eloRows
    );

  return {
    players,
    tournaments,

    identityCatalog,

    elo,

    /*
     * historyRows:
     * perfiles + identidad.
     *
     * eloRows:
     * exclusivamente CORE.
     */
    historyRows:
      rows,

    eloRows
  };
}

async function getIndex(tour) {
  const upper =
    String(tour)
      .toUpperCase();

  if (
    indexCache.has(upper)
  ) {
    return indexCache.get(
      upper
    );
  }

  const promise =
    Promise.all([
      /*
       * CORE:
       * Elo y referencia del tour.
       */
      loadTourHistory(
        upper
      ),

      /*
       * COVERAGE:
       * CORE + qual/chall/125/ITF.
       */
      loadTourCoverageHistory(
        upper
      )
    ])
      .then(
        ([
          coreRows,
          coverageRows
        ]) => {
          const index =
            buildIndex(
              coverageRows,
              coreRows
            );

          const extendedRows =
            coverageRows.filter(
              row =>
                row.__historySource ===
                'EXTENDED'
            ).length;

          return {
            rows:
              coverageRows.length,

            coreRows:
              coreRows.length,

            extendedRows,

            ...index
          };
        }
      );

  indexCache.set(
    upper,
    promise
  );

  return promise;
}

function inferSurface(
  tournament,
  index
) {
  const target =
    tournamentKey(
      tournament
    );

  if (!target) {
    return 'UNKNOWN';
  }

  if (
    index.tournaments.has(
      target
    )
  ) {
    return index.tournaments.get(
      target
    );
  }

  let bestSurface =
    'UNKNOWN';

  let bestScore =
    0;

  const targetTokens =
    new Set(
      target.split(' ')
    );

  for (
    const [
      key,
      surface
    ]
    of index.tournaments
  ) {
    if (
      key.includes(target) ||
      target.includes(key)
    ) {
      return surface;
    }

    const keyTokens =
      new Set(
        key.split(' ')
      );

    let common =
      0;

    for (
      const token
      of targetTokens
    ) {
      if (
        keyTokens.has(token)
      ) {
        common++;
      }
    }

    const union =
      new Set([
        ...targetTokens,
        ...keyTokens
      ]).size;

    const score =
      union
        ? common / union
        : 0;

    if (
      score > bestScore
    ) {
      bestScore =
        score;

      bestSurface =
        surface;
    }
  }

  return bestScore >= 0.5
    ? bestSurface
    : 'UNKNOWN';
}

function aggregate(records) {
  let serviceGames = 0;
  let heldGames = 0;

  let returnGames = 0;
  let breaks = 0;

  let servePoints = 0;
  let servePointsWon = 0;

  let returnPoints = 0;
  let returnPointsWon = 0;

  let usableMatches = 0;

  for (const r of records) {
    let used = false;

    const weight =
      Math.max(
        0,
        Math.min(
          1,
          Number(
            r.historyWeight ??
            1
          )
        )
      );

    if (
      r.svGms !== null &&
      r.svGms > 0 &&
      r.bpFaced !== null &&
      r.bpSaved !== null
    ) {
      const broken =
        Math.max(
          0,
          r.bpFaced -
          r.bpSaved
        );

      serviceGames +=
        r.svGms *
        weight;

      heldGames +=
        Math.max(
          0,
          r.svGms -
          broken
        ) *
        weight;

      used = true;
    }

    if (
      r.oppSvGms !== null &&
      r.oppSvGms > 0 &&
      r.oppBpFaced !== null &&
      r.oppBpSaved !== null
    ) {
      returnGames +=
        r.oppSvGms *
        weight;

      breaks +=
        Math.max(
          0,
          r.oppBpFaced -
          r.oppBpSaved
        ) *
        weight;

      used = true;
    }

    if (
      r.svpt !== null &&
      r.svpt > 0 &&
      r.firstWon !== null &&
      r.secondWon !== null
    ) {
      servePoints +=
        r.svpt *
        weight;

      servePointsWon +=
        (
          r.firstWon +
          r.secondWon
        ) *
        weight;

      used = true;
    }

    if (
      r.oppSvpt !== null &&
      r.oppSvpt > 0 &&
      r.oppFirstWon !== null &&
      r.oppSecondWon !== null
    ) {
      const opponentWon =
        r.oppFirstWon +
        r.oppSecondWon;

      returnPoints +=
        r.oppSvpt *
        weight;

      returnPointsWon +=
        Math.max(
          0,
          r.oppSvpt -
          opponentWon
        ) *
        weight;

      used = true;
    }

    if (used) {
      usableMatches +=
        weight;
    }
  }

  return {
    usableMatches,

    serviceGames,
    heldGames,

    returnGames,
    breaks,

    servePoints,
    servePointsWon,

    returnPoints,
    returnPointsWon,

    hold:
      serviceGames
        ? clamp(
            heldGames /
            serviceGames
          )
        : null,

    break:
      returnGames
        ? clamp(
            breaks /
            returnGames
          )
        : null,

    servePointsWon:
      servePoints
        ? clamp(
            servePointsWon /
            servePoints
          )
        : null,

    returnPointsWon:
      returnPoints
        ? clamp(
            returnPointsWon /
            returnPoints
          )
        : null
  };
}

function blendRate(
  surfaceValue,
  allValue,
  weight
) {
  if (
    surfaceValue === null ||
    surfaceValue === undefined
  ) {
    return allValue;
  }

  if (
    allValue === null ||
    allValue === undefined
  ) {
    return surfaceValue;
  }

  return (
    surfaceValue *
    weight +
    allValue *
    (
      1 - weight
    )
  );
}

function profile(
  identity,
  surface,
  index,
  asOf,
  eloOverride = null,
  sourceMode = 'COVERAGE'
) {
  if (
    !identity?.resolved ||
    !identity.canonicalKey
  ) {
    return null;
  }

  const source =
    index.players.get(
      identity.canonicalKey
    ) ||
    [];

  const scopedSource =
    sourceMode === 'CORE'
      ? source.filter(
          record =>
            record.historySource !== 'EXTENDED'
        )
      : source;

  /*
   * Point-In-Time:
   * nada del mismo día ni del futuro.
   */
  const all =
    scopedSource.filter(
      record =>
        isDateKeyBeforeAsOf(
          record.date,
          asOf
        )
    );

  if (!all.length) {
    return null;
  }

  const allRecent =
    all.slice(
      0,
      24
    );

  const surfaceMatches =
    surface !== 'UNKNOWN'
      ? all.filter(
          record =>
            record.surface ===
            surface
        )
      : [];

  const surfaceRecent =
    surfaceMatches.slice(
      0,
      24
    );

  const allAgg =
    aggregate(
      allRecent
    );

  const surfaceAgg =
    aggregate(
      surfaceRecent
    );

  let sampleType =
    'ALL';

  if (
    surface !== 'UNKNOWN' &&
    surfaceAgg.usableMatches >=
      COVERAGE_LIMITS
        .surfaceFull
  ) {
    sampleType =
      'SURFACE';

  } else if (
    surface !== 'UNKNOWN' &&
    surfaceAgg.usableMatches >=
      COVERAGE_LIMITS
        .surfaceBlend &&
    allAgg.usableMatches >=
      COVERAGE_LIMITS
        .effectiveReady
  ) {
    sampleType =
      'BLEND';
  }

  let surfaceWeight =
    0;

  if (
    sampleType ===
    'SURFACE'
  ) {
    surfaceWeight = 1;

  } else if (
    sampleType ===
    'BLEND'
  ) {
    surfaceWeight =
      Math.max(
        0.35,
        Math.min(
          0.76,
          surfaceAgg.usableMatches /
          (
            surfaceAgg.usableMatches +
            5
          )
        )
      );
  }

  const choose = key => {
    if (
      sampleType ===
      'SURFACE'
    ) {
      return surfaceAgg[key];
    }

    if (
      sampleType ===
      'BLEND'
    ) {
      return blendRate(
        surfaceAgg[key],
        allAgg[key],
        surfaceWeight
      );
    }

    return allAgg[key];
  };

  const recent =
    sampleType ===
    'SURFACE'
      ? surfaceRecent
      : allRecent;

  const support =
    sampleType ===
    'SURFACE'
      ? surfaceAgg
      : allAgg;

  const effectiveSample =
    effectiveSampleForMode(
      sampleType,
      surfaceAgg.usableMatches,
      allAgg.usableMatches
    );

  const hold =
    choose('hold');

  const breakRate =
    choose('break');

  const spw =
    choose(
      'servePointsWon'
    );

  const rpw =
    choose(
      'returnPointsWon'
    );

  const holdPct =
    percent(hold);

  const breakPct =
    percent(
      breakRate
    );

  const servePointsWonPct =
    percent(spw);

  const returnPointsWonPct =
    percent(rpw);

  const gate =
    coverageReadiness({
      effectiveSample,

      servePoints:
        support.servePoints,

      returnPoints:
        support.returnPoints,

      servePointsWonPct,

      returnPointsWonPct
    });

  const last10 =
    all.slice(
      0,
      10
    );

  const wins =
    last10.filter(
      record =>
        record.won
    ).length;

  const rank =
    all.find(
      record =>
        record.rank !== null
    )?.rank ??
    null;

  const rating =
    eloProfile(
      identity.canonicalName,
      surface,
      eloOverride ||
      index.elo
    );

  const mix =
    sourceMix(
      recent
    );

  return {
    name:
      identity.queryName,

    canonicalName:
      identity.canonicalName,

    identity: {
      method:
        identity.method,

      confidencePct:
        identity.confidencePct
    },

    rank,

    surface,

    sample:
      recent.length,

    effectiveSample:
      Math.round(
        effectiveSample *
        100
      ) / 100,

    surfaceSample:
      surfaceRecent.length,

    surfaceEffectiveSample:
      Math.round(
        surfaceAgg
          .usableMatches *
        100
      ) / 100,

    sampleType,

    surfaceWeightPct:
      Math.round(
        surfaceWeight *
        1000
      ) / 10,

    historyMix:
      mix,

    modelReady:
      gate.ready,

    coverageReason:
      gate.reason,

    holdPct,
    breakPct,
    servePointsWonPct,
    returnPointsWonPct,

    last10Wins:
      wins,

    last10Losses:
      last10.length -
      wins,

    eloRating:
      rating.overall,

    surfaceEloRating:
      rating.surface,

    ratingBlend:
      rating.blended,

    eloMatches:
      rating.matches,

    surfaceEloMatches:
      rating.surfaceMatches,

    raw: {
      serviceGames:
        support.serviceGames,

      heldGames:
        support.heldGames,

      returnGames:
        support.returnGames,

      breaks:
        support.breaks,

      servePoints:
        support.servePoints,

      servePointsWon:
        support.servePointsWon,

      returnPoints:
        support.returnPoints,

      returnPointsWon:
        support.returnPointsWon
    },

    confidence:
      effectiveSample >= 15
        ? 'HIGH'
        : effectiveSample >= 8
          ? 'MEDIUM'
          : 'LOW'
  };
}

export async function enrichMatchesWithStats(
  matches
) {
  const [
    atp,
    wta
  ] =
    await Promise.all([
      getIndex('ATP'),
      getIndex('WTA')
    ]);

  const indexes = {
    ATP: atp,
    WTA: wta
  };

  let foundPlayers = 0;
  let totalPlayers = 0;

  let bothProfiles = 0;
  let oneProfile = 0;
  let noProfiles = 0;

  let surfaceResolvedMatches = 0;

  let surfaceExactMatches = 0;
  let surfaceAliasMatches = 0;
  let surfaceFuzzyMatches = 0;
  let surfaceUnknownMatches = 0;

  let identityExact = 0;
  let identityAlias = 0;
  let identityFuzzy = 0;
  let identityUnresolved = 0;
  let identityAmbiguous = 0;
  let identityPlaceholder = 0;

  let modelReadyPlayers = 0;
  let extendedSupportedProfiles = 0;

  function countIdentity(identity) {
    switch (
      identity?.status
    ) {
      case 'EXACT':
        identityExact++;
        break;

      case 'ALIAS':
        identityAlias++;
        break;

      case 'FUZZY':
        identityFuzzy++;
        break;

      case 'AMBIGUOUS':
        identityAmbiguous++;
        break;

      case 'PLACEHOLDER':
        identityPlaceholder++;
        break;

      default:
        identityUnresolved++;
        break;
    }
  }

  /*
   * Elo es reconstruido por tour + cutoff.
   * En la cartelera diaria normalmente son
   * solo dos reconstrucciones: ATP y WTA.
   */
  const eloByCutoff =
    new Map();

  const pitCutoffs =
    new Set();

  const pitAudits =
    new Map();

  const enriched =
    matches.map(match => {

      const index =
        indexes[match.tour];

      if (!index) {
        return match;
      }

      const asOf =
        match.date;

      const cutoffKey =
        asOfDateKey(
          asOf
        );

      if (!cutoffKey) {
        return {
          ...match,

          pointInTime: {
            status:
              'INVALID_CUTOFF',

            cutoffKey:
              null,

            strictBefore:
              true,

            sameDayExcluded:
              true
          }
        };
      }

      pitCutoffs.add(
        cutoffKey
      );

      const eloKey =
        `${match.tour}:${cutoffKey}`;

      let pitElo =
        eloByCutoff.get(
          eloKey
        );

      if (!pitElo) {
        const eligibleRows =
          filterRowsBeforeAsOf(
            index.eloRows,
            cutoffKey
          );

        pitElo =
          buildElo(
            eligibleRows
          );

        eloByCutoff.set(
          eloKey,
          pitElo
        );

        pitAudits.set(
          eloKey,
          {
            tour:
              match.tour,

            cutoffKey,

            totalRows:
              index.eloRows.length,

            eligibleRows:
              eligibleRows.length,

            excludedRows:
              Math.max(
                0,
                index.eloRows.length -
                eligibleRows.length
              )
          }
        );
      }

      const surfaceMeta =
        resolveSurface({
          tournament:
            match.tournament,

          venue:
            match.venue,

          court:
            match.court,

          tournaments:
            index.tournaments
        });

      const surface =
        surfaceMeta.surface;

      if (
        surface !== 'UNKNOWN'
      ) {
        surfaceResolvedMatches++;

        if (
          surfaceMeta.source ===
          'HISTORY_EXACT'
        ) {
          surfaceExactMatches++;
        } else if (
          surfaceMeta.source.includes(
            'ALIAS'
          )
        ) {
          surfaceAliasMatches++;
        } else {
          surfaceFuzzyMatches++;
        }

      } else {
        surfaceUnknownMatches++;
      }

      const identityA =
        resolvePlayerIdentity(
          match.playerA.name,
          index.identityCatalog
        );

      const identityB =
        resolvePlayerIdentity(
          match.playerB.name,
          index.identityCatalog
        );

      countIdentity(
        identityA
      );

      countIdentity(
        identityB
      );

      const profileA =
        profile(
          identityA,
          surface,
          index,
          cutoffKey,
          pitElo,
          'COVERAGE'
        );

      const profileB =
        profile(
          identityB,
          surface,
          index,
          cutoffKey,
          pitElo,
          'COVERAGE'
        );

      const coreProfileA =
        profile(
          identityA,
          surface,
          index,
          cutoffKey,
          pitElo,
          'CORE'
        );

      const coreProfileB =
        profile(
          identityB,
          surface,
          index,
          cutoffKey,
          pitElo,
          'CORE'
        );

      totalPlayers += 2;

      if (
        profileA?.modelReady
      ) {
        modelReadyPlayers++;
      }

      if (
        profileB?.modelReady
      ) {
        modelReadyPlayers++;
      }

      if (
        profileA
          ?.historyMix
          ?.extended > 0
      ) {
        extendedSupportedProfiles++;
      }

      if (
        profileB
          ?.historyMix
          ?.extended > 0
      ) {
        extendedSupportedProfiles++;
      }

      if (profileA) {
        foundPlayers++;
      }

      if (profileB) {
        foundPlayers++;
      }

      if (
        profileA &&
        profileB
      ) {
        bothProfiles++;
      } else if (
        profileA ||
        profileB
      ) {
        oneProfile++;
      } else {
        noProfiles++;
      }

      return {
        ...match,

        pointInTime: {
          status:
            'ACTIVE',

          cutoffKey,

          strictBefore:
            true,

          sameDayExcluded:
            true
        },

        surface,
        surfaceMeta,

        playerA: {
          ...match.playerA,

          identity:
            identityA,

          profile:
            profileA,

          coreProfile:
            coreProfileA
        },

        playerB: {
          ...match.playerB,

          identity:
            identityB,

          profile:
            profileB,

          coreProfile:
            coreProfileB
        }
      };
    });

  return {
    matches: enriched,

    coverage: {
      totalMatches:
        matches.length,

      totalPlayers,

      foundPlayers,

      percentage:
        totalPlayers
          ? Math.round(
              foundPlayers /
              totalPlayers *
              1000
            ) / 10
          : 0,

      bothProfiles,
      oneProfile,
      noProfiles,

      surfaceResolvedMatches,

      surfaceExactMatches,
      surfaceAliasMatches,
      surfaceFuzzyMatches,
      surfaceUnknownMatches,

      identityExact,
      identityAlias,
      identityFuzzy,
      identityUnresolved,
      identityAmbiguous,
      identityPlaceholder,

      modelReadyPlayers,
      extendedSupportedProfiles,

      atpRows:
        atp.rows,

      wtaRows:
        wta.rows,

      atpCoreRows:
        atp.coreRows,

      wtaCoreRows:
        wta.coreRows,

      atpExtendedRows:
        atp.extendedRows,

      wtaExtendedRows:
        wta.extendedRows,

      atpPlayers:
        atp.players.size,

      wtaPlayers:
        wta.players.size,

      pointInTime:
        true,

      strictBefore:
        true,

      sameDayExcluded:
        true,

      cutoffCount:
        pitCutoffs.size,

      cutoffs:
        [
          ...pitCutoffs
        ].sort(),

      pitAudit:
        [
          ...pitAudits.values()
        ]
    }
  };
}
