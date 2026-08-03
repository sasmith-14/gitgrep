# Implementation Plan: GitHub Repository Search Engine

## Overview

This plan is structured as a hands-on learning journey across four phases. Each task is small and teaches exactly one concept. Later tasks always build on earlier ones, so work through them in order.

**Phases:**
1. Python embedding microservice hardening
2. Node.js / Express backend
3. React frontend (components and UI)
4. Frontend–backend integration

> Tasks marked with `*` are optional (property-based and unit tests). They're valuable but you can skip them for a faster build and come back later.

---

## Phase 1 — Harden the Embedding Microservice

> **What you'll learn:** How to make a small Python web service production-ready: input validation, structured error responses, and proper logging.

- [ ] 1. Add input validation to the `/embed` endpoint
  - [ ] 1.1 Validate the `text` field in `embedding_service.py`
    - Before encoding, check that the request body is valid JSON, that a `text` key exists, that its value is a non-empty string, and that it is at most 10,000 characters.
    - Return HTTP 400 with `{"error": "<reason>"}` for each failing case; return HTTP 400 for non-JSON bodies or a missing `Content-Type: application/json` header.
    - **Concept:** This teaches you about defensive programming — never trust incoming data. Flask's `request.get_json(silent=True)` returns `None` when the body is not valid JSON, which is the right tool here.
    - _Requirements: 1.3, 1.8_

  - [ ]* 1.2 Write property-based tests for embedding input validation
    - **Property 2: Embedding service rejects all invalid inputs**
    - For any empty string, non-string value, string longer than 10,000 chars, or missing/non-JSON body, the service returns 400 with an `error` field.
    - Use `hypothesis` and Flask's test client. Tag: `# Feature: github-repo-search-engine, Property 2`
    - **Validates: Requirements 1.3, 1.8**

- [ ] 2. Add error handling for unexpected exceptions
  - [ ] 2.1 Wrap the `model.encode()` call in a try/except block
    - If an exception is raised during encoding, catch it and return HTTP 500 with `{"error": "Embedding generation failed"}`.
    - **Concept:** This teaches you about exception handling in Python. Without `try/except`, any crash sends a raw HTML error page — not useful for an API caller.
    - _Requirements: 1.4_

- [ ] 3. Add request logging to the embedding service
  - [ ] 3.1 Log every incoming request and every error using Python's `logging` module
    - Configure a logger at the top of `embedding_service.py`. Log `INFO` for each request (method + path). Log `ERROR` before every error response.
    - Remove the bare `app.run(port=6000)` at the bottom and replace it with a `if __name__ == "__main__":` guard.
    - **Concept:** This teaches two things at once — Python's `logging` module (better than `print`) and the `if __name__ == "__main__":` pattern that prevents the server from starting when the file is imported as a module.
    - _Requirements: 1.1, 1.5, 1.6, 1.7_

  - [ ]* 3.2 Write property-based tests for embedding valid inputs
    - **Property 1: Embedding output has fixed dimension**
    - For any string of 1–10,000 characters, the returned `embedding` array has exactly 384 elements and every element is a finite float.
    - Tag: `# Feature: github-repo-search-engine, Property 1`
    - **Validates: Requirements 1.2**

- [ ] 4. Checkpoint — Embedding service is hardened
  - Ensure all tests pass, ask the user if questions arise.
  - Manually verify: start `embedding_service.py` and `curl -X POST http://localhost:6000/embed -H "Content-Type: application/json" -d '{"text":"hello"}' | python3 -m json.tool`
  - You should see an `embedding` array with 384 numbers.


---

## Phase 2 — Node.js / Express Backend

> **What you'll learn:** How to structure a real Express API using routes, controllers, and services — and how to connect it to an external database (Elasticsearch) and an external microservice (the Flask embedder).

