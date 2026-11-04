UV ?= uv
COMPOSE ?= docker compose
EMBED_TIMEOUT_MS ?= 10000

.DEFAULT_GOAL := help

.PHONY: help install up down seed rebuild-data eval eval-check eval-baseline bench test lint integration smoke verify prod-check audit hygiene outage-check
help:
	@printf "%s\n" \
	  "Local setup:   make install up seed" \
	  "Checks:        make verify | audit | hygiene" \
	  "Search eval:   make eval | eval-check | eval-baseline" \
	  "Load test:     make bench" \
	  "Experiment:    make balanced-seed balanced-check" \
	  "PDF guide:     make architecture-pdf" \
	  "Operations:    make smoke | outage-check | prod-check" \
	  "Full corpus:   make rebuild-data  (requires GITHUB_TOKEN)" \
	  "Stop services: make down  (keeps data volumes)"

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
	$(UV) run --frozen ruff check services scripts infra/checks tests
	npm --prefix backend run lint
integration:
	npm --prefix backend run integration
smoke:
	$(UV) run --frozen python -m infra.checks.smoke
verify: lint test integration smoke eval-check

prod-check:
	python3 -m infra.checks.check_prod

audit:
	npm audit --prefix backend --audit-level=low
	mkdir -p .cache
	$(UV) export --frozen --no-dev --no-emit-project -o .cache/requirements.txt > /dev/null
	$(UV) tool run --from pip-audit==2.9.0 pip-audit -r .cache/requirements.txt --disable-pip --no-deps

hygiene:
	test ! -d venv
	git rev-parse --is-inside-work-tree
	! git rev-list --objects --all | rg ' (venv/|node_modules/|backend/node_modules/|data/repos(_with_embeddings)?\.json$$)'

outage-check:
	$(UV) run --frozen python -m infra.checks.check_degradation

.PHONY: balanced-seed balanced-check
balanced-seed:
	ES_INDEX=gitgrep-balanced $(UV) run --frozen python -m scripts.indexing_repos --index gitgrep-balanced-v2 --layout balanced
balanced-check:
	ES_INDEX=gitgrep-balanced SEARCH_STRATEGY=balanced npm --prefix backend run integration
	cd backend && npx tsx ../eval/balanced.ts

.PHONY: architecture-pdf
architecture-pdf:
	$(UV) run --frozen --with reportlab==4.4.3 python docs/build_architecture.py
