# Phase 4 execution

Real commands:

```sh
npm --prefix backend run eval -- --write-baseline
# Aborted: Evaluation degraded for q04 (default embedding timeout 800 ms).
EMBED_TIMEOUT_MS=10000 npm --prefix backend run eval -- --write-baseline
# 50 queries, 50 repos, ES 9.4.3; no degraded query accepted.
EMBED_TIMEOUT_MS=10000 npm --prefix backend run bench
# 3 x 10-second autocannon scenarios, real ES + embedding HTTP calls.
npm --prefix backend test
# 12 passed, including hand-calculated nDCG/MRR/recall.
```

Recorded outputs are eval/RESULTS.md, eval/BENCHMARK.md and eval/benchmark.json. The evaluation labels are provisional assistant judgments requiring owner review. The initial timeout failure is deliberately retained here; measurement uses an explicit 10-second upstream budget while the API's default remains 800 ms with keyword degradation. On the recorded Apple M5 / 16 GiB machine, warm-model cold-query-cache p95 was 62.78 ms; cache-warm p95 was 30.20 ms at one connection. These are small-fixture results, not a production SLA.

No reranker, alternate embedding experiment, multi-language full corpus, or public deployment was run. Optional compute-heavy experiments were skipped pending label review, not assigned synthetic scores.
