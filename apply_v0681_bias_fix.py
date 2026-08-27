#!/usr/bin/env python3
from __future__ import annotations

import json
import shutil
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path.cwd()
PATCHES = {'src/engine/censo.js': [("    appVersion:\n      '0.6.7',\n",
                          "    appVersion:\n      '0.6.8.1',\n",
                          'Censo guarda versión real'),
                         ('  const readiness =\n    getMarketReadiness(\n      match\n    );\n\n  const price =\n',
                          '  const readiness =\n'
                          '    getMarketReadiness(\n'
                          '      match\n'
                          '    );\n'
                          '\n'
                          '  if (!readiness.eligible) {\n'
                          '    return {\n'
                          '      ok: false,\n'
                          "      reason: 'READINESS_GATE'\n"
                          '    };\n'
                          '  }\n'
                          '\n'
                          '  if (\n'
                          '    decision.audit\n'
                          '      ?.biasGuardBlocked\n'
                          '  ) {\n'
                          '    return {\n'
                          '      ok: false,\n'
                          "      reason: 'BIAS_GUARD'\n"
                          '    };\n'
                          '  }\n'
                          '\n'
                          '  const price =\n',
                          'Censo exige READY real'),
                         ('    expectedGames:\n'
                          '      match.totals\n'
                          '        ?.expectedGames ??\n'
                          '      null,\n'
                          '\n'
                          '    models: {\n',
                          '    expectedGames:\n'
                          '      match.totals\n'
                          '        ?.expectedGames ??\n'
                          '      null,\n'
                          '\n'
                          '    directionBiasAudit: {\n'
                          '      expectedMarketDeltaGames:\n'
                          '        decision.audit\n'
                          '          ?.expectedMarketDeltaGames ??\n'
                          '        null,\n'
                          '\n'
                          '      absExpectedMarketDeltaGames:\n'
                          '        decision.audit\n'
                          '          ?.absExpectedMarketDeltaGames ??\n'
                          '        null,\n'
                          '\n'
                          '      biasGuardStatus:\n'
                          '        decision.audit\n'
                          '          ?.biasGuardStatus ??\n'
                          '        null,\n'
                          '\n'
                          '      structuralFamilyExpected:\n'
                          '        match.totals\n'
                          '          ?.diagnostics\n'
                          '          ?.structuralFamilyExpected ??\n'
                          '        null,\n'
                          '\n'
                          '      familyGap:\n'
                          '        match.totals\n'
                          '          ?.diagnostics\n'
                          '          ?.familyGap ??\n'
                          '        null\n'
                          '    },\n'
                          '\n'
                          '    holdAudit: {\n'
                          '      playerA: {\n'
                          '        finalHoldPct:\n'
                          '          match.matchup\n'
                          '            ?.playerA\n'
                          '            ?.holdPct ??\n'
                          '          null,\n'
                          '\n'
                          '        pointHoldPct:\n'
                          '          match.matchup\n'
                          '            ?.playerA\n'
                          '            ?.pointHoldPct ??\n'
                          '          null,\n'
                          '\n'
                          '        gameCrossCheckPct:\n'
                          '          match.matchup\n'
                          '            ?.playerA\n'
                          '            ?.gameCrossCheckPct ??\n'
                          '          null,\n'
                          '\n'
                          '        correctionPct:\n'
                          '          match.matchup\n'
                          '            ?.playerA\n'
                          '            ?.holdCorrectionPct ??\n'
                          '          null\n'
                          '      },\n'
                          '\n'
                          '      playerB: {\n'
                          '        finalHoldPct:\n'
                          '          match.matchup\n'
                          '            ?.playerB\n'
                          '            ?.holdPct ??\n'
                          '          null,\n'
                          '\n'
                          '        pointHoldPct:\n'
                          '          match.matchup\n'
                          '            ?.playerB\n'
                          '            ?.pointHoldPct ??\n'
                          '          null,\n'
                          '\n'
                          '        gameCrossCheckPct:\n'
                          '          match.matchup\n'
                          '            ?.playerB\n'
                          '            ?.gameCrossCheckPct ??\n'
                          '          null,\n'
                          '\n'
                          '        correctionPct:\n'
                          '          match.matchup\n'
                          '            ?.playerB\n'
                          '            ?.holdCorrectionPct ??\n'
                          '          null\n'
                          '      }\n'
                          '    },\n'
                          '\n'
                          '    models: {\n',
                          'Censo congela auditoría Bias/HOLD')],
 'src/engine/eloLength.js': [('  const shift =\n    0.014 *\n    eloSignal;\n\n  const baseServeA =\n',
                              '  const matchesA =\n'
                              '    Number(\n'
                              '      match.playerA\n'
                              '        ?.profile\n'
                              '        ?.eloMatches || 0\n'
                              '    );\n'
                              '\n'
                              '  const matchesB =\n'
                              '    Number(\n'
                              '      match.playerB\n'
                              '        ?.profile\n'
                              '        ?.eloMatches || 0\n'
                              '    );\n'
                              '\n'
                              '  const eloEvidence =\n'
                              '    clamp(\n'
                              '      Math.min(\n'
                              '        matchesA,\n'
                              '        matchesB\n'
                              '      ) / 30,\n'
                              '      0,\n'
                              '      1\n'
                              '    );\n'
                              '\n'
                              '  /*\n'
                              '   * Antes: 1.4pp máximo fijo.\n'
                              '   * Ahora: ~1.0pp con poca evidencia\n'
                              '   * hasta ~2.0pp con 30+ partidos CORE.\n'
                              '   * Esto distingue mejor favoritos reales.\n'
                              '   */\n'
                              '  const maxShift =\n'
                              '    0.010 +\n'
                              '    0.010 *\n'
                              '    eloEvidence;\n'
                              '\n'
                              '  const shift =\n'
                              '    maxShift *\n'
                              '    eloSignal;\n'
                              '\n'
                              '  const baseServeA =\n',
                              'Elo adaptativo por evidencia CORE'),
                             ('      serveShiftPct:\n        shift * 100\n    }\n  };\n}\n',
                              '      serveShiftPct:\n'
                              '        shift * 100,\n'
                              '\n'
                              '      evidencePct:\n'
                              '        eloEvidence * 100,\n'
                              '\n'
                              '      matchesA,\n'
                              '      matchesB,\n'
                              '\n'
                              '      maxShiftPct:\n'
                              '        maxShift * 100\n'
                              '    }\n'
                              '  };\n'
                              '}\n',
                              'Auditoría Elo')],
 'src/engine/ensemble.js': [('const BASE_WEIGHTS = {\n  structural: 0.45,\n  bayesian: 0.35,\n  elo: 0.20\n};\n',
                             '/*\n'
                             ' * v0.6.8.1 ENSEMBLE DE-CORRELATION\n'
                             ' *\n'
                             ' * Markov y Elo pertenecen a una misma familia.\n'
                             ' * Ya no forman una mayoría artificial 2-vs-1\n'
                             ' * contra Bayes.\n'
                             ' *\n'
                             ' * Pesos efectivos:\n'
                             ' * Markov 45%\n'
                             ' * Bayes  40%\n'
                             ' * Elo    15%\n'
                             ' */\n'
                             'const FAMILY_WEIGHTS = {\n'
                             '  structuralFamily: 0.60,\n'
                             '  bayesian: 0.40\n'
                             '};\n'
                             '\n'
                             'const STRUCTURAL_MIX = {\n'
                             '  markov: 0.75,\n'
                             '  elo: 0.25\n'
                             '};\n',
                             'Definir familias del Ensemble'),
                            ('  const sampleA =\n'
                             '    Number(\n'
                             '      match.playerA\n'
                             '        ?.profile\n'
                             '        ?.sample || 0\n'
                             '    );\n'
                             '\n'
                             '  const sampleB =\n'
                             '    Number(\n'
                             '      match.playerB\n'
                             '        ?.profile\n'
                             '        ?.sample || 0\n'
                             '    );\n',
                             '  const sampleA =\n'
                             '    Number(\n'
                             '      match.playerA\n'
                             '        ?.profile\n'
                             '        ?.effectiveSample ??\n'
                             '      match.playerA\n'
                             '        ?.profile\n'
                             '        ?.sample ??\n'
                             '      0\n'
                             '    );\n'
                             '\n'
                             '  const sampleB =\n'
                             '    Number(\n'
                             '      match.playerB\n'
                             '        ?.profile\n'
                             '        ?.effectiveSample ??\n'
                             '      match.playerB\n'
                             '        ?.profile\n'
                             '        ?.sample ??\n'
                             '      0\n'
                             '    );\n',
                             'Quality usa Effective Sample'),
                            ('  const weights =\n'
                             '    robustWeights(\n'
                             '      structural,\n'
                             '      bayesian,\n'
                             '      elo\n'
                             '    );\n',
                             '  const weights =\n'
                             '    decorrelatedWeights(\n'
                             '      structural,\n'
                             '      bayesian,\n'
                             '      elo\n'
                             '    );\n',
                             'Usar weights de-correlacionados'),
                            ("    version:\n      'ENSEMBLE-0.4.1',\n",
                             "    version:\n      'ENSEMBLE-0.5.0-BIASGUARD',\n",
                             'Actualizar versión Ensemble'),
                            ('      expectedRange:\n'
                             '        round2(\n'
                             '          expectedRange\n'
                             '        ),\n'
                             '\n'
                             '      consensusStatus:\n',
                             '      expectedRange:\n'
                             '        round2(\n'
                             '          expectedRange\n'
                             '        ),\n'
                             '\n'
                             '      familyGap:\n'
                             '        round2(\n'
                             '          weights.familyGap\n'
                             '        ),\n'
                             '\n'
                             '      structuralFamilyExpected:\n'
                             '        round2(\n'
                             '          weights.structuralFamilyExpected\n'
                             '        ),\n'
                             '\n'
                             '      correlationGuard:\n'
                             '        true,\n'
                             '\n'
                             '      consensusStatus:\n',
                             'Diagnóstico de familias')],
 'src/engine/market.js': [('function clamp(value, min = 0, max = 1) {\n',
                           'import {\n'
                           '  getMarketReadiness\n'
                           "} from './readiness.js';\n"
                           '\n'
                           'function clamp(value, min = 0, max = 1) {\n',
                           'Market importa Readiness'),
                          ('function classification({\n  eligible,\n  probability,\n  edge\n}) {\n',
                           '/*\n'
                           ' * Protección simétrica mientras LAB acumula\n'
                           ' * suficiente backtest/calibración.\n'
                           ' *\n'
                           ' * Una diferencia extrema Expected vs línea\n'
                           ' * se audita y se bloquea; no se convierte\n'
                           ' * automáticamente en PLAY.\n'
                           ' */\n'
                           'export function marketBiasGuard(\n'
                           '  expectedGames,\n'
                           '  marketLine,\n'
                           '  threshold = 3.25\n'
                           ') {\n'
                           '  const expected =\n'
                           '    Number(expectedGames);\n'
                           '\n'
                           '  const line =\n'
                           '    Number(marketLine);\n'
                           '\n'
                           '  if (\n'
                           '    !Number.isFinite(expected) ||\n'
                           '    !Number.isFinite(line)\n'
                           '  ) {\n'
                           '    return {\n'
                           '      blocked: true,\n'
                           "      status: 'INVALID',\n"
                           '      deltaGames: null,\n'
                           '      absDeltaGames: null,\n'
                           '      threshold\n'
                           '    };\n'
                           '  }\n'
                           '\n'
                           '  const deltaGames =\n'
                           '    expected - line;\n'
                           '\n'
                           '  const absDeltaGames =\n'
                           '    Math.abs(deltaGames);\n'
                           '\n'
                           '  return {\n'
                           '    blocked:\n'
                           '      absDeltaGames >\n'
                           '      threshold,\n'
                           '\n'
                           '    status:\n'
                           '      absDeltaGames >\n'
                           '      threshold\n'
                           "        ? 'BLOCK'\n"
                           '        : absDeltaGames >= 2.25\n'
                           "          ? 'WATCH'\n"
                           "          : 'OK',\n"
                           '\n'
                           '    deltaGames:\n'
                           '      Math.round(\n'
                           '        deltaGames * 100\n'
                           '      ) / 100,\n'
                           '\n'
                           '    absDeltaGames:\n'
                           '      Math.round(\n'
                           '        absDeltaGames * 100\n'
                           '      ) / 100,\n'
                           '\n'
                           '    threshold\n'
                           '  };\n'
                           '}\n'
                           '\n'
                           'function classification({\n'
                           '  eligible,\n'
                           '  probability,\n'
                           '  edge\n'
                           '}) {\n',
                           'Agregar Market Bias Guard'),
                          ('  const eligible =\n'
                           "    match.state === 'pre' &&\n"
                           '    match.matchup?.markovReady &&\n'
                           "    consensus === 'STABLE' &&\n"
                           '    quality >= 72;\n',
                           '  const readiness =\n'
                           '    getMarketReadiness(\n'
                           '      match\n'
                           '    );\n'
                           '\n'
                           '  const shadow =\n'
                           '    match.totals\n'
                           '      ?.shadowAudit;\n'
                           '\n'
                           '  const shadowBlocked =\n'
                           '    Boolean(\n'
                           '      shadow?.available &&\n'
                           '      shadow.status ===\n'
                           "        'CAUTION'\n"
                           '    );\n'
                           '\n'
                           '  const biasGuard =\n'
                           '    marketBiasGuard(\n'
                           '      match.totals\n'
                           '        ?.expectedGames,\n'
                           '      market.line\n'
                           '    );\n'
                           '\n'
                           '  const eligible =\n'
                           '    readiness.eligible &&\n'
                           '    !shadowBlocked &&\n'
                           '    !biasGuard.blocked;\n',
                           'Unificar Market Gate'),
                          ('    recommendation,\n'
                           '    eligible,\n'
                           '\n'
                           '    reason:\n'
                           '      !eligible\n'
                           '        ? (\n'
                           "            match.state !== 'pre'\n"
                           "              ? 'LIVE_OR_FINAL'\n"
                           "              : consensus !== 'STABLE'\n"
                           "                ? 'CONSENSUS_NOT_STABLE'\n"
                           '                : quality < 72\n'
                           "                  ? 'LOW_QUALITY'\n"
                           "                  : 'DATA_GATE'\n"
                           '          )\n'
                           '        : bestSide === null\n'
                           "          ? 'NO_PRICE'\n"
                           "          : recommendation === 'PASS'\n"
                           "            ? 'NO_EDGE'\n"
                           "            : 'VALUE'\n"
                           '  };\n'
                           '}\n',
                           '    recommendation,\n'
                           '    eligible,\n'
                           '\n'
                           '    audit: {\n'
                           '      readinessScore:\n'
                           '        readiness.score,\n'
                           '\n'
                           '      readinessStatus:\n'
                           '        readiness.status,\n'
                           '\n'
                           '      shadowStatus:\n'
                           '        shadow?.available\n'
                           '          ? shadow.status\n'
                           "          : 'UNAVAILABLE',\n"
                           '\n'
                           '      expectedMarketDeltaGames:\n'
                           '        biasGuard.deltaGames,\n'
                           '\n'
                           '      absExpectedMarketDeltaGames:\n'
                           '        biasGuard.absDeltaGames,\n'
                           '\n'
                           '      biasGuardStatus:\n'
                           '        biasGuard.status,\n'
                           '\n'
                           '      biasGuardBlocked:\n'
                           '        biasGuard.blocked\n'
                           '    },\n'
                           '\n'
                           '    reason:\n'
                           '      !eligible\n'
                           '        ? (\n'
                           '            !readiness.eligible\n'
                           '              ? `READINESS_${readiness.reason}`\n'
                           '              : shadowBlocked\n'
                           "                ? 'SHADOW_CAUTION'\n"
                           '                : biasGuard.blocked\n'
                           "                  ? 'MODEL_MARKET_GAP'\n"
                           "                  : 'DATA_GATE'\n"
                           '          )\n'
                           '        : bestSide === null\n'
                           "          ? 'NO_PRICE'\n"
                           "          : recommendation === 'PASS'\n"
                           "            ? 'NO_EDGE'\n"
                           "            : 'VALUE'\n"
                           '  };\n'
                           '}\n',
                           'Exponer auditoría de Market')],
 'src/engine/matchup.js': [('function weightedLogit(\n'
                            '  a,\n'
                            '  b,\n'
                            '  weightA,\n'
                            '  weightB\n'
                            ') {\n'
                            '  return logistic(\n'
                            '    (\n'
                            '      logit(a) *\n'
                            '      weightA\n'
                            '    ) +\n'
                            '    (\n'
                            '      logit(b) *\n'
                            '      weightB\n'
                            '    )\n'
                            '  );\n'
                            '}\n',
                            'function weightedLogit(\n'
                            '  a,\n'
                            '  b,\n'
                            '  weightA,\n'
                            '  weightB\n'
                            ') {\n'
                            '  return logistic(\n'
                            '    (\n'
                            '      logit(a) *\n'
                            '      weightA\n'
                            '    ) +\n'
                            '    (\n'
                            '      logit(b) *\n'
                            '      weightB\n'
                            '    )\n'
                            '  );\n'
                            '}\n'
                            '\n'
                            '\n'
                            '/*\n'
                            ' * v0.6.8.1 HOLD FUSION\n'
                            ' *\n'
                            ' * Point-model sigue siendo la base.\n'
                            ' * La evidencia observada a nivel game entra\n'
                            ' * según reliability. No fuerza UNDER:\n'
                            ' * game evidence puede subir o bajar el HOLD.\n'
                            ' */\n'
                            'export function blendHoldEvidence(\n'
                            '  pointHold,\n'
                            '  gameHold,\n'
                            '  reliabilityValue\n'
                            ') {\n'
                            '  const evidence =\n'
                            '    clamp(\n'
                            '      Number(\n'
                            '        reliabilityValue || 0\n'
                            '      ),\n'
                            '      0,\n'
                            '      1\n'
                            '    );\n'
                            '\n'
                            '  const gameWeight =\n'
                            '    clamp(\n'
                            '      0.10 +\n'
                            '      evidence * 0.30,\n'
                            '      0.10,\n'
                            '      0.36\n'
                            '    );\n'
                            '\n'
                            '  const pointWeight =\n'
                            '    1 - gameWeight;\n'
                            '\n'
                            '  const hold =\n'
                            '    weightedLogit(\n'
                            '      pointHold,\n'
                            '      gameHold,\n'
                            '      pointWeight,\n'
                            '      gameWeight\n'
                            '    );\n'
                            '\n'
                            '  return {\n'
                            '    hold,\n'
                            '    pointWeight,\n'
                            '    gameWeight\n'
                            '  };\n'
                            '}\n',
                            'Hold Fusion helper'),
                           ('  const projectedHold =\n    holdFromPointProbability(\n      projectedServe\n    );\n',
                            '  const pointModelHold =\n    holdFromPointProbability(\n      projectedServe\n    );\n',
                            'Separar Point-HOLD'),
                           ('  const gameCrossCheck =\n'
                            '    weightedLogit(\n'
                            '      holdEvidence,\n'
                            '      breakConcession,\n'
                            '      0.56,\n'
                            '      0.44\n'
                            '    );\n'
                            '\n'
                            '  return {\n',
                            '  const gameCrossCheck =\n'
                            '    weightedLogit(\n'
                            '      holdEvidence,\n'
                            '      breakConcession,\n'
                            '      0.56,\n'
                            '      0.44\n'
                            '    );\n'
                            '\n'
                            '  const holdFusion =\n'
                            '    blendHoldEvidence(\n'
                            '      pointModelHold,\n'
                            '      gameCrossCheck,\n'
                            '      (\n'
                            '        serverRel +\n'
                            '        returnRel\n'
                            '      ) / 2\n'
                            '    );\n'
                            '\n'
                            '  const projectedHold =\n'
                            '    holdFusion.hold;\n'
                            '\n'
                            '  return {\n',
                            'Fusionar Point-HOLD + Game-HOLD'),
                           ('    holdPct:\n      toPct(\n        projectedHold\n      ),\n\n    baselineServePct:\n',
                            '    holdPct:\n'
                            '      toPct(\n'
                            '        projectedHold\n'
                            '      ),\n'
                            '\n'
                            '    pointHoldPct:\n'
                            '      toPct(\n'
                            '        pointModelHold\n'
                            '      ),\n'
                            '\n'
                            '    baselineServePct:\n',
                            'Exponer Point-HOLD'),
                           ('    holdGapPct:\n'
                            '      toPct(\n'
                            '        projectedHold -\n'
                            '        gameCrossCheck\n'
                            '      ),\n'
                            '\n'
                            '    reliabilityPct:\n',
                            '    holdGapPct:\n'
                            '      toPct(\n'
                            '        pointModelHold -\n'
                            '        gameCrossCheck\n'
                            '      ),\n'
                            '\n'
                            '    holdCorrectionPct:\n'
                            '      toPct(\n'
                            '        projectedHold -\n'
                            '        pointModelHold\n'
                            '      ),\n'
                            '\n'
                            '    holdFusionGameWeightPct:\n'
                            '      toPct(\n'
                            '        holdFusion.gameWeight\n'
                            '      ),\n'
                            '\n'
                            '    reliabilityPct:\n',
                            'Auditar corrección de HOLD')],
 'src/main.js': [("import './v068.css';\nimport './v063-ui.js';\n",
                  "import './v068.css';\n"
                  "import './v063-ui.js';\n"
                  '\n'
                  'import {\n'
                  '  renderDirectionAudit\n'
                  "} from './v0681-ui.js';\n",
                  'Main importa Direction Audit'),
                 ('    <div class="version">ATP + WTA · v0.6.8</div>\n',
                  '    <div class="version">ATP + WTA · v0.6.8.1</div>\n',
                  'Versión visible v0.6.8.1'),
                 ('function renderMatches() {\n'
                  '  renderRanking();\n'
                  '  renderCenso();\n'
                  '  renderLabBank();\n'
                  '\n'
                  '  const list = filteredMatches();\n',
                  'function renderMatches() {\n'
                  '  renderRanking();\n'
                  '  renderCenso();\n'
                  '  renderLabBank();\n'
                  '  renderDirectionAudit(matches);\n'
                  '\n'
                  '  const list = filteredMatches();\n',
                  'Render Direction Audit')]}
