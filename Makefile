UV ?= uv
COMPOSE ?= docker compose
EMBED_TIMEOUT_MS ?= 10000

.PHONY: install up down seed rebuild-data eval eval-check eval-baseline bench test lint integration smoke verify
install:
	$(UV) sync --frozen
	npm ci --prefix backend
	npm ci --prefix frontend
up:
	$(COMPOSE) up -d --build --wait
down:
	$(COMPOSE) down
seed:
	$(UV) run --frozen python -m scripts.generate_embeddings --input tests/fixtures/repos.json
	$(UV) run --frozen python -m scripts.indexing_repos
rebuild-data:
	$(UV) run --frozen python -m scripts.fetch_repos
	$(UV) run --frozen python -m scripts.generate_embeddings
	$(UV) run --frozen python -m scripts.indexing_repos --index gitgrep-v2
eval:
	EMBED_TIMEOUT_MS=$(EMBED_TIMEOUT_MS) npm --prefix backend run eval
eval-check:
	EMBED_TIMEOUT_MS=$(EMBED_TIMEOUT_MS) npm --prefix backend run eval -- --check
eval-baseline:
	EMBED_TIMEOUT_MS=$(EMBED_TIMEOUT_MS) npm --prefix backend run eval -- --write-baseline
bench:
	npm --prefix backend run build
	EMBED_TIMEOUT_MS=$(EMBED_TIMEOUT_MS) npm --prefix backend run bench
test:
	$(UV) run --frozen pytest -q
	npm --prefix backend test
lint:
	$(UV) run --frozen ruff check services scripts tests
	npm --prefix backend run lint
integration:
	npm --prefix backend run integration
smoke:
	$(UV) run --frozen python -m scripts.smoke
verify: lint test integration smoke eval-check
