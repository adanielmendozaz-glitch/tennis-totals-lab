import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseOdds
} from '../src/engine/market.js';

import {
  inferBestOf
} from '../src/engine/montecarlo.js';

import {
  settleResult
} from '../src/engine/censo.js';

test(
  'decimal 1.80 -> break-even y americano correctos',
  () => {
    const price =
      parseOdds(1.80);

    assert.equal(
      price.format,
      'DECIMAL'
    );

    assert.ok(
      Math.abs(
        price.probability -
        1 / 1.8
      ) < 1e-12
    );

    assert.equal(
      price.american,
      -125
    );
  }
);

test(
  'americano -110 -> decimal y break-even correctos',
  () => {
    const price =
      parseOdds(-110);

    assert.equal(
      price.format,
      'AMERICAN'
    );

    assert.ok(
      Math.abs(
        price.probability -
        110 / 210
      ) < 1e-12
    );

    assert.ok(
      Math.abs(
        price.decimal -
        (1 + 100 / 110)
      ) < 1e-12
    );
  }
);

test(
  'settlement OVER/UNDER/PUSH',
  () => {
    assert.equal(
      settleResult(
        'OVER',
        20.5,
        21
      ),
      'WIN'
    );

    assert.equal(
      settleResult(
        'UNDER',
        20.5,
        21
      ),
      'LOSS'
    );

    assert.equal(
      settleResult(
        'OVER',
        20,
        20
      ),
      'PUSH'
    );
  }
);

test(
  'ATP US Open main draw es BO5',
  () => {
    assert.equal(
      inferBestOf({
        tour: 'ATP',
        tournament: 'US Open',
        round: 'Round 1',
        type: 'Singles'
      }),
      5
    );
  }
);

test(
  'US Open qualifying sigue BO3',
  () => {
    assert.equal(
      inferBestOf({
        tour: 'ATP',
        tournament: 'US Open',
        round: 'Qualifying 1st Round',
        type: 'Singles'
      }),
      3
    );
  }
);

test(
  'WTA permanece BO3',
  () => {
    assert.equal(
      inferBestOf({
        tour: 'WTA',
        tournament: 'US Open',
        round: 'Round 1',
        type: 'Singles'
      }),
      3
    );
  }
);

