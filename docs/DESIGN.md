# Search design decisions

## Phase 0 — baseline

I considered patching the single ES request, adopting ES's RRF retriever, and running two retrievals in Node. I chose Node RRF: independent result ranks remove score-scale dependence and do not require a paid self-managed retriever. The audit found filters escaping the semantic path and nonexistent README quickstart paths. See phase evidence for executable checks.

## Phase 1 — repository

I considered keeping generated files, Git LFS, and reproducible source plus a sample. I chose a 50-repository metadata/README fixture and ignored local full datasets; LFS would still require downloading derived vectors. History rewriting removes venv, installed Node modules, and the two raw data files from all refs. The original checkout is backed up locally before rewriting; no push is performed.

Python is locked with uv and runs on 3.11. Backend dependencies are owned by backend rather than accidentally inherited from root. Each service validates a single environment config at startup. Endpoint defaults remain local for development; Compose overrides service URLs. Frontend files and its lockfile are owned by the other session.

## Phase 2 — corpus and indexing

I considered flat README truncation, a separate chunk index with a join in Node, and nested chunks. I chose nested chunks: parent prefilters and inner_hits give one repository per hit and the best passage in a single retrieval. The cost is rewriting a repository's nested documents when its README changes. The repo-level vector (name, description, topics, intro) seeds similar-repo search; semantic query search ranks the best README chunk. Empty READMEs get a metadata chunk.

MiniLM chunks contain at most 220 actual model tokens, with 32-token overlap. Headings are retained separately; Markdown parsing removes images, badge-only links, HTML tags, and anchor-only TOC entries. Code fences remain useful search text. Raw README fetches stop at 200,000 bytes. The fixture caps each README at 12,000 characters to keep git small. Model encode batches are normalized explicitly; caches include the pinned model revision as well as content. Auto device selection uses the library's CUDA/MPS/CPU detection.

HNSW uses unquantized cosine vectors, m=16 and ef_construction=100: a conventional small-index baseline with explicit settings, not a tuned latency/recall claim. Approximate retrieval's num_candidates is 10× depth, capped at 10,000. Name analysis uses word_delimiter_graph before lowercase with preserve_original and catenate_all, then flatten_graph for indexing; an edge-ngram subfield (2–20) serves partial names. Description/chunk text use standard analysis. The integration test checks actual analyzer output.

Index names are versioned (gitgrep-v1 by default), with gitgrep as alias. Bulk writes use stable repo IDs, batches of 50, a content hash skip check and a per-item failure file. Alias cutover happens only after all bulk items succeed and refresh. New corpus snapshots should use a fresh version to remove deleted repos; same-version reruns are incremental and deliberately do not delete absent records. Old versions stay available for rollback.

Collection config asks for 500 repos per each of eight languages (target 4,000, not an observed count). Language/star/date shards recursively bisect created date, then stars if necessary to avoid GitHub's 1,000-result cap. An unsplittable single-day/single-star shard fails loudly rather than silently truncating; pushed-date subdivision is a TODO if that case occurs. SQLite caches ETags and bodies; atomic checkpoints persist each README and completed page. --refresh revisits cached requests conditionally. No token is required by tests; a real full rebuild needs GITHUB_TOKEN and time within the API's rate budget.
