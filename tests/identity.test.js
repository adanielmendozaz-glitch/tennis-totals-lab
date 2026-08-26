import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildIdentityCatalog,
  nameSimilarity,
  resolvePlayerIdentity
} from '../src/engine/identity.js';

function catalog(names) {
  const rows = [];

  for (
    let i = 0;
    i < names.length;
    i += 2
  ) {
    rows.push({
      winner_name:
        names[i],

      loser_name:
        names[i + 1] ||
        'Control Player'
    });
  }

  return buildIdentityCatalog(
    rows
  );
}

test(
  'Identity: acentos normalizan a EXACT',
  () => {
    const c =
      catalog([
        'Nicolas Mejia',
        'Liam Draxl'
      ]);

    const id =
      resolvePlayerIdentity(
        'Nicolás Mejía',
        c
      );

    assert.equal(
      id.status,
      'EXACT'
    );

    assert.equal(
      id.confidencePct,
      100
    );
  }
);

test(
  'Identity: nombre intermedio puede ser ALIAS único',
  () => {
    const c =
      catalog([
        'Juan Manuel Cerundolo',
        'Fabian Marozsan'
      ]);

    const id =
      resolvePlayerIdentity(
        'Juan Cerundolo',
        c
      );

    assert.equal(
      id.status,
      'ALIAS'
    );

    assert.equal(
      id.canonicalName,
      'Juan Manuel Cerundolo'
    );
  }
);

test(
  'Identity: inicial + apellido solo si es único',
  () => {
    const c =
      catalog([
        'Maria Sakkari',
        'Aryna Sabalenka'
      ]);

    const id =
      resolvePlayerIdentity(
        'M Sakkari',
        c
      );

    assert.equal(
      id.status,
      'ALIAS'
    );
  }
);

test(
  'Identity: apellido/initial ambiguo falla cerrado',
  () => {
    const c =
      catalog([
        'Anna Smith',
        'Player One',
        'Alice Smith',
        'Player Two'
      ]);

    const id =
      resolvePlayerIdentity(
        'A Smith',
        c
      );

    assert.equal(
      id.resolved,
      false
    );

    assert.equal(
      id.status,
      'AMBIGUOUS'
    );
  }
);

test(
  'Identity: TBD nunca se inventa',
  () => {
    const c =
      catalog([
        'Elise Mertens',
        'Clara Tauson'
      ]);

    const id =
      resolvePlayerIdentity(
        'TBD',
        c
      );

    assert.equal(
      id.resolved,
      false
    );

    assert.equal(
      id.status,
      'PLACEHOLDER'
    );
  }
);

test(
  'Identity: typo leve con mismo apellido puede resolver FUZZY',
  () => {
    const c =
      catalog([
        'Maria Timofeeva',
        'Ann Li'
      ]);

    const id =
      resolvePlayerIdentity(
        'Mariya Timofeeva',
        c
      );

    assert.equal(
      id.status,
      'FUZZY'
    );

    assert.ok(
      id.confidencePct >= 88
    );
  }
);

test(
  'Identity similarity permanece acotada',
  () => {
    const score =
      nameSimilarity(
        'Maria',
        'Mariya'
      );

    assert.ok(
      score >= 0 &&
      score <= 1
    );
  }
);

