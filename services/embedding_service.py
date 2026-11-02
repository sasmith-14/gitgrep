from contextlib import asynccontextmanager
from functools import partial
import threading

from fastapi import FastAPI, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from services.config import Settings


class TextInput(BaseModel):
    texts: list[str] = Field(min_length=1, max_length=128)


def create_app(model_factory=None, settings=None):
    settings = settings or Settings()
    lock = threading.Lock()

    @asynccontextmanager
    async def lifespan(app):
        if model_factory:
            app.state.model = model_factory(settings)
        else:
            from services.model import load_model
            app.state.model = load_model(settings)
        # Warm the model before readiness so request one doesn't pay initialization.
        app.state.model.encode(["warmup"], normalize_embeddings=True)
        yield

    app = FastAPI(lifespan=lifespan)

    @app.middleware("http")
    async def limit_body(request: Request, call_next):
        length = request.headers.get("content-length", "0")
        if not length.isdigit() or int(length) > settings.max_body_bytes:
            return JSONResponse({"detail": "body too large"}, status_code=413)
        if request.method == "POST":
            data = bytearray()
            async for part in request.stream():
                data.extend(part)
                if len(data) > settings.max_body_bytes:
                    return JSONResponse({"detail": "body too large"}, status_code=413)
            request._body = bytes(data)
        return await call_next(request)

    @app.get("/health")
    def health(request: Request):
        return {"model": settings.model_name, "revision": settings.model_revision,
                "dimension": settings.embed_dimension, "ready": hasattr(request.app.state, "model")}

    @app.post("/embed")
    async def embed(data: TextInput, request: Request):
        if len(data.texts) > settings.max_batch or any(
            not x.strip() or len(x) > settings.max_text_chars for x in data.texts
        ):
            return JSONResponse({"detail": "invalid batch or text length"}, status_code=422)

        def encode():
            # One model at a time bounds accelerator memory across simultaneous HTTP requests.
            with lock:
                return request.app.state.model.encode(data.texts, normalize_embeddings=True).tolist()

        vectors = await run_in_threadpool(partial(encode))
        return {"embeddings": vectors, "model": settings.model_name, "dimension": settings.embed_dimension}

    return app


app = create_app()
