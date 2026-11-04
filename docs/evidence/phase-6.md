# Phase 6: final local acceptance

Recorded 2026-11-04. Branch: `phase-6-infra`. No remote push or cloud deployment occurred. The temporary root AUDIT.md is removed in the final documentation commit; its original findings remain in the audit commit and the design/evidence documents.

## What ran

| Command | Observed outcome | Raw output |
|---|---|---|
| `FRONTEND_PORT=5174 make up` | Images built; all four services healthy | [compose-build.txt](compose-build.txt) |
| `make verify` | Lint passed; 6 Python + 15 Node + 2 real-ES tests passed; endpoint smoke and eval gate passed | [verification.txt](verification.txt) |
| `make hygiene` | No venv directory or purged paths reachable from any Git ref | [verification.txt](verification.txt) |
| `make audit` | No known backend npm or Python runtime advisories reported | [verification.txt](verification.txt) |
| `make outage-check` | Embedding stopped: search 200/degraded, readiness 503; restored: search 200/normal, readiness 200 | [verification.txt](verification.txt) |
| `make prod-check` | Disposable production ES: anonymous 401, read-key search 200, read-key write 403 | [verification.txt](verification.txt) |
| `npm --prefix frontend run build` | Build passed with existing Vite configuration/CSS warnings | [verification.txt](verification.txt) |
| `make bench` | All three scenarios completed without errors or degradation | [benchmark-run.txt](benchmark-run.txt) |
| `make seed` | All 50 repos reused cached vectors; documents=50, changed=0, failed=0 | [seed-repeat.txt](seed-repeat.txt) |

Port 5174 preserves the separate frontend session's server on 5173. No frontend source or lockfile was edited in this work. The existing frontend dependency audit findings are still that session's responsibility; the zero-advisory statement above covers the backend and Python runtime only.

## Recorded results

The final evaluation uses real Elasticsearch 9.4.3 and MiniLM at the pinned revision, with sentence-transformers 6.2.0 and transformers 5.22.1. RRF nDCG@10 is 0.8239, keyword 0.7784, semantic 0.8034 and equal-weight blending 0.8084. The dependency refresh changed none of the recorded nDCG values; the baseline now includes the runtime library identity. Labels remain provisional and require owner review. See [RESULTS.md](../../eval/RESULTS.md) and [per-query rankings](../../eval/fixture-run.json).

The final benchmark supersedes the earlier phase-4 timing run. On an Apple M5 with 16 GiB host RAM, a 512 MiB ES heap and a 1,363,760-byte fixture index, single-connection cold query-cache p95 was 30.98 ms at 44.51 requests/s; cached p95 was 14.80 ms at 82.53 requests/s. Eight cached connections reached 233.63 requests/s with p95 48.18 ms. Each scenario ran for 10 seconds with one fixed query. The model ran on CPU inside Docker; the harness used Node v26.8.1 on the host. See [BENCHMARK.md](../../eval/BENCHMARK.md) for all percentiles and limitations.

## Infrastructure and remaining checks

Development Compose starts ES, embeddings, API and frontend with healthchecks, dependencies, memory limits and persistent volumes. Multi-stage non-root images pin base digests; the model is baked into the embedding image and runtime model access is offline. Production Compose is standalone, enables ES authentication, and exposes neither ES nor embeddings on a host port. The local production permission test creates its own project and removes only its disposable volume.

GitHub Actions defines unit/type/lint checks, actual ES integration, fixture quality gating, dependency audits and image builds. Local commands passed; the workflow has not run on GitHub because nothing was pushed. The deployment guide describes a single VM and TLS setup, not an existing deployment. Frontend remote API migration is still needed before a remote browser can use that UI.

No GITHUB_TOKEN was configured, so the intended 4,000-repo/eight-language collection is unrun. The collector splits created-date/star shards; an unsplittable single-day/single-star shard errors instead of silently truncating, and pushed-date subdivision remains a follow-up. Owner label review, full-corpus measurements, optional reranking/alternate model and CUDA validation remain undone. No Grafana dashboard was added.

The history rewrite and lease-safe push command are recorded in [phase-1.md](phase-1.md). Review the destination before using them: origin is still `sasmith-14/search_engine_project`, whereas the requested repository URL was `sasmith-14/gitgrep`.