- [ ] 5. Install backend dependencies and configure environment variables
  - [ ] 5.1 Install `@elastic/elasticsearch` and set up `.env`
    - Run `npm install @elastic/elasticsearch` inside `backend/`.
    - Create `backend/.env` with two variables: `ELASTICSEARCH_URL=http://localhost:9200` and `EMBEDDING_SERVICE_URL=http://localhost:6000`.
    - Add `require('dotenv').config()` at the very top of `server.js` so the variables are available everywhere.
    - **Concept:** Environment variables let you change where the app connects (dev vs. prod) without touching code. `dotenv` loads a `.env` file into `process.env` for you.
    - _Requirements: 2.1, 2.2_

  - [ ] 5.2 Create the shared Elasticsearch client in `backend/services/esClient.js`
    - Instantiate `new Client({ node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200' })` and export it.
    - Import and test the connection in `server.js` at startup (`.ping()` in a `try/catch`): log the ES host on success, log the error but keep the server running on failure.
    - **Concept:** Creating one shared client and reusing it (instead of creating a new one per request) is a common pattern — it's cheaper and avoids connection exhaustion.
    - _Requirements: 2.2, 2.3, 2.4, 2.5_

- [ ] 6. Reorganize `server.js` into the routes/controllers/services structure
  - [ ] 6.1 Create `backend/routes/search.js` with just the route declaration
    - Create the file with an Express `Router`. Add one line: `router.get('/', searchController.search)`. Export the router.
    - Mount it in `server.js` with `app.use('/search', searchRouter)` and remove the old inline `/search` route.
    - **Concept:** Separating route _declarations_ from route _logic_ is called "separation of concerns". The routes file is the table of contents; the controller is the content.
    - _Requirements: 3.1, 3.5_

  - [ ] 6.2 Create `backend/controllers/searchController.js` as a stub
    - Export a `search(req, res, next)` function that reads `req.query.q`, returns 400 if it is missing or empty, and otherwise returns `res.json({ message: 'stub' })`.
    - **Concept:** The controller is the "HTTP layer" — its only job is to read from `req`, validate, call services, and write to `res`. It knows nothing about Elasticsearch or Flask.
    - _Requirements: 3.2_

  - [ ] 6.3 Create `backend/middleware/errorHandler.js`
    - Write the four-argument Express error handler: `function errorHandler(err, req, res, next)`.
    - Log `err.stack` to the console. Respond with `{ error: err.message }` and `err.status || 500`. Do NOT include the stack trace in the response body.
    - Register it in `server.js` after all routes with `app.use(errorHandler)`.
    - **Concept:** A single centralized error handler means you never repeat `res.status(500).json(...)` in 10 different places. Any route calls `next(error)` and this one function handles it.
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [ ]* 6.4 Write property-based tests for the error handler
    - **Property 7: Error middleware uses the error's status and never leaks stack traces**
    - Generate random `Error` objects with `.status` values in 400–599. Assert the response code matches and the body has no stack or file path.
    - Tag: `# Feature: github-repo-search-engine, Property 7`
    - **Validates: Requirements 6.2, 6.4**

- [ ] 7. Implement the embedding service client
  - [ ] 7.1 Create `backend/services/embeddingService.js`
    - Write `getEmbedding(text)`: POST to `process.env.EMBEDDING_SERVICE_URL + '/embed'` with `{ text }` as the JSON body. Use `AbortController` + `setTimeout` for a 5-second timeout. Return the `embedding` array on success. Throw an `Error` with `.status = 503` on timeout or if the service is unreachable.
    - **Concept:** `AbortController` is the standard way to add timeouts to `fetch` in Node.js. Without a timeout, a crashed downstream service would hang your request forever.
    - _Requirements: 4.2, 4.7_

- [ ] 8. Implement the Elasticsearch search service
  - [ ] 8.1 Create `backend/services/searchService.js` — build the query body
    - Write `hybridSearch({ q, mode, minStars, maxStars, from, size })`.
    - Build the ES request body: `multi_match` on `name^3`, `description^2`, `readme` for `keyword` and `hybrid` modes; `knn` on the `embedding` field for `semantic` and `hybrid` modes. Add a `range` filter for `stars` only when `minStars` or `maxStars` are provided. Include the `highlight` config and `from`/`size` fields.
    - **Concept:** Building the query as a plain JavaScript object before sending it makes the logic testable in isolation — you can unit-test the shape of the object without ever calling Elasticsearch.
    - _Requirements: 4.3, 5.2, 5.3_

  - [ ]* 8.2 Write property-based tests for the stars range filter
    - **Property 3: Stars range filter is reflected in the Elasticsearch query**
    - Generate random valid `minStars`/`maxStars` pairs. Assert the constructed query body contains the correct `range` filter on `stars`. Assert the filter is absent when neither is provided.
    - Tag: `# Feature: github-repo-search-engine, Property 3`
    - **Validates: Requirements 5.2, 5.3**

  - [ ]* 8.3 Write property-based tests for the pagination offset
    - **Property 4: Pagination from-offset is computed correctly**
    - Generate random `page` ≥ 1 and `pageSize` 1–50. Assert `from === (page - 1) * pageSize` in the built query body.
    - Tag: `# Feature: github-repo-search-engine, Property 4`
    - **Validates: Requirements 5.5**

