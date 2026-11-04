# Documentation

| Document | Purpose |
|---|---|
| [Beginner guide](../ARCHITECTURE.md) | Illustrated introduction from basics through advanced search concepts; [PDF](../Gitgrep-Architecture.pdf) |
| [Balanced experiment](BALANCED.md) | Repo shortlisting, flat passage scoring, measurements and activation |
| [API](API.md) | Public request/response contract, curl examples and captured responses |
| [Design](DESIGN.md) | Retrieval, indexing, pagination and failure tradeoffs |
| [Development](DEVELOPMENT.md) | Commands, configuration, local service workflow and troubleshooting |
| [Deployment](DEPLOY.md) | Single-VM setup, authenticated ES, TLS and rollback |
| [Evaluation](../eval/README.md) | Label review and baseline maintenance |
| [Results](../eval/RESULTS.md) | Measured retrieval metrics and five failure cases |
| [Benchmark](../eval/BENCHMARK.md) | Measured latency, throughput and exact test conditions |
| [Evidence](evidence/README.md) | Recorded commands and responses, including historical phase runs |
| [Portfolio](PORTFOLIO.md) | Measured resume bullets and interview questions |

## Repository map

```text
gitgrep/
├── backend/             TypeScript API, ranking code and Node tests
│   ├── src/             Parser, retrieval, fusion, upstreams and middleware
│   └── tests/           Unit, property, API and real-ES integration tests
├── services/            FastAPI embedding service and shared Python config
├── scripts/             Collection, README processing, embedding and indexing
├── tests/               Python tests and the shared 50-repository fixture
├── eval/                Query judgments, runners, baseline and measured results
├── infra/               Service Dockerfiles, nginx and operational checks
│   └── checks/          Endpoint smoke, embedding outage and ES permission checks
├── frontend/            React client, maintained separately
├── docs/                Architecture, API, operations and execution evidence
├── .github/             CI workflow and pull request template
├── Makefile             Repository-wide commands; run make help
├── docker-compose.yml   Local four-service stack
└── docker-compose.prod.yml  Standalone authenticated production configuration
```

Service manifests stay with their service. Python dependencies are shared by the pipeline and embedding service, so `pyproject.toml` and `uv.lock` stay at the root. The root Node manifest only forwards the original backend test/build commands. Compose files stay at the root so existing `docker compose` commands continue to work.

`data/`, `.cache/`, `.venv/`, `node_modules/` and `dist/` are local working artifacts, excluded from Git. `eval/fixture-run.json`, `eval/benchmark.json` and `docs/evidence/` intentionally retain small measured artifacts so reviewers can inspect the claims without rerunning the stack.
