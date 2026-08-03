# Requirements Document

## Introduction

This document defines the requirements for a GitHub Repository Search Engine — a full-stack web application that lets users search 500 indexed GitHub repositories using a hybrid approach combining keyword search (BM25) and semantic search (dense vector knn). The system consists of three components: a Python Flask embedding microservice, a Node.js/Express backend API, and a React frontend built with Vite. The project is structured as a learning exercise in the MERN-style web development stack (using Elasticsearch instead of MongoDB), so each component is designed to teach a distinct concept.

## Glossary

- **Embedding_Service**: The Python Flask microservice running on port 6000 that converts text into a 384-dimensional vector using the `all-MiniLM-L6-v2` sentence-transformers model.
- **Backend**: The Node.js/Express server running on port 5050 that handles search requests, calls the Embedding_Service, and queries Elasticsearch.
- **Frontend**: The React application (built with Vite) running in the browser that provides the user interface for searching and viewing results.
- **Elasticsearch**: The locally running search engine (via Docker) containing the `repos` index with 500 GitHub repository documents.
- **Hybrid_Search**: A combined search strategy that merges BM25 keyword scoring and cosine-similarity knn vector scoring using an Elasticsearch `bool` query.
- **Repo_Card**: A UI component in the Frontend that displays a single repository result including its name, description, stars, and link.
- **Search_Mode**: A user-selectable setting that determines whether the search uses keyword-only, semantic-only, or hybrid mode.
- **Pagination**: The mechanism for splitting search results into pages, controlled by `from` and `size` parameters.
- **Stars_Filter**: A user-configurable minimum and/or maximum star count used to narrow search results.
- **Error_Middleware**: An Express middleware function that catches errors from route handlers and returns a structured JSON error response.

---

## Requirements

### Requirement 1: Harden the Embedding Microservice

**User Story:** As a developer, I want the Embedding_Service to be production-ready, so that the Backend can call it reliably without crashes or silent failures.

#### Acceptance Criteria

1. THE Embedding_Service SHALL load the `all-MiniLM-L6-v2` model exactly once at startup, before handling any requests.
2. WHEN a POST request is received at `/embed` with a JSON body containing a `text` field that is a non-empty string between 1 and 10,000 characters, THE Embedding_Service SHALL return a JSON response containing an `embedding` array of exactly 384 floating-point numbers.
3. IF the POST request body is missing the `text` field, `text` is an empty string, `text` is not a string type, or `text` exceeds 10,000 characters, THEN THE Embedding_Service SHALL return a 400 status code with a JSON body containing an `error` field that identifies which validation rule was violated.
4. IF an unhandled exception occurs during encoding, THEN THE Embedding_Service SHALL return a 500 status code with a JSON body containing an `error` field stating that embedding generation failed.
5. THE Embedding_Service SHALL log each incoming request at INFO level, including the HTTP method and path.
6. THE Embedding_Service SHALL log each error at ERROR level before returning an error response.
7. WHEN the module is executed as the main script, THE Embedding_Service SHALL start the Flask server on port 6000.
8. IF the POST request body is not valid JSON or the `Content-Type` header is not `application/json`, THEN THE Embedding_Service SHALL return a 400 status code with a JSON body containing an `error` field describing the parsing failure.

---

### Requirement 2: Install and Configure the Elasticsearch Client in the Backend

**User Story:** As a developer, I want the Backend to connect to Elasticsearch, so that it can execute search queries against the `repos` index.

#### Acceptance Criteria

1. THE Backend SHALL install the `@elastic/elasticsearch` npm package and load Elasticsearch connection configuration (host URL) from environment variables using a `.env` file.
2. IF the `ELASTICSEARCH_URL` environment variable is not set or is empty, THEN THE Backend SHALL fall back to `http://localhost:9200`.
3. THE Backend SHALL create a single shared Elasticsearch client instance that all route handlers reuse.
4. WHEN the Backend starts, THE Backend SHALL log the Elasticsearch host it is connecting to.
5. IF the Elasticsearch client cannot establish a connection on startup, THEN THE Backend SHALL log an error message describing the failure and continue running so that subsequent retry attempts from route handlers can succeed.

