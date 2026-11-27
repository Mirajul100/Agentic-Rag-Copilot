from pathlib import Path
from app.services.ingestion import load_file, split_documents
from app.rag.vector_store import add_documents_to_vector_store

doc = Path("data/information_kb/project.pdf")
documents = load_file(doc)
split_docs = split_documents(documents)
vector_store = add_documents_to_vector_store(split_docs)
print (f"Added {len(split_docs)} documents to the vector store.")
print (f"Vector store: {vector_store}")