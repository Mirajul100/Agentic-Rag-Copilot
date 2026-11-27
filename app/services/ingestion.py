from pathlib import Path
from typing import Iterable
from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.document_loaders import PyPDFLoader, TextLoader
from docx import Document as DocxDocument

SUPPORTED_FILE_TYPES = [".pdf", ".txt", ".docx" , ".md"]

# Loads a file and returns an iterable of Document objects based on the file type.
def load_file(file_path: str) -> Iterable[Document]:
    file = file_path.suffix.lower()
    if file.endswith(".pdf"):
        loader = PyPDFLoader(str(file_path))
        return loader.load()
    if file.endswith(".txt"):
        loader = TextLoader(str(file_path), encoding="utf-8")
        return loader.load()
    if file.endswith(".docx"):
        doc = DocxDocument(str(file_path))
        text = "\n".join([para.text for para in doc.paragraphs])
        return [Document(page_content=text, metadata={"source": str(file_path)})]
    if file.endswith(".md"):
        loader = TextLoader(str(file_path), encoding="utf-8")
        return loader.load()
    return ValueError(f"Unsupported file type: {file_path.suffix}")

# Splits a list of Document objects into smaller chunks based on the specified chunk size and overlap.
def split_documents(documents: Iterable[Document]) -> list[Document]:
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=200,
        add_start_index=True,
    )
    return splitter.split_documents(list(documents))