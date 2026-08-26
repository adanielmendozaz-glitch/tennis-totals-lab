import test from 'node:test';
import assert from 'node:assert/strict';

import {
  matchDataTrust,
  profileDataTrust,
  profileProvenance,
  shadowDriftStatus
} from '../src/engine/dataTrust.js';

function p({ main = 24, extended = 0, effectiveSample = 20, sampleType = 'SURFACE', confidence = 'HIGH' } = {}) {
  return {
    modelReady: true,
    effectiveSample,
    sample: 24,
    sampleType,
    confidence,
    identity: { method: 'EXACT' },
    historyMix: { main, extended, weightedMain: main, weightedExtended: extended * 0.8 }
  };
}

test('DataTrust CORE', () => assert.equal(profileProvenance(p()).label, 'CORE'));
test('DataTrust CORE_HEAVY', () => assert.equal(profileProvenance(p({main:18, extended:4})).label, 'CORE_HEAVY'));
test('DataTrust EXT_DOMINANT', () => assert.equal(profileProvenance(p({main:0, extended:24})).label, 'EXT_DOMINANT'));
test('DataTrust CORE fuerte HIGH', () => assert.equal(profileDataTrust(p()).level, 'HIGH'));
test('DataTrust EXT dominant no HIGH', () => assert.notEqual(profileDataTrust(p({main:0, extended:24, effectiveSample:14, confidence:'MEDIUM'})).level, 'HIGH'));
test('DataTrust partido hereda debilidad', () => {
  const t = matchDataTrust({
    surface:'HARD', surfaceMeta:{confidencePct:99},
    playerA:{profile:p()},
    playerB:{profile:p({main:0, extended:24, effectiveSample:10, sampleType:'ALL', confidence:'LOW'})}
  });
  assert.notEqual(t.level, 'HIGH');
});
test('Shadow pequeño OK', () => assert.equal(shadowDriftStatus(0.42, 2.8), 'OK'));
test('Shadow grande CAUTION', () => assert.equal(shadowDriftStatus(2.1, 9.5), 'CAUTION'));

