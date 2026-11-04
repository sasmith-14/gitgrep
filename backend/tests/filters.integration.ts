import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Search } from '../src/search';
import { readConfig } from '../src/config';
import { validateInput } from '../src/query';
import { timings } from '../src/types';

test('real ES: prefiltered semantic/keyword counts equal exhaustive fixture check', async () => {
  const repos = JSON.parse(readFileSync(resolve(process.cwd(),'..','tests/fixtures/repos.json'),'utf8')) as any[];
  const search = new Search(readConfig({ ...process.env, LOG_LEVEL:'silent', MAX_DEPTH:'100', EMBED_TIMEOUT_MS:'10000' }));
  const cases = [
    { lang:'Python' }, { lang:'Rust' }, { minStars:'100000' },
    { lang:'Python', minStars:'100000', pushedAfter:'2025-01-01' },
    { topic: repos.find(r=>r.topics.length)?.topics[0] },
    { lang:'Rust', topic:'cli', minStars:'100' },
  ];
  for (const filter of cases) {
    const expected = repos.filter(r => (!filter.lang || r.language.toLowerCase() === filter.lang.toLowerCase()) &&
      (!filter.minStars || r.stargazers_count >= Number(filter.minStars)) &&
      (!filter.pushedAfter || Date.parse(r.pushed_at) > Date.parse(filter.pushedAfter)) &&
      (!filter.topic || r.topics.includes(filter.topic))).map(r=>String(r.id)).sort();
    for (const mode of ['keyword','semantic','hybrid']) {
      const result = await search.search(validateInput({q:'lang:Python',size:'50',mode,...filter},100),timings());
      assert.equal(result.degraded,false, 'integration must use real model, not fallback');
      assert.equal(result.total,expected.length,JSON.stringify({filter,mode}));
      assert.deepEqual(result.results.map(r=>r.id).sort(),expected,JSON.stringify({filter,mode}));
    }
  }
  const analyzer = await search.upstream.request(`/${search.config.ES_INDEX}/_analyze`, { analyzer:'identifier',text:'fast-api fastAPI' });
  const tokens = analyzer.tokens.map((t:any)=>t.token);
  for (const term of ['fast','api','fastapi']) assert.ok(tokens.includes(term),JSON.stringify(tokens));
  const similar = await search.similar(String(repos[0].id),10,timings());
  assert.equal(similar.results.length,10);
  assert.ok(similar.results.every(r=>r.id!==String(repos[0].id)));
  await assert.rejects(search.similar('99999999999999999',10,timings()),(e:any)=>e.code==='NOT_FOUND');
});

test('real ES: quoted phrases and exclusions prefilter both lists',async()=>{
  const search=new Search(readConfig({...process.env,EMBED_TIMEOUT_MS:'10000'}));
  for (const mode of ['keyword','semantic','hybrid']) {
    const included=await search.search(validateInput({q:'"FastAPI"',mode,size:'50'},100),timings());
    assert.equal(included.degraded,false);
    assert.ok(included.results.some(r=>r.fullName==='fastapi/fastapi'));
    const excluded=await search.search(validateInput({q:'lang:Python -"FastAPI"',mode,size:'50'},100),timings());
    assert.equal(excluded.degraded,false);
    const disallowed=new Set(included.results.map(r=>r.id));
    assert.ok(excluded.results.every(r=>!disallowed.has(r.id)));
    assert.equal(included.total+excluded.total,50);
  }
});
