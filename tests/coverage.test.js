import test from 'node:test';
import assert from 'node:assert/strict';

import {
  COVERAGE_LIMITS,
  coverageReadiness,
  effectiveSampleForMode,
  historyRowWeight,
  sourceMix
} from '../src/engine/coverage.js';

test(
  'Coverage: MAIN pesa más que Challenger/ITF',
  () => {
    const main =
      historyRowWeight({
        __historySource:
          'MAIN'
      });

    const qualifier =
      historyRowWeight({
        __historySource:
          'EXTENDED',
        tourney_level:
          'A'
      });

    const challenger =
      historyRowWeight({
        __historySource:
          'EXTENDED',
        tourney_level:
          'C'
      });

    const itf =
      historyRowWeight({
        __historySource:
          'EXTENDED',
        tourney_level:
          'S'
      });

    assert.equal(
      main,
      1
    );

    assert.ok(
      main >
      qualifier
    );

    assert.ok(
      qualifier >
      challenger
    );

    assert.ok(
      challenger >
      itf
    );
  }
);

test(
  'Coverage: BLEND penaliza evidencia fuera de superficie',
  () => {
    const surface =
      effectiveSampleForMode(
        'SURFACE',
        8,
        12
      );

    const blend =
      effectiveSampleForMode(
        'BLEND',
        4,
        12
      );

    const all =
      effectiveSampleForMode(
        'ALL',
        0,
        8
      );

    assert.equal(
      surface,
      8
    );

    assert.ok(
      blend < 12
    );

    assert.ok(
      all < 8
    );
  }
);

test(
  'Coverage: 7 eff + soporte de puntos puede ser READY',
  () => {
    const gate =
      coverageReadiness({
        effectiveSample:
          7,

        servePoints:
          420,

        returnPoints:
          405,

        servePointsWonPct:
          63.2,

        returnPointsWonPct:
          37.1
      });

    assert.equal(
      gate.ready,
      true
    );

    assert.equal(
      gate.reason,
      'READY'
    );
  }
);

test(
  'Coverage: muestra insuficiente no se fuerza',
  () => {
    const gate =
      coverageReadiness({
        effectiveSample:
          4.8,

        servePoints:
          500,

        returnPoints:
          500,

        servePointsWonPct:
          63,

        returnPointsWonPct:
          37
      });

    assert.equal(
      gate.ready,
      false
    );

    assert.equal(
      gate.reason,
      'LOW_EFFECTIVE_SAMPLE'
    );
  }
);

test(
  'Coverage: sin soporte de puntos no entra al modelo',
  () => {
    const gate =
      coverageReadiness({
        effectiveSample:
          COVERAGE_LIMITS
            .effectiveReady +
          1,

        servePoints:
          150,

        returnPoints:
          500,

        servePointsWonPct:
          63,

        returnPointsWonPct:
          37
      });

    assert.equal(
      gate.ready,
      false
    );

    assert.equal(
      gate.reason,
      'SERVE_SUPPORT_LOW'
    );
  }
);

test(
  'Coverage: sourceMix separa MAIN y EXTENDED',
  () => {
    const mix =
      sourceMix([
        {
          historySource:
            'MAIN',
          historyWeight:
            1
        },
        {
          historySource:
            'EXTENDED',
          historyWeight:
            0.8
        }
      ]);

    assert.equal(
      mix.main,
      1
    );

    assert.equal(
      mix.extended,
      1
    );

    assert.equal(
      mix.weightedExtended,
      0.8
    );
  }
);

