import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app';
import { readConfig } from '../src/config';
import { Search } from '../src/search';
import { Embeddings, Upstreams } from '../src/upstreams';
import { hit } from './helpers';
const config = readConfig({ LOG_LEVEL: 'silent', EMBED_DIMENSION: '3', RATE_LIMIT: '10000' });
function setup(failEmbed = false, failEs = false) {
  const calls: { url: string; body: any }[] = [];
  const upstream = new Upstreams(config, (async (url, options) => {
    const body = options?.body ? JSON.parse(String(options.body)) : null;
    calls.push({ url: String(url), body });
    if (String(url).endsWith('/embed')) {
      if (failEmbed) throw new Error('secret internal model path');
      return Response.json({ embeddings: [[1,0,0]] });
    }
    if (failEs) return Response.json({ error: 'secret ES stack' }, { status: 500 });
    if (String(url).endsWith('/_cluster/health')) return Response.json({ status: 'green' });
    if (String(url).endsWith('/health')) return Response.json({ ready: true, dimension: 3 });
    if (String(url).includes('/_doc/')) return Response.json({ found: true, _source: { embedding: [1,0,0] } });
    if (body?.aggs) return Response.json({ aggregations: { languages: { buckets: [{key:'python',doc_count:1}] }, topics: { buckets: [{key:'cli',doc_count:1}] } } });
    return Response.json({ hits: { total: { value: 1 }, hits: [hit('123')] } });
  }) as typeof fetch);
  return { ...createApp(config,new Search(config,upstream)), calls };
}
test('search contract, cached embedding, headers and legacy route', async () => {
  const { app, calls } = setup();
  const response = await request(app).get('/api/search?q=tool');
  assert.equal(response.status,200);
  assert.equal(response.body.results[0].fullName,'owner/123');
  assert.equal(response.body.degraded,false);
  assert.equal(response.body.timings.parseMs >= 0,true);
  for (const stage of ['parseMs','embedMs','bm25Ms','knnMs','fuseMs']) assert.ok(response.headers['server-timing'].includes(`${stage};dur=`));
  assert.ok(response.headers['x-request-id']);
  assert.equal((await request(app).get('/api/search?q=tool')).status,200);
  assert.equal(calls.filter(c=>c.url.endsWith('/embed')).length,1);
  assert.ok(Array.isArray((await request(app).get('/search?q=tool&language=Python')).body));
});
test('semantic failure falls back to keyword and hides internal messages', async () => {
  const { app } = setup(true);
  for (const mode of ['semantic','hybrid']) {
    const response = await request(app).get(`/api/search?q=tool&mode=${mode}`);
    assert.equal(response.status,200);
    assert.equal(response.body.degradedReason,'embedding_unavailable');
    assert.equal(response.body.results.length,1);
    assert.ok(!JSON.stringify(response.body).includes('secret'));
  }
  const error = await request(setup(false,true).app).get('/api/search?q=tool&mode=keyword');
  assert.equal(error.status,502);
  assert.deepEqual(error.body,{error:{code:'INTERNAL',message:'Upstream unavailable',retryAfterMs:null}});
});
test('validation, compare, similar, cached facets, readiness and metrics', async () => {
  const { app, calls } = setup();
  assert.equal((await request(app).get('/api/search?q=x&size=51')).status,400);
  assert.equal((await request(app).get('/api/search?q=x').set('Origin','https://evil.example')).status,403);
  const compare = await request(app).get('/api/compare?q=tool');
  assert.deepEqual(Object.keys(compare.body).sort(),['degraded','fused','keyword','semantic','tookMs']);
  assert.equal((await request(app).get('/api/similar/123')).status,200);
  assert.equal((await request(app).get('/api/similar/invalid')).status,400);
  await request(app).get('/api/facets'); await request(app).get('/api/facets');
  assert.equal(calls.filter(c=>c.body?.aggs).length,1);
  assert.equal((await request(app).get('/healthz')).status,200);
  assert.equal((await request(app).get('/readyz')).status,200);
  assert.ok((await request(app).get('/metrics')).text.includes('gitgrep_requests_total'));
  const missing = await request(app).get('/missing');
  assert.equal(missing.body.error.code,'NOT_FOUND');
  assert.ok(missing.headers['server-timing']);
});
test('rate limit has contract error and Retry-After', async () => {
  const { app } = createApp({ ...config, RATE_LIMIT: 1 });
  await request(app).get('/api/search');
  const response = await request(app).get('/api/search');
  assert.equal(response.status,429);
  assert.equal(response.body.error.code,'RATE_LIMITED');
  assert.ok(Number(response.headers['retry-after']) > 0);
  assert.ok(response.body.error.retryAfterMs > 0);
});
test('embedding cache bounds, circuit opening and one half-open probe', async () => {
  let calls = 0, fail = true;
  const c = { ...config, EMBED_CACHE_SIZE: 1, BREAKER_FAILURES: 1, BREAKER_RESET_MS: 10 };
  const embedding = new Embeddings(new Upstreams(c,(async () => {
    calls++;
    if (fail) throw new Error('down');
    return Response.json({embeddings:[[1,0,0]]});
  }) as typeof fetch));
  await assert.rejects(embedding.get('a'));
  await assert.rejects(embedding.get('b'));
  assert.equal(calls,1);
  await new Promise(r=>setTimeout(r,15));
  fail = false;
  await Promise.all([embedding.get('a'),embedding.get('a')]);
  assert.equal(calls,2);
  await embedding.get('b');
  assert.deepEqual([...embedding.cache.keys()],['b']);
});
test('outbound timeout is sanitized', async () => {
  const upstream = new Upstreams(config, (async () => { throw new DOMException('secret','TimeoutError'); }) as typeof fetch);
  await assert.rejects(upstream.request('/'), (error: any) => error.code === 'UPSTREAM_TIMEOUT' && !error.message.includes('secret'));
});
test('startup config rejects non-HTTP URLs and invalid ports',()=>{
  assert.throws(()=>readConfig({ES_URL:'file:///etc/passwd'}));
  assert.throws(()=>readConfig({PORT:'65536'}));
  assert.throws(()=>readConfig({TRUST_PROXY_HOPS:'2'}));
});
test('lookahead detects depth cap and pages remain disjoint',async()=>{
  const c = {...config, MAX_DEPTH:3};
  const upstream = new Upstreams(c,(async()=>Response.json({hits:{total:{value:4},hits:['1','2','3','4'].map(id=>hit(id))}})) as typeof fetch);
  const {app}=createApp(c,new Search(c,upstream));
  const first=await request(app).get('/api/search?q=tool&mode=keyword&size=2');
  const second=await request(app).get('/api/search?q=tool&mode=keyword&size=2&page=2');
  assert.equal(first.body.total,3);assert.equal(first.body.totalCapped,true);
  assert.deepEqual(first.body.results.map((r:any)=>r.id),['1','2']);
  assert.deepEqual(second.body.results.map((r:any)=>r.id),['3']);
});
test('readiness failure reports each dependency and canonical error',async()=>{
  const {app}=setup(false,true);
  const response=await request(app).get('/readyz');
  assert.equal(response.status,503);
  assert.equal(response.body.dependencies.elasticsearch,'unavailable');
  assert.equal(response.body.error.code,'INTERNAL');
});
