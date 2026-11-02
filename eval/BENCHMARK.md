# Local fixture benchmark

Run 2026-11-02T09:38:47.626Z. Embedding timeout 10000 ms. Reproduce: `make bench` after seeding and starting the real dependencies. 50 repo documents, 1365040 index bytes including nested chunks. Apple M5, 10 logical CPUs, 16.0 GiB host RAM, darwin/arm64, Node v26.8.1. ES JVM heap 512 MiB. Real embedding model: sentence-transformers/all-MiniLM-L6-v2@c9745ed1d9f207416be6d2e6f8de32d1f16199bf.

| Query cache | Connections | p50 ms | p95 ms | p99 ms | req/s | Requests |
|---|---:|---:|---:|---:|---:|---:|
| cold embeddings | 1 | 30.51 | 62.78 | 69.83 | 27.57 | 276 |
| cached embeddings | 1 | 17.67 | 30.20 | 31.95 | 52.00 | 521 |
| cached embeddings | 8 | 67.06 | 86.07 | 110.99 | 118.41 | 1190 |

Autocannon 8.0.0, HTTP/1.1, pipeline=1, 10 seconds per row, one fixed hybrid query: “tool for building chatbots”. An isolated instance of the production Express app uses real ES and embedding HTTP calls; rate limiting is raised for the harness and request logging disabled. “Cold” deletes only the matching Node query embedding cache entry before each lookup, one connection, after model/JIT warmup; it is not a cold model or cold OS cache. Cached rows prime one embedding then reuse it. ES filesystem/query caches stay warm for all rows. All completed requests returned 200 without degradation; harness rejects errors/non-2xx/degraded results. p95 is computed from observed response times, not substituted with autocannon's p97.5. This small local, single-query run is not a production capacity forecast. Raw counters and timings are in benchmark.json.