---

### Requirement 3: Reorganize the Backend into Routes, Controllers, and Services

**User Story:** As a developer, I want the Backend code organized into separate layers, so that I can understand separation of concerns and maintain the codebase as it grows.

#### Acceptance Criteria

1. THE Backend SHALL define all Express route declarations in a dedicated routes file (`routes/search.js`).
2. THE Backend SHALL define all request/response handling logic in a dedicated controller file (`controllers/searchController.js`).
3. THE Backend SHALL define all Elasticsearch query construction and execution logic in a dedicated service file (`services/searchService.js`).
4. THE Backend SHALL define all Embedding_Service HTTP call logic in a dedicated service file (`services/embeddingService.js`).
5. THE Backend entry point (`server.js`) SHALL only configure Express middleware and mount routes — it SHALL NOT contain query or business logic.
6. WHEN a route handler encounters an error, THE Backend SHALL pass the error to the next Express middleware function using `next(error)` rather than handling it inline.

---

### Requirement 4: Implement the Hybrid Search Endpoint

**User Story:** As a developer, I want the Backend to expose a `/search` endpoint that performs hybrid BM25 + semantic search, so that users can find relevant repositories even when their query words don't exactly match the index content.

#### Acceptance Criteria

1. THE Backend SHALL expose a `GET /search` endpoint that accepts a `q` query parameter containing the search text.
2. WHEN a `GET /search` request is received with a non-empty `q` parameter of 1,000 characters or fewer, THE Backend SHALL call the Embedding_Service with a configurable timeout of 5 seconds to convert `q` into a vector embedding.
3. WHEN the embedding is received, THE Backend SHALL execute an Elasticsearch query that combines a multi-field BM25 `multi_match` on `name`, `description`, and `readme` with a `knn` vector search on the `embedding` field, returning results ordered by combined relevance score descending.
4. THE Backend SHALL return a JSON response containing an array of at most `pageSize` result objects, where each object includes `name`, `description`, `stars`, `url`, and a `highlights` object containing highlight fragments for the `name`, `description`, and `readme` fields as returned by Elasticsearch's highlight API.
5. IF the `q` parameter is absent or empty, THEN THE Backend SHALL return a 400 status code with a JSON error message.
6. IF the `q` parameter exceeds 1,000 characters, THEN THE Backend SHALL return a 400 status code with a JSON error message stating the query is too long.
7. IF the Embedding_Service does not respond within 5 seconds or is unreachable, THEN THE Backend SHALL return a 503 status code with a JSON error message indicating the embedding service is unavailable.
8. IF Elasticsearch returns an error, THEN THE Backend SHALL return a 500 status code with a JSON error message.

---

### Requirement 5: Add Stars Filtering and Pagination to the Search Endpoint

**User Story:** As a developer, I want the `/search` endpoint to support star count filtering and page-based pagination, so that users can narrow results and browse large result sets.

#### Acceptance Criteria

1. THE Backend SHALL accept optional `minStars` and `maxStars` query parameters on `GET /search`, each interpreted as integers.
2. WHEN `minStars` is provided, THE Backend SHALL include a range filter requiring `stars >= minStars` in the Elasticsearch query.
3. WHEN `maxStars` is provided, THE Backend SHALL include a range filter requiring `stars <= maxStars` in the Elasticsearch query.
4. THE Backend SHALL accept optional `page` (default: 1) and `pageSize` (default: 10, maximum: 50) query parameters on `GET /search`.
5. THE Backend SHALL compute the Elasticsearch `from` offset as `(page - 1) * pageSize`.
6. THE Backend SHALL return a `total` count of matching documents alongside the results array in the response body.
7. IF `minStars`, `maxStars`, `page`, or `pageSize` are provided as non-integer values, or if `page` is less than 1, or if `pageSize` is less than 1 or greater than 50, THEN THE Backend SHALL return a 400 status code with a JSON error message identifying the invalid parameter.
8. IF `minStars` and `maxStars` are both provided and `minStars` is greater than `maxStars`, THEN THE Backend SHALL return a 400 status code with a JSON error message stating that minStars cannot exceed maxStars.