SPECIAL_ENSEMBLE = {'end': 'function weightedMetric(',
 'replacement': 'export function decorrelatedWeights(\n'
                '  structural,\n'
                '  bayesian,\n'
                '  elo\n'
                ') {\n'
                '  const structuralFamilyExpected =\n'
                '    STRUCTURAL_MIX.markov *\n'
                '    Number(\n'
                '      structural.expectedGames\n'
                '    ) +\n'
                '    STRUCTURAL_MIX.elo *\n'
                '    Number(\n'
                '      elo.expectedGames\n'
                '    );\n'
                '\n'
                '  const familyGap =\n'
                '    Math.abs(\n'
                '      structuralFamilyExpected -\n'
                '      Number(\n'
                '        bayesian.expectedGames\n'
                '      )\n'
                '    );\n'
                '\n'
                '  return {\n'
                '    structural:\n'
                '      FAMILY_WEIGHTS\n'
                '        .structuralFamily *\n'
                '      STRUCTURAL_MIX.markov,\n'
                '\n'
                '    bayesian:\n'
                '      FAMILY_WEIGHTS\n'
                '        .bayesian,\n'
                '\n'
                '    elo:\n'
                '      FAMILY_WEIGHTS\n'
                '        .structuralFamily *\n'
                '      STRUCTURAL_MIX.elo,\n'
                '\n'
                '    structuralFamilyExpected,\n'
                '    familyGap,\n'
                '    correlationGuard: true\n'
                '  };\n'
                '}\n'
                '\n',
 'start': 'function median3('}
