# Design Document: GitHub Repository Search Engine

## Overview

This document describes the technical design for the GitHub Repository Search Engine — a full-stack learning project that lets users search 500 indexed GitHub repositories using a hybrid BM25 + semantic search strategy.

The system has three independently running services that communicate over HTTP:

1. **Python Flask Embedding Service** (port 6000) — converts a query string into a 384-dimensional vector using `all-MiniLM-L6-v2`.
2. **Node.js / Express Backend** (port 5050) — receives search requests from the browser, calls the embedding service, builds and fires the Elasticsearch query, and returns structured results.
3. **React / Vite Frontend** (browser) — renders the search bar, filters, results list, and pagination.

**Elasticsearch** (port 9200, Docker) stores the 500 repository documents in a `repos` index and is only spoken to directly by the backend.

### How a search flows end-to-end

```
User types query
      │
      ▼
React Frontend  ──GET /search?q=...──►  Express Backend
                                               │
                                    POST /embed (query text)
                                               │
                                               ▼
                                     Flask Embedding Service
                                         returns [384 floats]
                                               │
                                    ES hybrid query (bool + knn)
                                               │
                                               ▼
                                         Elasticsearch
                                         returns hits + highlights
                                               │
                ◄── JSON { results, total } ───┘
      │
      ▼
ResultsList renders RepoCards
```

---

## Architecture

### Component diagram

```
┌─────────────────────────────────────────────────────┐
│                   Browser                           │
│  ┌───────────────────────────────────────────────┐  │
│  │  React App (Vite dev server, proxies /api →   │  │
│  │  localhost:5050)                              │  │
│  │                                               │  │
│  │  App.jsx                                      │  │
│  │   ├─ SearchBar                                │  │
│  │   ├─ SearchControls (mode toggle)             │  │
│  │   ├─ StarsFilter                              │  │
│  │   ├─ ErrorBanner                              │  │
│  │   ├─ LoadingIndicator                         │  │
│  │   ├─ ResultsList → RepoCard × N               │  │
│  │   └─ Pagination                               │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
              │  GET /api/search?q=&mode=&...
              ▼
┌─────────────────────────────────────────────────────┐
│  Node.js / Express  (port 5050)                     │
│                                                     │
│  server.js                                          │
│   └─ routes/search.js                              │
│        └─ controllers/searchController.js           │
│             ├─ services/embeddingService.js         │
│             └─ services/searchService.js            │
└─────────────────────────────────────────────────────┘
         │  POST /embed          │  HTTP REST
         ▼                       ▼
┌────────────────┐    ┌────────────────────────┐
│  Flask Embed   │    │  Elasticsearch :9200   │
│  Service :6000 │    │  index: repos          │
└────────────────┘    └────────────────────────┘
```

### Technology choices

| Layer | Technology | Reason |
|---|---|---|
| Frontend | React + Vite | Fast hot-reload dev experience; Vite proxy removes CORS headache |
| Backend | Node.js + Express 5 | Already in place; lightweight, familiar for JS learners |
| Embeddings | Python Flask + sentence-transformers | Model already working; keeps Python ML code separate |
| Search | Elasticsearch 9.x | Already running; supports both BM25 text and knn vector fields |

---

## Components and Interfaces

### Backend file structure

```
backend/
├── server.js                    ← Express setup + middleware mount
├── .env                         ← ELASTICSEARCH_URL, EMBEDDING_SERVICE_URL
├── routes/
│   └── search.js                ← GET /search route declaration
├── controllers/
│   └── searchController.js      ← Request parsing, validation, response building
└── services/
    ├── searchService.js         ← Elasticsearch query construction + execution
    └── embeddingService.js      ← HTTP call to Flask /embed
```

**Why three layers?**
- **Routes** — just maps URLs to controller functions; no logic.
- **Controllers** — handles HTTP concerns: reads query params, validates them, calls services, writes response or calls `next(error)`.
- **Services** — pure data access: builds the ES query body and makes the `fetch` call to Flask; has no knowledge of `req`/`res`.

