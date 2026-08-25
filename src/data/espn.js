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

function detectTour(group) {
  const text = [
    group?.grouping?.displayName,
    group?.grouping?.name,
    group?.grouping?.slug,
    group?.name
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

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
  const text = [
    group?.grouping?.displayName,
    group?.grouping?.name,
    group?.grouping?.slug,
    group?.name
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return text.includes('single');
}

function score(player) {
  return (player?.linescores || []).map(set =>
    String(set.displayValue ?? set.value ?? '')
  );
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

function normalize(data, requestedDate) {
  const requestedKey =
    localDateKey(requestedDate);

  const matches = [];

  for (const tournament of data?.events || []) {

    for (const group of tournament.groupings || []) {

      if (!isSingles(group)) {
        continue;
      }

      const tour =
        detectTour(group);

      if (!tour) {
        continue;
      }

      for (const comp of group.competitions || []) {

        const matchDate =
          comp.date ||
          comp.startDate ||
          '';

        /*
         * ESPN puede devolver el cuadro completo
         * del torneo aunque pidamos un solo día.
         *
         * Aquí nos quedamos SOLAMENTE con partidos
         * cuya fecha local corresponde a HOY.
         */
        if (
          matchDate &&
          dateKeyFromIso(matchDate) !== requestedKey
        ) {
          continue;
        }

        const match =
          normalizeCompetition(
            comp,
            tournament,
            group,
            tour
          );

        if (match) {
          matches.push(match);
        }
      }
    }
  }

  /*
   * Dedupe GLOBAL.
   * Ya no usamos ATP-id y WTA-id porque el mismo
   * partido nunca debe aparecer dos veces.
   */
  const unique =
    new Map();

  for (const match of matches) {
    const key =
      match.id ||
      [
        match.playerA.name,
        match.playerB.name,
        match.date
      ].join('|');

    unique.set(key, match);
  }

  return [...unique.values()];
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

  const matches =
    normalize(data, date);

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
    errors: []
  };
}
