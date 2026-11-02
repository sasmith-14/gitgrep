# Phase 5 execution

npm --prefix backend run build; npm --prefix backend test; npm --prefix backend run integration; uv run pytest -q; uv run ruff check services scripts tests all pass before dependency refresh. Real integration: 1 passed, all three modes × six exhaustive metadata predicate cases, analyzer tokens, similar seed exclusion and 404. The API suite additionally verifies truncation lookahead/disjoint pages, startup URL/port validation, breaker half-open, bounded LRU, sanitized timeout/error responses, CORS, rate limit headers and metrics.

npm audit found advisories in initial package pins; the backend was updated to Express 5.3.0, express-rate-limit 8.7.2 and Zod 4.6.7, with refreshed transitive dependencies. npm then reported zero known vulnerabilities. Python pip-audit found advisories in the original FastAPI/Starlette, sentence-transformers and transformers set; dependencies were refreshed rather than suppressing the report. Final audit results and post-update tests are retained in the final verification evidence.

Public defaults remain 800 ms embedding / 2,000 ms ES, with keyword degradation on embedding errors. Evaluation and benchmark use 10,000 ms, recorded in their reports. No multi-replica cache/rate store or shallow Grafana dashboard was added.

Refreshed pins: FastAPI 0.162.0 / Starlette 1.10.0, sentence-transformers 6.2.0, transformers 5.22.1, torch 2.15.0. pip-audit 2.9.0 against the full frozen runtime export: `No known vulnerabilities found`. Linux Torch resolves from the explicit PyTorch CPU index; host macOS retains MPS support. Python unit suite after the update: 5 passed; ruff: All checks passed. Embedding health now reports device and library versions so later measurements cannot hide this dependency refresh.