- [ ] 9. Complete the search controller with full validation and service calls
  - [ ] 9.1 Add full parameter validation to `searchController.js`
    - Parse `q`, `mode`, `minStars`, `maxStars`, `page`, `pageSize` from `req.query`.
    - Validate: `q` required and ≤ 1000 chars; `mode` must be `keyword`, `semantic`, or `hybrid` if provided; `minStars`/`maxStars` must parse as integers ≥ 0; `page` ≥ 1; `pageSize` 1–50; `minStars` ≤ `maxStars` when both are set. Call `next(error)` with status 400 for any failure.
    - **Concept:** Validating inputs at the controller level means your service functions receive only clean data. This is called the "fail fast" principle.
    - _Requirements: 4.5, 4.6, 5.7, 5.8_

  - [ ]* 9.2 Write property-based tests for invalid parameter combinations
    - **Property 6: Invalid parameter combinations always produce 400**
    - Generate random invalid param combos (missing `q`, `q` too long, non-integer stars, `page < 1`, `pageSize > 50`, `minStars > maxStars`). Assert response is always 400 with an `error` field.
    - Tag: `# Feature: github-repo-search-engine, Property 6`
    - **Validates: Requirements 4.5, 4.6, 5.7, 5.8**

  - [ ] 9.3 Wire `embeddingService` and `searchService` into the controller
    - In `searchController.js`, call `getEmbedding(q)` and pass the result vector to `hybridSearch(...)`. Format the ES hits into the response shape `{ results: [...], total }`. Each result must include `name`, `description`, `stars`, `url`, and `highlights`.
    - Use `try/catch` and pass errors to `next(error)`.
    - **Concept:** The controller is the "orchestrator" — it calls two services, combines their outputs, and formats the final response. Neither service knows about the other.
    - _Requirements: 4.1, 4.3, 4.4, 5.4, 5.6_

  - [ ]* 9.4 Write property-based tests for result array length
    - **Property 5: Result array length never exceeds pageSize**
    - Mock the ES client to return random numbers of hits. Assert `results.length <= pageSize` for any valid `pageSize` in 1–50.
    - Tag: `# Feature: github-repo-search-engine, Property 5`
    - **Validates: Requirements 4.4, 5.4**

- [ ] 10. Checkpoint — Backend API is complete
  - Ensure all tests pass, ask the user if questions arise.
  - Manually verify: `curl "http://localhost:5050/search?q=machine+learning"` should return a JSON object with `results` and `total`.


---

## Phase 3 — React Frontend

> **What you'll learn:** How to build a React UI from scratch with Vite, how components communicate via props and callbacks, and how to manage shared application state.

