from elasticsearch import Elasticsearch
import json

es = Elasticsearch("http://localhost:9200")

mapping = {
    "mappings": {
        "properties": {
            "name": {"type": "text"},
            "description": {"type": "text"},
            "readme": {"type": "text"},
            "stars": {"type": "integer"},
            "url": {"type": "keyword"},
            "embedding": {
                "type": "dense_vector",
                "dims": 384,
                "index": True,
                "similarity": "cosine"
            }
        }
    }
}

es.indices.delete(index="repos", ignore_unavailable=True)
es.indices.create(index="repos", body=mapping)

with open("data/repos_with_embeddings.json") as f:
    repos = json.load(f)

for repo in repos:
    doc = {
        "name": repo["name"],
        "description": repo.get("description", ""),
        "readme": repo.get("readme", ""),
        "stars": repo["stargazers_count"],
        "url": repo["html_url"],
        "embedding": repo["embedding"]
    }
    es.index(index="repos", document=doc)

print("Indexed with embeddings")