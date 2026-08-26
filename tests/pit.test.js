import test from 'node:test';
import assert from 'node:assert/strict';

import {
  asOfDateKey,
  isDateKeyBeforeAsOf,
  filterRowsBeforeAsOf,
  pointInTimeAudit
} from '../src/engine/pointInTime.js';

test(
  'PIT: normaliza fecha local del partido',
  () => {
    const date =
      new Date(
        2026,
        7,
        25,
        18,
        30,
        0
      );

    assert.equal(
      asOfDateKey(date),
      '20260825'
    );
  }
);

test(
  'PIT: mismo día queda excluido',
  () => {
    assert.equal(
      isDateKeyBeforeAsOf(
        '20260824',
        '20260825'
      ),
      true
    );

    assert.equal(
      isDateKeyBeforeAsOf(
        '20260825',
        '20260825'
      ),
      false
    );

    assert.equal(
      isDateKeyBeforeAsOf(
        '20260826',
        '20260825'
      ),
      false
    );
  }
);

test(
  'PIT: filtra pasado y bloquea futuro',
  () => {
    const rows = [
      {
        tourney_date:
          '20260823',
        id: 1
      },
      {
        tourney_date:
          '20260824',
        id: 2
      },
      {
        tourney_date:
          '20260825',
        id: 3
      },
      {
        tourney_date:
          '20260826',
        id: 4
      }
    ];

    const filtered =
      filterRowsBeforeAsOf(
        rows,
        '20260825'
      );

    assert.deepEqual(
      filtered.map(
        row => row.id
      ),
      [1, 2]
    );
  }
);

test(
  'PIT: cutoff inválido falla cerrado',
  () => {
    const rows = [
      {
        tourney_date:
          '20260820'
      }
    ];

    assert.deepEqual(
      filterRowsBeforeAsOf(
        rows,
        'invalid'
      ),
      []
    );
  }
);

test(
  'PIT audit reporta elegibles/excluidos',
  () => {
    const audit =
      pointInTimeAudit(
        [
          {
            tourney_date:
              '20260820'
          },
          {
            tourney_date:
              '20260825'
          },
          {
            tourney_date:
              '20260826'
          }
        ],
        '20260825'
      );

    assert.equal(
      audit.status,
      'ACTIVE'
    );

    assert.equal(
      audit.eligibleRows,
      1
    );

    assert.equal(
      audit.excludedRows,
      2
    );

    assert.equal(
      audit.sameDayExcluded,
      true
    );
  }
);