NEW_FILES = {'src/engine/directionBias.js': 'function round1(value) {\n'
                                '  return Math.round(\n'
                                '    Number(value || 0) *\n'
                                '    10\n'
                                '  ) / 10;\n'
                                '}\n'
                                '\n'
                                'function round2(value) {\n'
                                '  return Math.round(\n'
                                '    Number(value || 0) *\n'
                                '    100\n'
                                '  ) / 100;\n'
                                '}\n'
                                '\n'
                                'function mean(values) {\n'
                                '  if (!values.length) {\n'
                                '    return null;\n'
                                '  }\n'
                                '\n'
                                '  return (\n'
                                '    values.reduce(\n'
                                '      (sum, value) =>\n'
                                '        sum + value,\n'
                                '      0\n'
                                '    ) /\n'
                                '    values.length\n'
                                '  );\n'
                                '}\n'
                                '\n'
                                'export function summarizeDirectionBias(\n'
                                '  matches\n'
                                ') {\n'
                                '  const rows =\n'
                                '    (matches || [])\n'
                                '      .filter(match => {\n'
                                '        const decision =\n'
                                '          match.marketDecision;\n'
                                '\n'
                                '        return (\n'
                                '          decision &&\n'
                                "          ['OVER', 'UNDER'].includes(\n"
                                '            decision.bestSide\n'
                                '          ) &&\n'
                                '          Number.isFinite(\n'
                                '            Number(decision.line)\n'
                                '          ) &&\n'
                                '          Number.isFinite(\n'
                                '            Number(\n'
                                '              match.totals\n'
                                '                ?.expectedGames\n'
                                '            )\n'
                                '          )\n'
                                '        );\n'
                                '      })\n'
                                '      .map(match => {\n'
                                '        const decision =\n'
                                '          match.marketDecision;\n'
                                '\n'
                                '        const expected =\n'
                                '          Number(\n'
                                '            match.totals\n'
                                '              .expectedGames\n'
                                '          );\n'
                                '\n'
                                '        const line =\n'
                                '          Number(\n'
                                '            decision.line\n'
                                '          );\n'
                                '\n'
                                '        return {\n'
                                '          side:\n'
                                '            decision.bestSide,\n'
                                '\n'
                                '          recommendation:\n'
                                '            decision.recommendation,\n'
                                '\n'
                                '          expected,\n'
                                '          line,\n'
                                '\n'
                                '          delta:\n'
                                '            expected - line,\n'
                                '\n'
                                '          blocked:\n'
                                '            Boolean(\n'
                                '              decision.audit\n'
                                '                ?.biasGuardBlocked\n'
                                '            )\n'
                                '        };\n'
                                '      });\n'
                                '\n'
                                '  const n = rows.length;\n'
                                '\n'
                                '  const over =\n'
                                '    rows.filter(\n'
                                '      row =>\n'
                                "        row.side === 'OVER'\n"
                                '    ).length;\n'
                                '\n'
                                '  const under =\n'
                                '    rows.filter(\n'
                                '      row =>\n'
                                "        row.side === 'UNDER'\n"
                                '    ).length;\n'
                                '\n'
                                '  const overPct =\n'
                                '    n\n'
                                '      ? over / n * 100\n'
                                '      : 0;\n'
                                '\n'
                                '  const underPct =\n'
                                '    n\n'
                                '      ? under / n * 100\n'
                                '      : 0;\n'
                                '\n'
                                '  const expectedValues =\n'
                                '    rows.map(\n'
                                '      row => row.expected\n'
                                '    );\n'
                                '\n'
                                '  const deltas =\n'
                                '    rows.map(\n'
                                '      row => row.delta\n'
                                '    );\n'
                                '\n'
                                '  const expectedRange =\n'
                                '    expectedValues.length\n'
                                '      ? Math.max(\n'
                                '          ...expectedValues\n'
                                '        ) -\n'
                                '        Math.min(\n'
                                '          ...expectedValues\n'
                                '        )\n'
                                '      : null;\n'
                                '\n'
                                '  const directionSkew =\n'
                                '    n >= 5 &&\n'
                                '    Math.max(\n'
                                '      overPct,\n'
                                '      underPct\n'
                                '    ) >= 80;\n'
                                '\n'
                                '  const compression =\n'
                                '    n >= 5 &&\n'
                                '    expectedRange !== null &&\n'
                                '    expectedRange <= 0.75;\n'
                                '\n'
                                '  const playRows =\n'
                                '    rows.filter(\n'
                                '      row =>\n'
                                '        row.recommendation ===\n'
                                "        'PLAY'\n"
                                '    );\n'
                                '\n'
                                '  const leanRows =\n'
                                '    rows.filter(\n'
                                '      row =>\n'
                                '        row.recommendation ===\n'
                                "        'LEAN'\n"
                                '    );\n'
                                '\n'
                                '  const blocked =\n'
                                '    rows.filter(\n'
                                '      row => row.blocked\n'
                                '    ).length;\n'
                                '\n'
                                '  let status =\n'
                                "    'WAIT_MARKETS';\n"
                                '\n'
                                '  if (n > 0 && n < 5) {\n'
                                '    status =\n'
                                "      'EARLY_SAMPLE';\n"
                                '\n'
                                '  } else if (\n'
                                '    directionSkew ||\n'
                                '    compression\n'
                                '  ) {\n'
                                '    status =\n'
                                "      'AUDIT';\n"
                                '\n'
                                '  } else if (n >= 5) {\n'
                                '    status =\n'
                                "      'NORMAL';\n"
                                '  }\n'
                                '\n'
                                '  return {\n'
                                '    n,\n'
                                '    over,\n'
                                '    under,\n'
                                '\n'
                                '    overPct:\n'
                                '      round1(overPct),\n'
                                '\n'
                                '    underPct:\n'
                                '      round1(underPct),\n'
                                '\n'
                                '    play: {\n'
                                '      total:\n'
                                '        playRows.length,\n'
                                '\n'
                                '      over:\n'
                                '        playRows.filter(\n'
                                '          row =>\n'
                                "            row.side === 'OVER'\n"
                                '        ).length,\n'
                                '\n'
                                '      under:\n'
                                '        playRows.filter(\n'
                                '          row =>\n'
                                "            row.side === 'UNDER'\n"
                                '        ).length\n'
                                '    },\n'
                                '\n'
                                '    lean: {\n'
                                '      total:\n'
                                '        leanRows.length,\n'
                                '\n'
                                '      over:\n'
                                '        leanRows.filter(\n'
                                '          row =>\n'
                                "            row.side === 'OVER'\n"
                                '        ).length,\n'
                                '\n'
                                '      under:\n'
                                '        leanRows.filter(\n'
                                '          row =>\n'
                                "            row.side === 'UNDER'\n"
                                '        ).length\n'
                                '    },\n'
                                '\n'
                                '    avgExpectedMinusLine:\n'
                                '      deltas.length\n'
                                '        ? round2(\n'
                                '            mean(deltas)\n'
                                '          )\n'
                                '        : null,\n'
                                '\n'
                                '    avgAbsExpectedMinusLine:\n'
                                '      deltas.length\n'
                                '        ? round2(\n'
                                '            mean(\n'
                                '              deltas.map(\n'
                                '                value =>\n'
                                '                  Math.abs(value)\n'
                                '              )\n'
                                '            )\n'
                                '          )\n'
                                '        : null,\n'
                                '\n'
                                '    expectedRange:\n'
                                '      expectedRange === null\n'
                                '        ? null\n'
                                '        : round2(\n'
                                '            expectedRange\n'
                                '          ),\n'
                                '\n'
                                '    directionSkew,\n'
                                '    compression,\n'
                                '    blocked,\n'
                                '    status\n'
                                '  };\n'
                                '}\n'
                                '\n',
 'src/v0681-ui.js': 'import {\n'
                    '  summarizeDirectionBias\n'
                    "} from './engine/directionBias.js';\n"
                    '\n'
                    'function ensurePanel() {\n'
                    '  let panel =\n'
                    '    document.querySelector(\n'
                    "      '#directionBiasPanel'\n"
                    '    );\n'
                    '\n'
                    '  if (panel) {\n'
                    '    return panel;\n'
                    '  }\n'
                    '\n'
                    '  const totals =\n'
                    '    document.querySelector(\n'
                    "      '#totalsEnginePanel'\n"
                    '    );\n'
                    '\n'
                    '  if (!totals) {\n'
                    '    return null;\n'
                    '  }\n'
                    '\n'
                    '  totals.insertAdjacentHTML(\n'
                    "    'afterend',\n"
                    '    `\n'
                    '      <section\n'
                    '        id="directionBiasPanel"\n'
                    '        class="direction-bias-panel waiting">\n'
                    '\n'
                    '        <div class="direction-bias-head">\n'
                    '          <div>\n'
                    '            <span>DIRECTION BIAS AUDIT</span>\n'
                    '            <strong>Esperando mercados...</strong>\n'
                    '          </div>\n'
                    '\n'
                    '          <b id="directionBiasBadge">WAIT</b>\n'
                    '        </div>\n'
                    '\n'
                    '        <div class="direction-bias-metrics">\n'
                    '          <div>\n'
                    '            <span>ANALYZED</span>\n'
                    '            <strong id="biasAnalyzed">0</strong>\n'
                    '          </div>\n'
                    '\n'
                    '          <div>\n'
                    '            <span>OVER</span>\n'
                    '            <strong id="biasOver">0</strong>\n'
                    '          </div>\n'
                    '\n'
                    '          <div>\n'
                    '            <span>UNDER</span>\n'
                    '            <strong id="biasUnder">0</strong>\n'
                    '          </div>\n'
                    '\n'
                    '          <div>\n'
                    '            <span>AVG Δ</span>\n'
                    '            <strong id="biasGap">—</strong>\n'
                    '          </div>\n'
                    '        </div>\n'
                    '\n'
                    '        <div\n'
                    '          id="directionBiasDetail"\n'
                    '          class="direction-bias-detail">\n'
                    '        </div>\n'
                    '      </section>\n'
                    '    `\n'
                    '  );\n'
                    '\n'
                    '  return document.querySelector(\n'
                    "    '#directionBiasPanel'\n"
                    '  );\n'
                    '}\n'
                    '\n'
                    'export function renderDirectionAudit(\n'
                    '  matches\n'
                    ') {\n'
                    '  const panel =\n'
                    '    ensurePanel();\n'
                    '\n'
                    '  if (!panel) {\n'
                    '    return;\n'
                    '  }\n'
                    '\n'
                    '  const audit =\n'
                    '    summarizeDirectionBias(\n'
                    '      matches\n'
                    '    );\n'
                    '\n'
                    '  const set = (\n'
                    '    selector,\n'
                    '    value\n'
                    '  ) => {\n'
                    '    const el =\n'
                    '      panel.querySelector(\n'
                    '        selector\n'
                    '      );\n'
                    '\n'
                    '    if (el) {\n'
                    '      el.textContent =\n'
                    '        String(value);\n'
                    '    }\n'
                    '  };\n'
                    '\n'
                    "  set('#biasAnalyzed', audit.n);\n"
                    '\n'
                    '  set(\n'
                    "    '#biasOver',\n"
                    '    `${audit.over} · ${audit.overPct.toFixed(0)}%`\n'
                    '  );\n'
                    '\n'
                    '  set(\n'
                    "    '#biasUnder',\n"
                    '    `${audit.under} · ${audit.underPct.toFixed(0)}%`\n'
                    '  );\n'
                    '\n'
                    '  set(\n'
                    "    '#biasGap',\n"
                    '    audit.avgExpectedMinusLine === null\n'
                    "      ? '—'\n"
                    '      : `${\n'
                    '          audit.avgExpectedMinusLine >= 0\n'
                    "            ? '+'\n"
                    "            : ''\n"
                    '        }${audit.avgExpectedMinusLine.toFixed(2)}`\n'
                    '  );\n'
                    '\n'
                    '  panel.className =\n'
                    '    `direction-bias-panel ${\n'
                    '      audit.status.toLowerCase()\n'
                    '    }`;\n'
                    '\n'
                    '  const badge =\n'
                    '    panel.querySelector(\n'
                    "      '#directionBiasBadge'\n"
                    '    );\n'
                    '\n'
                    '  if (badge) {\n'
                    '    badge.textContent =\n'
                    "      audit.status === 'AUDIT'\n"
                    "        ? 'AUDIT'\n"
                    "        : audit.status === 'NORMAL'\n"
                    "          ? 'OK'\n"
                    "          : audit.status === 'EARLY_SAMPLE'\n"
                    "            ? 'EARLY'\n"
                    "            : 'WAIT';\n"
                    '  }\n'
                    '\n'
                    '  const title =\n'
                    '    panel.querySelector(\n'
                    "      '.direction-bias-head strong'\n"
                    '    );\n'
                    '\n'
                    '  if (title) {\n'
                    '    title.textContent =\n'
                    "      audit.status === 'AUDIT'\n"
                    "        ? 'Sesgo/compresión detectado'\n"
                    "        : audit.status === 'NORMAL'\n"
                    "          ? 'Dirección dentro de rango'\n"
                    "          : audit.status === 'EARLY_SAMPLE'\n"
                    "            ? 'Muestra temprana'\n"
                    "            : 'Esperando mercados...';\n"
                    '  }\n'
                    '\n'
                    '  const detail =\n'
                    '    panel.querySelector(\n'
                    "      '#directionBiasDetail'\n"
                    '    );\n'
                    '\n'
                    '  if (detail) {\n'
                    '    const range =\n'
                    '      audit.expectedRange === null\n'
                    "        ? '—'\n"
                    '        : audit.expectedRange.toFixed(2);\n'
                    '\n'
                    '    detail.innerHTML = `\n'
                    '      <span>\n'
                    '        PLAY\n'
                    '        <strong>\n'
                    '          O ${audit.play.over}\n'
                    '          · U ${audit.play.under}\n'
                    '        </strong>\n'
                    '      </span>\n'
                    '\n'
                    '      <span>\n'
                    '        LEAN\n'
                    '        <strong>\n'
                    '          O ${audit.lean.over}\n'
                    '          · U ${audit.lean.under}\n'
                    '        </strong>\n'
                    '      </span>\n'
                    '\n'
                    '      <span>\n'
                    '        EXPECTED RANGE\n'
                    '        <strong>${range}</strong>\n'
                    '      </span>\n'
                    '\n'
                    '      <span>\n'
                    '        GAP BLOCKS\n'
                    '        <strong>${audit.blocked}</strong>\n'
                    '      </span>\n'
                    '\n'
                    '      ${\n'
                    '        audit.directionSkew\n'
                    '          ? `\n'
                    '            <em>\n'
                    '              DIRECTION SKEW:\n'
                    '              ≥80% hacia un mismo lado.\n'
                    '            </em>\n'
                    '          `\n'
                    "          : ''\n"
                    '      }\n'
                    '\n'
                    '      ${\n'
                    '        audit.compression\n'
                    '          ? `\n'
                    '            <em>\n'
                    '              EXPECTED COMPRESSION:\n'
                    '              Expected Games demasiado agrupados.\n'
                    '            </em>\n'
                    '          `\n'
                    "          : ''\n"
                    '      }\n'
                    '    `;\n'
                    '  }\n'
                    '}\n'
                    '\n',
 'tests/biasGuard.test.js': "import test from 'node:test';\n"
                            "import assert from 'node:assert/strict';\n"
                            '\n'
                            'import {\n'
                            '  blendHoldEvidence\n'
                            "} from '../src/engine/matchup.js';\n"
                            '\n'
                            'import {\n'
                            '  decorrelatedWeights\n'
                            "} from '../src/engine/ensemble.js';\n"
                            '\n'
                            'import {\n'
                            '  marketBiasGuard\n'
                            "} from '../src/engine/market.js';\n"
                            '\n'
                            'import {\n'
                            '  summarizeDirectionBias\n'
                            "} from '../src/engine/directionBias.js';\n"
                            '\n'
                            "test('BiasFix: Hold Fusion queda entre Point y Game evidence', () => {\n"
                            '  const result =\n'
                            '    blendHoldEvidence(\n'
                            '      0.80,\n'
                            '      0.70,\n'
                            '      0.70\n'
                            '    );\n'
                            '\n'
                            '  assert.ok(result.hold < 0.80);\n'
                            '  assert.ok(result.hold > 0.70);\n'
                            '});\n'
                            '\n'
                            "test('BiasFix: reliability aumenta peso de Game evidence', () => {\n"
                            '  const low =\n'
                            '    blendHoldEvidence(\n'
                            '      0.80,\n'
                            '      0.70,\n'
                            '      0.20\n'
                            '    );\n'
                            '\n'
                            '  const high =\n'
                            '    blendHoldEvidence(\n'
                            '      0.80,\n'
                            '      0.70,\n'
                            '      0.90\n'
                            '    );\n'
                            '\n'
                            '  assert.ok(\n'
                            '    high.gameWeight >\n'
                            '    low.gameWeight\n'
                            '  );\n'
                            '});\n'
                            '\n'
                            "test('BiasFix: Ensemble de-correlacionado suma 100%', () => {\n"
                            '  const weights =\n'
                            '    decorrelatedWeights(\n'
                            '      { expectedGames: 25 },\n'
                            '      { expectedGames: 21 },\n'
                            '      { expectedGames: 25 }\n'
                            '    );\n'
                            '\n'
                            '  const total =\n'
                            '    weights.structural +\n'
                            '    weights.bayesian +\n'
                            '    weights.elo;\n'
                            '\n'
                            '  assert.ok(\n'
                            '    Math.abs(total - 1) <\n'
                            '    1e-9\n'
                            '  );\n'
                            '});\n'
                            '\n'
                            "test('BiasFix: pesos efectivos Markov45 Bayes40 Elo15', () => {\n"
                            '  const weights =\n'
                            '    decorrelatedWeights(\n'
                            '      { expectedGames: 25 },\n'
                            '      { expectedGames: 20 },\n'
                            '      { expectedGames: 25 }\n'
                            '    );\n'
                            '\n'
                            '  assert.equal(weights.structural, 0.45);\n'
                            '  assert.equal(weights.bayesian, 0.40);\n'
                            '  assert.equal(weights.elo, 0.15);\n'
                            '});\n'
                            '\n'
                            "test('BiasFix: gap extremo bloquea OVER y UNDER simétricamente', () => {\n"
                            '  assert.equal(\n'
                            '    marketBiasGuard(\n'
                            '      24.5,\n'
                            '      20.0\n'
                            '    ).blocked,\n'
                            '    true\n'
                            '  );\n'
                            '\n'
                            '  assert.equal(\n'
                            '    marketBiasGuard(\n'
                            '      19.0,\n'
                            '      23.0\n'
                            '    ).blocked,\n'
                            '    true\n'
                            '  );\n'
                            '});\n'
                            '\n'
                            "test('BiasFix: gap moderado queda WATCH y no bloquea', () => {\n"
                            '  const guard =\n'
                            '    marketBiasGuard(\n'
                            '      24.5,\n'
                            '      22.0\n'
                            '    );\n'
                            '\n'
                            '  assert.equal(guard.blocked, false);\n'
                            "  assert.equal(guard.status, 'WATCH');\n"
                            '});\n'
                            '\n'
                            "test('BiasFix: auditor detecta 5/5 OVER + Expected comprimido', () => {\n"
                            '  const matches =\n'
                            '    [20, 21.5, 22, 22.5, 21.5]\n'
                            '      .map(\n'
                            '        (line, index) => ({\n'
                            '          totals: {\n'
                            '            expectedGames:\n'
                            '              24.30 +\n'
                            '              index * 0.03\n'
                            '          },\n'
                            '\n'
                            '          marketDecision: {\n'
                            '            line,\n'
                            "            bestSide: 'OVER',\n"
                            '            recommendation:\n'
                            '              index === 0\n'
                            "                ? 'PLAY'\n"
                            "                : 'LEAN',\n"
                            '\n'
                            '            audit: {\n'
                            '              biasGuardBlocked:\n'
                            '                false\n'
                            '            }\n'
                            '          }\n'
                            '        })\n'
                            '      );\n'
                            '\n'
                            '  const audit =\n'
                            '    summarizeDirectionBias(\n'
                            '      matches\n'
                            '    );\n'
                            '\n'
                            '  assert.equal(audit.overPct, 100);\n'
                            '  assert.equal(audit.directionSkew, true);\n'
                            '  assert.equal(audit.compression, true);\n'
                            "  assert.equal(audit.status, 'AUDIT');\n"
                            '});\n'
                            '\n'}
