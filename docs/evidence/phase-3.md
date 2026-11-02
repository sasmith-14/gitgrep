# Phase 3 execution

Commands: npm --prefix backend run build; npm --prefix backend test; npm --prefix backend run integration. The integration uses real ES 9.4.3 and real MiniLM on the fixture. It exhaustively compares all returned IDs to a Python-fixture metadata predicate for language/stars/date/topic combinations in all three modes (50 results fit below the retrieval cap), then checks identifier analyzer tokens and similar exclusion/404.

Two real-stack failures were found and fixed: native Node fetch rejects the original port 6000 as unsafe, so the embedding default is now 6001; ES 9 excludes dense vectors from returned _source unless explicitly requested, so similar fetches _source_exclude_vectors=false and includes only embedding. Tests never accept degraded mode in integration.

The indexer repeat returned {"index":"gitgrep-v1","documents":50,"changed":0,"failed":0}. Unit tests cover RRF hand calculation, duplicate candidates, operator precedence, invalid parameters, a 1,000-case Unicode property and 300 operator-position/override cases, caches/breaker, API shapes, timing headers, CORS/rate errors and sanitized timeouts. Final outputs are captured in docs/evidence/verification.txt after all phases.
