const KEYS = {
  bayes: 'bayesian',
  structural: 'structural',
  elo: 'elo',
  ensemble: 'ensemble'
};

const GRID = [0.50,0.60,0.70,0.80,0.90,1.00];

const finite = v => {
  if (
    v === null ||
    v === undefined ||
    v === ''
  ) {
    return null;
  }

  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const mean = a => a.length
  ? a.reduce((x,y)=>x+y,0)/a.length
  : null;

const r1 = v => Number.isFinite(v)
  ? Math.round(v*10)/10
  : null;

const r2 = v => Number.isFinite(v)
  ? Math.round(v*100)/100
  : null;

const dkey = r => {
  const x = String(r?.date||'').slice(0,10);
  return /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : null;
};

function comparable(records=[]){
  return records.filter(r =>
    finite(r?.actualGames) !== null &&
    Object.values(KEYS).every(
      k => finite(r?.modelBenchmarks?.[k]) !== null
    )
  );
}

const pred = (r,k) => finite(r?.modelBenchmarks?.[k]);

function structuralFamily(r){
  const m = pred(r,KEYS.structural);
  const e = pred(r,KEYS.elo);
  return m===null || e===null ? null : 0.75*m + 0.25*e;
}

function metrics(records,predictor){
  const errors = [];
  for(const r of records){
    const p = finite(predictor(r));
    const a = finite(r?.actualGames);
    if(p===null || a===null) continue;
    errors.push(p-a);
  }
  const ae = errors.map(Math.abs);
  return {
    n: errors.length,
    maeGames: r2(mean(ae)),
    biasGames: r2(mean(errors)),
    rmseGames: errors.length
      ? r2(Math.sqrt(mean(errors.map(x=>x*x))))
      : null,
    overEstimatePct: errors.length
      ? r1(errors.filter(x=>x>0).length/errors.length*100)
      : null,
    withinTwoPct: errors.length
      ? r1(ae.filter(x=>x<=2).length/errors.length*100)
      : null
  };
}

export function strictChronologicalSplit(records=[],trainFraction=0.70){
  const rows = comparable(records)
    .filter(r=>dkey(r))
    .sort((a,b)=>dkey(a).localeCompare(dkey(b)) || String(a.id||'').localeCompare(String(b.id||'')));

  const dates = [...new Set(rows.map(dkey))].sort();

  if(dates.length < 2){
    return {train:[],test:[],trainDates:[],testDates:[],strict:false,reason:'NEED_MULTIPLE_DATES'};
  }

  const target = Math.max(1,Math.floor(rows.length*trainFraction));
  let acc = 0;
  let cut = -1;

  for(let i=0;i<dates.length-1;i++){
    acc += rows.filter(r=>dkey(r)===dates[i]).length;
    if(acc>=target){ cut=i+1; break; }
  }

  if(cut<1){
    cut = Math.max(1,Math.min(dates.length-1,Math.floor(dates.length*trainFraction)));
  }

  const trainDates = dates.slice(0,cut);
  const testDates = dates.slice(cut);
  const tset = new Set(trainDates);
  const hset = new Set(testDates);

  const train = rows.filter(r=>tset.has(dkey(r)));
  const test = rows.filter(r=>hset.has(dkey(r)));

  return {
    train,test,trainDates,testDates,
    strict: train.length>0 && test.length>0 &&
      !trainDates.some(d=>hset.has(d)),
    reason:null
  };
}

function trainBias(records,predictor){
  return metrics(records,predictor).biasGames ?? 0;
}

const corrected = (predictor,bias) => r => {
  const x = finite(predictor(r));
  return x===null ? null : x-bias;
};

const blend = w => r => {
  const b = pred(r,KEYS.bayes);
  const s = structuralFamily(r);
  return b===null || s===null ? null : w*b + (1-w)*s;
};

function selectBlend(train){
  return GRID.map(w=>{
    const raw = blend(w);
    const bias = trainBias(train,raw);
    const fn = corrected(raw,bias);
    return {
      bayesWeight:w,
      structuralFamilyWeight:r2(1-w),
      trainBiasGames:r2(bias),
      trainMaeGames:metrics(train,fn).maeGames,
      predictor:fn
    };
  }).sort((a,b)=>
    (a.trainMaeGames??Infinity)-(b.trainMaeGames??Infinity) ||
    b.bayesWeight-a.bayesWeight
  )[0];
}

function sampleGate(trainN,testN){
  if(trainN>=180 && testN>=75) return {code:'STRONG',label:'STRONG WALK-FORWARD'};
  if(trainN>=60 && testN>=30) return {code:'USEFUL',label:'USEFUL HOLDOUT'};
  return {code:'EARLY',label:'EARLY · DO NOT PROMOTE'};
}

export function summarizeArchitectureAudit(records=[]){
  const rows = comparable(records);
  const split = strictChronologicalSplit(rows);
  const sample = sampleGate(split.train.length,split.test.length);

  const strengthN = rows.filter(r=>finite(r?.strengthGapPp)!==null).length;
  const strengthCoverage = {
    n: strengthN,
    pct: rows.length ? r1(strengthN/rows.length*100) : 0
  };

  if(!split.strict){
    return {
      n:rows.length,sample,split,candidates:[],
      best:null,strengthCoverage,
      promotion:{status:'HOLD',reason:'Se necesitan fechas históricas separadas para un holdout sin leakage.'}
    };
  }

  const bayesRaw = r=>pred(r,KEYS.bayes);
  const ensRaw = r=>pred(r,KEYS.ensemble);

  const bayesBias = trainBias(split.train,bayesRaw);
  const ensBias = trainBias(split.train,ensRaw);

  const bayesCorr = corrected(bayesRaw,bayesBias);
  const ensCorr = corrected(ensRaw,ensBias);
  const picked = selectBlend(split.train);

  const candidates = [
    {key:'bayes_raw',label:'BAYES RAW',fit:'NONE',train:metrics(split.train,bayesRaw),test:metrics(split.test,bayesRaw)},
    {key:'bayes_bias',label:'BAYES BIAS-CORRECTED',fit:`BIAS ${r2(bayesBias)} g`,train:metrics(split.train,bayesCorr),test:metrics(split.test,bayesCorr)},
    {key:'current',label:'CURRENT ENSEMBLE',fit:'45/40/15 PROD',train:metrics(split.train,ensRaw),test:metrics(split.test,ensRaw)},
    {key:'ensemble_bias',label:'ENSEMBLE BIAS-CORRECTED',fit:`BIAS ${r2(ensBias)} g`,train:metrics(split.train,ensCorr),test:metrics(split.test,ensCorr)},
    {key:'blend',label:'TRAIN-SELECTED BLEND',
      fit:`${Math.round(picked.bayesWeight*100)}% BAYES · ${Math.round(picked.structuralFamilyWeight*100)}% STRUCT FAMILY`,
      bayesWeight:picked.bayesWeight,
      train:metrics(split.train,picked.predictor),
      test:metrics(split.test,picked.predictor)}
  ].sort((a,b)=>
    (a.test.maeGames??Infinity)-(b.test.maeGames??Infinity) ||
    Math.abs(a.test.biasGames??Infinity)-Math.abs(b.test.biasGames??Infinity)
  ).map((x,i)=>({...x,rank:i+1}));

  const baseline = candidates.find(x=>x.key==='current');
  const best = candidates[0];
  const improve = baseline?.test?.maeGames>0
    ? r1((baseline.test.maeGames-best.test.maeGames)/baseline.test.maeGames*100)
    : null;

  const ready =
    split.train.length>=60 &&
    split.test.length>=30 &&
    Number.isFinite(improve) &&
    improve>=5 &&
    Math.abs(best.test.biasGames??Infinity)<=1.0;

  return {
    n:rows.length,sample,
    split:{
      ...split,
      trainRange: split.trainDates.length ? `${split.trainDates[0]} → ${split.trainDates.at(-1)}` : '—',
      testRange: split.testDates.length ? `${split.testDates[0]} → ${split.testDates.at(-1)}` : '—'
    },
    candidates,
    best:{
      key:best.key,
      label:best.label,
      testMaeGames:best.test.maeGames,
      testBiasGames:best.test.biasGames,
      improvementVsCurrentPct:improve
    },
    strengthCoverage,
    promotion:{
      status:ready?'CANDIDATE':'HOLD',
      reason:ready
        ? 'Supera al ensemble actual ≥5% en MAE holdout y mantiene |bias| ≤1 juego.'
        : 'Aún no cumple simultáneamente muestra, mejora ≥5% y |bias| ≤1 juego.'
    }
  };
}
