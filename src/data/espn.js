import { CapacitorHttp } from '@capacitor/core';

const ESPN =
  'https://site.api.espn.com/apis/site/v2/sports/tennis';

function localDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
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

function normalizeCompetition(comp, tournament, tour) {
  const competitors = [...(comp.competitors || [])]
    .sort((a, b) => (a.order || 99) - (b.order || 99));

  const playerA = competitors[0];
  const playerB = competitors[1];

  if (!playerA || !playerB) return null;

  const score = player =>
    (player.linescores || []).map(s =>
      String(s.displayValue ?? s.value ?? '')
    );

  const state = comp.status?.type?.state || 'pre';
  const detail =
    comp.status?.type?.shortDetail ||
    comp.status?.type?.detail ||
    comp.status?.type?.description ||
    'Programado';

  return {
    id: String(comp.id),
    tour,
    tournament: tournament.name || tournament.shortName || tour,
    tournamentId: tournament.id,
    date: comp.date || comp.startDate || '',
    state,
    completed: Boolean(comp.status?.type?.completed),
    status: detail,
    period: comp.status?.period ?? 0,

    round:
      comp.round?.displayName ||
      comp.round?.name ||
      '',

    court:
      comp.venue?.court ||
      comp.venue?.fullName ||
      '',

    venue:
      comp.venue?.fullName || '',

    type:
      comp.type?.slug ||
      comp.type?.text ||
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
        playerA.athlete?.flag?.href || '',
      country:
        playerA.athlete?.flag?.alt || '',
      winner: Boolean(playerA.winner),
      sets: score(playerA)
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
        playerB.athlete?.flag?.href || '',
      country:
        playerB.athlete?.flag?.alt || '',
      winner: Boolean(playerB.winner),
      sets: score(playerB)
    }
  };
}

function normalize(data, tour) {
  const matches = [];

  for (const tournament of data?.events || []) {
    for (const group of tournament.groupings || []) {
      const groupSlug =
        group.grouping?.slug ||
        group.grouping?.displayName ||
        '';

      if (!String(groupSlug).toLowerCase().includes('singles')) {
        continue;
      }

      for (const comp of group.competitions || []) {
        const match = normalizeCompetition(comp, tournament, tour);

        if (match) {
          matches.push(match);
        }
      }
    }
  }

  const unique = new Map();

  for (const match of matches) {
    unique.set(`${tour}-${match.id}`, match);
  }

  return [...unique.values()];
}

export async function getTourScoreboard(tour, date = new Date()) {
  const dateKey = localDateKey(date);
  const url = `${ESPN}/${tour.toLowerCase()}/scoreboard?dates=${dateKey}`;

  const data = await request(url);

  return normalize(data, tour.toUpperCase());
}

export async function getTodayMatches() {
  const results = await Promise.allSettled([
    getTourScoreboard('atp'),
    getTourScoreboard('wta')
  ]);

  const matches = [];
  const errors = [];

  if (results[0].status === 'fulfilled') {
    matches.push(...results[0].value);
  } else {
    errors.push(`ATP: ${results[0].reason?.message || 'error'}`);
  }

  if (results[1].status === 'fulfilled') {
    matches.push(...results[1].value);
  } else {
    errors.push(`WTA: ${results[1].reason?.message || 'error'}`);
  }

  matches.sort((a, b) => {
    const priority = { in: 0, pre: 1, post: 2 };

    const stateDiff =
      (priority[a.state] ?? 9) -
      (priority[b.state] ?? 9);

    if (stateDiff !== 0) return stateDiff;

    return new Date(a.date) - new Date(b.date);
  });

  return {
    matches,
    errors
  };
}