- [ ] 11. Scaffold the React app with Vite
  - [ ] 11.1 Create the React app and configure the dev proxy
    - Run `npm create vite@latest frontend -- --template react` from the project root.
    - Create `frontend/.env` with `VITE_API_URL=http://localhost:5050`.
    - In `vite.config.js`, add a `server.proxy` entry: `/api` → `http://localhost:5050` with `rewrite: (path) => path.replace(/^\/api/, '')`.
    - Delete all boilerplate content from `App.jsx` and `App.css`, leaving just an empty component that returns `<div id="app"></div>`.
    - **Concept:** The Vite proxy makes the browser think the backend is on the same origin, which avoids CORS errors during development. In production you'd configure your web server (nginx, etc.) to do the same thing.
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [ ] 12. Build the SearchBar component
  - [ ] 12.1 Create `frontend/src/components/SearchBar.jsx`
    - Use `useState` to track the input value as a controlled input.
    - On submit (button click or Enter key): trim the value; if non-empty, call `onSearch(trimmedValue)`; if empty, do nothing.
    - Accept an `isLoading` prop; disable both the input and the button while `isLoading` is `true`.
    - **Concept:** A "controlled input" means React state is the single source of truth for what the input shows. Every keystroke updates state (`onChange`), and the input's `value` always reflects that state. This is the standard React pattern.
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_

  - [ ]* 12.2 Write property-based tests for SearchBar — whitespace rejection
    - **Property 8: Whitespace-only search is rejected by the SearchBar**
    - Generate random whitespace-only strings. Render `<SearchBar onSearch={mock} />`, type the string, click submit. Assert the mock was never called.
    - Tag: `# Feature: github-repo-search-engine, Property 8`
    - **Validates: Requirements 8.3, 8.5**

  - [ ]* 12.3 Write property-based tests for SearchBar — valid submit trims value
    - **Property 9: Valid SearchBar submission trims the value and calls onSearch**
    - Generate non-empty strings with optional surrounding whitespace. Assert `onSearch` is called with the trimmed value.
    - Tag: `# Feature: github-repo-search-engine, Property 9`
    - **Validates: Requirements 8.3, 8.4**

- [ ] 13. Build the SearchControls and StarsFilter components
  - [ ] 13.1 Create `frontend/src/components/SearchControls.jsx`
    - Render three buttons or radio inputs for "Keyword", "Semantic", "Hybrid". Highlight the active selection. Accept `mode` and `onModeChange` props.
    - **Concept:** This is the simplest form of "lifting state up" — the component doesn't own the `mode` value, it just displays it and reports changes via a callback. The parent (`App.jsx`) owns the state.
    - _Requirements: 9.1, 9.2_

  - [ ] 13.2 Create `frontend/src/components/StarsFilter.jsx`
    - Render two number inputs ("Min Stars", "Max Stars"). Accept `minStars`, `maxStars`, and `onChange` props.
    - If both inputs are non-empty and `minStars > maxStars`, display an inline validation message and block form submission by calling a `onValidationError` prop (or equivalent signal to the parent).
    - Remove the message as soon as the condition no longer holds.
    - **Concept:** Inline validation gives instant feedback without waiting for a server round-trip. The logic lives in the component that owns those two values.
    - _Requirements: 9.3, 9.4, 9.5, 9.6_

- [ ] 14. Build the RepoCard and ResultsList components
  - [ ] 14.1 Create `frontend/src/components/RepoCard.jsx`
    - Accept `name`, `description`, `stars`, `url`, and `highlights` props.
    - Display all four required fields. Render `url` as an `<a>` with `target="_blank" rel="noopener noreferrer"`.
    - For `name`, `description`, and `readme`, show the `highlights` fragment (using `dangerouslySetInnerHTML`) if one exists; otherwise show the plain field value.
    - **Concept:** `dangerouslySetInnerHTML` lets React render raw HTML — in this case the `<em>` tags from Elasticsearch's highlight feature. It's "dangerous" if the content comes from users, but here it comes from our own backend, so it's fine.
    - _Requirements: 10.2, 10.3, 10.4_

  - [ ]* 14.2 Write property-based tests for RepoCard content
    - **Property 10: RepoCard renders all required fields from the result object**
    - Generate random repo objects with/without `highlights`. Assert all fields render, the link has `rel="noopener noreferrer"`, and highlighted fragments take priority over plain values.
    - Tag: `# Feature: github-repo-search-engine, Property 10`
    - **Validates: Requirements 10.2, 10.3**

  - [ ] 14.3 Create `frontend/src/components/ResultsList.jsx`
    - Accept a `results` prop (array or null/undefined). Map over it and render one `<RepoCard>` per element. Render nothing if the array is empty, null, or undefined.
    - **Concept:** In React, rendering a list means calling `.map()` on an array and returning one JSX element per item. Each element needs a unique `key` prop so React can efficiently update the DOM.
    - _Requirements: 10.1_

  - [ ]* 14.4 Write property-based tests for ResultsList card count
    - **Property 11: ResultsList renders exactly one RepoCard per result**
    - Generate random-length arrays of repo objects. Assert the number of rendered `RepoCard` elements equals the array length.
    - Tag: `# Feature: github-repo-search-engine, Property 11`
    - **Validates: Requirements 10.1**

