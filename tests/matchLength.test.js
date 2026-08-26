import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildMatchLengthCalibration,
  prepareMatchLength,
  fairLineFromCurve,
  summarizeMatchLength
} from '../src/engine/matchLength.js';

import {
  simulateMatchTotals
} from '../src/engine/montecarlo.js';

function profile({
  hold = 75,
  breakPct = 25,
  spw = 62,
  rpw = 38,
  rating = 1500,
  eloMatches = 30
} = {}) {
  return {
    holdPct: hold,
    breakPct,
    servePointsWonPct: spw,
    returnPointsWonPct: rpw,
    ratingBlend: rating,
    eloMatches
  };
}

function makeMatch({
  profileA = profile(),
  profileB = profile(),
  holdA = 80,
  holdB = 80,
  rel = 80,
  trust = 'HIGH',
  id = 'test-match'
} = {}) {
  return {
    id,
    tour: 'ATP',
    bestOf: 3,

    playerA: {
      name: 'Player A',
      profile: profileA
    },

    playerB: {
      name: 'Player B',
      profile: profileB
    },

    matchup: {
      markovReady: true,

      dataTrust: {
        level: trust
      },

      baseline: {
        servePointPct: 65,
        returnPointPct: 35,
        holdPct: 81.6,
        breakPct: 18.4
      },

      averageHoldPct:
        (holdA + holdB) / 2,

      playerA: {
        servePointPct: 64,
        holdPct: holdA,
        reliabilityPct: rel
      },

      playerB: {
        servePointPct: 64,
        holdPct: holdB,
        reliabilityPct: rel
      }
    }
  };
}

test('MatchLength: perfiles iguales no inventan gap', () => {
  const c =
    buildMatchLengthCalibration(
      makeMatch()
    );

  assert.equal(c.available, true);

  assert.ok(
    Math.abs(
      c.strengthGapPp
    ) < 0.001
  );
});

test('MatchLength: jugador A fuerte expande HOLD a favor de A', () => {
  const c =
    buildMatchLengthCalibration(
      makeMatch({
        profileA:
          profile({
            hold: 86,
            breakPct: 34,
            spw: 67,
            rpw: 43,
            rating: 1650
          }),

        profileB:
          profile({
            hold: 70,
            breakPct: 18,
            spw: 59,
            rpw: 34,
            rating: 1450
          })
      })
    );

  assert.ok(c.strengthGapPp > 0);
  assert.ok(c.holdShiftAPp > 0);
  assert.ok(c.holdShiftBPp < 0);
  assert.ok(c.calibratedHoldGapPp > c.baseHoldGapPp);
});

test('MatchLength: mirror produce dirección opuesta', () => {
  const strong =
    profile({
      hold: 86,
      breakPct: 34,
      spw: 67,
      rpw: 43,
      rating: 1650
    });

  const weak =
    profile({
      hold: 70,
      breakPct: 18,
      spw: 59,
      rpw: 34,
      rating: 1450
    });

  const a =
    buildMatchLengthCalibration(
      makeMatch({
        profileA: strong,
        profileB: weak
      })
    );

  const b =
    buildMatchLengthCalibration(
      makeMatch({
        profileA: weak,
        profileB: strong
      })
    );

  assert.ok(a.strengthGapPp > 0);
  assert.ok(b.strengthGapPp < 0);

  assert.ok(
    Math.abs(
      a.strengthGapPp +
      b.strengthGapPp
    ) < 0.05
  );
});

test('MatchLength: conserva el HOLD medio salvo clamps', () => {
  const c =
    buildMatchLengthCalibration(
      makeMatch({
        holdA: 79,
        holdB: 81,

        profileA:
          profile({
            hold: 82,
            breakPct: 31,
            spw: 65,
            rpw: 41
          }),

        profileB:
          profile({
            hold: 75,
            breakPct: 20,
            spw: 61,
            rpw: 36
          })
      })
    );

  const before =
    (
      c.baseHoldA +
      c.baseHoldB
    ) / 2;

  const after =
    (
      c.calibratedHoldA +
      c.calibratedHoldB
    ) / 2;

  assert.ok(
    Math.abs(
      before -
      after
    ) < 0.05
  );
});

