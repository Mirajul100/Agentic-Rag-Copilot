import time
from pinecone import Pinecone, ServerlessSpec, PineconeException
from app.core.config import get_settings
from langchain_pinecone import PineconeVectorStore
from langchain_google_genai import GoogleGenerativeAIEmbeddings

settings = get_settings()

_embeddings = None
_vector_store = None

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
        _embeddings = GoogleGenerativeAIEmbeddings(
            model=settings.gemini_embedding_model,
            google_api_key=settings.gemini_api_key,
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
