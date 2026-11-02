from pydantic import Field, HttpUrl
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file="services/.env", extra="ignore")
    model_name: str = "sentence-transformers/all-MiniLM-L6-v2"
    model_revision: str = "c9745ed1d9f207416be6d2e6f8de32d1f16199bf"
    embed_dimension: int = Field(384, ge=1, le=4096)
    model_device: str = "auto"
    max_batch: int = Field(32, ge=1, le=128)
    max_text_chars: int = Field(12000, ge=1, le=100000)
    max_body_bytes: int = Field(400000, ge=1)
    es_url: HttpUrl = HttpUrl("http://localhost:9200")
    es_index: str = Field("gitgrep", pattern=r"^[a-z][a-z0-9_-]*$")
    es_api_key: str = ""
    es_timeout_ms: int = Field(2000, ge=1)
    embed_url: HttpUrl = HttpUrl("http://localhost:6000")
    embed_timeout_ms: int = Field(30000, ge=1)
    github_api_url: HttpUrl = HttpUrl("https://api.github.com")
    github_token: str = ""