#### `server.js` responsibilities

```
load .env
create express app
register cors, express.json()
mount /search router
register error-handling middleware
listen on 5050
log ES host at startup
```

#### `routes/search.js`

```
router.get('/', searchController.search)
export router
```

#### `controllers/searchController.js`

```
search(req, res, next):
  1. Extract q, mode, minStars, maxStars, page, pageSize from req.query
  2. Validate all parameters → call next(error) with status 400 on bad input
  3. Call embeddingService.getEmbedding(q)          → vector
  4. Call searchService.hybridSearch(params, vector) → { hits, total }
  5. Format and return JSON response
```

#### `services/embeddingService.js`

```
getEmbedding(text):
  POST http://localhost:6000/embed   { text }
  timeout: 5 seconds (AbortController)
  returns: number[]   (384 floats)
  throws:  503 error if unreachable or timeout
```

#### `services/searchService.js`

```
hybridSearch({ q, mode, minStars, maxStars, from, size }):
  build ES request body (see "Elasticsearch query" section below)
  call esClient.search(...)
  return { hits: [...], total: number }
```

### Frontend component tree

```
App.jsx
 ├── SearchBar.jsx           props: onSearch, isLoading
 ├── SearchControls.jsx      props: mode, onModeChange
 ├── StarsFilter.jsx         props: minStars, maxStars, onChange, validationError
 ├── ErrorBanner.jsx         props: message
 ├── LoadingIndicator.jsx    (rendered while isLoading === true)
 ├── ResultsList.jsx         props: results
 │    └── RepoCard.jsx       props: name, description, stars, url, highlights
 └── Pagination.jsx          props: page, total, pageSize, onPageChange, isLoading
```

**State lives in `App.jsx`** — all child components receive data via props and communicate changes via callback props. This is the standard React "lift state up" pattern and keeps each component simple and independently testable.

```
// State held in App.jsx
const [query, setQuery]         = useState('')
const [mode, setMode]           = useState('hybrid')
const [minStars, setMinStars]   = useState('')
const [maxStars, setMaxStars]   = useState('')
const [page, setPage]           = useState(1)
const [pageSize]                = useState(10)          // fixed for now
const [results, setResults]     = useState([])
const [total, setTotal]         = useState(0)
const [isLoading, setIsLoading] = useState(false)
const [error, setError]         = useState(null)
```

### Frontend API module

```
frontend/src/api/search.js

export async function fetchSearch({ q, mode, minStars, maxStars, page, pageSize })
  → builds URLSearchParams (omitting defaults)
  → fetch('/api/search?' + params)
  → returns { results, total } on 2xx
  → throws Error with message from body on non-2xx
  → throws Error('Could not connect to the server') on network failure
```

The Vite dev server proxies `/api/*` → `http://localhost:5050` (stripping `/api`), so `fetch('/api/search')` in the browser hits `http://localhost:5050/search` with no CORS problems.

---

## Data Models

### Elasticsearch document (existing `repos` index)

| Field | ES type | Description |
|---|---|---|
| `name` | `text` | Repository name |
| `description` | `text` | Short repo description |
| `readme` | `text` | README content (truncated) |
| `stars` | `integer` | GitHub star count |
| `url` | `keyword` | GitHub HTML URL |
| `embedding` | `dense_vector` dims=384, cosine | Sentence embedding of name+description+readme |

### API contract: `GET /search`

**Request query parameters**

| Parameter | Type | Required | Default | Constraints |
|---|---|---|---|---|
| `q` | string | yes | — | 1–1000 characters |
| `mode` | string | no | `hybrid` | `keyword` \| `semantic` \| `hybrid` |
| `minStars` | integer | no | — | ≥ 0 |
| `maxStars` | integer | no | — | ≥ 0, ≥ minStars |
| `page` | integer | no | `1` | ≥ 1 |
| `pageSize` | integer | no | `10` | 1–50 |

**Success response — 200 OK**

