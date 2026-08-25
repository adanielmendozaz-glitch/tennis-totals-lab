import {
  loadTourHistory,
  normalizeName
} from '../data/history.js';

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

function buildIndex(rows) {
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

  const elo =
    buildElo(rows);

  return {
    players,
    tournaments,
    elo
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
    loadTourHistory(
      upper
    )
      .then(rows => {
        const index =
          buildIndex(rows);

        return {
          rows:
            rows.length,

          ...index
        };
      });

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
        r.svGms;

      heldGames +=
        Math.max(
          0,
          r.svGms -
          broken
        );

      used = true;
    }

    if (
      r.oppSvGms !== null &&
      r.oppSvGms > 0 &&
      r.oppBpFaced !== null &&
      r.oppBpSaved !== null
    ) {
      returnGames +=
        r.oppSvGms;

      breaks +=
        Math.max(
          0,
          r.oppBpFaced -
          r.oppBpSaved
        );

      used = true;
    }

    if (
      r.svpt !== null &&
      r.svpt > 0 &&
      r.firstWon !== null &&
      r.secondWon !== null
    ) {
      servePoints +=
        r.svpt;

      servePointsWon +=
        r.firstWon +
        r.secondWon;

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
        r.oppSvpt;

      returnPointsWon +=
        Math.max(
          0,
          r.oppSvpt -
          opponentWon
        );

      used = true;
    }

    if (used) {
      usableMatches++;
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

function profile(
  name,
  surface,
  index
) {
  const key =
    normalizeName(name);

  const all =
    index.players.get(key) ||
    [];

  if (!all.length) {
    return null;
  }

  const surfaceMatches =
    surface !== 'UNKNOWN'
      ? all.filter(
          r =>
            r.surface === surface
        )
      : [];

  const useSurface =
    surfaceMatches.length >= 8;

  const pool =
    useSurface
      ? surfaceMatches
      : all;

  const recent =
    pool.slice(0, 24);

  const last10 =
    all.slice(0, 10);

  const agg =
    aggregate(recent);

  const wins =
    last10.filter(
      r => r.won
    ).length;

  const rank =
    all.find(
      r =>
        r.rank !== null
    )?.rank ?? null;

  const rating =
    eloProfile(
      name,
      surface,
      index.elo
    );

  return {
    name,

    rank,

    surface,

    sample:
      recent.length,

    surfaceSample:
      surfaceMatches.length,

    sampleType:
      useSurface
        ? 'SURFACE'
        : 'ALL',

    holdPct:
      percent(
        agg.hold
      ),

    breakPct:
      percent(
        agg.break
      ),

    servePointsWonPct:
      percent(
        agg.servePointsWon
      ),

    returnPointsWonPct:
      percent(
        agg.returnPointsWon
      ),

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
        agg.serviceGames,

      heldGames:
        agg.heldGames,

      returnGames:
        agg.returnGames,

      breaks:
        agg.breaks,

      servePoints:
        agg.servePoints,

      servePointsWon:
        agg.servePointsWon,

      returnPoints:
        agg.returnPoints,

      returnPointsWon:
        agg.returnPointsWon
    },

    confidence:
      agg.usableMatches >= 15
        ? 'HIGH'
        : agg.usableMatches >= 8
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

  const enriched =
    matches.map(match => {

      const index =
        indexes[match.tour];

      if (!index) {
        return match;
      }

      const surface =
        inferSurface(
          match.tournament,
          index
        );

      if (
        surface !== 'UNKNOWN'
      ) {
        surfaceResolvedMatches++;
      }

      const profileA =
        profile(
          match.playerA.name,
          surface,
          index
        );

      const profileB =
        profile(
          match.playerB.name,
          surface,
          index
        );

      totalPlayers += 2;

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

        surface,

        playerA: {
          ...match.playerA,
          profile: profileA
        },

        playerB: {
          ...match.playerB,
          profile: profileB
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

      atpRows:
        atp.rows,

      wtaRows:
        wta.rows,

      atpPlayers:
        atp.players.size,

      wtaPlayers:
        wta.players.size
    }
  };
}
