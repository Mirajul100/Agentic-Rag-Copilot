from pathlib import Path
from pydantic_settings import BaseSettings , SettingsConfigDict
from functools import lru_cache

BASE_DIR = Path(__file__).resolve().parents[2]

class Settings(BaseSettings):
    app_name: str = "Agentic RAG Copilot"
    app_env: str = "development"
    gemini_api_key: str = ""
    tavily_api_key: str = ""
    pinecone_api_key: str = ""
    gemini_model: str = "gemini-3.5-flash-lite"
    gemini_embedding_model: str = "gemini-embedding-2"
    pinecone_index_name: str = "document-support-rag"
    pinecone_namespace: str = "document-support-kb"
    top_k: int = 5
    max_retries: int = 3
    admin_api_key: str = "change-me"
    audit_db_path: str = str(BASE_DIR / "data" / "audit.db")
    upload_dir: str = str(BASE_DIR / "uploads")
    sample_docs_dir: str = str(BASE_DIR / "data" / "sample_kb")

    model_config = SettingsConfigDict(env_file=str(BASE_DIR / ".env"), env_file_encoding="utf-8")
    
@lru_cache
def get_settings() -> Settings:
    return Settings()