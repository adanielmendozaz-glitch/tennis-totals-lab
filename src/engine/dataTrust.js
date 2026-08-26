function clamp(value, min = 0, max = 100) {
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

