from pathlib import Path
from app.services.ingestion import load_file, split_documents

doc = Path("data/information_kb/project.pdf")
documents = load_file(doc)
split_docs = split_documents(documents)

print(len(split_docs))