"""
Centralized application configuration.

All settings are loaded from environment variables (or a local .env
file during development) via pydantic-settings. Import `settings`
anywhere in the app to access typed, validated configuration.
"""
from functools import lru_cache
from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    ENABLE_EMBEDDINGS: bool = True  
    # --- App ---
    APP_NAME: str = "Helix"
    APP_ENV: str = "development"
    APP_DEBUG: bool = True
    APP_HOST: str = "0.0.0.0"
    APP_PORT: int = 8000
    SECRET_KEY: str = "change-me"

    # --- CORS ---
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:3001"

    @property
    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    # --- Neo4j ---
    NEO4J_URI: str = "bolt://localhost:7687"
    NEO4J_USER: str = "neo4j"
    NEO4J_PASSWORD: str = "neo4j"
    NEO4J_DATABASE: str = "neo4j"
    NEO4J_MAX_CONNECTION_POOL_SIZE: int = 50
    NEO4J_CONNECTION_TIMEOUT: int = 30

    # --- PostgreSQL ---
    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = 5432
    POSTGRES_USER: str = "helix"
    POSTGRES_PASSWORD: str = "helix_password"
    POSTGRES_DB: str = "helix_db"
    DATABASE_URL: str = "postgresql+asyncpg://helix:helix_password@localhost:5432/helix_db"

    # --- Redis ---
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379
    REDIS_DB: int = 0
    REDIS_PASSWORD: str = ""
    REDIS_URL: str = "redis://localhost:6379/0"

    # --- Celery ---
    CELERY_BROKER_URL: str = "redis://localhost:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/2"

    # --- Groq ---
    GROQ_API_KEY: str = ""
    GROQ_MODEL: str =  "qwen/qwen3.6-27b"
    GROQ_TEMPERATURE: float = 0.1

    # --- Embeddings ---
    EMBEDDING_MODEL: str = "sentence-transformers/all-MiniLM-L6-v2"
    EMBEDDING_DIM: int = 384
    
    # --- Public demo repo (viewable without auth) ---
    PUBLIC_DEMO_REPO_ID: str = ""

    # --- Repository storage ---
    REPO_STORAGE_PATH: str = "./storage/repos"
    MAX_REPO_SIZE_MB: int = 500

    # --- FAISS ---
    FAISS_INDEX_PATH: str = "./storage/faiss_index"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()