# Audit — 2026-11-02

Inspected all first-party source/configuration, both data file schemas and counts, lockfile dependency metadata and tracked dependency inventory. Vendored libraries and binary assets were inventoried, not read line by line: 25,784 tracked files are mostly installed dependencies.

## Claims versus implementation

README names `embedding_service/`, `fetch_repos.py`, and `index_to_elasticsearch.py`; none exists. Actual files: `services/embedding_service.py`, `scripts/python_script.py`, `scripts/indexing_repos.py`. No Python requirements. Backend's elastic client is accidentally resolved from the root dependencies. API is `/search`, returns ES hits, and accepts only q/minStars. Frontend also sends `language`, which is ignored. Existing frontend will retain a compatibility route while another session adopts `/api`.

Dataset: 500 repos, all Python; 12,275,492 README characters. 36 MB raw plus vector JSON. The old script embeds only the first 1,000 README characters. A sampled stored vector has squared norm 1.000000064; encoding does not explicitly request normalization. Cannot infer normalization of every runtime query from this sample.

## Search correctness

One ES request supplies both `query` and `knn`, so ES adds BM25 and vector scores (incomparable scales). Filter on stars exists only under bool; no knn.filter, so semantic hits bypass it. No language/date/topic mapping or filters. k=5, num_candidates=50, default ES size=10: retrieval and page limits differ. No pagination. Vector similarity is cosine, consistent with MiniLM's intended cosine use, but normalization is implicit. Standard analyzers only, no identifier splitting or partial-name subfield. Destructive index deletion on every seed, generated IDs, no bulk, version alias, or idempotence.

## Reliability and boundaries

No outbound timeouts, retry handling, embedding cache, circuit breaker, degradation, readiness, metrics, request IDs, graceful shutdown, validation beyond nonempty q, or rate limits. parseInt accepts junk/negative input. CORS permits every origin. Exception messages including upstream internals go directly into 500 bodies. Host/port/index literals throughout. Model loaded once on module import, one text per request, synchronous encode in FastAPI's worker thread (not event-loop blocking). No service health or batch/length limits. Fetcher has a token literal placeholder, no timeout/status validation/rate handling/checkpoint/dedup/ETag; README loop sleeps a fixed 0.5s. No real tests: scripts/test.py is a manual network demo. No CI.

## Hygiene and execution baseline

7 local commits, not 4; main ahead of origin/main by 3. Actual origin is search_engine_project.git, not the supplied gitgrep URL. Preserve origin and do not push. Untracked existing .gitignore preserved and extended. venv is 654 MB; .git is 181 MB; root and backend node_modules also tracked. No Python lockfile, Node ranges with lockfiles. No tracked .env outside vendored libraries. Compose runs ES only, security disabled with no prod alternative, heap/memory/health/volume absent. Docker CLI present, daemon unavailable at initial audit. Node v26.8.1, uv 0.12.10 on arm64 macOS.

## Plan and acceptance

0. Record audit before features; each subsequent phase gets a branch and scoped commits, retaining earlier work in ancestry.
1. Extract 50 existing records to a lean sample, remove installed/generated artifacts from every revision with git-filter-repo, preserve a local backup and origin. Pin isolated backend and Python environments.
2. Shared validated Python config; resumable sharded collector; heading-aware token chunks; normalized batch embeddings with content cache; nested chunks in versioned ES indices, bulk failure reporting and atomic alias cutover.
3. Small typed Node service, hand tokenizer, server-side RRF, prefilters, passages, pagination, compare/similar/facets. Preserve legacy /search shape outside binding /api contract.
4. Explicit provisional judgments and reproducible metrics/blending comparator. Execute real runs only if dependencies available; no invented numbers. Benchmark cold/cache cases separately.
5. Boundaries, timeouts/degradation/cache/breaker, observability, unit/property/API/Python and real ES integration checks.
6. Full dev/prod stack, CI gates, deployment and measured portfolio notes. Delete this temporary audit once durable design/evidence docs replace it.

Per-phase execution evidence belongs in docs/evidence/. If Docker/network/model resources prevent execution, record exact failure and an executable TODO instead of claiming success.
