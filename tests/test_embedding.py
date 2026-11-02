import numpy as np
from fastapi.testclient import TestClient
from services.config import Settings
from services.embedding_service import create_app


class Model:
    calls = 0

    def encode(self, texts, normalize_embeddings):
        assert normalize_embeddings
        self.calls += 1
        return np.array([[1., 0., 0.] for _ in texts])


def test_embedding_batch_loads_once_and_validates():
    model = Model()
    with TestClient(create_app(lambda _: model, Settings(embed_dimension=3, max_batch=2, max_text_chars=10))) as client:
        assert client.get('/health').json()['dimension'] == 3
        assert client.post('/embed', json={'texts': ['a', 'b']}).json()['embeddings'] == [[1, 0, 0], [1, 0, 0]]
        assert client.post('/embed', json={'texts': ['']}).status_code == 422
        assert client.post('/embed', json={'texts': ['a'] * 3}).status_code == 422
        assert client.post('/embed', json={'texts': ['a' * 11]}).status_code == 422
        assert client.post('/embed', content=b'a' * 400001).status_code == 413
        assert model.calls == 2  # warmup plus the one accepted batch
