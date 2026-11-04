import argparse
import hashlib
import json
from pathlib import Path
import sqlite3

from services.config import Settings
from services.model import load_model
from scripts.chunking import chunk_readme, sections


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def generate(source, destination, cache_path=".cache/embeddings.sqlite"):
    settings = Settings()
    model = load_model(settings)
    Path(cache_path).parent.mkdir(parents=True, exist_ok=True)
    cache = sqlite3.connect(cache_path)
    cache.execute("CREATE TABLE IF NOT EXISTS embeddings (hash TEXT PRIMARY KEY, vector TEXT NOT NULL)")
    output = []
    for repo in json.loads(Path(source).read_text()):
        chunks = chunk_readme(repo.get("readme") or "", model.tokenizer)
        intro = next((body for _, body in sections(repo.get('readme') or '')), '')
        metadata = f"{repo['full_name']} {repo.get('description') or ''} {' '.join(repo.get('topics') or [])}"
        summary_tokens = model.tokenizer.encode(metadata + ' ' + intro, add_special_tokens=False, truncation=True, max_length=220)
        summary = model.tokenizer.decode(summary_tokens, skip_special_tokens=True)
        if not chunks:
            chunks = [{"heading": "Overview", "body": metadata}]
        texts = [summary] + [c["body"] for c in chunks]
        keys = [digest([settings.model_name, settings.model_revision, text]) for text in texts]
        vectors = {}
        for key in set(keys):
            row = cache.execute("SELECT vector FROM embeddings WHERE hash=?", (key,)).fetchone()
            if row:
                vectors[key] = json.loads(row[0])
        missing = list(dict.fromkeys(key for key in keys if key not in vectors))
        text_for = dict(zip(keys, texts))
        for start in range(0, len(missing), settings.max_batch):
            batch = missing[start:start + settings.max_batch]
            encoded = model.encode([text_for[k] for k in batch], normalize_embeddings=True,
                                   batch_size=settings.max_batch, show_progress_bar=False)
            for key, vector in zip(batch, encoded):
                vectors[key] = vector.tolist()
                cache.execute("INSERT OR REPLACE INTO embeddings VALUES (?,?)", (key, json.dumps(vectors[key])))
            cache.commit()
        document = {"id": str(repo["id"]), "fullName": repo["full_name"], "name": repo["name"],
                    "url": repo["html_url"], "description": repo.get("description") or "",
                    "language": repo.get("language") or "Unknown", "stars": repo["stargazers_count"],
                    "pushedAt": repo["pushed_at"], "topics": repo.get("topics") or [],
                    "embedding": vectors[keys[0]],
                    "chunks": [dict(c, embedding=vectors[k]) for c, k in zip(chunks, keys[1:])],
                    "model": settings.model_name, "modelRevision": settings.model_revision}
        document["contentHash"] = digest(document)
        output.append(document)
        print(f"embed {len(output)} {document['fullName']} chunks={len(chunks)} new_vectors={len(missing)}", flush=True)
    Path(destination).parent.mkdir(parents=True, exist_ok=True)
    temporary = Path(str(destination) + ".tmp")
    temporary.write_text(json.dumps(output, ensure_ascii=False))
    temporary.replace(destination)
    cache.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default="data/repos.json")
    parser.add_argument("--output", default="data/repos_with_embeddings.json")
    args = parser.parse_args()
    generate(args.input, args.output)
