import { test } from 'node:test';
import assert from 'node:assert/strict';
import { metrics } from '../src/eval-metrics';
test('eval metrics match a hand-ranked relevance list',()=>{
  const m=metrics(['b','x','a'],{a:2,b:1});
  assert.equal(m.mrr,1); assert.equal(m.recall,1);
  assert.equal(m.ndcg,(1+3/Math.log2(4))/(3+1/Math.log2(3)));
  assert.deepEqual(metrics([],{a:2}),{ndcg:0,mrr:0,recall:0});
});