CSS_APPEND = '\n/* v0.6.8.1 DIRECTION BIAS AUDIT */\n\n.direction-bias-panel {\n  overflow: hidden;\n  margin: 12px 0 18px;\n  border: 1px solid #284437;\n  border-radius: 14px;\n  background: #08150e;\n}\n\n.direction-bias-head {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 12px;\n  padding: 12px 13px;\n  border-bottom: 1px solid #1d3328;\n}\n\n.direction-bias-head span {\n  display: block;\n  color: #63eaa0;\n  font-size: 8px;\n  font-weight: 900;\n  letter-spacing: .12em;\n}\n\n.direction-bias-head strong {\n  display: block;\n  margin-top: 3px;\n  font-size: 11px;\n}\n\n.direction-bias-head b {\n  padding: 6px 8px;\n  border-radius: 8px;\n  color: #76e8a7;\n  background: #10331f;\n  font-size: 7px;\n}\n\n.direction-bias-panel.audit {\n  border-color: #6b4c22;\n}\n\n.direction-bias-panel.audit .direction-bias-head {\n  background: rgba(91, 61, 20, .16);\n}\n\n.direction-bias-panel.audit .direction-bias-head b {\n  color: #f0c87a;\n  background: #4c3014;\n}\n\n.direction-bias-panel.early_sample .direction-bias-head b {\n  color: #d9c676;\n  background: #342b12;\n}\n\n.direction-bias-metrics {\n  display: grid;\n  grid-template-columns: repeat(4, 1fr);\n  background: #183025;\n}\n\n.direction-bias-metrics > div {\n  padding: 10px 9px;\n  background: #09160f;\n}\n\n.direction-bias-metrics span,\n.direction-bias-detail > span {\n  display: block;\n  color: #62766b;\n  font-size: 6px;\n  font-weight: 900;\n}\n\n.direction-bias-metrics strong {\n  display: block;\n  margin-top: 4px;\n  color: #e8f1ec;\n  font-size: 12px;\n}\n\n.direction-bias-detail {\n  display: grid;\n  grid-template-columns: repeat(4, 1fr);\n  gap: 1px;\n  background: #172d23;\n}\n\n.direction-bias-detail > span {\n  padding: 9px;\n  background: #0a1710;\n}\n\n.direction-bias-detail > span strong {\n  display: block;\n  margin-top: 4px;\n  color: #dfe9e3;\n  font-size: 8px;\n}\n\n.direction-bias-detail em {\n  grid-column: 1 / -1;\n  padding: 8px 10px;\n  color: #d6b875;\n  background: #20180b;\n  font-size: 7px;\n  font-style: normal;\n  line-height: 1.4;\n}\n\n@media (max-width: 420px) {\n  .direction-bias-metrics,\n  .direction-bias-detail {\n    grid-template-columns: repeat(2, 1fr);\n  }\n}\n'

