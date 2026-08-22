# gitgrep

**grep for repositories, by meaning.**

A hybrid search engine for GitHub repositories — combining traditional keyword search with AI-powered semantic search, so you can find repos by what they *do*, not just what they're *called*.

Search "tool for building chatbots" and get relevant results even if none of them contain the exact word "chatbot."

---

## Why this exists

GitHub's native search only matches exact keywords. If a repo's README says "conversational AI assistant" but you search "chatbot," you might miss it entirely.

gitgrep solves this by combining:
- **Keyword search** — traditional exact-text matching (fast, precise)
- **Semantic search** — AI embeddings that understand *meaning*, so related concepts match even without shared words
- **Hybrid ranking** — both scored and blended into one result list

This is the same underlying pattern used in real-world products like Notion search, e-commerce search, and internal documentation search.

---

## How it works (high level)

```
 You type a query
        ↓
   React frontend
        ↓
  Node.js/Express API  ──────→  Python microservice
        ↓                        (converts text → embedding)
  Elasticsearch
  (keyword + semantic search combined)
        ↓
   Ranked results
```

1. You type a search query in the browser
2. The React frontend sends it to a Node.js backend
3. The backend asks a small Python service to convert your query into a **vector embedding** (a list of numbers representing meaning)
4. The backend sends both your original text *and* the embedding to Elasticsearch
5. Elasticsearch searches by keyword match AND by vector similarity, blends the scores, and returns ranked results
6. Results show up in the UI, with filters for language and minimum stars

---

## Tech stack

| Layer | Technology | Purpose |
|---|---|---|
| Data source | GitHub REST API | Fetches repo metadata + READMEs |
| Search engine | Elasticsearch | Stores and searches repo data (keyword + vector) |
| Embeddings | `sentence-transformers` (all-MiniLM-L6-v2) | Converts text into 384-dimensional vectors |
| Embedding service | Python + FastAPI | Serves embeddings over a small internal API |
| Backend | Node.js + Express | Main REST API, orchestrates search |
| Frontend | React (Vite) + Tailwind CSS | Search UI |
| Infrastructure | Docker | Runs Elasticsearch locally |

---

## Dataset

- ~500 Python repositories, fetched via the GitHub Search API
- Each repo includes: name, description, star count, language, URL, and full README text
- Indexed into Elasticsearch with both text fields (for keyword search) and a 384-dim embedding vector (for semantic search)

*(GitHub's Search API caps results at 1,000 per query — this project uses a curated subset rather than attempting to index "all" of GitHub, which isn't feasible for a single-machine project.)*

---

## Features

- 🔍 **Hybrid search** — keyword + semantic, combined in a single query
- 🎯 **Filters** — narrow by programming language and minimum star count
- ⚡ **Fast local search** — powered by Elasticsearch's vector + text indexing
- 🎨 **Custom terminal-themed UI** — built from scratch with React and Tailwind, including an interactive WebGL background
- 🕘 **Query history** — revisit recent searches instantly

---

## Running it locally

**Prerequisites:** Python 3.9+, Node.js 18+, Docker

**1. Start Elasticsearch**
```bash
docker-compose up -d
```

**2. Set up and run the Python embedding service**
```bash
cd embedding_service
pip install -r requirements.txt
uvicorn embedding_service:app --port 6000 --reload
```

**3. Set up and run the backend**
```bash
cd backend
npm install
node server.js
```

**4. Set up and run the frontend**
```bash
cd frontend
npm install
npm run dev
```

**5. (First time only) Fetch and index the data**
```bash
cd scripts
python3 fetch_repos.py
python3 generate_embeddings.py
python3 index_to_elasticsearch.py
```

Then open `http://localhost:5173` in your browser.

---

## Project structure

```
gitgrep/
├── data/                  # Fetched repo data (JSON)
├── scripts/                # Data collection, embedding generation, indexing
├── embedding_service/       # Python FastAPI microservice
├── backend/                # Node.js/Express API
│   ├── routes/
│   └── services/
├── frontend/                # React app
│   └── src/
│       └── components/
├── docker-compose.yml
└── README.md
```

---

## What I learned building this

- How search engines actually rank results (BM25, vector similarity, hybrid scoring)
- Building and connecting a microservice architecture across two languages (Python + Node.js)
- Designing REST APIs from scratch
- React fundamentals (state, effects, component composition) from zero
- Running and managing services with Docker

---

## Roadmap

- [ ] Pagination
- [ ] Keyword-only / semantic-only / hybrid search mode toggle
- [ ] Proper README chunking (currently truncated to first 1000 characters per repo)
- [ ] CI/CD pipeline (GitHub Actions)
- [ ] Live deployment
- [ ] Monitoring dashboard (Prometheus + Grafana)
- [ ] Load testing with published performance numbers

---
