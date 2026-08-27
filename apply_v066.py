#!/usr/bin/env python3
from __future__ import annotations

import json
import shutil
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path.cwd()

REQUIRED = [
    ROOT / 'package.json',
    ROOT / 'src/main.js',
    ROOT / 'src/engine/playerStats.js',
    ROOT / 'src/engine/matchup.js',
    ROOT / 'src/engine/readiness.js',
    ROOT / 'src/engine/ranking.js',
    ROOT / 'src/engine/censo.js',
    ROOT / 'src/workers/totals.worker.js',
    ROOT / 'src/style.css',
]


def fail(msg: str):
    print(f'\n[ERROR] {msg}\n')
    sys.exit(1)


def rep(path: Path, old: str, new: str, label: str):
    text = path.read_text(encoding='utf-8')
    if new in text:
        print(f'[OK] {label}: ya aplicado')
        return
    if old not in text:
        fail(f'No encontré patrón: {label}\nArchivo: {path}')
    path.write_text(text.replace(old, new, 1), encoding='utf-8')
    print(f'[OK] {label}')


for p in REQUIRED:
    if not p.exists():
        fail(f'Ejecuta desde ~/tennis-totals-lab. Falta: {p}')

pkg_path = ROOT / 'package.json'
pkg = json.loads(pkg_path.read_text(encoding='utf-8'))
version = str(pkg.get('version', ''))
if version not in {'0.6.5', '0.6.6'}:
    fail(f'Versión detectada {version}; este parche es 0.6.5 -> 0.6.6')

stamp = datetime.now().strftime('%Y%m%d-%H%M%S')
backup = ROOT / f'.v066-backup-{stamp}'
for rel in [
    'package.json','package-lock.json','src/main.js','src/style.css',
    'src/engine/playerStats.js','src/engine/matchup.js','src/engine/readiness.js',
    'src/engine/ranking.js','src/engine/censo.js','src/workers/totals.worker.js'
]:
    src = ROOT / rel
    if src.exists():
        dst = backup / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
print(f'[OK] Backup: {backup.name}')

