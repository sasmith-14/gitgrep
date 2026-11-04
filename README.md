# gitgrep

grep for repositories, by meaning. An Express API searches GitHub repository metadata and README passages with BM25 and MiniLM vectors, then merges the two ranked lists with Reciprocal Rank Fusion in Node.

I replaced the original score addition because BM25 and cosine have different scales. RRF avoids choosing a score weight, but it can bury a strong result that appears in only one list. The evaluation includes five examples where that happens.

The checked-in corpus is **50 real Python repositories**, extracted from the previous dataset. The collector is configured for 500 repos in each of eight languages (4,000 target); that full collection has **not** been run. I do not claim these fixture results generalize to that corpus.

## Run it

Prerequisites: Git, Node 22+, uv, Docker Engine/Desktop with Compose v2, and enough disk/network access for the model and images. Docker needs about 6 GiB available for development. First build downloads the pinned model into the embedding image; runtime is offline.

```sh
make install
make up
make seed
make verify
```

Open http://localhost:5173. API: http://localhost:5050/api/search?q=fastapi. If another frontend server owns 5173, run `FRONTEND_PORT=5174 make up`; the existing frontend dev server can continue using the API. CORS_ORIGIN must match the browser origin. Frontend source and its dependency upgrades belong to a separate session; the API keeps `/search` compatible while that UI migrates to `/api/search`.

`make up` starts ES, embeddings, API and the existing frontend with healthchecks, memory limits and persistent volumes. `make seed` embeds/indexes the fixture; reruns skip unchanged vectors/documents. `make down` stops services without removing volumes.

To run the backend outside Docker, copy backend/.env.example to backend/.env, then `npm --prefix backend run build && npm --prefix backend start`. Embeddings run with `uv run --frozen uvicorn services.embedding_service:app --host 127.0.0.1 --port 6001`. Port 6001 is deliberate: Node fetch rejects the original port 6000. Config and defaults are validated at startup; service URLs are supplied through environment variables.

## What to inspect

| Area | Implementation | Reproduce/check |
|---|---|---|
| Ranking | Parallel BM25 and nested chunk kNN; RRF k=60; shared prefilters | `make integration` |
| Query API | Operators, explicit overrides, modes, bounded pagination, compare/similar/facets | `make smoke` |
| Pipeline | Adaptive GitHub shards, Public-only ID dedup, checkpoint + ETags, heading chunks, cached normalized batches | `make test` |
| Failures | Embedding timeout → keyword degradation; breaker, bounded LRU, consistent errors | `make test outage-check` |
| Observability | Request IDs, stage timings, structured logs, Prometheus | `make smoke` |
| Production ES | Auth required; read-only key can search but cannot write | `make prod-check` |
| Dependencies | Locked Python/Node trees, CPU Linux runtime, model revision and image digests pinned | `make audit` |

[API contract and recorded responses](docs/API.md) · [Design choices and rejected alternatives](docs/DESIGN.md) · [Single-VM deployment](docs/DEPLOY.md) · [Resume bullets and interview answers](docs/PORTFOLIO.md)

## Measured retrieval quality

**Provisional assistant-authored judgments; owner review required.** There are 50 queries covering names, intent, synonyms, acronyms and typos. Grades are 0–2; unlisted repos currently count as zero. These are a regression fixture, not human ground truth or a held-out benchmark. Review `eval/queries.json`, including false zeros, and fill its ownerReview section before presenting quality claims.

<!-- eval:start -->
Recorded 2026-11-04T04:10:48.685Z; 50 queries / 50 repos, provisional labels.

| Mode | nDCG@10 | MRR@10 | Recall@10 |
|---|---:|---:|---:|
| keyword | 0.7784 | 0.8381 | 0.7917 |
| semantic | 0.8034 | 0.8407 | 0.9067 |
| hybrid-RRF | 0.8239 | 0.8683 | 0.8967 |
| weighted-score | 0.8084 | 0.8547 | 0.8717 |
<!-- eval:end -->

`make eval` runs all four measured variants on the same real ES/model candidate lists and writes [eval/RESULTS.md](eval/RESULTS.md), including five losing queries and per-query ranking evidence. The naive baseline adds 0.5×BM25 + 0.5×ES vector score; its weight was not tuned. Optional cross-encoder and alternate model rows are explicitly unrun. `make eval-check` rejects an absolute nDCG drop greater than 0.05 or a fixture/labels/model/version identity change; `make eval-baseline` replaces the baseline only when explicitly invoked.

