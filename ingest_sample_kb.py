from pathlib import Path
from app.core.config import get_settings
from app.services.ingestion import load_file, split_documents
from app.rag.vector_store import add_documents_to_vector_store

settings = get_settings()

folders = Path(settings.sample_docs_dir)
files = [f for f in folders.iterdir() if f.is_file() and f.suffix.lower() in [".pdf", ".txt", ".docx", ".md", ".csv", ".xlsx"]]

all_docs = []

for file_path in files:
    try:
        all_docs.extend(load_file(file_path))
    except Exception as e:
        print(f"Error processing {file_path}: {e}")
chunked_docs = split_documents(all_docs)
vector_store = add_documents_to_vector_store(chunked_docs)
print(f"Added {len(chunked_docs)} documents to the vector store.")