---

### Requirement 6: Implement Error Handling Middleware in the Backend

**User Story:** As a developer, I want a centralized error handler in the Backend, so that all errors produce consistent JSON responses and I don't repeat error-handling code in every route.

#### Acceptance Criteria

1. THE Backend SHALL register a centralized Express error-handling middleware after all routes that intercepts any error passed via `next(error)`.
2. WHEN the error middleware is invoked, THE Backend SHALL return a JSON response with an `error` field containing the error message and an HTTP status code in the range 400–599 matching `err.status` if set, or 500 otherwise.
3. WHEN the error middleware is invoked, THE Backend SHALL print the full error stack trace to the server console before sending the response.
4. THE Backend error middleware SHALL NOT include the error stack trace or file paths in the JSON response body sent to the client.

---

### Requirement 7: Create the React Frontend with Vite

**User Story:** As a developer, I want a React application scaffolded with Vite, so that I have a fast development environment and a starting point for building the search UI.

#### Acceptance Criteria

1. THE Frontend SHALL be created using the Vite `react` template in a `frontend/` directory at the project root.
2. THE Frontend SHALL define the Backend API base URL in a Vite environment variable (`VITE_API_URL`) loaded from a `frontend/.env` file.
3. WHEN the Frontend starts in development mode, THE Frontend SHALL proxy requests whose path begins with `/api` to `http://localhost:5050`, stripping the `/api` prefix before forwarding, to avoid CORS issues during development.
4. THE Frontend `App.jsx` SHALL contain only a single root element with no boilerplate markup, placeholder imports, or generated sample content before any custom components are added.

---

### Requirement 8: Build the Search Bar Component

**User Story:** As a user, I want a search input field with a submit button, so that I can type a query and trigger a search.

#### Acceptance Criteria

1. THE Frontend SHALL render a `SearchBar` component containing a text input field and a submit button.
2. WHEN the user types in the text input, THE Frontend SHALL update the component's controlled input state on every keystroke.
3. WHEN the submit button is clicked and the input value is non-empty after trimming whitespace, THE Frontend SHALL invoke the `onSearch` callback prop with the trimmed input value; IF `onSearch` is not provided, THE Frontend SHALL perform no action.
4. WHEN the Enter key is pressed while the text input is focused and the input value is non-empty after trimming whitespace, THE Frontend SHALL invoke the `onSearch` callback prop with the trimmed input value; IF `onSearch` is not provided, THE Frontend SHALL perform no action.
5. WHEN the input field is empty or contains only whitespace and the submit button is clicked, THE Frontend SHALL NOT invoke the `onSearch` callback.
6. THE `SearchBar` component SHALL accept an `isLoading` boolean prop and, WHILE `isLoading` is true, THE `SearchBar` SHALL disable the submit button.
7. THE `SearchBar` component SHALL accept an `isLoading` boolean prop and, WHILE `isLoading` is true, THE `SearchBar` SHALL disable the text input field.

---

### Requirement 9: Build the Search Mode Toggle and Stars Filter UI

**User Story:** As a user, I want to choose between keyword, semantic, and hybrid search modes and filter by star count, so that I can control how results are ranked and narrowed.

#### Acceptance Criteria

1. THE Frontend SHALL render a `SearchControls` component containing a segmented control or radio group with three options: "Keyword", "Semantic", and "Hybrid", with "Hybrid" selected by default.
2. WHEN the user selects a search mode, THE Frontend SHALL update the selected mode in shared application state so that it is accessible when the next search is submitted.
3. THE Frontend SHALL render a `StarsFilter` component containing two number inputs labeled "Min Stars" and "Max Stars", each accepting only non-negative integers up to 999,999,999.
4. WHEN the user changes a stars filter input, THE Frontend SHALL update the filter values in component state.
5. WHEN a search is submitted, THE Frontend SHALL include the active search mode as a `mode` query parameter and any non-blank stars filter values as `minStars` and `maxStars` query parameters in the API request; a stars input with the value 0 SHALL be transmitted as `0`, not omitted.
6. IF `minStars` is greater than `maxStars` and both inputs are non-empty, THEN THE Frontend SHALL display an inline validation message and SHALL NOT submit the search request; the validation message SHALL be removed when the condition no longer holds.

