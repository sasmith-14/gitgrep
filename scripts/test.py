from sentence_transformers import SentenceTransformer
from elasticsearch import Elasticsearch

model = SentenceTransformer("all-MiniLM-L6-v2")
es = Elasticsearch("http://localhost:9200")

query = "tool for building chatbots"
query_embedding = model.encode(query).tolist()

response = es.search(
    index="repos",
    knn={
        "field": "embedding",
        "query_vector": query_embedding,
        "k": 5,
        "num_candidates": 50
    }
)

for hit in response["hits"]["hits"]:
    print(hit["_source"]["name"], "-", hit["_score"])