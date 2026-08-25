import { CapacitorHttp } from '@capacitor/core';

const ESPN =
  'https://site.api.espn.com/apis/site/v2/sports/tennis/all/scoreboard';

function localDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

function dateKeyFromIso(iso) {
  if (!iso) return '';

  const d = new Date(iso);

  if (Number.isNaN(d.getTime())) {
    return '';
  }

  return localDateKey(d);
}

async function request(url) {
  try {
    const response = await CapacitorHttp.get({
      url,
      headers: {
        Accept: 'application/json'
      }
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`ESPN HTTP ${response.status}`);
    }

    if (typeof response.data === 'string') {
      return JSON.parse(response.data);
    }

    return response.data;

  } catch (nativeError) {
    const response = await fetch(url);

    if (!response.ok) {
      throw nativeError;
    }

    return response.json();
  }
}

function groupingText(group) {
  return [
    group?.grouping?.displayName,
    group?.grouping?.name,
    group?.grouping?.slug,
    group?.name
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function detectTour(group) {
  const text = groupingText(group);

  if (
    text.includes("women") ||
    text.includes("women's") ||
    text.includes('womens') ||
    text.includes('female')
  ) {
    return 'WTA';
  }

  if (
    text.includes("men") ||
    text.includes("men's") ||
    text.includes('mens') ||
    text.includes('male')
  ) {
    return 'ATP';
  }

  return null;
}

function isSingles(group) {
  return groupingText(group).includes('single');
}

function isDoubles(group) {
  return groupingText(group).includes('double');
}

function score(player) {
  return (player?.linescores || []).map(set =>
    String(set.displayValue ?? set.value ?? '')
  );
}

function playerKey(player) {
  return String(
    player?.id ||
    player?.name ||
    player?.shortName ||
    ''
  )
    .trim()
    .toLowerCase();
}

function matchupKey(match) {
  const players = [
    playerKey(match.playerA),
    playerKey(match.playerB)
  ].sort();

  return [
    match.tour,
    match.tournamentId,
    dateKeyFromIso(match.date),
    ...players
  ].join('|');
}

function normalizeCompetition(
  comp,
  tournament,
  group,
  tour
) {
  const competitors = [...(comp.competitors || [])]
    .sort((a, b) => (a.order || 99) - (b.order || 99));

  if (competitors.length < 2) {
    return null;
  }

  const playerA = competitors[0];
  const playerB = competitors[1];

  const state =
    comp.status?.type?.state ||
    'pre';

  const detail =
    comp.status?.type?.shortDetail ||
    comp.status?.type?.detail ||
    comp.status?.type?.description ||
    'Programado';

  return {
    id: String(comp.id || comp.uid || ''),

    tour,

    tournament:
      tournament.name ||
      tournament.shortName ||
      'Torneo',

    tournamentId:
      String(tournament.id || ''),

    date:
      comp.date ||
      comp.startDate ||
      '',

    state,

    completed:
      Boolean(comp.status?.type?.completed),

    status: detail,

    period:
      comp.status?.period ?? 0,

    round:
      comp.round?.displayName ||
      comp.round?.name ||
      group?.grouping?.displayName ||
      '',

    court:
      comp.venue?.court ||
      comp.venue?.fullName ||
      '',

    venue:
      comp.venue?.fullName ||
      '',

    type:
      group?.grouping?.displayName ||
      group?.grouping?.name ||
      '',

    playerA: {
      id: String(playerA.id || ''),

      name:
        playerA.athlete?.displayName ||
        playerA.athlete?.fullName ||
        'Jugador 1',

      shortName:
        playerA.athlete?.shortName ||
        playerA.athlete?.displayName ||
        'Jugador 1',

      flag:
        playerA.athlete?.flag?.href ||
        '',

      country:
        playerA.athlete?.flag?.alt ||
        '',

      winner:
        Boolean(playerA.winner),

      sets:
        score(playerA)
    },

    playerB: {
      id: String(playerB.id || ''),

      name:
        playerB.athlete?.displayName ||
        playerB.athlete?.fullName ||
        'Jugador 2',

      shortName:
        playerB.athlete?.shortName ||
        playerB.athlete?.displayName ||
        'Jugador 2',

      flag:
        playerB.athlete?.flag?.href ||
        '',

      country:
        playerB.athlete?.flag?.alt ||
        '',

      winner:
        Boolean(playerB.winner),

      sets:
        score(playerB)
    }
  };
}

function inspectOutput(matches, requestedKey) {
  const ids = new Set();
  const matchups = new Set();

  const issues = {
    duplicateIds: 0,
    duplicateMatchups: 0,
    outsideDate: 0,
    invalidTour: 0,
    nonSingles: 0
  };

  for (const match of matches) {

    if (match.id) {
      if (ids.has(match.id)) {
        issues.duplicateIds += 1;
      }

      ids.add(match.id);
    }

    const key = matchupKey(match);

    if (matchups.has(key)) {
      issues.duplicateMatchups += 1;
    }

    matchups.add(key);

    if (dateKeyFromIso(match.date) !== requestedKey) {
      issues.outsideDate += 1;
    }

    if (!['ATP', 'WTA'].includes(match.tour)) {
      issues.invalidTour += 1;
    }

    if (
      !String(match.type)
        .toLowerCase()
        .includes('single')
    ) {
      issues.nonSingles += 1;
    }
  }

  return issues;
}

function normalize(data, requestedDate) {
  const requestedKey = localDateKey(requestedDate);

  const diagnostics = {
    received: 0,
    singlesCandidates: 0,
    acceptedBeforeDedupe: 0,

    doublesRejected: 0,
    nonSinglesRejected: 0,
    outsideDateRejected: 0,
    missingDateRejected: 0,
    unknownTourRejected: 0,
    invalidCompetitorsRejected: 0,

    duplicateIdsRemoved: 0,
    duplicateMatchupsRemoved: 0
  };

  const candidates = [];

  for (const tournament of data?.events || []) {

    for (const group of tournament.groupings || []) {

      const competitions =
        group.competitions || [];

      diagnostics.received +=
        competitions.length;

      if (!isSingles(group)) {

        if (isDoubles(group)) {
          diagnostics.doublesRejected +=
            competitions.length;
        } else {
          diagnostics.nonSinglesRejected +=
            competitions.length;
        }

        continue;
      }

      const tour = detectTour(group);

      if (!tour) {
        diagnostics.unknownTourRejected +=
          competitions.length;

        continue;
      }

      for (const comp of competitions) {

        diagnostics.singlesCandidates += 1;

        const matchDate =
          comp.date ||
          comp.startDate ||
          '';

        if (!matchDate) {
          diagnostics.missingDateRejected += 1;
          continue;
        }

        if (
          dateKeyFromIso(matchDate) !==
          requestedKey
        ) {
          diagnostics.outsideDateRejected += 1;
          continue;
        }

        const match =
          normalizeCompetition(
            comp,
            tournament,
            group,
            tour
          );

        if (!match) {
          diagnostics.invalidCompetitorsRejected += 1;
          continue;
        }

        candidates.push(match);
        diagnostics.acceptedBeforeDedupe += 1;
      }
    }
  }

  const ids = new Set();
  const matchups = new Set();

  const matches = [];

  for (const match of candidates) {

    if (
      match.id &&
      ids.has(match.id)
    ) {
      diagnostics.duplicateIdsRemoved += 1;
      continue;
    }

    const key = matchupKey(match);

    if (matchups.has(key)) {
      diagnostics.duplicateMatchupsRemoved += 1;
      continue;
    }

    if (match.id) {
      ids.add(match.id);
    }

    matchups.add(key);
    matches.push(match);
  }

  const outputIssues =
    inspectOutput(
      matches,
      requestedKey
    );

  const outputIssueCount =
    Object.values(outputIssues)
      .reduce(
        (sum, value) => sum + value,
        0
      );

  const tournaments =
    new Set(
      matches.map(
        match =>
          `${match.tour}|${match.tournamentId}|${match.tournament}`
      )
    );

  const health = {
    status:
      outputIssueCount === 0
        ? 'clean'
        : 'warning',

    requestedDate: requestedKey,

    received:
      diagnostics.received,

    singlesCandidates:
      diagnostics.singlesCandidates,

    acceptedBeforeDedupe:
      diagnostics.acceptedBeforeDedupe,

    unique:
      matches.length,

    tournaments:
      tournaments.size,

    atp:
      matches.filter(
        match => match.tour === 'ATP'
      ).length,

    wta:
      matches.filter(
        match => match.tour === 'WTA'
      ).length,

    live:
      matches.filter(
        match => match.state === 'in'
      ).length,

    pre:
      matches.filter(
        match => match.state === 'pre'
      ).length,

    final:
      matches.filter(
        match => match.state === 'post'
      ).length,

    rejected: {
      doubles:
        diagnostics.doublesRejected,

      otherGroups:
        diagnostics.nonSinglesRejected,

      outsideDate:
        diagnostics.outsideDateRejected,

      missingDate:
        diagnostics.missingDateRejected,

      unknownTour:
        diagnostics.unknownTourRejected,

      invalidCompetitors:
        diagnostics.invalidCompetitorsRejected,

      duplicateIds:
        diagnostics.duplicateIdsRemoved,

      duplicateMatchups:
        diagnostics.duplicateMatchupsRemoved
    },

    outputIssues
  };

  return {
    matches,
    health
  };
}

export async function getTodayMatches(
  date = new Date()
) {
  const dateKey =
    localDateKey(date);

  const url =
    `${ESPN}?dates=${dateKey}`;

  const data =
    await request(url);

  const normalized =
    normalize(data, date);

  const matches =
    normalized.matches;

  matches.sort((a, b) => {

    const priority = {
      in: 0,
      pre: 1,
      post: 2
    };

    const stateDiff =
      (priority[a.state] ?? 9) -
      (priority[b.state] ?? 9);

    if (stateDiff !== 0) {
      return stateDiff;
    }

    return (
      new Date(a.date) -
      new Date(b.date)
    );
  });

  return {
    matches,
    health: normalized.health,
    errors: []
  };
}
