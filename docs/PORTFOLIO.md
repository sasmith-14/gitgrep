# Portfolio handoff

These bullets describe the recorded local experiment, not production traffic. The corpus contains 50 repositories; the 50-query relevance labels are assistant-authored and await owner review. Keep that qualification when using retrieval numbers. Commands and raw results are linked below.

## Resume bullets

- Replaced raw BM25/vector score addition with application-side Reciprocal Rank Fusion, measuring nDCG@10 of 0.8239 versus 0.7784 for keyword search and 0.8084 for equal-weight score blending on a 50-query provisional fixture.
- Added a bounded query-embedding LRU cache; a local single-connection test reduced p95 latency from 30.98 ms to 14.80 ms and increased throughput from 44.51 to 82.53 requests/s on the 50-repository index.
- Built cached batch embedding and content-hash indexing; repeating the 50-repository seed generated zero new vectors and changed zero Elasticsearch documents, with zero bulk failures.
- Verified retrieval filters against exhaustive fixture predicates across 18 metadata-filter/mode combinations, plus phrase/exclusion integration checks; the final suite passed 6 Python, 15 Node and 2 real-Elasticsearch tests.
- Hardened failure and permission boundaries: stopping the embedding container preserved HTTP 200 keyword search while readiness returned 503; a production ES permission test returned 401 anonymously, 200 for read-key search and 403 for read-key writes.

Evidence: [evaluation](../eval/RESULTS.md), [benchmark and machine details](../eval/BENCHMARK.md), [repeat seed](evidence/seed-repeat.txt), [verification output](evidence/verification.txt). The load test used one fixed query for 10 seconds per scenario on an Apple M5 with 16 GiB RAM. It is not a capacity claim for the intended 4,000-repository corpus.

## Interview questions and answers

**Why fuse ranks in Node instead of adding scores or using Elasticsearch's RRF retriever?**

BM25 and vector scores have different scales. I merge ranks with `1 / (60 + rank)`, avoiding a score weight and the self-managed licensed retriever dependency. The provisional fixture favored RRF overall, but rank fusion discards useful score margins. The vLLM query produced an exact rank-sum tie with Whisper; the stable ID tie break chose the less relevant result. I recorded five losses rather than claiming fusion always wins.

**Why use nested README chunks instead of a separate chunk index?**

Nested kNN returns repository-level hits with the best passage through inner hits, so filters and passage selection stay in one retrieval. A separate index would require grouping/joining chunk hits and overfetching to obtain enough distinct repos. The cost is that updating a repository rewrites its nested block; that tradeoff suits this small, periodically refreshed corpus. I have not measured the large-corpus write cost.

**How did you establish filter correctness?**

Both retrievals use the same constraints, with semantic constraints inside `knn.filter`. Integration tests compare returned IDs and counts against exhaustive predicates on the 50-repo fixture across all three modes. Quoted phrases and their exclusions also partition the fixture. This proves those cases, not ANN recall at arbitrary scale; candidate sizing still needs evaluation on the full corpus.

**Why limit pagination to 100 results?**

RRF needs both ranked candidate lists before slicing a page. Recomputing ever-deeper lists is expensive, so `MAX_DEPTH` bounds the pool and a lookahead detects capping. Results describe that bounded pool, not an exhaustive semantic match count. I would consider cached search sessions before promising deep, stable pagination over a changing index.

**What happens when the embedding service fails?**

The API defaults to an 800 ms embedding timeout and falls back to keyword retrieval with explicit degradation fields. A small circuit breaker opens after consecutive failures and permits a half-open probe. The query LRU bounds memory and coalesces concurrent misses. I tested both failure and recovery by stopping and restoring the real container. Evaluation uses a recorded 10-second timeout and rejects degraded runs so fallback cannot masquerade as semantic quality.

**How much confidence should someone place in the evaluation?**

It is a reproducible regression fixture, not human ground truth. All 50 labels need owner review, unlisted repos count as zero, and the corpus is Python-only. RRF reached 0.8239 nDCG@10, but semantic search had higher Recall@10 (0.9067 versus 0.8967). I have not collected the intended eight-language corpus, evaluated a reranker or alternate model, run remote CI, or deployed publicly. Those are explicit follow-ups, not implied results.
