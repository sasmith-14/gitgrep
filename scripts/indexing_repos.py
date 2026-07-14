from elasticsearch import Elasticsearch
import json

es = Elasticsearch("http://localhost:9200")

with open("data/repos.json") as f:
    repos = json.load(f)

for repo in repos:
    doc = {
        "name": repo["name"],
        "description": repo.get("description", ""),
        "readme": repo.get("readme", ""),
        "stars": repo["stargazers_count"],
        "language": repo.get("language", ""),
        "url": repo["html_url"]
    }
    es.index(index="repos", document=doc)

print("Done indexing")