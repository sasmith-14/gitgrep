# Local development

Run commands from the repository root unless stated otherwise. Use Node 22+, Python 3.11 through uv, and Docker with Compose v2. The first install/build needs network access for pinned dependencies and the model. `make help` lists the main entry points.

## Commands

| Command | What it does |
|---|---|
| `make install` | Install locked Python, backend and frontend dependencies |
| `make up` | Build and start all four services, waiting for healthchecks |
| `make seed` | Embed/index the 50-repo fixture; reuse unchanged content |
| `make verify` | Lint, unit tests, integration, smoke and evaluation regression gate |
| `make test` | Isolated Python and Node unit/property/API tests |
| `make integration` | Query the actual seeded ES/model and check filters |
| `make eval` | Recompute retrieval metrics and recorded rankings |
| `make bench` | Run the fixed cold/cached query scenarios |
| `make audit` | Check backend and Python runtime dependency advisories |
| `make outage-check` | Stop embeddings, assert keyword fallback, then restore the service |
| `make prod-check` | Create disposable authenticated ES and check read-key permissions |
| `make hygiene` | Check that removed artifacts remain absent from Git history |
| `make down` | Stop the development stack, retaining its data volumes |

`make smoke` refreshes recorded endpoint responses in `docs/evidence/api/`. Evaluation refreshes its reports, raw fixture run and the README's marked result table. Benchmarking refreshes its report, JSON and marked README table. Inspect generated diffs before committing. To run smoke checks without replacing the published capture, use:

```sh
uv run --frozen python -m infra.checks.smoke --output docs/evidence/local/api
```

The outage check briefly interrupts semantic search on the development stack. The production permission check removes only its own disposable project/volume. Neither command targets a deployed VM.

## Configuration

| File | Read by | Typical settings |
|---|---|---|
| Root `.env` (copy `.env.example`) | Docker Compose | `CORS_ORIGIN`, `FRONTEND_PORT` |
| `backend/.env` (copy `backend/.env.example`) | Backend npm start/dev | ES/model URLs, timeouts, cache and rate limits |
| `services/.env` (copy `services/.env.example`) | Python service and pipeline | Model, ES connection, GitHub token |
| `.env.prod` | Explicit production Compose command | Password, read-only API key, public origin |

These local files are ignored. Do not put credentials into fixtures, command output or reports. Production setup has a separate [guide](DEPLOY.md).

## Run one service on the host

The Compose quickstart is enough to test the project. For backend edits, stop only its container, then start the host watcher in a dedicated terminal:

```sh
docker compose stop backend
cp backend/.env.example backend/.env  # first setup only
npm --prefix backend run dev
```

For embedding-service edits, stop its container and run:

```sh
docker compose stop embedding
uv run --frozen uvicorn services.embedding_service:app --host 127.0.0.1 --port 6001
```

The host backend can reach both services on their published local ports. A backend running inside Docker uses the embedding container hostname; use the host backend too when replacing embeddings with a host process. Stop host processes before restoring the containers with `make up`.

## Full corpus and index lifecycle

```sh
GITHUB_TOKEN=... make rebuild-data
```

The collector configuration is [scripts/collection.json](../scripts/collection.json): eight languages, star buckets and a created-date interval. The larger local corpus has now collected/indexed 4,000 repositories using scripts/collection.live.json; see [LIVE.md](LIVE.md). The original configuration remains available for separate rebuilds. Requests split around GitHub's result cap, respect rate limits and persist checkpoints/ETags. An unsplittable single-day/single-star shard fails explicitly. Conditional refresh uses `uv run --frozen python -m scripts.fetch_repos --refresh`.

`make rebuild-data` targets `gitgrep-v2` and moves the alias after successful indexing. Use a new version for subsequent corpus snapshots: same-index incremental writes do not delete records missing from the new input. Keep a separate fixture index/environment for integration and evaluation; those checks expect the checked-in 50 repositories. Schema, chunking and model details are in [DESIGN.md](DESIGN.md).

## Troubleshooting

- **Port 5173 is occupied:** to test the Compose frontend on 5174, run `FRONTEND_PORT=5174 CORS_ORIGIN=http://localhost:5174 make up`. If using an existing frontend dev server on 5173 instead, keep its origin configured. The current client calls the API on localhost:5050.
- **Readiness returns 503:** inspect `docker compose ps` and `docker compose logs --tail=100 backend embedding elasticsearch`. The first model image build needs time to download weights; runtime model access is offline.
- **Search works but semantic results degrade:** inspect the response's `degradedReason` and model health. The public embedding timeout defaults to 800 ms; evaluation/benchmark commands use a recorded 10-second timeout and reject degradation.
- **The evaluation gate fails after a data/model change:** compare the recorded identity and labels. Review the change before invoking `make eval-baseline`; do not hide a regression by refreshing the baseline automatically.
- **Testing CUDA:** the Linux lock/image uses CPU Torch. A CUDA installation needs a reviewed CUDA-enabled dependency setup; that path has not been validated. Host installs use available accelerators where the installed Torch build supports them.