Evaluation and load measurement use a recorded 10-second embedding timeout to exclude degraded runs. The public API defaults to 800 ms and serves keyword-only on embedding failure; an initial 800 ms evaluation did abort during model warmup. Warm/cold measurement terms below refer to the query embedding cache, not downloading or starting a model.

## Measured local latency

<!-- bench:start -->
Recorded 2026-11-04T04:13:40.070Z; Apple M5, 16.0 GiB host RAM, 50 repos. Full conditions in the benchmark report.

| Query cache | Connections | p50 ms | p95 ms | p99 ms | req/s |
|---|---:|---:|---:|---:|---:|
| cold embeddings | 1 | 21.35 | 30.98 | 49.03 | 44.51 |
| cached embeddings | 1 | 11.80 | 14.80 | 15.91 | 82.53 |
| cached embeddings | 8 | 32.91 | 48.18 | 61.53 | 233.63 |
<!-- bench:end -->

`make bench` runs pinned autocannon scenarios against the production Express app with real upstreams. It records machine specs, device/library versions, index bytes, request counts, errors and cache counters in [eval/BENCHMARK.md](eval/BENCHMARK.md) and [raw output](eval/benchmark.json). Each row is a 10-second, single-query run. Rate limits are raised only in the isolated harness; ES caches are not cleared between rows. This is a local fixture measurement, not a production capacity forecast.

## Data and index lifecycle

```sh
GITHUB_TOKEN=... make rebuild-data
```

The default config is `scripts/collection.json`: eight languages, star buckets and a created-date interval. Shards with >1,000 results split recursively; an unsplittable single-day/single-star shard fails rather than dropping data. The collector reads full READMEs up to 200 KB, honors rate-limit/reset/retry headers, and persists checkpoints/ETags in ignored data files. Use `uv run --frozen python -m scripts.fetch_repos --refresh` for conditional refreshes. Full collection needs an authenticated quota and may wait for rate resets; no GitHub token was configured in this session.

The chunker strips Markdown noise and splits by heading, falling back to 220 model-token windows with 32-token overlap. Repo vectors contain name, description, topics and intro; nested README vectors return the best passage. All vectors are explicitly normalized, indexed with cosine/HNSW, and cached by model revision + content. Linux's default wheel/image is CPU-only; host auto-selection uses available PyTorch accelerators (MPS on supported macOS). A CUDA host needs a CUDA-enabled Torch build and a corresponding reviewed lockfile; that hardware path was not tested.

The indexer bulk-writes stable repo IDs to versioned indices, skips matching content hashes, reports item failures and moves the `gitgrep` alias only after success. Use a fresh version for a new corpus snapshot: incremental writes to an existing version do not delete records absent from the input. Old indices remain available for rollback. After rebuilding the full corpus, use a separate fixture index/environment for the fixture-only integration/eval commands.

## Tests and CI

`make test` runs Python unit tests and Node unit/property/API tests. The tokenizer gets 1,000 generated Unicode cases and 300 operator-position/override cases. `make integration` uses actual Docker ES and MiniLM, comparing returned IDs/counts to exhaustive fixture predicates across all three modes; it also checks identifier analysis and similar-repo exclusion. `make verify` runs lint, tests, integration, real endpoint smoke checks and the eval gate. [Execution evidence](docs/evidence/verification.txt) records the final commands and outcomes.

GitHub Actions defines those checks, frontend build, dependency audits and image builds. The completed work is published to `sasmith-14/gitgrep`; remote Actions status was not confirmed because the GitHub API returned a rate-limit error. No live deployment URL is claimed. Production ES auth is tested locally with `make prod-check`; read [DEPLOY.md](docs/DEPLOY.md) before using the standalone production Compose file.

## Not done / needs owner attention

- Review the provisional relevance judgments and baseline; collect and evaluate the intended multi-language corpus with your GitHub token.
- Optional reranker, alternate embedding model and CUDA hardware validation were not run. Grafana JSON was skipped.
- Provision a VM/DNS/TLS and run the deployment steps. CI is configured but not yet run remotely.
- Frontend migration and its dependency audit findings remain with the frontend session; its source/lockfile were not changed here.
- History was rewritten and published to `sasmith-14/gitgrep` with an explicit remote-tip lease after owner authorization. Origin now points to that repository. Existing clone owners should re-clone rather than merge the old history. [Cleanup commands and original remote tip](docs/evidence/phase-1.md) preserve the pre-publication record.
