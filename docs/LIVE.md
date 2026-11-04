# Larger corpus: active on the local website

The local website at **http://localhost:5174** now uses balanced search over **4,000 public repositories**, with 500 each in Python, JavaScript, TypeScript, Rust, Go, Java, C++ and Ruby. This is 80 times the previous 50-repository serving fixture. It includes **96,045 passages** and uses 202,484,995 primary-store bytes (about 193.1 MiB at verification). It is not complete GitHub coverage.

The active pair is ES_INDEX=gitgrep-live and SEARCH_STRATEGY=balanced, backed by gitgrep-live-v1. Repository summaries use int8 HNSW; passages use flat vectors scored only after repository shortlisting. REPO_CANDIDATES=200. The original gitgrep fixture alias and gitgrep-balanced experiment alias remain separate.

[Recorded dataset checks](../eval/live-dataset.json) include actual indexed counts, per-language results, source hashes and a successful check of the website's legacy /search route. [Live benchmark](../eval/LIVE-BENCHMARK.md) and [raw counters](../eval/live-benchmark.json) describe measured performance on this corpus. Fixture relevance numbers are not used as larger-corpus quality results. A [runtime/container snapshot](../eval/live-runtime.json) records ES at 1.37 GiB of its 2 GiB limit; this includes other indices/caches and is neither peak RAM nor a per-index attribution.

## Rebuild and activate

Start the normal development dependencies first. Configure GITHUB_TOKEN in ignored services/.env or the process environment; do not commit it. This run used the existing GitHub credential helper for authentication, with the credential retained only in process memory.

```sh
make live-collect live-seed
FRONTEND_PORT=5174 CORS_ORIGIN=http://localhost:5174 \
  ES_INDEX=gitgrep-live SEARCH_STRATEGY=balanced make up
make live-verify live-bench
```

The collector uses scripts/collection.live.json, data/live-checkpoint.json and an ETag response cache. It prioritizes higher-star buckets and targets 500 repositories per language. Downloads are bounded to eight workers and paced at most eight scheduled starts per second within each page. Worker clients reuse connections; cached HTTP responses and checkpoints support interruption/retry. Checkpoints flush every 20 new repositories and at page boundaries, so interruption can replay a small cached remainder. Source metadata, README downloads, vectors and checkpoints stay outside Git.

The local ignored root .env now persists FRONTEND_PORT=5174, CORS_ORIGIN=http://localhost:5174, ES_INDEX=gitgrep-live, SEARCH_STRATEGY=balanced and REPO_CANDIDATES=200. This makes later make up calls keep the active dataset. Other clones must choose these settings explicitly. Port 5173 currently belongs to another development app; use 5174 for this project.

make live-up rebuilds/starts the backend against the live alias when the rest of the stack is already up. make live-seed generates cached vectors and indexes the versioned target; the indexer uses a 30-second bulk timeout while the interactive API retains its configured request deadlines. For a later replacement snapshot, choose a fresh index version rather than reusing v1: same-version writes do not delete absent repositories.

## Verify the running system

```sh
make live-verify
curl -fsS http://localhost:9200/gitgrep-live/_count
curl -fsS --get http://localhost:5050/api/search \
  --data-urlencode 'q=framework' --data 'lang=Rust&size=3'
```

The acceptance check verifies 4,000 root documents and exactly 500 per configured language, checks int8/flat vector mappings, queries all eight language filters in keyword, semantic and hybrid modes, checks non-degraded responses and request/timing headers, and calls the same /search compatibility route as the React client. /api/search.total remains capped at MAX_DEPTH (100 by default); it is not the full dataset count.

The existing React client still displays a static "500" label. That label is not a live index count; its source remains with the separate frontend session. Search itself uses the verified 4,000-repository index.

## Preserve fixture evaluation and roll back

The 50-repository fixture remains the source for make integration and make eval-check. Those commands access the fixture alias directly; the generalized smoke check discovers an existing result ID and validates returned language values so it also works against the larger website dataset.

To serve the original fixture again, set ES_INDEX=gitgrep and SEARCH_STRATEGY=chunks in the ignored root .env, then restart the backend. Do not use chunk-HNSW retrieval against the live flat-passage index. No index deletion is necessary for rollback.

The 50-query labels still require owner review. There are no owner-reviewed quality scores for all 4,000 repositories. Scheduled refreshes, query-time GitHub discovery, all-GitHub coverage, remote deployment and isolated total-RAM comparisons remain future work. The benchmark is a local fixed-query measurement, not a production capacity guarantee.