pkg['version'] = '0.6.6'
pkg_path.write_text(json.dumps(pkg, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
lock_path = ROOT / 'package-lock.json'
if lock_path.exists():
    lock = json.loads(lock_path.read_text(encoding='utf-8'))
    lock['version'] = '0.6.6'
    if isinstance(lock.get('packages', {}).get(''), dict):
        lock['packages']['']['version'] = '0.6.6'
    lock_path.write_text(json.dumps(lock, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
print('[OK] version -> 0.6.6')

# ------------------------------------------------------------------
# Data Trust engine
# ------------------------------------------------------------------
data_trust = r"""function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Number(value || 0)));
}

function round1(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

export function profileProvenance(profile) {
  const mix = profile?.historyMix || {};
  const main = Math.max(0, Number(mix.main || 0));
  const extended = Math.max(0, Number(mix.extended || 0));
  const total = main + extended;
  const share = total ? extended / total : 0;

  let label = 'NO_DATA';
  if (total > 0 && share === 0) label = 'CORE';
  else if (share <= 0.25) label = 'CORE_HEAVY';
  else if (share <= 0.60) label = 'MIXED';
  else if (share <= 0.85) label = 'EXT_HEAVY';
  else if (total > 0) label = 'EXT_DOMINANT';

  return {
    label,
    main,
    extended,
    extendedSharePct: round1(share * 100)
  };
}

export function profileDataTrust(profile) {
  if (!profile || profile.modelReady === false) {
    return {
      level: 'CAUTION',
      score: 0,
      provenance: profileProvenance(profile),
      reason: profile?.coverageReason || 'NOT_MODEL_READY'
    };
  }

  const provenance = profileProvenance(profile);
  const penalty = {
    CORE: 0,
    CORE_HEAVY: 4,
    MIXED: 10,
    EXT_HEAVY: 18,
    EXT_DOMINANT: 26,
    NO_DATA: 35
  }[provenance.label] ?? 20;

  let score = 100 - penalty;
  const eff = Number(profile.effectiveSample ?? profile.sample ?? 0);
  if (eff < 8) score -= 10;
  else if (eff < 12) score -= 6;
  else if (eff < 16) score -= 3;

  if (profile.sampleType === 'BLEND') score -= 6;
  else if (profile.sampleType === 'ALL') score -= 11;

  if (profile.confidence === 'MEDIUM') score -= 3;
  else if (profile.confidence === 'LOW') score -= 8;

  if (profile.identity?.method === 'ALIAS') score -= 2;
  else if (profile.identity?.method === 'FUZZY') score -= 7;

  score = clamp(score);
  const level = score >= 85 ? 'HIGH' : score >= 72 ? 'MEDIUM' : 'CAUTION';

  return {
    level,
    score: round1(score),
    provenance,
    reason: 'PROFILE_TRUST'
  };
}

export function matchDataTrust(match) {
  const a = profileDataTrust(match?.playerA?.profile);
  const b = profileDataTrust(match?.playerB?.profile);

  if (!match?.playerA?.profile || !match?.playerB?.profile) {
    return { level: 'CAUTION', score: 0, playerA: a, playerB: b, reason: 'PROFILE_MISSING' };
  }

  const minimum = Math.min(a.score, b.score);
  const average = (a.score + b.score) / 2;
  let score = 0.70 * minimum + 0.30 * average;

  if (match.surface === 'UNKNOWN') score -= 20;
  const surfaceConfidence = Number(match.surfaceMeta?.confidencePct || 0);
  if (surfaceConfidence > 0 && surfaceConfidence < 90) {
    score -= Math.min(6, (90 - surfaceConfidence) * 0.20);
  }

  score = clamp(score);
  const level = score >= 85 ? 'HIGH' : score >= 72 ? 'MEDIUM' : 'CAUTION';
  return { level, score: round1(score), playerA: a, playerB: b, reason: 'MATCH_TRUST' };
}

export function shadowDriftStatus(expectedDelta, maxProbabilityDeltaPct) {
  const g = Math.abs(Number(expectedDelta || 0));
  const p = Math.abs(Number(maxProbabilityDeltaPct || 0));
  if (g <= 0.75 && p <= 4) return 'OK';
  if (g <= 1.50 && p <= 8) return 'WATCH';
  return 'CAUTION';
}
"""
(ROOT / 'src/engine/dataTrust.js').write_text(data_trust + '\n', encoding='utf-8')
print('[OK] Data Trust engine creado')

# ------------------------------------------------------------------
# PlayerStats: build CORE-only shadow profiles
# ------------------------------------------------------------------
player = ROOT / 'src/engine/playerStats.js'
rep(player,
"""function profile(
  identity,
  surface,
  index,
  asOf,
  eloOverride = null
) {""",
"""function profile(
  identity,
  surface,
  index,
  asOf,
  eloOverride = null,
  sourceMode = 'COVERAGE'
) {""",
'profile acepta sourceMode')

rep(player,
"""  const source =
    index.players.get(
      identity.canonicalKey
    ) ||
    [];

  /*
   * Point-In-Time:""",
"""  const source =
    index.players.get(
      identity.canonicalKey
    ) ||
    [];

  const scopedSource =
    sourceMode === 'CORE'
      ? source.filter(
          record =>
            record.historySource !== 'EXTENDED'
        )
      : source;

  /*
   * Point-In-Time:""",
'profile CORE scope')

rep(player,
"""  const all =
    source.filter(
      record =>""",
"""  const all =
    scopedSource.filter(
      record =>""",
'PIT usa scopedSource')

rep(player,
"""      const profileA =
        profile(
          identityA,
          surface,
          index,
          cutoffKey,
          pitElo
        );

      const profileB =
        profile(
          identityB,
          surface,
          index,
          cutoffKey,
          pitElo
        );""",
"""      const profileA =
        profile(
          identityA,
          surface,
          index,
          cutoffKey,
          pitElo,
          'COVERAGE'
        );

      const profileB =
        profile(
          identityB,
          surface,
          index,
          cutoffKey,
          pitElo,
          'COVERAGE'
        );

      const coreProfileA =
        profile(
          identityA,
          surface,
          index,
          cutoffKey,
          pitElo,
          'CORE'
        );

      const coreProfileB =
        profile(
          identityB,
          surface,
          index,
          cutoffKey,
          pitElo,
          'CORE'
        );""",
'CORE shadow profiles')

rep(player,
"""          profile:
            profileA
        },

        playerB:""",
"""          profile:
            profileA,

          coreProfile:
            coreProfileA
        },

        playerB:""",
'playerA coreProfile')

rep(player,
"""          profile:
            profileB
        }
      };""",
"""          profile:
            profileB,

          coreProfile:
            coreProfileB
        }
      };""",
'playerB coreProfile')

# ------------------------------------------------------------------
# Matchup: trust + shadow matchup + summary buckets
# ------------------------------------------------------------------
matchup = ROOT / 'src/engine/matchup.js'
rep(matchup,
"""import {
  getTourBaselines,
  selectBaseline
} from './surfaceBaselines.js';""",
"""import {
  getTourBaselines,
  selectBaseline
} from './surfaceBaselines.js';

import {
  matchDataTrust
} from './dataTrust.js';""",
'Matchup importa DataTrust')

rep(matchup,
"""  const audit =
    coverageAudit(
      match,
      baseline
    );

  const playerA =""",
"""  const audit =
    coverageAudit(
      match,
      baseline
    );

  const dataTrust =
    matchDataTrust(match);

  const playerA =""",
'Matchup calcula trust')

rep(matchup,
"""  const averageHold =
    (
      Number(
        playerA.holdPct || 0
      ) +
      Number(
        playerB.holdPct || 0
      )
    ) / 2;

  return {""",
"""  const averageHold =
    (
      Number(
        playerA.holdPct || 0
      ) +
      Number(
        playerB.holdPct || 0
      )
    ) / 2;

  let shadowCore = null;

  if (
    status === 'FULL' &&
    enoughSample(match.playerA?.coreProfile) &&
    enoughSample(match.playerB?.coreProfile)
  ) {
    const shadowA = matchupPlayer(
      match.playerA.coreProfile,
      match.playerB.coreProfile,
      baseline
    );

    const shadowB = matchupPlayer(
      match.playerB.coreProfile,
      match.playerA.coreProfile,
      baseline
    );

    shadowCore = {
      status: 'FULL',
      markovReady: true,
      baselineSurface: baseline.surface,
      playerA: shadowA,
      playerB: shadowB,
      averageHoldPct:
        Math.round(((Number(shadowA.holdPct || 0) + Number(shadowB.holdPct || 0)) / 2) * 10) / 10
    };
  }

  return {""",
'CORE shadow matchup')

rep(matchup,
"""    coverageAudit:
      audit,

    markovReady:""",
"""    coverageAudit:
      audit,

    dataTrust,
    shadowCore,

    markovReady:""",
'trust/shadow en matchup')

rep(matchup,
"""  let noData = 0;
  let markovReady = 0;

  const enriched = [];""",
"""  let noData = 0;
  let markovReady = 0;

  let trustHigh = 0;
  let trustMedium = 0;
  let trustCaution = 0;
  let shadowEligible = 0;

  const enriched = [];""",
'summary trust counters')

rep(matchup,
"""    if (
      matchup.status === 'FULL'
    ) {
      full++;
    } else if (""",
"""    if (
      matchup.status === 'FULL'
    ) {
      full++;

      if (matchup.dataTrust?.level === 'HIGH') trustHigh++;
      else if (matchup.dataTrust?.level === 'MEDIUM') trustMedium++;
      else trustCaution++;

      if (matchup.shadowCore?.markovReady) shadowEligible++;

    } else if (""",
'contar trust en FULL')

rep(matchup,
"""      full,
      partial,
      noData,
      markovReady,

      pointInTime:""",
"""      full,
      partial,
      noData,
      markovReady,

      trustHigh,
      trustMedium,
      trustCaution,
      shadowEligible,

      pointInTime:""",
'summary expone trust')

# ------------------------------------------------------------------
# Worker: coverage-vs-core shadow, 5K each only when CORE ready
# ------------------------------------------------------------------
worker = r"""import {
  simulateEnsembleTotals
} from '../engine/ensemble.js';

import {
  simulateMatchTotals
} from '../engine/montecarlo.js';

import {
  shadowDriftStatus
} from '../engine/dataTrust.js';

function round1(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function curveDelta(coverage, core) {
  const map = new Map((core || []).map(row => [Number(row.line), Number(row.overPct)]));
  const values = [];
  for (const row of coverage || []) {
    const line = Number(row.line);
    if (map.has(line)) values.push(Math.abs(Number(row.overPct) - map.get(line)));
  }
  return {
    meanPct: values.length ? round1(values.reduce((a, b) => a + b, 0) / values.length) : 0,
    maxPct: values.length ? round1(Math.max(...values)) : 0,
    comparedLines: values.length
  };
}

self.onmessage = event => {
  const { type, generation, matches, simulations } = event.data || {};
  if (type !== 'RUN') return;

  const total = matches.length;
  let completed = 0;

  for (const match of matches) {
    try {
      const result = simulateEnsembleTotals(match, simulations);
      const shadowCore = match.matchup?.shadowCore;

      if (shadowCore?.markovReady) {
        try {
          const coverageMarkov = simulateMatchTotals(match, 5000);
          const coreMarkov = simulateMatchTotals({ ...match, matchup: shadowCore }, 5000);
          const expectedDelta = round2(coverageMarkov.expectedGames - coreMarkov.expectedGames);
          const delta = curveDelta(coverageMarkov.curve, coreMarkov.curve);

          result.shadowAudit = {
            available: true,
            mode: 'CORE_ONLY',
            simulations: 5000,
            coverageExpectedGames: round2(coverageMarkov.expectedGames),
            coreExpectedGames: round2(coreMarkov.expectedGames),
            expectedDelta,
            meanProbabilityDeltaPct: delta.meanPct,
            maxProbabilityDeltaPct: delta.maxPct,
            comparedLines: delta.comparedLines,
            status: shadowDriftStatus(expectedDelta, delta.maxPct)
          };
        } catch (error) {
          result.shadowAudit = { available: false, reason: error?.message || 'SHADOW_ERROR' };
        }
      } else {
        result.shadowAudit = { available: false, reason: 'CORE_SAMPLE_NOT_READY' };
      }

      completed++;
      self.postMessage({ type: 'RESULT', generation, matchId: match.id, completed, total, result });
    } catch (error) {
      completed++;
      self.postMessage({
        type: 'MATCH_ERROR', generation, matchId: match.id, completed, total,
        error: error?.message || 'ENSEMBLE_ERROR'
      });
    }
  }

  self.postMessage({ type: 'COMPLETE', generation, completed, total });
};
"""
(ROOT / 'src/workers/totals.worker.js').write_text(worker + '\n', encoding='utf-8')
print('[OK] Shadow Audit 5K coverage vs CORE')

# ------------------------------------------------------------------
# Readiness: effective sample + small trust penalty (not a hard block)
# ------------------------------------------------------------------
readiness = ROOT / 'src/engine/readiness.js'
text = readiness.read_text(encoding='utf-8')
text = text.replace("?.sample || 0", "?.effectiveSample ??\n        match.playerA?.profile?.sample ?? 0", 1)
text = text.replace("?.sample || 0", "?.effectiveSample ??\n        match.playerB?.profile?.sample ?? 0", 1)
readiness.write_text(text, encoding='utf-8')
print('[OK] Readiness usa effective sample')

rep(readiness,
"""  score -=
    disagreementPenalty;

  score =
    clamp(score);""",
"""  score -=
    disagreementPenalty;

  const trustLevel =
    match.matchup?.dataTrust?.level ||
    'UNKNOWN';

  const trustPenalty =
    trustLevel === 'CAUTION'
      ? 8
      : trustLevel === 'MEDIUM'
        ? 3
        : 0;

  score -= trustPenalty;
  score = clamp(score);""",
'Readiness trust penalty')

rep(readiness,
"""      disagreement:
        Math.round(
          disagreement * 10
        ) / 10
    }""",
"""      disagreement:
        Math.round(
          disagreement * 10
        ) / 10,

      dataTrust:
        match.matchup?.dataTrust?.score ?? null,

      dataTrustLevel:
        match.matchup?.dataTrust?.level ?? 'UNKNOWN',

      dataTrustPenalty:
        trustPenalty
    }""",
'Readiness expone trust')

# ------------------------------------------------------------------
# Ranking audit fields
# ------------------------------------------------------------------
ranking = ROOT / 'src/engine/ranking.js'
rep(ranking,
"""    quality,
    disagreement,

    consensus:""",
"""    quality,
    disagreement,

    dataTrust:
      match.matchup?.dataTrust?.level ?? 'CAUTION',

    dataTrustScore:
      match.matchup?.dataTrust?.score ?? 0,

    provenanceA:
      match.matchup?.dataTrust?.playerA?.provenance?.label ?? 'NO_DATA',

    provenanceB:
      match.matchup?.dataTrust?.playerB?.provenance?.label ?? 'NO_DATA',

    shadowStatus:
      match.totals?.shadowAudit?.status ?? 'N/A',

    shadowExpectedDelta:
      match.totals?.shadowAudit?.expectedDelta ?? null,

    consensus:""",
'Ranking audit fields')

# ------------------------------------------------------------------
# Censo snapshot
# ------------------------------------------------------------------
censo = ROOT / 'src/engine/censo.js'
ct = censo.read_text(encoding='utf-8')
ct = ct.replace("'0.6.5'", "'0.6.6'", 1)
censo.write_text(ct, encoding='utf-8')
rep(censo,
"""    id,
    matchId: id,""",
"""    dataTrustAudit: {
      level: match.matchup?.dataTrust?.level ?? null,
      score: match.matchup?.dataTrust?.score ?? null,
      playerA: match.matchup?.dataTrust?.playerA ?? null,
      playerB: match.matchup?.dataTrust?.playerB ?? null,
      shadow: match.totals?.shadowAudit ?? null
    },

    id,
    matchId: id,""",
'Censo congela trust/shadow')

# ------------------------------------------------------------------
# Main UI
# ------------------------------------------------------------------
main = ROOT / 'src/main.js'
mt = main.read_text(encoding='utf-8')
mt = mt.replace('ATP + WTA · v0.6.5', 'ATP + WTA · v0.6.6')
main.write_text(mt, encoding='utf-8')

rep(main,
"""    match.pointInTime?.cutoffKey,

    match.matchup?.playerA?.servePointPct,""",
"""    match.pointInTime?.cutoffKey,
    match.matchup?.dataTrust?.score,
    match.matchup?.shadowCore?.playerA?.servePointPct,
    match.matchup?.shadowCore?.playerB?.servePointPct,

    match.matchup?.playerA?.servePointPct,""",
'cache fingerprint trust/shadow')

trust_html = r'''      ${
        m.dataTrust
          ? `
            <div class="data-trust-strip ${m.dataTrust.level.toLowerCase()}">
              <div>
                <span>DATA TRUST</span>
                <strong>${m.dataTrust.level} · ${Number(m.dataTrust.score).toFixed(1)}</strong>
              </div>
              <div>
                <span>A</span>
                <strong>${m.dataTrust.playerA?.provenance?.label || 'NO_DATA'}</strong>
              </div>
              <div>
                <span>B</span>
                <strong>${m.dataTrust.playerB?.provenance?.label || 'NO_DATA'}</strong>
              </div>
            </div>
          `
          : ''
      }

'''
text = main.read_text(encoding='utf-8')
anchor = """      ${
        m.status !== 'FULL' &&
        m.coverageAudit
          ? `"""
if trust_html not in text:
    if anchor not in text:
        fail('main.js: no encontré Coverage Diagnostic')
    main.write_text(text.replace(anchor, trust_html + anchor, 1), encoding='utf-8')
    print('[OK] Detail DATA TRUST')

shadow_html = r'''      ${
        totals.shadowAudit?.available
          ? `
            <div class="shadow-audit ${totals.shadowAudit.status.toLowerCase()}">
              <div><span>CORE SHADOW</span><strong>${totals.shadowAudit.coreExpectedGames.toFixed(2)}</strong></div>
              <div><span>COVERAGE</span><strong>${totals.shadowAudit.coverageExpectedGames.toFixed(2)}</strong></div>
              <div><span>Δ EXPECTED</span><strong>${totals.shadowAudit.expectedDelta >= 0 ? '+' : ''}${totals.shadowAudit.expectedDelta.toFixed(2)}</strong></div>
              <div><span>MAX P Δ</span><strong>${totals.shadowAudit.maxProbabilityDeltaPct.toFixed(1)} pp</strong></div>
              <div class="shadow-status">SHADOW ${totals.shadowAudit.status} · 5K CORE</div>
            </div>
          `
          : `
            <div class="shadow-audit unavailable">
              SHADOW CORE · NO DISPONIBLE · ${totals.shadowAudit?.reason || 'CORE_SAMPLE_NOT_READY'}
            </div>
          `
      }

'''
text = main.read_text(encoding='utf-8')
anchor = '      <div class="totals-foot">'
if shadow_html not in text:
    if anchor not in text:
        fail('main.js: no encontré totals-foot')
    main.write_text(text.replace(anchor, shadow_html + anchor, 1), encoding='utf-8')
    print('[OK] Detail Shadow Audit')

summary_old = """    ${
      summary.pointInTime
        ? `
          <span>
            POINT-IN-TIME
            <strong>STRICT</strong>
            · ATP ${summary.atp?.cutoffKey || '—'}
            · WTA ${summary.wta?.cutoffKey || '—'}
          </span>
        `
        : ''
    }
  `;"""
summary_new = """    ${
      summary.pointInTime
        ? `
          <span>
            POINT-IN-TIME
            <strong>STRICT</strong>
            · ATP ${summary.atp?.cutoffKey || '—'}
            · WTA ${summary.wta?.cutoffKey || '—'}
          </span>
        `
        : ''
    }

    <span>
      DATA TRUST:
      HIGH <strong>${summary.trustHigh || 0}</strong>
      · MED <strong>${summary.trustMedium || 0}</strong>
      · CAUTION <strong>${summary.trustCaution || 0}</strong>
      · SHADOW <strong>${summary.shadowEligible || 0}</strong>
    </span>
  `;"""
rep(main, summary_old, summary_new, 'Dashboard trust buckets')

# ------------------------------------------------------------------
# CSS
# ------------------------------------------------------------------
style = ROOT / 'src/style.css'
css = style.read_text(encoding='utf-8')
block = r'''
/* v0.6.6 Data Trust & Shadow Audit */
.data-trust-strip {
  display: grid;
  grid-template-columns: 1.35fr 1fr 1fr;
  border-top: 1px solid rgba(255,255,255,.06);
  border-bottom: 1px solid rgba(255,255,255,.06);
  background: rgba(255,255,255,.025);
}
.data-trust-strip > div { padding: 11px 16px; display: flex; flex-direction: column; gap: 4px; }
.data-trust-strip span, .shadow-audit span { font-size: 9px; letter-spacing: .06em; opacity: .58; }
.data-trust-strip strong { font-size: 11px; }
.data-trust-strip.high strong { color: #75eeb0; }
.data-trust-strip.medium strong { color: #dcc66c; }
.data-trust-strip.caution strong { color: #e89b7d; }
.shadow-audit {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  border-top: 1px solid rgba(255,255,255,.06);
  background: rgba(5,22,14,.55);
}
.shadow-audit > div { padding: 11px 12px; display: flex; flex-direction: column; gap: 4px; }
.shadow-audit strong { font-size: 12px; }
.shadow-audit .shadow-status { grid-column: 1 / -1; padding: 9px 12px; font-size: 10px; }
.shadow-audit.ok .shadow-status { color: #75eeb0; }
.shadow-audit.watch .shadow-status { color: #dbc56c; }
.shadow-audit.caution .shadow-status { color: #e89b7d; }
.shadow-audit.unavailable { display: block; padding: 10px 14px; font-size: 10px; opacity: .58; }
'''
if 'v0.6.6 Data Trust & Shadow Audit' not in css:
    style.write_text(css + '\n' + block + '\n', encoding='utf-8')
    print('[OK] CSS v0.6.6')

# ------------------------------------------------------------------
# Tests
# ------------------------------------------------------------------
test_code = r"""import test from 'node:test';
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
"""
(ROOT / 'tests/dataTrust.test.js').write_text(test_code + '\n', encoding='utf-8')
print('[OK] 8 tests Data Trust/Shadow')

print('\n============================================================')
print('Tennis Totals Lab v0.6.6 aplicado')
print('============================================================')
print('Ahora ejecuta:')
print('  node --check src/engine/dataTrust.js')
print('  node --check src/engine/playerStats.js')
print('  node --check src/engine/matchup.js')
print('  node --check src/engine/readiness.js')
print('  node --check src/engine/ranking.js')
print('  node --check src/workers/totals.worker.js')
print('  node --check src/engine/censo.js')
print('  node --check src/main.js')
print('  npm test')
print('  npm run build')
print('  npx cap sync android')
print('Esperado: tests 32 / pass 32 / fail 0')
print('SI todo está verde:')
print('  git status')
print('  git add package.json package-lock.json src tests')
print('  git commit -m "v0.6.6 Data Trust and Shadow Audit"')
print('  git push origin main')
print('  gh run watch')
print(f'Backup local: {backup.name}')
