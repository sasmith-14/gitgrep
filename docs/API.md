# HTTP API

The public API is `/api`; the old `/search` array remains only for the current frontend's migration. All examples below target a seeded local stack. Real recorded bodies, status codes, X-Request-Id and Server-Timing headers are in `docs/evidence/api/`; regenerate with `make smoke`.

## GET /api/search

```sh
curl -i -G http://localhost:5050/api/search \
  --data-urlencode 'q=lang:python stars:>500 "web framework" -deprecated' \
  --data-urlencode 'mode=hybrid' --data-urlencode 'page=1' --data-urlencode 'size=10'
curl -G http://localhost:5050/api/search --data-urlencode 'q=fastapi' \
  --data-urlencode 'lang=Python' --data-urlencode 'minStars=1000' \
  --data-urlencode 'pushedAfter=2025-01-01' --data-urlencode 'topic=api' --data-urlencode 'topic=web'
```

| Parameter | Validation/default |
|---|---|
| q | Required string, 1–300 UTF-16 code units, nonblank; duplicate q rejected |
| mode | keyword, semantic, hybrid; default hybrid |
| lang | Optional nonempty language, case-insensitive exact match |
| minStars | Optional nonnegative safe integer; inclusive lower bound |
| pushedAfter | Optional real ISO calendar date YYYY-MM-DD; strictly after UTC midnight |
| topic | Optional repeatable string; all requested topics must match |
| page | Positive integer, default 1 |
| size | 1–50, default 10 |

Recognized q operators: `lang:rust`, `stars:>500`, `pushed:>2025-01-01`, `topic:cli`, `"exact phrase"`, `-excluded` and `-"excluded phrase"`. Recognized scalars use the last value; topics accumulate with AND. Explicit params replace corresponding operators, including the entire topic list on an explicit topic parameter. stars:>500 becomes minStars=501. Unknown, empty or invalid operators remain ordinary text, never an operator error. Quotes preserve phrases; an unfinished quote consumes the remaining text. Phrase/exclusion predicates apply to both retrievals. The parsed object reports effective filters after explicit overrides.

Successful search shape (all listed fields are returned, except totalCapped which is present only when capped):

```json
{
  "query": { "raw": "...", "text": "...", "parsed": {
    "lang": null, "minStars": null, "pushedAfter": null,
    "topics": [], "phrases": [], "exclude": []
  } },
  "mode": "hybrid", "page": 1, "size": 10,
  "total": 100, "totalCapped": true,
  "tookMs": 41,
  "degraded": false, "degradedReason": null,
  "timings": { "parseMs": 0, "embedMs": 0, "bm25Ms": 0, "knnMs": 0, "fuseMs": 0 },
  "results": [{
    "id": "123456", "fullName": "owner/repo", "url": "https://github.com/owner/repo",
    "description": "...", "language": "Python", "stars": 1234,
    "pushedAt": "2025-09-01T00:00:00Z", "topics": ["cli"],
    "match": { "heading": "Installation", "passage": "plain text", "highlights": [[0, 5]] },
    "explain": { "keywordRank": 3, "semanticRank": 7, "fusedScore": 0.0312, "cosine": 0.61 }
  }]
}
```

This block describes the schema; its numbers are illustrative. A measured response follows below. match is null if no chunk matched (including repo-vector similar search). passage is plain text <=400 UTF-16 code units; highlights are sorted, merged, end-exclusive offsets relative to that returned string. Render text, not HTML. Ranks start at 1 and are null when absent from a retrieval list. cosine is null for keyword-only hits; otherwise it describes the semantic vector match, not confidence or the fused score. Timings are milliseconds and may be fractional.

Total is the bounded candidate pool, capped at MAX_DEPTH (default 100), rather than an exact corpus-wide relevance count. One lookahead candidate detects truncation. A page starting at or beyond MAX_DEPTH returns INVALID_QUERY; a page crossing its end is shortened. Live index updates can shift pagination. Embedding failure/timeout/open circuit serves keyword-only even when the requested mode is semantic, retaining the requested mode with degraded=true and degradedReason="embedding_unavailable". ES failures do not produce synthetic empty success.

## GET /api/compare

Accepts the same q/filter syntax as search. Always compares keyword, semantic and RRF, top 10 per list. Shape: `{ "keyword": [result], "semantic": [result], "fused": [result], "tookMs": number, "degraded": boolean }`. Result objects use exactly the search result shape. If embeddings fail, semantic is empty and fused contains keyword results.

```sh
curl -G http://localhost:5050/api/compare --data-urlencode 'q=tool for building chatbots' --data-urlencode 'minStars=1000'
```

## GET /api/similar/:id

