# Search design decisions

## Phase 0 — baseline

I considered patching the single ES request, adopting ES's RRF retriever, and running two retrievals in Node. I chose Node RRF: independent result ranks remove score-scale dependence and do not require a paid self-managed retriever. The audit found filters escaping the semantic path and nonexistent README quickstart paths. See phase evidence for executable checks.

## Phase 1 — repository

I considered keeping generated files, Git LFS, and reproducible source plus a sample. I chose a 50-repository metadata/README fixture and ignored local full datasets; LFS would still require downloading derived vectors. History rewriting removes venv, installed Node modules, and the two raw data files from all refs. The original checkout is backed up locally before rewriting; no push is performed.

Python is locked with uv and runs on 3.11. Backend dependencies are owned by backend rather than accidentally inherited from root. Each service validates a single environment config at startup. Endpoint defaults remain local for development; Compose overrides service URLs. Frontend files and its lockfile are owned by the other session.

## Phase 2 — corpus and indexing

I considered flat README truncation, a separate chunk index with a join in Node, and nested chunks. I chose nested chunks: parent prefilters and inner_hits give one repository per hit and the best passage in a single retrieval. The cost is rewriting a repository's nested documents when its README changes. The repo-level vector (name, description, topics, intro) seeds similar-repo search; semantic query search ranks the best README chunk. Empty READMEs get a metadata chunk.

MiniLM chunks contain at most 220 actual model tokens, with 32-token overlap. Headings are retained separately; Markdown parsing removes images, badge-only links, HTML tags, and anchor-only TOC entries. Code fences remain useful search text. Raw README fetches stop at 200,000 bytes. The fixture caps each README at 12,000 characters to keep git small. Model encode batches are normalized explicitly; caches include the pinned model revision as well as content. Auto device selection uses the library's CUDA/MPS/CPU detection.

HNSW uses unquantized cosine vectors, m=16 and ef_construction=100: a conventional small-index baseline with explicit settings, not a tuned latency/recall claim. Approximate retrieval's num_candidates is 10× (depth+1), capped at 10,000. Name analysis uses word_delimiter_graph before lowercase with preserve_original and catenate_all, then flatten_graph for indexing; an edge-ngram subfield (2–20) serves partial names. Description/chunk text use standard analysis. The integration test checks actual analyzer output.

Index names are versioned (gitgrep-v1 by default), with gitgrep as alias. Bulk writes use stable repo IDs, batches of 50, a content hash skip check and a per-item failure file. Alias cutover happens only after all bulk items succeed and refresh. New corpus snapshots should use a fresh version to remove deleted repos; same-version reruns are incremental and deliberately do not delete absent records. Old versions stay available for rollback.

Collection config asks for 500 repos per each of eight languages (target 4,000, not an observed count). Language/star/date shards recursively bisect created date, then stars if necessary to avoid GitHub's 1,000-result cap. An unsplittable single-day/single-star shard fails loudly rather than silently truncating; pushed-date subdivision is a TODO if that case occurs. SQLite caches ETags and bodies; atomic checkpoints persist each README and completed page. --refresh revisits cached requests conditionally. No token is required by tests; a real full rebuild needs GITHUB_TOKEN and time within the API's rate budget.

## Phase 3 — retrieval

I considered adding BM25 and cosine scores, min-max score normalization, and rank fusion. RRF in Node adds 1/(k+rank) across independent lexical and semantic candidate lists, k=60 by default. Raw BM25 grows with term rarity/length and cosine has a bounded scale; adding them makes a weight dataset-dependent. RRF discards score magnitudes and may lose a strong exact-name signal; evaluation reports this tradeoff rather than assuming it wins.

Lexical and semantic work run through Promise.all: BM25 starts immediately while embedding precedes kNN. Each retrieval uses the same root prefilter, including phrases/exclusions, and knn.filter applies it before neighbor selection. The semantic path searches the best nested chunk, not a sum of chunk scores. Similar uses the repo vector and excludes the seed in knn.filter. Cosine is recovered from ES's unboosted cosine score with 2*score-1; it describes the matched chunk (repo vector for similar), not fused confidence.

