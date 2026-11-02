import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { Search } from '../backend/src/search';
import { readConfig } from '../backend/src/config';
import { parseQuery } from '../backend/src/query';
import { fuse } from '../backend/src/fusion';
import { timings } from '../backend/src/types';
import { metrics } from '../backend/src/eval-metrics';

async function main() {
  const root = resolve(process.cwd(),'..');
  const read = (p:string) => readFileSync(resolve(root,p),'utf8');
  const hash = (s:string) => createHash('sha256').update(s).digest('hex');
  const labels = JSON.parse(read('eval/queries.json'));
  const failureNotes = JSON.parse(read('eval/failure-notes.json'));
  const fixture = JSON.parse(read('tests/fixtures/repos.json'));
  const config = readConfig();
  const search = new Search(config);
  const health = await search.upstream.request('/health',undefined,true);
  const es = await search.upstream.request('/');
  const indexed = await search.upstream.request(`/${config.ES_INDEX}/_count`);
  if (indexed.count !== fixture.length) throw new Error('Eval requires exactly the fixture corpus; seed a dedicated ES_INDEX');
  const results: any[] = [];
  for (const item of labels.queries) {
    const query = parseQuery(item.q);
    const lists = await search.lists({query,mode:'hybrid',page:1,size:10},timings());
    if (lists.degradedReason) throw new Error(`Evaluation degraded for ${item.id}; fix embedding service before reporting`);
    const scores = new Map<string,number>();
    for (const list of [lists.keyword,lists.semantic]) for (const h of list) scores.set(h._id,(scores.get(h._id) ?? 0)+.5*h._score);
    const rankings = { keyword: lists.keyword.slice(0,10).map(h=>h._id), semantic: lists.semantic.slice(0,10).map(h=>h._id),
      'hybrid-RRF': fuse(lists.keyword,lists.semantic,query,config.RRF_K).slice(0,10).map(r=>r.id),
      'weighted-score': [...scores].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,10).map(x=>x[0]) };
    results.push({id:item.id,q:item.q,category:item.category, rankings,
      metrics:Object.fromEntries(Object.entries(rankings).map(([mode,ranking])=>[mode,metrics(ranking,item.relevance)]))});
  }
  const modes = ['keyword','semantic','hybrid-RRF','weighted-score'];
  const averages = Object.fromEntries(modes.map(mode=>[mode,Object.fromEntries(['ndcg','mrr','recall'].map(metric=>
    [metric,results.reduce((sum,r)=>sum+r.metrics[mode][metric],0)/results.length]))]));
  const identity = { fixtureHash:hash(read('tests/fixtures/repos.json')),labelsHash:hash(read('eval/queries.json')),
    model:health.model,revision:health.revision,libraries:{'sentence-transformers':health.libraries?.['sentence-transformers'],transformers:health.libraries?.transformers},esVersion:es.version.number,rrfK:config.RRF_K };
  const artifact = { embeddingTimeoutMs:config.EMBED_TIMEOUT_MS, date:new Date().toISOString(),status:labels.status,identity,queries:results.length,documents:indexed.count,averages,results };
  const baselinePath = resolve(root,'eval/baseline.json');
  if (process.argv.includes('--write-baseline')) writeFileSync(baselinePath,JSON.stringify({identity,ndcg:averages['hybrid-RRF'].ndcg,threshold:.05},null,2)+'\n');
  if (process.argv.includes('--check')) {
    const baseline = JSON.parse(readFileSync(baselinePath,'utf8'));
    if (JSON.stringify(baseline.identity)!==JSON.stringify(identity)) throw new Error('Baseline identity mismatch; review corpus/model/labels before replacing it');
    if (averages['hybrid-RRF'].ndcg < baseline.ndcg-baseline.threshold) throw new Error('Fixture nDCG regression exceeds absolute 0.05');
  }
  mkdirSync(resolve(root,'eval/runs'),{recursive:true});
  writeFileSync(resolve(root,'eval/runs/latest.json'),JSON.stringify(artifact,null,2)+'\n');
  const losses = results.filter(r=>r.metrics['hybrid-RRF'].ndcg < Math.max(r.metrics.keyword.ndcg,r.metrics.semantic.ndcg))
    .sort((a,b)=>(Math.max(b.metrics.keyword.ndcg,b.metrics.semantic.ndcg)-b.metrics['hybrid-RRF'].ndcg)-(Math.max(a.metrics.keyword.ndcg,a.metrics.semantic.ndcg)-a.metrics['hybrid-RRF'].ndcg)).slice(0,5);
  const names = Object.fromEntries(fixture.map((r:any)=>[String(r.id),r.full_name]));
  const rows = modes.map(mode=>`| ${mode} | ${averages[mode].ndcg.toFixed(4)} | ${averages[mode].mrr.toFixed(4)} | ${averages[mode].recall.toFixed(4)} |`).join('\n');
  const failures = losses.map(r=>`- **${r.q}**: keyword ${r.metrics.keyword.ndcg.toFixed(4)}, semantic ${r.metrics.semantic.ndcg.toFixed(4)}, RRF ${r.metrics['hybrid-RRF'].ndcg.toFixed(4)}. Lexical #1: ${names[r.rankings.keyword[0]] ?? 'none'}; semantic #1: ${names[r.rankings.semantic[0]] ?? 'none'}; fused #1: ${names[r.rankings['hybrid-RRF'][0]]}. ${failureNotes[r.id] ?? 'Rank consensus changed the ordering relative to the stronger single list; inspect the saved candidates and provisional labels before attributing this to model quality.'}`).join('\n');
  const report = `# Fixture evaluation\n\nRun: ${artifact.date}. Embedding timeout ${config.EMBED_TIMEOUT_MS} ms. ${results.length} queries, ${indexed.count} repositories. **${labels.status}**. Labels are provisional assistant judgments, not human ground truth. Unlisted repos count as zero for this experiment, so recall is only relative to nominated positives. Owner review is required in queries.json. This tiny Python-only sample is a correctness/regression fixture, not evidence of generalization.\n\nReproduce: \`make eval\` after \`make seed\`. CI: \`make eval-check\` (absolute nDCG tolerance 0.05 against reviewed-in baseline identity).\n\n| Mode | nDCG@10 | MRR@10 | Recall@10 |\n|---|---:|---:|---:|\n${rows}\n| hybrid+rerank | not run | not run | not run |\n| alternative model | not run | not run | not run |\n\nWeighted baseline adds 0.5×raw BM25 + 0.5×ES cosine score on the same candidate lists. It has no per-query normalization or tuned weight. RRF k=${config.RRF_K}. Optional cross-encoder and alternative model were omitted pending owner-reviewed labels; no quality benefit is claimed.\n\n## Failure analysis\n\n${losses.length < 5 ? `Only ${losses.length} losing queries were observed; no extra failures are invented.\n\n` : ''}${failures || 'No losing queries observed on these provisional labels.'}\n\n## Provenance\n\nModel: ${health.model}@${health.revision}. ES ${es.version.number}. Fixture SHA256 ${identity.fixtureHash}; labels SHA256 ${identity.labelsHash}. Raw per-query rankings: eval/runs/latest.json (generated, ignored by git).\n`;
  writeFileSync(resolve(root,'eval/RESULTS.md'),report);
  console.log(report);
}
main().catch(error=>{ console.error(error.message);process.exitCode=1; });