test('MatchLength: CAUTION aplica menos corrección que HIGH', () => {
  const args = {
    profileA:
      profile({
        hold: 84,
        breakPct: 32,
        spw: 66,
        rpw: 42
      }),

    profileB:
      profile({
        hold: 72,
        breakPct: 20,
        spw: 60,
        rpw: 35
      })
  };

  const high =
    buildMatchLengthCalibration(
      makeMatch({
        ...args,
        trust: 'HIGH'
      })
    );

  const caution =
    buildMatchLengthCalibration(
      makeMatch({
        ...args,
        trust: 'CAUTION'
      })
    );

  assert.ok(
    Math.abs(
      caution.correctionGapPp
    ) <
    Math.abs(
      high.correctionGapPp
    )
  );
});

test('MatchLength: Fair Line elige la media línea más cercana a 50%', () => {
  const fair =
    fairLineFromCurve([
      {
        line: 21.5,
        overPct: 62,
        underPct: 38
      },
      {
        line: 22.5,
        overPct: 56,
        underPct: 44
      },
      {
        line: 23.5,
        overPct: 50.8,
        underPct: 49.2
      },
      {
        line: 24.5,
        overPct: 46,
        underPct: 54
      }
    ]);

  assert.equal(
    fair.line,
    23.5
  );
});

test('MatchLength: auditor global detecta compresión', () => {
  const matches =
    Array.from(
      { length: 12 },
      (_, index) => ({
        totals: {
          expectedGames:
            24.20 +
            index * 0.02,

          decidingSetPct:
            49.0,

          lengthAudit: {
            fairLine: 23.5,
            status:
              index === 0
                ? 'COMPRESSION'
                : 'WATCH'
          }
        }
      })
    );

  const audit =
    summarizeMatchLength(
      matches
    );

  assert.equal(
    audit.status,
    'AUDIT'
  );

  assert.ok(
    audit.expectedRange <
    1
  );
});

test('MatchLength: auditor global acepta dispersión real', () => {
  const expected = [
    19.8,
    20.7,
    21.6,
    22.4,
    23.1,
    23.8,
    24.5,
    25.1,
    25.7,
    26.2
  ];

  const matches =
    expected.map(
      (value, index) => ({
        totals: {
          expectedGames:
            value,

          decidingSetPct:
            25 +
            index * 2.2,

          lengthAudit: {
            fairLine:
              19.5 +
              index * 0.5,

            status: 'OK'
          }
        }
      })
    );

  const audit =
    summarizeMatchLength(
      matches
    );

  assert.equal(
    audit.status,
    'OK'
  );

  assert.ok(
    audit.expectedRange >
    5
  );
});

test('MatchLength: Monte Carlo devuelve scorelines que suman ~100%', () => {
  const result =
    simulateMatchTotals(
      makeMatch(),
      12000
    );

  const total =
    Object.values(
      result.scoreProbabilities
    ).reduce(
      (sum, value) =>
        sum + value,
      0
    );

  assert.ok(
    Math.abs(
      total -
      100
    ) <= 0.3
  );
});

test('MatchLength: gap fuerte reduce set decisivo vs modelo comprimido', () => {
  const match =
    makeMatch({
      id:
        'strong-gap',

      profileA:
        profile({
          hold: 88,
          breakPct: 36,
          spw: 68,
          rpw: 44,
          rating: 1700
        }),

      profileB:
        profile({
          hold: 68,
          breakPct: 16,
          spw: 58,
          rpw: 33,
          rating: 1400
        }),

      holdA: 80,
      holdB: 80,
      rel: 85,
      trust: 'HIGH'
    });

  const compressed =
    simulateMatchTotals(
      match,
      15000
    );

  const prepared =
    prepareMatchLength(
      match
    );

  const calibrated =
    simulateMatchTotals(
      prepared,
      15000
    );

  assert.ok(
    calibrated.decidingSetPct <
    compressed.decidingSetPct -
    3
  );

  assert.ok(
    calibrated.matchWinPctA >
    compressed.matchWinPctA +
    5
  );
});