Pagination retrieves MAX_DEPTH+1 candidates per list (one lookahead hit), fuses their union and returns a slice of the first MAX_DEPTH (100 default). Total counts the retrievable fused pool, not every relevant document in ES. totalCapped is present when truncation is observed. A semantic-only pool of exactly MAX_DEPTH may hide more distant neighbors; its total is explicitly a candidate-pool total. The first page is recomputed on every request; stable tie-breaking uses repo ID, but concurrent index changes can move results between pages. I considered search_after and per-query result sessions; neither avoids recomputing global fused ranks cheaply, so deep pages are rejected at MAX_DEPTH.

The tokenizer is a small left-to-right scanner. Last recognized scalar operator wins; repeated topics are ANDed and deduplicated. Explicit params override matching operator fields (explicit topic replaces the entire operator topic list). stars:>500 means minStars=501; pushed:>YYYY-MM-DD is strict UTC midnight. Empty/invalid/unknown operators remain text; unmatched quotes consume the rest as a phrase. Highlight intervals use JavaScript UTF-16 indices into the returned <=400-code-unit plain passage, end-exclusive. Intervals are merged, and display code must render them as text, never HTML.

I chose TypeScript over checkJs because the original API has three small files; sharing query/result/timing types costs little and catches omissions in a binding response contract. Runtime validation still checks all public parameters. /search is a temporary compatibility endpoint for the unchanged frontend, returning the old ES-shaped array; /api/search follows the new contract.

Node's native fetch rejects port 6000 under its unsafe-port list; the embedding default is 6001. ES 9's vector source omission also required explicit _source_exclude_vectors=false for the similar seed. Both issues were caught by running real endpoints; mocks alone missed them.

## Phase 4 — measurement

I considered synthetic vectors/labels, downloading a large public relevance benchmark, and a deliberately small checked-in corpus with explicit provisional judgments. I chose 50 existing repos and 50 assistant-authored graded query judgments for executable regression tests. The owner must review both positive labels and implicit zeros. These numbers describe this sample only; they are not ground truth or a claim about the planned 4,000-repo corpus. nDCG uses gain 2^grade-1 and log2(rank+1); MRR treats grade>0 as relevant; Recall@10 divides by the nominated relevant repos.

The same raw candidate lists feed keyword, semantic, RRF and a naive 0.5 BM25 + 0.5 ES vector-score baseline. I did not tune weights or k on these labels. Optional cross-encoder and alternative-model experiments are omitted until labels have owner review; extra compute cannot fix uncertain judgments. The regression identity pins fixture/label hashes, model/revision, ES version and RRF k; the gate allows an absolute nDCG decline of 0.05 and fails on identity mismatch.

Benchmark options were a mocked microbenchmark, a rate-limited public API test, or an isolated production app connected to the real upstreams. I chose the last: autocannon, fixed query/scenario, 10-second samples, cache-cold and cache-warm at one connection plus cached at eight. Cold means query-cache miss after model warmup, not a process/model download. The harness verifies no degradation/non-2xx and reports hardware/index size rather than extrapolating production throughput.

## Phase 5 — failure boundaries

I considered retries on interactive queries, a circuit breaker plus keyword degradation, and failing the whole request. I chose bounded upstream calls and keyword fallback on embedding errors, including semantic-only requests. Defaults are 800 ms embedding, 2,000 ms ES; the benchmark/eval use an explicit 10,000 ms embedding budget because a first-use shape exceeded 800 ms on this machine. Three consecutive embedding failures open the breaker for 10 seconds; one half-open probe closes it on success. A bounded LRU and same-query in-flight coalescing avoid duplicate embedding work. Facets have a TTL plus in-flight coalescing.

Security middleware uses helmet, one configured CORS origin, 16 KiB JSON bodies, IP rate limiting and centralized public errors. TRUST_PROXY_HOPS defaults to 0 and may be 1 only when the API is reachable exclusively through the single trusted deployment proxy. Logs contain generated request IDs, route templates, status and timings, never raw search text, API keys or upstream error bodies. Prometheus events count cache hit/miss, degradation and per-upstream errors; histograms cover every search stage and total request duration. Server-Timing reports the same five timing stages on success and failure. Shutdown drains requests for up to 10 seconds.

I considered an external shared cache/Redis rate store and per-process state. For one VM/process, Maps and the limiter's in-memory store are sufficient; multiple API replicas require a shared rate store or gateway rate limiting before scale-out. Retrieval now requests one lookahead hit beyond MAX_DEPTH to distinguish an exactly-full pool from an observed truncation; only MAX_DEPTH results are exposed. Unit/API/property checks plus a real Docker ES filter test cover the failure boundaries without adding a generic resilience framework.