- [ ] 15. Build the Pagination, LoadingIndicator, and ErrorBanner components
  - [ ] 15.1 Create `frontend/src/components/Pagination.jsx`
    - Accept `page`, `total`, `pageSize`, `onPageChange`, and `isLoading` props.
    - Display "Page X of Y" where Y is `Math.ceil(total / pageSize)`.
    - Render "Previous" and "Next" buttons. Disable "Previous" on page 1. Disable "Next" on the last page. Disable both while `isLoading` is `true`.
    - **Concept:** Disabling buttons based on state prevents impossible actions (going to page 0). The page count formula `Math.ceil(total / pageSize)` is a one-liner but worth understanding — it rounds up so a partial final page still counts.
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6_

  - [ ] 15.2 Create `frontend/src/components/LoadingIndicator.jsx` and `frontend/src/components/ErrorBanner.jsx`
    - `LoadingIndicator`: renders a visible element (e.g., `<p>Loading...</p>`). No hidden CSS.
    - `ErrorBanner`: accepts a `message` prop and renders it in a visible element. If `message` is null/undefined/empty, render nothing.
    - **Concept:** Simple, single-responsibility components like these are easy to test and reuse. Their only job is to convert a prop into some DOM output.
    - _Requirements: 10.5, 10.6, 12.4, 12.5_

- [ ] 16. Checkpoint — Frontend components are complete
  - Ensure all tests pass, ask the user if questions arise.
  - At this stage the components exist but aren't wired to the API yet. You can import them into a temporary `App.jsx` and pass hardcoded props to visually verify they render correctly.


---

## Phase 4 — Frontend–Backend Integration

> **What you'll learn:** How the React state machine, the API module, and all the components connect into a working application.

- [ ] 17. Create the API module
  - [ ] 17.1 Create `frontend/src/api/search.js`
    - Export `fetchSearch({ q, mode, minStars, maxStars, page, pageSize })`.
    - Build a `URLSearchParams` object: always include `q`; omit `mode` if it equals `"hybrid"`; omit `minStars`/`maxStars` if blank; omit `page` if it equals `1`; omit `pageSize` if it equals `10`.
    - `fetch('/api/search?' + params)`. If status is not 2xx, parse the body and throw `new Error(body.error)`. If `fetch` itself throws (network failure), re-throw with the message `"Could not connect to the server"`.
    - Return `{ results, total }` on success.
    - **Concept:** Isolating all `fetch` calls in one module means the rest of your app never needs to know about URLs or HTTP status codes. This is called the "repository pattern" — one place where data access lives.
    - _Requirements: 12.1, 12.2_

  - [ ]* 17.2 Write property-based tests for API URL construction
    - **Property 12: Search API request URL includes all non-default parameters**
    - Generate random valid param combos. Assert `q` is always present; `mode` is present only when not `"hybrid"`; `minStars`/`maxStars` present only when set; `page` only when > 1; `pageSize` only when not 10.
    - Tag: `# Feature: github-repo-search-engine, Property 12`
    - **Validates: Requirements 12.2**