```json
{
  "results": [
    {
      "name": "torvalds/linux",
      "description": "Linux kernel source tree",
      "stars": 185000,
      "url": "https://github.com/torvalds/linux",
      "highlights": {
        "name": ["<em>linux</em> kernel"],
        "description": ["<em>Linux</em> kernel source tree"],
        "readme": ["The <em>Linux</em> kernel is a..."]
      }
    }
  ],
  "total": 42
}
```

`highlights` keys are only present when Elasticsearch returns a fragment for that field; fields without a fragment are absent from `highlights` and the frontend falls back to the plain field value.

**Error responses**

| Status | When |
|---|---|
| 400 | Missing/invalid `q`, non-integer filter params, `minStars > maxStars`, `pageSize > 50` |
| 503 | Embedding service unreachable or timed out |
| 500 | Elasticsearch error |

All error bodies: `{ "error": "<human-readable message>" }`

### Elasticsearch query design

The hybrid query combines a `multi_match` (BM25 keyword relevance) with a `knn` vector nearest-neighbour search inside a `bool` query. Elasticsearch merges scores from both clauses.

```json
{
  "query": {
    "bool": {
      "must": [
        {
          "multi_match": {
            "query": "<user query>",
            "fields": ["name^3", "description^2", "readme"],
            "type": "best_fields",
            "fuzziness": "AUTO"
          }
        }
      ],
      "filter": [
        { "range": { "stars": { "gte": 100, "lte": 50000 } } }
      ]
    }
  },
  "knn": {
    "field": "embedding",
    "query_vector": [0.12, -0.03, ...],
    "k": 10,
    "num_candidates": 100
  },
  "highlight": {
    "fields": {
      "name": {},
      "description": {},
      "readme": { "fragment_size": 200, "number_of_fragments": 1 }
    },
    "pre_tags": ["<em>"],
    "post_tags": ["</em>"]
  },
  "from": 0,
  "size": 10
}
```

**Mode variations:**
- `hybrid` (default) — both `bool.must[multi_match]` and `knn` are included.
- `keyword` — only `bool.must[multi_match]`; `knn` is omitted.
- `semantic` — only `knn`; `bool.must` is empty (or omitted).

Field boosts (`name^3`, `description^2`) rank exact name matches higher than README mentions — a deliberate design choice reflecting the fact that name matches are usually the most relevant result.

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Embedding output has fixed dimension

*For any* non-empty string of 1–10,000 characters sent to `POST /embed`, the returned `embedding` array SHALL contain exactly 384 elements, each a finite floating-point number.

**Validates: Requirements 1.2**

---

### Property 2: Embedding service rejects all invalid inputs

*For any* request where `text` is missing, empty, not a string, longer than 10,000 characters, or the body is not valid JSON, the embedding service SHALL return HTTP 400 with an `error` field — never a 2xx response.

**Validates: Requirements 1.3, 1.8**

---

### Property 3: Stars range filter is reflected in the Elasticsearch query

*For any* search request with `minStars` and/or `maxStars` set to valid integers, the Elasticsearch query body constructed by `searchService` SHALL contain a `range` filter on the `stars` field applying `gte: minStars` and/or `lte: maxStars` — and that filter SHALL be absent when neither parameter is provided.

**Validates: Requirements 5.2, 5.3**

---

### Property 4: Pagination from-offset is computed correctly

*For any* valid `page` (≥ 1) and `pageSize` (1–50), the `from` value in the Elasticsearch query body SHALL equal exactly `(page - 1) * pageSize`.

**Validates: Requirements 5.5**

---

### Property 5: Result array length never exceeds pageSize

*For any* valid search request, the length of the `results` array in the JSON response SHALL be at most `pageSize`.

**Validates: Requirements 4.4, 5.4**

---

### Property 6: Invalid parameter combinations always produce 400

*For any* request to `GET /search` where `q` is absent or empty, `q` exceeds 1,000 characters, `minStars > maxStars`, `page < 1`, `pageSize > 50`, or any numeric parameter is a non-integer string, the backend SHALL respond with HTTP 400 and a JSON body containing an `error` field — never 2xx or 5xx.

