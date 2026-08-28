import test from 'node:test';
import assert from 'node:assert/strict';
import { strictChronologicalSplit, summarizeArchitectureAudit } from '../src/engine/architectureAudit.js';

function rows(dates=10,per=10){
  const out=[]; let id=0;
  for(let d=1;d<=dates;d++){
    const date=`2026-01-${String(d).padStart(2,'0')}`;
    for(let i=0;i<per;i++){
      const actual=18+((d+i)%10);
      out.push({
        id:`m${id++}`,date,actualGames:actual,strengthGapPp:2+(i%5),
        modelBenchmarks:{
          bayesian:actual+0.6,
          structural:actual+2.0,
          elo:actual+2.1,
          ensemble:actual+1.4
        }
      });
    }
  }
  return out;
}

test('v0613 split no comparte fechas',()=>{
  const s=strictChronologicalSplit(rows(8,5));
  assert.equal(s.strict,true);
  const train=new Set(s.trainDates);
  for(const d of s.testDates) assert.equal(train.has(d),false);
});

test('v0613 falla cerrado con una fecha',()=>{
  const s=strictChronologicalSplit(rows(1,40));
  assert.equal(s.strict,false);
});

test('v0613 Bayes supera current en sintético',()=>{
  const a=summarizeArchitectureAudit(rows(10,10));
  const current=a.candidates.find(x=>x.key==='current');
  assert.ok(a.best.testMaeGames < current.test.maeGames);
});

test('v0613 muestra pequeña no promueve',()=>{
  const a=summarizeArchitectureAudit(rows(4,5));
  assert.equal(a.promotion.status,'HOLD');
});

test('v0613 cuenta strength snapshots',()=>{
  const x=rows(5,8); x[0].strengthGapPp=null;
  const a=summarizeArchitectureAudit(x);
  assert.equal(a.strengthCoverage.n,x.length-1);
});
