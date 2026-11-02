# Phase 2 execution

```sh
UV_CACHE_DIR=/private/tmp/gitgrep-uv-cache uv sync --python 3.11
uv run pytest -q
uv run ruff check services scripts tests
uv run python -m scripts.generate_embeddings --input tests/fixtures/repos.json
uv run python -m scripts.indexing_repos
```

Real MiniLM vectors generated from all 50 fixture records, using the pinned model revision. ES 9.4.3 started locally in Docker with 512 MB JVM heap and 2 GB memory limit. First seed: {"index":"gitgrep-v1","documents":50,"changed":50,"failed":0}. A real ES 400 caught the original multi-get _source body format; corrected to _source_includes query parameter before the successful seed. Repeating the seed is checked below and in the final verification log.

Chunker test caught heading ancestry when the first heading skipped a level; fixed using heading levels. Python tests include bounded chunks/overlap/noise removal, shard partition boundaries, ETag + rate-limit retries and embedding batch/length/body boundaries with a fake model. Real model runs are separate from these unit tests.

The eight-language full GitHub collection was not run: it would download thousands of READMEs and consume an authenticated API quota. No multi-language coverage or full-corpus metrics are claimed. Rebuild command is documented in the Makefile; owner should review collector results before publishing them.
