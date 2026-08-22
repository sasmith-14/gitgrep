from fastapi import FastAPI
from sentence_transformers import SentenceTransformer
from pydantic import BaseModel

app = FastAPI()
model = SentenceTransformer("all-MiniLM-L6-v2")

class TextInput(BaseModel):
    text: str

@app.post("/embed")
def embed(data: TextInput):
    embedding = model.encode(data.text).tolist()
    return {"embedding" : embedding}

