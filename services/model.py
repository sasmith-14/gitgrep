from sentence_transformers import SentenceTransformer
from services.config import Settings


def load_model(settings: Settings):
    device = None if settings.model_device == "auto" else settings.model_device
    model = SentenceTransformer(settings.model_name, revision=settings.model_revision, device=device)
    if model.get_sentence_embedding_dimension() != settings.embed_dimension:
        raise ValueError("model dimension differs from EMBED_DIMENSION")
    return model
