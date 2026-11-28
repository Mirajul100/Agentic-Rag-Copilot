import time
from threading import Lock
from pinecone import Pinecone, ServerlessSpec, PineconeException
from app.core.config import get_settings
from langchain_pinecone import PineconeVectorStore
from langchain_google_genai import GoogleGenerativeAIEmbeddings

settings = get_settings()

_embeddings = None
_vector_store = None

EMBEDDING_BATCH_SIZE = 20
EMBEDDING_QUOTA_RETRIES = 3


class EmbeddingQuotaError(RuntimeError):
    """Raised when Gemini's embedding quota remains exhausted after retries."""


class QuotaAwareEmbeddings:
    """Pace Gemini embedding inputs and retry transient quota responses."""

    def __init__(self, embeddings, requests_per_minute: int):
        self._embeddings = embeddings
        self._requests_per_minute = max(1, requests_per_minute)
        self._next_request_at = time.monotonic()
        self._lock = Lock()

    def _pace(self, input_count: int) -> None:
        interval = input_count * 60 / self._requests_per_minute
        with self._lock:
            now = time.monotonic()
            start_at = max(now, self._next_request_at)
            self._next_request_at = start_at + interval
        delay = start_at - now
        if delay > 0:
            time.sleep(delay)

    @staticmethod
    def _is_quota_error(error: Exception) -> bool:
        message = str(error).lower()
        return any(marker in message for marker in ("resource_exhausted", "429", "quota", "rate limit"))

    def _embed(self, texts: list[str]) -> list[list[float]]:
        for attempt in range(EMBEDDING_QUOTA_RETRIES + 1):
            self._pace(len(texts))
            try:
                return self._embeddings.embed_documents(texts, batch_size=len(texts))
            except Exception as error:
                if not self._is_quota_error(error):
                    raise
                if attempt == EMBEDDING_QUOTA_RETRIES:
                    raise EmbeddingQuotaError(
                        "Gemini's embedding quota is exhausted. Wait a minute and retry, "
                        "or lower GEMINI_EMBEDDING_REQUESTS_PER_MINUTE to match your project's quota."
                    ) from error
                time.sleep(2 ** attempt)
        raise AssertionError("Unreachable")

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        vectors: list[list[float]] = []
        for offset in range(0, len(texts), EMBEDDING_BATCH_SIZE):
            vectors.extend(self._embed(texts[offset:offset + EMBEDDING_BATCH_SIZE]))
        return vectors

    def embed_query(self, text: str) -> list[float]:
        return self._embed([text])[0]

EMBEDDING_MODEL_DIMENSIONS = {
    "gemini-embedding-2": 3072,
    "gemini-embedding-001": 3072,
}

def get_embedding_dimension(model_name: str | None = None) -> int:
    name = (model_name or settings.gemini_embedding_model or "").strip().lower()
    
    if name not in EMBEDDING_MODEL_DIMENSIONS:
        raise ValueError(f"Unsupported embedding model: {name}")
    
    return EMBEDDING_MODEL_DIMENSIONS[name]

def get_embeddings_model():
    global _embeddings
    if _embeddings is None:
        if not settings.gemini_api_key:
            raise ValueError("Gemini API key is not set in the configuration.")
        google_embeddings = GoogleGenerativeAIEmbeddings(
            model=settings.gemini_embedding_model,
            google_api_key=settings.gemini_api_key,
        )
        _embeddings = QuotaAwareEmbeddings(
            google_embeddings,
            settings.gemini_embedding_requests_per_minute,
        )
    return _embeddings

def ensure_index():
    if not settings.pinecone_api_key:
        raise ValueError("Pinecone API key is not set in the configuration.")
    
    desired_dimensions = get_embedding_dimension()
    index_name = settings.pinecone_index_name
    
    try:
        pc = Pinecone(api_key=settings.pinecone_api_key)
        
        existing_indexes = pc.list_indexes()
        index_names = [
            idx['name'] if isinstance(idx, dict) else getattr(idx, 'name', str(idx)) 
            for idx in existing_indexes
        ]
        
        if index_name not in index_names:
            cloud = getattr(settings, "PINECONE_CLOUD", "aws")
            region = getattr(settings, "PINECONE_REGION", "us-east-1")
            metric = getattr(settings, "PINECONE_METRIC", "cosine")
            
            pc.create_index(
                name=index_name,
                dimension=desired_dimensions,
                metric=metric,
                spec=ServerlessSpec(cloud=cloud, region=region)
            )
        else:
            index_info = pc.describe_index(index_name)
            current_dimensions = (
                index_info.get("dimension") if isinstance(index_info, dict) 
                else getattr(index_info, "dimension", None)
            )
            
            if current_dimensions is not None and current_dimensions != desired_dimensions:
                raise ValueError(
                    f"Pinecone index '{index_name}' has dimension {current_dimensions}, "
                    f"but your current embedding model requires dimension {desired_dimensions}. "
                    f"Please delete the existing index or update your embedding configuration."
                )

    except PineconeException:
        raise
    except Exception:
        raise
    
    return pc, index_name

def get_vector_store():
    global _vector_store
    if _vector_store is None:
        pc, index_name = ensure_index()
        pinecone_index = pc.Index(index_name)
        _vector_store = PineconeVectorStore(
            index=pinecone_index,
            embedding=get_embeddings_model(),
            namespace=settings.pinecone_namespace,
        )
    return _vector_store

def get_retriever():
    return get_vector_store().as_retriever(search_kwargs={"k": settings.top_k})

def add_documents_to_vector_store(documents):
    vector_store = get_vector_store()
    return vector_store.add_documents(documents)
