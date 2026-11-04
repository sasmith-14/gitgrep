const { once } = require('node:events');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const autocannon = require('../backend/node_modules/autocannon');
const { createApp } = require('../backend/dist/src/app');
const { Search } = require('../backend/dist/src/search');
const { readConfig } = require('../backend/dist/src/config');
const root = path.resolve(__dirname, '..');
const percentile = (sorted, p) => sorted[Math.max(0,Math.ceil(sorted.length*p)-1)];

async function scenario(config, name, connections, cold) {
  const events = {};
  const search = new Search(config, undefined, kind => events[kind] = (events[kind] || 0) + 1);
  if (cold) {
    const get = search.embeddings.get.bind(search.embeddings);
    search.embeddings.get = text => { search.embeddings.cache.delete(text); return get(text); };
  }
  const { app } = createApp(config, search);
  const server = app.listen(0, '127.0.0.1');
  await once(server,'listening');
  const url = `http://127.0.0.1:${server.address().port}/api/search?q=tool%20for%20building%20chatbots`;
  try {
    const warm = await fetch(url);
    if (!warm.ok || (await warm.json()).degraded) throw new Error('Benchmark requires non-degraded real upstreams');
    Object.keys(events).forEach(k=>delete events[k]);
    const times = [];
    const result = await new Promise((resolve,reject)=>{
      const run = autocannon({url,connections,duration:10,pipelining:1,timeout:10},(err,result)=>err?reject(err):resolve(result));
      run.on('response',(_client,status,_bytes,time)=>{ if (status===200) times.push(time); });
    });
    if (result.errors || result.non2xx || events.degraded || !times.length) throw new Error(`${name}: errors/non2xx/degradation invalidates run`);
    if (cold && (events.hit || events.miss < times.length || events.miss > times.length + connections)) throw new Error('Cold scenario must miss the query cache on every completed request');
    times.sort((a,b)=>a-b);
    return {name,connections,durationSeconds:result.duration,requests:times.length,
      p50:percentile(times,.5),p95:percentile(times,.95),p99:percentile(times,.99),
      requestsPerSecond:times.length/result.duration,errors:result.errors,non2xx:result.non2xx,events};
  } finally { await new Promise(resolve=>server.close(resolve)); }
}
async function main() {
  const config = {...readConfig(),RATE_LIMIT:1000000,LOG_LEVEL:'silent'};
  const search = new Search(config);
  const index = await search.upstream.request(`/${config.ES_INDEX}/_stats/store`);
  const count = await search.upstream.request(`/${config.ES_INDEX}/_count`);
  const nodes = await search.upstream.request('/_nodes/stats/jvm');
  const model = await search.upstream.request('/health',undefined,true);
  const rows = [];
  rows.push(await scenario(config,'cold embeddings',1,true));
  rows.push(await scenario(config,'cached embeddings',1,false));
  rows.push(await scenario(config,'cached embeddings',8,false));
  const machine = {cpu:os.cpus()[0].model,logicalCpus:os.cpus().length,memoryGiB:os.totalmem()/1024**3,
    platform:os.platform(),arch:os.arch(),node:process.version,esHeapBytes:Object.values(nodes.nodes)[0].jvm.mem.heap_max_in_bytes};
  const report = {date:new Date().toISOString(),machine,indexBytes:index._all.total.store.size_in_bytes,
    repositories:count.count,model,query:'tool for building chatbots',embeddingTimeoutMs:config.EMBED_TIMEOUT_MS,durationPerScenarioSeconds:10,rows};
  fs.writeFileSync(path.join(root,'eval/benchmark.json'),JSON.stringify(report,null,2)+'\n');
  const md = `# Local fixture benchmark\n\nRun ${report.date}. Embedding timeout ${config.EMBED_TIMEOUT_MS} ms. Reproduce: \`make bench\` after seeding and starting the real dependencies. ${count.count} repo documents, ${report.indexBytes} index bytes including nested chunks. ${machine.cpu}, ${machine.logicalCpus} logical CPUs, ${machine.memoryGiB.toFixed(1)} GiB host RAM, ${machine.platform}/${machine.arch}, Node ${machine.node}. ES JVM heap ${(machine.esHeapBytes/1024**2).toFixed(0)} MiB. Real embedding model: ${model.model}@${model.revision} (${model.device}); libraries ${JSON.stringify(model.libraries)}.\n\n| Query cache | Connections | p50 ms | p95 ms | p99 ms | req/s | Requests |\n|---|---:|---:|---:|---:|---:|---:|\n${rows.map(r=>`| ${r.name} | ${r.connections} | ${r.p50.toFixed(2)} | ${r.p95.toFixed(2)} | ${r.p99.toFixed(2)} | ${r.requestsPerSecond.toFixed(2)} | ${r.requests} |`).join('\n')}\n\nAutocannon 8.0.0, HTTP/1.1, pipeline=1, 10 seconds per row, one fixed hybrid query: “${report.query}”. An isolated instance of the production Express app uses real ES and embedding HTTP calls; rate limiting is raised for the harness and request logging disabled. “Cold” deletes only the matching Node query embedding cache entry before each lookup, one connection, after model/JIT warmup; it is not a cold model or cold OS cache. Cached rows prime one embedding then reuse it. ES caches are not cleared between rows. All completed requests returned 200 without degradation; harness rejects errors/non-2xx/degraded results. p95 is computed from observed response times, not substituted with autocannon's p97.5. This small local, single-query run is not a production capacity forecast. Raw counters and timings are in benchmark.json.\n`;
  fs.writeFileSync(path.join(root,'eval/BENCHMARK.md'),md);
  const readmePath=path.join(root,'README.md');
  const table=`<!-- bench:start -->\nRecorded ${report.date}; ${machine.cpu}, ${machine.memoryGiB.toFixed(1)} GiB host RAM, ${count.count} repos. Full conditions in the benchmark report.\n\n| Query cache | Connections | p50 ms | p95 ms | p99 ms | req/s |\n|---|---:|---:|---:|---:|---:|\n${rows.map(r=>`| ${r.name} | ${r.connections} | ${r.p50.toFixed(2)} | ${r.p95.toFixed(2)} | ${r.p99.toFixed(2)} | ${r.requestsPerSecond.toFixed(2)} |`).join('\n')}\n<!-- bench:end -->`;
  fs.writeFileSync(readmePath,fs.readFileSync(readmePath,'utf8').replace(/<!-- bench:start -->[\s\S]*?<!-- bench:end -->/,table));
  console.log(md);
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
