# Balanced retrieval experiment

Recorded 2026-11-04T06:01:00.875Z. **Provisional assistant-authored labels; owner review required.**

The balanced path is enabled on the larger local website. The fixture comparison below is historical; [LIVE.md](LIVE.md) describes the 4,000-repo activation. The default fresh-checkout fixture remains separate. It shortlists repositories using int8 HNSW summary vectors, then computes exact passage cosine scores only within those repositories. Passage vectors use a flat index, avoiding passage HNSW graphs. This changes internal retrieval and index layout; the public API contract is unchanged.

## Measured comparison

| Strategy | nDCG@10 | MRR@10 | Recall@10 | Warm p50 ms | Warm p95 ms | Cold embedding p95 ms | Index bytes |
|---|---:|---:|---:|---:|---:|---:|---:|
| Chunk HNSW (default) | 0.8239 | 0.8683 | 0.8967 | 12.26 | 20.92 | 25.50 | 1363760 |
| Repo shortlist + flat passages | 0.8239 | 0.8683 | 0.8967 | 16.22 | 23.04 | 29.92 | 1385814 |

50 queries, 50 repository documents, 575 nested passages. Three warmed sequential rounds alternate strategy order: 150 requests per design. One additional pass clears each query-embedding cache before 50 requests per design; the model stays warm. ES caches are not cleared. This is not a concurrent load test and does not replace the separately recorded autocannon benchmark. Raw samples and provenance: [balanced-results.json](../eval/balanced-results.json).

Host: Apple M5, 16 GiB RAM, darwin/arm64, Node v26.8.1. ES 9.4.3; MiniLM at c9745ed1d9f207416be6d2e6f8de32d1f16199bf, CPU model service; ES heap 512 MiB. The raw artifact records model library versions and label hash. Index bytes come from primary-store stats; these can vary with segment merges.

**Decision: retain chunk search as the default.** Balanced retrieval preserved the measured scores but was slower and used slightly more disk in this run. The corpus is smaller than the default 200-repository shortlist, so the experiment does not measure the quality loss from pruning a large corpus. No process/container RAM reduction has been measured. There are 625 graph-indexed vectors in the original layout versus 50 in the balanced layout, but all 625 vectors still exist and flat scoring still uses memory/page cache.

## Run it safely

From the project root, after the normal quickstart has seeded the fixture:

```sh
make balanced-seed balanced-check
```

This creates `gitgrep-balanced-v2` behind the separate `gitgrep-balanced` alias. It does not change the live `gitgrep` alias. Reruns skip unchanged documents. The earlier `gitgrep-balanced-v1` experiment used unindexed passage vectors and consumed substantially more disk; it is retained locally for inspection. Do not reuse it for the final format. The indexer now checks vector format and dimension before writing.

To try the real API on a separate port, use a dedicated terminal:

```sh
npm --prefix backend run build
PORT=5051 ES_INDEX=gitgrep-balanced SEARCH_STRATEGY=balanced npm --prefix backend start
curl -fsS 'http://localhost:5051/api/search?q=chatbot&size=3'
```

REPO_CANDIDATES defaults to 200, capped at 2,000 by startup validation. Effective shortlisting is at least MAX_DEPTH+1 so existing page bounds remain meaningful. Both stages apply metadata/phrase/exclusion filters; timings accumulate both ES calls in knnMs. Similar-repo search continues to use summary vectors. An empty shortlist returns no semantic hits without a second query. Embedding failure retains the existing keyword fallback.

For Compose, ES_INDEX and SEARCH_STRATEGY are environment-configurable. Leave the defaults for the existing demo. A balanced index cannot serve nested chunk-HNSW retrieval; pair strategy and index correctly. Returning to the original pair is the rollback. Production migration needs a reviewed new version behind the production alias and the correct API-key permissions.

## Next evidence needed

Collect a reviewed corpus larger than the shortlist; evaluate budgets such as 100, 200 and 500; measure mixed-query concurrent latency, cold filesystem behavior and actual memory with isolated deployments. A missing first-stage candidate cannot be recovered by passage rescoring. A 4,000-repository collection has since been completed and activated separately. GitHub refresh scheduling, on-demand discovery and all-GitHub coverage remain unimplemented.

## Beginner guide and PDF reproduction

[ARCHITECTURE.md](../ARCHITECTURE.md) is the text source of the [13-page illustrated guide](../Gitgrep-Architecture.pdf). It introduces the architecture, ingestion, BM25, vectors, HNSW, quantization, RRF, constraints, caching, failure handling, deployment and evaluation. Run `make architecture-pdf` to rebuild it with an isolated pinned ReportLab dependency. Rendering/validation used PyMuPDF 1.26.4; these tools are not application dependencies.
