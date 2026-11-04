import { createHash } from 'node:crypto';
import { platform, arch, cpus, totalmem } from 'node:os';
import { readFileSync, writeFileSync } from 'node:fs';
import { Search } from '../backend/src/search';
import { readConfig } from '../backend/src/config';
import { validateInput } from '../backend/src/query';
import { timings } from '../backend/src/types';
import { metrics } from '../backend/src/eval-metrics';

async function main() {
  const labels = JSON.parse(readFileSync('../eval/queries.json', 'utf8'));
  const output: any = { date: new Date().toISOString(), status: labels.status, candidates: 200,
    conditions: '50-repo fixture; warmed query embeddings; 3 sequential rounds, alternating strategies; plus one 50-query cold embedding-cache pass per strategy; model warm; no load concurrency. RAM not measured.', variants: {} };
  const searches = {
    chunks: new Search(readConfig({ ...process.env, ES_INDEX: 'gitgrep', SEARCH_STRATEGY: 'chunks', EMBED_TIMEOUT_MS: '10000' })),
    balanced: new Search(readConfig({ ...process.env, ES_INDEX: 'gitgrep-balanced', SEARCH_STRATEGY: 'balanced', EMBED_TIMEOUT_MS: '10000' })),
  };
  for (const search of Object.values(searches)) {
    const count = await search.upstream.request(`/${search.config.ES_INDEX}/_count`);
    if (count.count !== 50) throw new Error('Use the 50-repository fixture in both indices');
    for (const item of labels.queries) await search.embeddings.get(validateInput({ q: item.q }, 100).query.text || item.q);
  }
  const samples: any = { chunks: [], balanced: [] };
  for (let round = 0; round < 3; round++) for (const item of labels.queries) {
    for (const name of (round % 2 ? ['balanced', 'chunks'] : ['chunks', 'balanced']) as ('chunks'|'balanced')[]) {
      const response = await searches[name].search(validateInput({ q: item.q }, 100), timings());
      if (response.degraded) throw new Error('Degraded experiment');
      samples[name].push({ id: item.id, ms: response.tookMs,
        ...metrics(response.results.map(r => r.id), item.relevance) });
    }
  }
  for (const [name, search] of Object.entries(searches)) {
    const rows = samples[name];
    const times = rows.map((x: any) => x.ms).sort((a: number,b: number) => a-b);
    const stats = await search.upstream.request(`/${search.config.ES_INDEX}/_stats/docs,store`);
    const avg = (field: string) => rows.reduce((sum: number,x: any) => sum+x[field],0)/rows.length;
    output.variants[name] = { ndcg: avg('ndcg'), mrr: avg('mrr'), recall: avg('recall'),
      p50Ms: times[Math.ceil(times.length*.5)-1], p95Ms: times[Math.ceil(times.length*.95)-1],
      indexBytes: stats._all.primaries.store.size_in_bytes, requests: rows.length };
  }
  for (const [name, search] of Object.entries(searches)) {
    const cold: number[] = [];
    for (const item of labels.queries) {
      search.embeddings.cache.clear();
      const response = await search.search(validateInput({ q: item.q }, 100), timings());
      if (response.degraded) throw new Error('Degraded cold-cache experiment');
      cold.push(response.tookMs);
    }
    cold.sort((a,b) => a-b);
    output.variants[name].coldEmbeddingP95Ms = cold[Math.ceil(cold.length*.95)-1];
    output.variants[name].coldRequests = cold.length;
  }
  output.machine = { platform: platform(), arch: arch(), cpu: cpus()[0]?.model, ramBytes: totalmem(), node: process.version };
  output.model = await searches.chunks.upstream.request('/health', undefined, true);
  output.elasticsearch = (await searches.chunks.upstream.request('/')).version.number;
  output.labelsSha256 = createHash('sha256').update(readFileSync('../eval/queries.json')).digest('hex');
  output.samples = samples;
  writeFileSync('../eval/balanced-results.json',JSON.stringify(output,null,2)+'\n');
  console.log(JSON.stringify({ ...output, samples: undefined },null,2));
}
main().catch(error => { console.error(error); process.exitCode=1; });
