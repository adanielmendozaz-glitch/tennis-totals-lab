import {
  CapacitorHttp
} from '@capacitor/core';

const CORE =
  'https://sports.core.api.espn.com/v2/sports/tennis/leagues';

const diagnostics =
  new Map();

function diagnosticId(matchOrId) {
  if (
    matchOrId &&
    typeof matchOrId === 'object'
  ) {
    return String(
      matchOrId.id || ''
    );
  }

  return String(
    matchOrId || ''
  );
}

function setDiagnostic(
  match,
  status,
  message,
  extra = {}
) {
  const observedAt =
    new Date().toISOString();

  const diagnostic = {
    status,
    message,
    observedAt,
    ...extra
  };

  const id =
    diagnosticId(match);

  if (id) {
    diagnostics.set(
      id,
      diagnostic
    );
  }

  if (
    match &&
    typeof match === 'object'
  ) {
    match.marketDiagnostic =
      diagnostic;

    match.marketObservedAt =
      observedAt;
  }

  return diagnostic;
}

export function getMarketDiagnostic(
  matchOrId
) {
  return (
    diagnostics.get(
      diagnosticId(
        matchOrId
      )
    ) ||
    null
  );
}

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

function hasRawTotal(item) {
  return (
    item?.overUnder !== null &&
    item?.overUnder !== undefined &&
    String(
      item.overUnder
    ).trim() !== ''
  );
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
    setDiagnostic(
      match,
      'INVALID_REQUEST',
      'Partido sin identificador ATP/WTA válido.'
    );

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
    setDiagnostic(
      match,
      'INVALID_REQUEST',
      'ESPN no entregó eventId/competitionId.'
    );

    return [];
  }

  const url =
    `${CORE}/${league}/events/${eventId}/competitions/${competitionId}/odds`;

  try {
    const payload =
      await requestJson(url);

    const items =
      Array.isArray(
        payload?.items
      )
        ? payload.items
        : [];

    if (!items.length) {
      setDiagnostic(
        match,
        'NO_MARKET',
        'ESPN respondió correctamente, pero no publicó mercado O/U.',
        {
          received: 0,
          parsed: 0
        }
      );

      return [];
    }

    const resolved =
      await Promise.all(
        items.map(
          dereference
        )
      );

    const markets =
      resolved
        .map(
          normalizeOdds
        )
        .filter(Boolean);

    if (markets.length) {
      setDiagnostic(
        match,
        'OK',
        'Mercado O/U utilizable.',
        {
          received:
            items.length,

          parsed:
            markets.length
        }
      );

      return markets;
    }

    const rawTotals =
      resolved.filter(
        hasRawTotal
      ).length;

    if (rawTotals > 0) {
      setDiagnostic(
        match,
        'PARSE_ERROR',
        'ESPN publicó un total, pero el formato no pasó la validación.',
        {
          received:
            items.length,

          rawTotals,

          parsed: 0
        }
      );
    } else {
      setDiagnostic(
        match,
        'NO_MARKET',
        'ESPN respondió, pero no publicó un total O/U para este partido.',
        {
          received:
            items.length,

          rawTotals: 0,

          parsed: 0
        }
      );
    }

    return [];

  } catch (error) {
    setDiagnostic(
      match,
      'ODDS_ERROR',
      error?.message ||
      'No fue posible consultar ESPN Odds.',
      {
        received: 0,
        parsed: 0
      }
    );

    return [];
  }
}