**Validates: Requirements 4.5, 4.6, 5.7, 5.8**

---

### Property 7: Error middleware uses the error's status and never leaks stack traces

*For any* `Error` object passed to the Express error middleware, the HTTP response SHALL use `err.status` (if set in 400–599) or 500 otherwise, contain an `error` field with the message, and SHALL NOT include the stack trace or any file path in the JSON response body.

**Validates: Requirements 6.2, 6.4**

---

### Property 8: Whitespace-only search is rejected by the SearchBar

*For any* string composed entirely of whitespace characters typed into `SearchBar` and submitted (via button click or Enter key), the `onSearch` callback SHALL NOT be invoked — the input state may change but no API call should result.

**Validates: Requirements 8.3, 8.5**

---

### Property 9: Valid SearchBar submission trims the value and calls onSearch

*For any* non-empty input string (even with surrounding whitespace), clicking the submit button or pressing Enter SHALL invoke `onSearch` with the trimmed version of the input string.

**Validates: Requirements 8.3, 8.4**

---

### Property 10: RepoCard renders all required fields from the result object

*For any* repository result object with `name`, `description`, `stars`, `url`, and optional `highlights`, the rendered `RepoCard` SHALL display all four required fields, link `url` in an anchor with `rel="noopener noreferrer"`, and show the highlighted fragment for any field that has one — falling back to the plain field value when no highlight is present.

**Validates: Requirements 10.2, 10.3**

---

### Property 11: ResultsList renders exactly one RepoCard per result

*For any* non-null array of N result objects passed to `ResultsList`, exactly N `RepoCard` elements SHALL be rendered — no more, no fewer.

**Validates: Requirements 10.1**

---

### Property 12: Search API request URL includes all non-default parameters

*For any* combination of search parameters, the URL constructed by the API module SHALL include `q` always; include `mode` only when it is not `hybrid`; include `minStars` and `maxStars` only when they are set (including when set to `0`); include `page` only when it is not `1`; and include `pageSize` only when it is not `10`.

**Validates: Requirements 12.2**

---

### Property 13: Non-2xx response displays the error field in the banner

*For any* HTTP response with a non-2xx status code containing an `error` field in the JSON body, the frontend SHALL render an error banner element that is present in the DOM and contains the error message text.

**Validates: Requirements 12.4**

---

### Property 14: New search always resets page to 1

*For any* application state where the current page is greater than 1, submitting a new search query SHALL reset the page counter to 1 before the request is dispatched.

**Validates: Requirements 11.7**

---

## Error Handling

### Backend error hierarchy

```
ValidationError   (status 400) — bad query params
EmbeddingError    (status 503) — embedding service down / timeout
SearchError       (status 500) — Elasticsearch failure
```

Each service layer throws plain `Error` objects with a `.status` property. The centralized Express error middleware (the last `app.use()` in `server.js`) catches them all:

```js
// middleware/errorHandler.js
function errorHandler(err, req, res, next) {
  console.error(err.stack);          // full stack to server console
  const status = err.status || 500;
  res.status(status).json({ error: err.message });
  // note: stack trace is NOT sent to the client
}
```

Every route handler uses `try/catch` and forwards to `next(error)` — no inline `res.status(...).json(...)` error calls outside the central handler.

### Frontend error handling

- On non-2xx: parse `response.json().error` and display in `ErrorBanner`.
- On network failure (`fetch` throws): display "Could not connect to the server" in `ErrorBanner`.
- On `minStars > maxStars`: show inline validation in `StarsFilter` and block submission.
- `ErrorBanner` is cleared at the start of every new search request.

---

## Testing Strategy

### Unit tests (example-based)

Focus on specific inputs and boundary conditions. Use **Jest** for the backend and **Vitest + React Testing Library** for the frontend.