---

### Requirement 10: Build the Results Display Component

**User Story:** As a user, I want to see repository results displayed as cards with highlighted matching text, so that I can quickly identify relevant repositories.

#### Acceptance Criteria

1. THE Frontend SHALL render a `ResultsList` component that maps over a results array prop and renders one `RepoCard` per element; IF the prop is null, undefined, or an empty array, no `RepoCard` elements SHALL be rendered.
2. THE `RepoCard` component SHALL display the repository `name`, `description`, `stars` count, and a clickable `url` link that opens in a new browser tab with `rel="noopener noreferrer"` set on the anchor element.
3. WHEN the API response includes highlight fragments for `name`, `description`, or `readme`, THE `RepoCard` SHALL render the highlighted fragment instead of the plain field value, preserving the inline markup tags returned by the Backend; fields without a highlight fragment SHALL fall back to the plain field value.
4. THE Frontend SHALL render highlighted HTML fragments using React's `dangerouslySetInnerHTML` only with content sourced directly from the Backend response, and SHALL NOT apply any additional HTML transformation to that content.
5. WHILE a search request is in progress, THE Frontend SHALL render a loading indicator element that is present in the DOM and not hidden with `display:none` or `visibility:hidden`, in place of the results list.
6. WHEN the search returns zero results, THE Frontend SHALL display a "No results found" message.

---

### Requirement 11: Build the Pagination UI Component

**User Story:** As a user, I want previous and next page controls, so that I can browse through more than the first page of results.

#### Acceptance Criteria

1. THE Frontend SHALL render a `Pagination` component displaying the current page number and the total page count, where total page count is computed as the ceiling of (total results / pageSize).
2. THE `Pagination` component SHALL render a "Previous" button and a "Next" button.
3. WHILE on the first page, THE Frontend SHALL disable the "Previous" button.
4. IF the current page equals the total page count, THEN THE Frontend SHALL disable the "Next" button.
5. WHEN the "Next" or "Previous" button is clicked, THE Frontend SHALL re-submit the search request with the incremented or decremented `page` parameter.
6. WHILE a pagination-triggered search request is in progress, THE Frontend SHALL disable both the "Previous" and "Next" buttons.
7. WHEN a new search query is submitted, THE Frontend SHALL reset the current page to 1.

---

### Requirement 12: Connect the Frontend to the Backend API

**User Story:** As a developer, I want the Frontend to call the Backend `/search` endpoint, so that real search results are displayed in the UI.

#### Acceptance Criteria

1. THE Frontend SHALL define a dedicated API module (`src/api/search.js`) that contains all `fetch` calls to the Backend.
2. WHEN `onSearch` is invoked, THE Frontend SHALL call the Backend `GET /search` endpoint with `q`, `mode`, `minStars`, `maxStars`, `page`, and `pageSize` as query parameters, omitting `mode` when it equals "keyword" (default), omitting `minStars` and `maxStars` when they are blank or unset, omitting `page` when it equals 1 (default), and omitting `pageSize` when it equals 10 (default).
3. WHEN the Backend responds with a 2xx status code, THE Frontend SHALL parse the response body and store the `results` array and `total` count in React state, making them available to the `ResultsList` and `Pagination` components.
4. IF the Backend returns a non-2xx HTTP status code, THEN THE Frontend SHALL parse the response body and display the value of the `error` field in an error banner that is rendered in the DOM and not hidden.
5. IF a network error occurs (no response received), THEN THE Frontend SHALL display a "Could not connect to the server" message in the error banner that is rendered in the DOM and not hidden.
6. WHEN `onSearch` is invoked, THE Frontend SHALL remove any previously displayed error banner before initiating the new request.