required = [
    ROOT / "package.json",
    ROOT / "package-lock.json",
    ROOT / "src/main.js",
    ROOT / "src/style.css",
    ROOT / "src/engine/matchup.js",
    ROOT / "src/engine/eloLength.js",
    ROOT / "src/engine/ensemble.js",
    ROOT / "src/engine/market.js",
    ROOT / "src/engine/censo.js",
]

for path in required:
    if not path.exists():
        print(f"[ERROR] Falta {path}")
        print("Ejecuta desde ~/tennis-totals-lab")
        sys.exit(1)

pkg_path = ROOT / "package.json"
pkg = json.loads(pkg_path.read_text(encoding="utf-8"))

if str(pkg.get("version")) != "0.6.8":
    print(f"[ERROR] Esperaba v0.6.8; encontré {pkg.get('version')}")
    sys.exit(1)

stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
backup = ROOT / f".v0681-bias-fix-backup-{stamp}"

for path in required:
    rel = path.relative_to(ROOT)
    dst = backup / rel
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(path, dst)

print(f"[OK] Backup local: {backup.name}")

# Version
pkg["version"] = "0.6.8.1"
pkg_path.write_text(
    json.dumps(pkg, ensure_ascii=False, indent=2) + "\n",
    encoding="utf-8"
)

