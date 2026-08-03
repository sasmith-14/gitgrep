from sentence_transformers import SentenceTransformer
import json

with open("data/repos.json", "r") as f:
    repos = json.load(f)

model = SentenceTransformer("all-MiniLM-L6-v2")

for repo in repos:
    text = f"{repo['name']} {repo.get('description', '')} {repo.get('readme', '')[:1000]}"
    embedding = model.encode(text)
    repo["embedding"] = embedding.tolist()

with open("data/repos_with_embeddings.json", "w") as f:
    json.dump(repos, f)

print("Done")