id is a GitHub numeric repository id (1–20 digits); size is 1–50, default 10. Returns the search envelope with mode=semantic, page=1, query.raw=id, empty query.text and null/empty parsed filters. It uses the repo-level vector and excludes itself inside knn.filter; it does not need the embedding service for retrieval. Unknown id returns 404 NOT_FOUND. No README chunk was retrieved, so match is null.

```sh
curl http://localhost:5050/api/similar/160919119?size=3
```

## GET /api/facets

Shape: `{ "languages": [{ "name": "python", "count": 50 }], "topics": [{ "name": "cli", "count": 4 }] }`. These numbers are schema examples. Language names reflect normalized index terms. Topics return the top 30 by count. Cached for FACET_TTL_MS (60,000 default); index changes may take that long to appear.

```sh
curl http://localhost:5050/api/facets
```

## Health and instrumentation

`GET /healthz` is process liveness: `{ "status": "ok" }`.

`GET /readyz` reaches ES cluster health and embedding health: `{ "status": "ready", "dependencies": { "elasticsearch": "ok", "embedding": "ok" } }`. A failed dependency returns 503, its value becomes "unavailable", status becomes "unavailable", and a canonical error object accompanies the dependency statuses. Readiness checks dimension consistency but does not assert that the dataset has already been seeded.

`GET /metrics` returns Prometheus text. Metrics: gitgrep_requests_total{route,status}, gitgrep_stage_seconds{stage}, gitgrep_events_total{kind}. Event kinds: hit, miss, embedding_error, es_error, degraded. Cache hit ratio is rate(hit)/(rate(hit)+rate(miss)); coalesced cold lookups count as misses. Stage histograms observe executed stages only; total includes every response. Metrics/readiness should stay private in deployment.

```sh
curl -i http://localhost:5050/healthz
curl -i http://localhost:5050/readyz
curl http://localhost:5050/metrics
```

## Errors and headers

Every response carries a generated X-Request-Id and Server-Timing with parseMs, embedMs, bm25Ms, knnMs, fuseMs. Timings match the search timing stages (rounded to three decimals in the header). CORS permits only CORS_ORIGIN; origin-less tools and health probes are allowed.

```json
{ "error": { "code": "INVALID_QUERY", "message": "Invalid search parameters", "retryAfterMs": null } }
```

| Code | HTTP status |
|---|---|
| INVALID_QUERY | 400 for input, 403 for disallowed CORS origin |
| NOT_FOUND | 404 |
| RATE_LIMITED | 429; Retry-After is seconds, retryAfterMs is milliseconds |
| UPSTREAM_TIMEOUT | 504 for ES timeout; embedding timeout degrades to keyword |
| INTERNAL | 500 for internal failure, 502 for unavailable ES, 503 in readiness diagnostics |

No public error includes a stack trace, raw ES error or model internals. Public search/compare/similar/facets and legacy search share the per-IP limiter. Liveness/readiness/metrics stay available to infrastructure. Unknown query params are ignored; malformed/repeated scalar params are rejected.

## Recorded local search response

From `make smoke`, /api/search?q=fastapi&size=1, HTTP 200. This is a real response on the 50-repo fixture; time values vary between runs.

```json
{
  "query": {
    "raw": "fastapi",
    "text": "fastapi",
    "parsed": {
      "lang": null,
      "minStars": null,
      "pushedAfter": null,
      "topics": [],
      "phrases": [],
      "exclude": []
    }
  },
  "mode": "hybrid",
  "page": 1,
  "size": 1,
  "total": 50,
  "tookMs": 34.41958199999499,
  "degraded": false,
  "degradedReason": null,
  "timings": {
    "parseMs": 1.7751659999994445,
    "embedMs": 10.770875000001979,
    "bm25Ms": 10.305249999997613,
    "knnMs": 17.419832999999926,
    "fuseMs": 3.2244580000042333
  },
  "results": [
    {
      "id": "160919119",
      "fullName": "fastapi/fastapi",
      "url": "https://github.com/fastapi/fastapi",
      "description": "FastAPI framework, high performance, easy to learn, fast to code, ready for production",
      "language": "Python",
      "stars": 100467,
      "pushedAt": "2026-07-13T19:49:34Z",
      "topics": [
        "api",
        "async",
        "asyncio",
        "fastapi",
        "framework",
        "json",
        "json-schema",
        "openapi",
        "openapi3",
        "pydantic",
        "python",
        "python-types",
        "python3",
        "redoc",
        "rest",
        "starlette",
        "swagger",
        "swagger-ui",
        "uvicorn",
        "web"
      ],
      "match": {
        "heading": "Requirements",
        "passage": "fastapi stands on the shoulders of giants : starlette for the web parts. pydantic for the data parts.",
        "highlights": [
          [
            0,
            7
          ]
        ]
      },
      "explain": {
        "keywordRank": 1,
        "semanticRank": 1,
        "fusedScore": 0.03278688524590164,
        "cosine": 0.6585922
      }
    }
  ]
}
```
