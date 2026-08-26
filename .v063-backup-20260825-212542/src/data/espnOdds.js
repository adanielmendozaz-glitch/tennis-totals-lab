import {
  CapacitorHttp
} from '@capacitor/core';

const CORE =
  'https://sports.core.api.espn.com/v2/sports/tennis/leagues';

async function requestJson(url) {
  try {
    const response =
      await CapacitorHttp.get({
        url,
        headers: {
          Accept: 'application/json'
        }
      });

    if (
      response.status < 200 ||
      response.status >= 300
    ) {
      throw new Error(
        `ESPN ODDS HTTP ${response.status}`
      );
    }

    if (
      typeof response.data === 'string'
    ) {
      return JSON.parse(
        response.data
      );
    }

    return response.data;

  } catch (nativeError) {
    const response =
      await fetch(url);

    if (!response.ok) {
      throw nativeError;
    }

    return response.json();
  }
}

function leagueSlug(tour) {
  return tour === 'WTA'
    ? 'wta'
    : 'atp';
}

async function dereference(item) {
  if (
    item?.provider ||
    !item?.$ref
  ) {
    return item;
  }

  try {
    const url =
      String(item.$ref)
        .replace(
          /^http:/,
          'https:'
        )
        .replace(
          'sports.core.api.espn.pvt',
          'sports.core.api.espn.com'
        );

    return await requestJson(url);

  } catch {
    return item;
  }
}

function validTotal(value) {
  const n =
    Number(value);

  return (
    Number.isFinite(n) &&
    n >= 10.5 &&
    n <= 60.5
  );
}

function normalizeOdds(item) {
  const total =
    Number(
      item?.overUnder
    );

  if (!validTotal(total)) {
    return null;
  }

  return {
    provider:
      item?.provider?.name ||
      item?.provider?.displayName ||
      'ESPN',

    line:
      total,

    overOdds:
      Number(
        item?.overOdds ||
        item?.over?.odds ||
        item?.over?.moneyLine
      ) || null,

    underOdds:
      Number(
        item?.underOdds ||
        item?.under?.odds ||
        item?.under?.moneyLine
      ) || null,

    source:
      'ESPN_CORE'
  };
}

export async function getMatchMarkets(
  match
) {
  if (
    !match?.id ||
    !['ATP', 'WTA'].includes(
      match?.tour
    )
  ) {
    return [];
  }

  const league =
    leagueSlug(
      match.tour
    );

  const eventId =
    String(
      match.tournamentId || ''
    );

  const competitionId =
    String(
      match.id || ''
    );

  if (
    !eventId ||
    !competitionId
  ) {
    return [];
  }

  const url =
    `${CORE}/${league}/events/${eventId}/competitions/${competitionId}/odds`;

  try {
    const payload =
      await requestJson(url);

    const items =
      payload?.items || [];

    const resolved =
      await Promise.all(
        items.map(
          dereference
        )
      );

    return resolved
      .map(
        normalizeOdds
      )
      .filter(Boolean);

  } catch {
    return [];
  }
}