lock_path = ROOT / "package-lock.json"
lock = json.loads(lock_path.read_text(encoding="utf-8"))
lock["version"] = "0.6.8.1"
if isinstance(lock.get("packages"), dict) and "" in lock["packages"]:
    lock["packages"][""]["version"] = "0.6.8.1"
lock_path.write_text(
    json.dumps(lock, ensure_ascii=False, indent=2) + "\n",
    encoding="utf-8"
)

# Exact patches
for rel, items in PATCHES.items():
    path = ROOT / rel
    text = path.read_text(encoding="utf-8")

    for old, new, label in items:
        if new in text:
            print(f"[OK] {label}: ya aplicado")
            continue

        if old not in text:
            print(f"[ERROR] No encontré patrón: {label}")
            sys.exit(1)

        text = text.replace(old, new, 1)
        print(f"[OK] {label}")

    path.write_text(text, encoding="utf-8")

# Replace old median/robust block in ensemble
ensemble_path = ROOT / "src/engine/ensemble.js"
ensemble = ensemble_path.read_text(encoding="utf-8")

if "export function decorrelatedWeights" not in ensemble:
    start = ensemble.find(SPECIAL_ENSEMBLE["start"])
    end = ensemble.find(SPECIAL_ENSEMBLE["end"])

    if start == -1 or end == -1 or end <= start:
        print("[ERROR] No pude localizar robustWeights/median3")
        sys.exit(1)

    ensemble = (
        ensemble[:start] +
        SPECIAL_ENSEMBLE["replacement"] +
        ensemble[end:]
    )
    ensemble_path.write_text(ensemble, encoding="utf-8")
    print("[OK] robustWeights eliminado; familias activadas")

