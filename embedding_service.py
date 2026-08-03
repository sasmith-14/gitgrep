from flask import Flask, request, jsonify
from sentence_transformers import SentenceTransformer

app = Flask(__name__)
model = SentenceTransformer("all-MiniLM-L6-v2")

@app.route("/embed", methods=["POST"])
def embed():
    text = request.json["text"]
    embedding = model.encode(text).tolist()
    return jsonify({"embedding": embedding})

app.run(port=6000)