**Backend unit tests** (`backend/__tests__/`):
- `embeddingService.test.js` — mock `fetch`; verify timeout throws 503, valid response returns array, non-200 from Flask throws error.
- `searchService.test.js` — mock `esClient`; verify query body built correctly for each mode (keyword/semantic/hybrid), stars filter included/excluded correctly, `from` offset computed correctly.
- `searchController.test.js` — verify `q` missing → 400, `q` too long → 400, `pageSize=51` → 400, `minStars > maxStars` → 400.

**Frontend unit tests** (`frontend/src/__tests__/`):
- `SearchBar.test.jsx` — whitespace input does not call `onSearch`; enter key calls `onSearch`; `isLoading=true` disables input and button.
- `StarsFilter.test.jsx` — `minStars > maxStars` shows validation message and blocks submission.
- `ResultsList.test.jsx` — empty array renders no cards; N results renders N cards.
- `Pagination.test.jsx` — page 1 disables "Previous"; last page disables "Next".

### Property-based tests

Use **fast-check** (Node.js) for the backend and **fast-check** for the frontend.

Each property test runs a minimum of **100 iterations**.

Tag format: `// Feature: github-repo-search-engine, Property N: <property text>`

| Property | Test location | Generator inputs | What is asserted |
|---|---|---|---|
| P1: Embedding dimension | `backend/__tests__/embeddingService.pbt.test.js` | Arbitrary string 1–10,000 chars | `embedding.length === 384` and all elements are finite numbers |
| P2: Embedding rejects invalid | `backend/__tests__/embeddingService.pbt.test.js` | Empty string, non-string, length > 10,000, bad JSON | Response status is 400 with `error` field |
| P3: Stars filter in ES query | `backend/__tests__/searchService.pbt.test.js` | Random valid `minStars` / `maxStars` integers | ES query body contains correct `range` filter |
| P4: Pagination from-offset | `backend/__tests__/searchService.pbt.test.js` | Random `page` ≥ 1, `pageSize` 1–50 | `from === (page-1) * pageSize` in ES query |
| P5: Results ≤ pageSize | `backend/__tests__/searchController.pbt.test.js` | Random `pageSize` 1–50, mock ES response | `results.length <= pageSize` always |
| P6: Invalid params → 400 | `backend/__tests__/searchController.pbt.test.js` | Random invalid param combos | Response is always 400 with `error` field |
| P7: Error middleware status + no stack | `backend/__tests__/errorHandler.pbt.test.js` | Error objects with random status 400–599 | Response status matches, body has no stack/path |
| P8: Whitespace rejected | `frontend/src/__tests__/SearchBar.pbt.test.jsx` | Arbitrary whitespace-only strings | `onSearch` mock never called |
| P9: Valid submit trims and calls onSearch | `frontend/src/__tests__/SearchBar.pbt.test.jsx` | Arbitrary non-empty strings with optional whitespace | `onSearch` called with trimmed value |
| P10: RepoCard content | `frontend/src/__tests__/RepoCard.pbt.test.jsx` | Random repo objects with/without highlights | All fields present, correct highlight/fallback logic |
| P11: ResultsList card count | `frontend/src/__tests__/ResultsList.pbt.test.jsx` | Random-length results arrays | DOM card count equals `results.length` |
| P12: API URL omits defaults | `frontend/src/__tests__/search.api.pbt.test.js` | Random valid param combos | URL has correct params, defaults omitted |
| P13: Non-2xx shows error banner | `frontend/src/__tests__/App.pbt.test.jsx` | Random error messages, status codes 400–599 | Banner present in DOM with correct message |
| P14: New search resets page | `frontend/src/__tests__/App.pbt.test.jsx` | Random page values > 1, then new search | Page state resets to 1 |

### Integration / smoke tests

- Start all three services and run a single real query end-to-end (manual or with a short script).
- Verify Elasticsearch index exists and contains the expected field mappings.
- Verify the embedding service returns 384-dim vectors for a known input.

These are intentionally light — the property and unit tests cover the logic; integration tests just confirm the wiring is correct.
