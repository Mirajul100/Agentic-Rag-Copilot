from pathlib import Path
from typing import Iterable
from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.document_loaders import PyPDFLoader, TextLoader, CSVLoader
from docx import Document as DocxDocument
from openpyxl import load_workbook

SUPPORTED_FILE_TYPES = [".pdf", ".txt", ".docx" , ".md" , '.csv' , '.xlsx']

# Loads a file and returns an iterable of Document objects based on the file type.
def load_file(file_path: str) -> Iterable[Document]:
    file_path = Path(file_path)
    file = file_path.suffix.lower()
    if file.endswith(".pdf"):
        loader = PyPDFLoader(str(file_path))
        return loader.load()
    if file.endswith(".txt"):
        loader = TextLoader(str(file_path), encoding="utf-8")
        return loader.load()
    if file.endswith(".docx"):
        doc = DocxDocument(str(file_path))
        parts = [para.text for para in doc.paragraphs if para.text.strip()]
        for table in doc.tables:
            for row in table.rows:
                cells = [cell.text.replace("\n", " ").strip() for cell in row.cells]
                if any(cells):
                    parts.append("\t".join(cells))
        text = "\n".join(parts)
        return [Document(page_content=text, metadata={"source": str(file_path)})]
    if file.endswith(".md"):
        loader = TextLoader(str(file_path), encoding="utf-8")
        return loader.load()
    if file.endswith(".csv"):
        loader = CSVLoader(str(file_path))
        return loader.load()
    if file == ".xlsx":
        workbook = load_workbook(file_path, read_only=True, data_only=True)
        try:
            documents = []
            for sheet in workbook.worksheets:
                rows = [
                    "\t".join("" if value is None else str(value) for value in row).rstrip()
                    for row in sheet.iter_rows(values_only=True)
                ]
                content = "\n".join(row for row in rows if row.strip())
                if content:
                    documents.append(
                        Document(
                            page_content=content,
                            metadata={"source": str(file_path), "sheet": sheet.title},
                        )
                    )
            return documents
        finally:
            workbook.close()
    raise ValueError(f"Unsupported file type: {file_path.suffix}")

# Splits a list of Document objects into smaller chunks based on the specified chunk size and overlap.
def split_documents(documents: Iterable[Document]) -> list[Document]:
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=200,
        add_start_index=True,
    )
    return splitter.split_documents(list(documents))