# New files
for rel, content in NEW_FILES.items():
    path = ROOT / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    print(f"[OK] creado {rel}")

# CSS
style_path = ROOT / "src/style.css"
style = style_path.read_text(encoding="utf-8")
if "/* v0.6.8.1 DIRECTION BIAS AUDIT */" not in style:
    style_path.write_text(
        style + CSS_APPEND,
        encoding="utf-8"
    )
    print("[OK] CSS Direction Bias agregado")

checks = {
    "package 0.6.8.1":
        '"version": "0.6.8.1"' in
        pkg_path.read_text(encoding="utf-8"),
    "visible 0.6.8.1":
        "ATP + WTA · v0.6.8.1" in
        (ROOT / "src/main.js").read_text(encoding="utf-8"),
    "hold fusion":
        "blendHoldEvidence" in
        (ROOT / "src/engine/matchup.js").read_text(encoding="utf-8"),
    "decorrelation":
        "decorrelatedWeights" in
        ensemble_path.read_text(encoding="utf-8"),
    "bias guard":
        "marketBiasGuard" in
        (ROOT / "src/engine/market.js").read_text(encoding="utf-8"),
    "direction audit":
        (ROOT / "src/engine/directionBias.js").exists(),
    "UI audit":
        (ROOT / "src/v0681-ui.js").exists(),
    "censo v0.6.8.1":
        "'0.6.8.1'" in
        (ROOT / "src/engine/censo.js").read_text(encoding="utf-8"),
}

