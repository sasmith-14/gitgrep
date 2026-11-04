# Local fixture benchmark

Run 2026-11-04T04:13:40.070Z. Embedding timeout 10000 ms. Reproduce: `make bench` after seeding and starting the real dependencies. 50 repo documents, 1363760 index bytes including nested chunks. Apple M5, 10 logical CPUs, 16.0 GiB host RAM, darwin/arm64, Node v26.8.1. ES JVM heap 512 MiB. Real embedding model: sentence-transformers/all-MiniLM-L6-v2@c9745ed1d9f207416be6d2e6f8de32d1f16199bf (cpu); libraries {"sentence-transformers":"6.2.0","transformers":"5.22.1","torch":"2.15.0+cpu"}.

| Query cache | Connections | p50 ms | p95 ms | p99 ms | req/s | Requests |
|---|---:|---:|---:|---:|---:|---:|
| cold embeddings | 1 | 21.35 | 30.98 | 49.03 | 44.51 | 446 |
| cached embeddings | 1 | 11.80 | 14.80 | 15.91 | 82.53 | 827 |
| cached embeddings | 8 | 32.91 | 48.18 | 61.53 | 233.63 | 2341 |

Autocannon 8.0.0, HTTP/1.1, pipeline=1, 10 seconds per row, one fixed hybrid query: “tool for building chatbots”. An isolated instance of the production Express app uses real ES and embedding HTTP calls; rate limiting is raised for the harness and request logging disabled. “Cold” deletes only the matching Node query embedding cache entry before each lookup, one connection, after model/JIT warmup; it is not a cold model or cold OS cache. Cached rows prime one embedding then reuse it. ES caches are not cleared between rows. All completed requests returned 200 without degradation; harness rejects errors/non-2xx/degraded results. p95 is computed from observed response times, not substituted with autocannon's p97.5. This small local, single-query run is not a production capacity forecast. Raw counters and timings are in benchmark.json.
