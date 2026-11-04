FROM python:3.11-slim-bookworm@sha256:94a8fee35252d06ab75856f15f12c7bae67b10e8a6da93c7fded82b2610926cd AS build
WORKDIR /app
RUN pip install --no-cache-dir uv==0.12.10
COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv uv sync --frozen --no-dev --no-install-project
COPY services ./services
ENV HF_HOME=/opt/hf MODEL_DEVICE=cpu
RUN .venv/bin/python -c "from services.config import Settings; from services.model import load_model; load_model(Settings()).encode(['image warmup'], normalize_embeddings=True)"
FROM python:3.11-slim-bookworm@sha256:94a8fee35252d06ab75856f15f12c7bae67b10e8a6da93c7fded82b2610926cd
ENV PATH=/app/.venv/bin:$PATH HF_HOME=/opt/hf HF_HUB_OFFLINE=1 TOKENIZERS_PARALLELISM=false PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 MODEL_DEVICE=cpu OMP_NUM_THREADS=2 MKL_NUM_THREADS=2
WORKDIR /app
RUN useradd --uid 10001 --create-home app && mkdir -p /app/data /app/.cache && chown -R app:app /app
COPY --from=build /app/.venv /app/.venv
COPY --from=build /opt/hf /opt/hf
COPY --chown=app:app services ./services
COPY --chown=app:app scripts ./scripts
COPY --chown=app:app tests/fixtures ./tests/fixtures
USER app
EXPOSE 6001
CMD ["uvicorn", "services.embedding_service:app", "--host", "0.0.0.0", "--port", "6001", "--limit-concurrency", "32"]