bad = [name for name, ok in checks.items() if not ok]
if bad:
    print("[ERROR] Sanity:", ", ".join(bad))
    sys.exit(1)

print("")
print("============================================================")
print("v0.6.8.1 — DIRECTION BIAS FIX + AUDIT APLICADO")
print("============================================================")
for name in checks:
    print("✓", name)

print("")
print("CAMBIOS:")
print("  ✓ Markov+Elo ya no son 2 votos independientes")
print("  ✓ Pesos efectivos Markov45 / Bayes40 / Elo15")
print("  ✓ Quality usa Effective Sample")
print("  ✓ HOLD fusiona point-model + evidencia real de games")
print("  ✓ Elo distingue mejor favoritos con evidencia CORE")
print("  ✓ Market exige Readiness READY")
print("  ✓ Shadow CAUTION bloquea")
print("  ✓ |Expected-Line| > 3.25 bloquea por seguridad")
print("  ✓ Direction Bias Audit visible")
print("  ✓ Censo guarda versión/auditoría correctas")
print("")
print("IMPORTANTE: esto NO fuerza UNDER.")
print("Si el dato realmente favorece OVER, OVER seguirá apareciendo.")
print("")
print("Ahora ejecuta:")
print("  node --check src/engine/matchup.js")
print("  node --check src/engine/eloLength.js")
print("  node --check src/engine/ensemble.js")
print("  node --check src/engine/market.js")
print("  node --check src/engine/directionBias.js")
print("  node --check src/v0681-ui.js")
print("  node --check src/main.js")
print("  npm test")
print("  npm run build")
print("  npx cap sync android")
print("")
print("Esperado: tests 60 · pass 60 · fail 0")
print("")
print("NO HAGAS PUSH TODAVÍA.")
print("Primero revisamos tests y 3–5 partidos.")
print("")
print(f"Backup local: {backup.name}")
