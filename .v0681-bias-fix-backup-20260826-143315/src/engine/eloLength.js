import {
  simulateMatchTotals
} from './montecarlo.js';

import {
  holdFromPointProbability
} from './matchup.js';

function clamp(
  value,
  min,
  max
) {
  return Math.max(
    min,
    Math.min(
      max,
      value
    )
  );
}

export function simulateEloTotals(
  match,
  simulations = 20000
) {
  const ratingA =
    Number(
      match.playerA
        ?.profile
        ?.ratingBlend ||
      1500
    );

  const ratingB =
    Number(
      match.playerB
        ?.profile
        ?.ratingBlend ||
      1500
    );

  const eloDiff =
    clamp(
      ratingA -
      ratingB,
      -600,
      600
    );

  /*
   * Elo no sustituye saque/resto.
   * Solo agrega una corrección
   * moderada de fortaleza global.
   */
  const eloSignal =
    Math.tanh(
      eloDiff /
      300
    );

  const shift =
    0.014 *
    eloSignal;

  const baseServeA =
    Number(
      match.matchup
        .playerA
        .servePointPct
    ) / 100;

  const baseServeB =
    Number(
      match.matchup
        .playerB
        .servePointPct
    ) / 100;

  const serveA =
    clamp(
      baseServeA +
      shift,
      0.45,
      0.82
    );

  const serveB =
    clamp(
      baseServeB -
      shift,
      0.45,
      0.82
    );

  const adjusted = {
    ...match,

    matchup: {
      ...match.matchup,

      playerA: {
        ...match.matchup.playerA,

        servePointPct:
          serveA * 100,

        holdPct:
          holdFromPointProbability(
            serveA
          ) * 100
      },

      playerB: {
        ...match.matchup.playerB,

        servePointPct:
          serveB * 100,

        holdPct:
          holdFromPointProbability(
            serveB
          ) * 100
      }
    }
  };

  const result =
    simulateMatchTotals(
      adjusted,
      simulations
    );

  return {
    ...result,

    version:
      'ELO-0.4.0',

    mode:
      'SURFACE_ELO',

    elo: {
      playerA:
        ratingA,

      playerB:
        ratingB,

      difference:
        eloDiff,

      serveShiftPct:
        shift * 100
    }
  };
}
