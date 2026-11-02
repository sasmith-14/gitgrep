# Search design decisions

## Phase 0 — baseline

I considered patching the single ES request, adopting ES's RRF retriever, and running two retrievals in Node. I chose Node RRF: independent result ranks remove score-scale dependence and do not require a paid self-managed retriever. The audit found filters escaping the semantic path and nonexistent README quickstart paths. See phase evidence for executable checks.

## Phase 1 — repository

I considered keeping generated files, Git LFS, and reproducible source plus a sample. I chose a 50-repository metadata/README fixture and ignored local full datasets; LFS would still require downloading derived vectors. History rewriting removes venv, installed Node modules, and the two raw data files from all refs. The original checkout is backed up locally before rewriting; no push is performed.