- [ ] 18. Wire all state into `App.jsx`
  - [ ] 18.1 Declare all application state in `App.jsx`
    - Add `useState` hooks for: `query`, `mode` (default `"hybrid"`), `minStars`, `maxStars`, `page` (default `1`), `pageSize` (fixed at `10`), `results` (default `[]`), `total` (default `0`), `isLoading` (default `false`), `error` (default `null`).
    - **Concept:** "Lifting state up" — all state that multiple components need lives in the closest common ancestor, which is `App.jsx`. Child components receive values as props and report changes via callbacks.
    - _Requirements: 12.3_

  - [ ] 18.2 Implement the `handleSearch` function in `App.jsx`
    - Write `handleSearch(q)`: set `isLoading = true`, clear `error`, reset `page = 1`. Call `fetchSearch(...)`. On success, set `results` and `total`. On error, set `error` to the error message. Finally set `isLoading = false`.
    - **Concept:** The `try/catch/finally` pattern in async functions guarantees `isLoading` is always reset to `false`, even if the request fails. Skipping `finally` is a common bug that leaves a spinner stuck on screen.
    - _Requirements: 11.7, 12.3, 12.4, 12.5, 12.6_

  - [ ]* 18.3 Write property-based tests for non-2xx error display
    - **Property 13: Non-2xx response displays the error field in the banner**
    - Mock `fetchSearch` to reject with random error messages and status codes 400–599. Assert `ErrorBanner` is present in the DOM with the correct message.
    - Tag: `# Feature: github-repo-search-engine, Property 13`
    - **Validates: Requirements 12.4**

  - [ ]* 18.4 Write property-based tests for new search resetting page
    - **Property 14: New search always resets page to 1**
    - Set `page` state to a random value > 1. Submit a new search. Assert `page` resets to 1 before the request is dispatched.
    - Tag: `# Feature: github-repo-search-engine, Property 14`
    - **Validates: Requirements 11.7**

- [ ] 19. Render all components in `App.jsx`
  - [ ] 19.1 Compose the full component tree in `App.jsx`
    - Import and render: `SearchBar`, `SearchControls`, `StarsFilter`, `ErrorBanner`, `LoadingIndicator` (shown only while `isLoading`), `ResultsList` (hidden while loading), a "No results found" message (when `results` is empty and not loading), and `Pagination` (shown when `total > 0`).
    - Pass the correct props and callbacks to each component.
    - **Concept:** React is a tree of components. `App.jsx` is the root — it owns all state and passes slices of it down as props. Data flows down; events flow up via callbacks. This is called unidirectional data flow.
    - _Requirements: 10.5, 10.6, 11.1–11.7, 12.3_

- [ ] 20. Implement pagination page changes
  - [ ] 20.1 Add `handlePageChange` to `App.jsx` and connect it to `Pagination`
    - Write `handlePageChange(newPage)`: update `page` state, then call `fetchSearch(...)` with the new page value.
    - Pass `handlePageChange` as `onPageChange` to `Pagination`.
    - **Concept:** This is the last piece of the data flow puzzle. The `Pagination` component doesn't know anything about fetching — it just calls `onPageChange(newPage)` and lets `App.jsx` decide what to do with it.
    - _Requirements: 11.5, 11.6_

- [ ] 21. Final checkpoint — Full stack is wired together
  - Ensure all tests pass, ask the user if questions arise.
  - Start all three services (embedding service, backend, frontend dev server) and run a real end-to-end search. Verify results appear, pagination works, the mode toggle changes results, and star filters narrow the list.

---

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP. Come back to them later for a deeper learning experience.
- Each task references specific requirements for traceability to `requirements.md`.
- Properties reference the numbered correctness properties in `design.md`.
- The backend uses CommonJS (`require`) since `package.json` has `"type": "commonjs"`. The frontend uses ES modules (Vite default). Don't mix the two styles within a layer.
- Keep all three services running in separate terminal tabs: `python embedding_service.py`, `node backend/server.js`, and `npm run dev` inside `frontend/`.


---

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "5.1"] },
    { "id": 1, "tasks": ["1.2", "2.1", "5.2"] },
    { "id": 2, "tasks": ["3.1", "6.1"] },
    { "id": 3, "tasks": ["3.2", "6.2", "6.3", "7.1"] },
    { "id": 4, "tasks": ["6.4", "8.1", "11.1"] },
    { "id": 5, "tasks": ["8.2", "8.3", "9.1", "12.1"] },
    { "id": 6, "tasks": ["9.2", "9.3", "12.2", "12.3"] },
    { "id": 7, "tasks": ["9.4", "13.1", "13.2", "14.1"] },
    { "id": 8, "tasks": ["14.2", "14.3", "15.1", "15.2"] },
    { "id": 9, "tasks": ["14.4", "17.1"] },
    { "id": 10, "tasks": ["17.2", "18.1"] },
    { "id": 11, "tasks": ["18.2"] },
    { "id": 12, "tasks": ["18.3", "18.4", "19.1"] },
    { "id": 13, "tasks": ["20.1"] }
  ]
}
```
