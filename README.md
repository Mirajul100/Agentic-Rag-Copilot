# Agentic-Rag-Copilot

An AI-powered Agentic RAG project built with Python.

## Installation

**1. Clone the repository**
```bash
git clone <https://github.com/Mirajul100/Agentic-Rag-Copilot>
cd Agentic-Rag-Copilot
```

**2. Create virtual environment**
```bash
python -m venv venv
```

**3. Activate virtual environment**

Windows (Git Bash):
```bash
source venv/Scripts/activate
```

Linux / macOS:
```bash
source venv/bin/activate
```

**4. Install dependencies**
```bash
uv pip install -r requirements.txt
```

## Run Project

Create a `.env` file in the project root with the required service credentials:

```dotenv
GEMINI_API_KEY=your_gemini_api_key
TAVILY_API_KEY=your_tavily_api_key
PINECONE_API_KEY=your_pinecone_api_key
ADMIN_PASSWORD=choose_an_upload_password
```

The Gemini key powers question answering and embeddings, Tavily is used when the
private knowledge base does not contain an answer, and Pinecone stores searchable
document chunks. The document upload dialog uses `ADMIN_PASSWORD` as its admin key.

To load the included sample documents into Pinecone, run this once after configuring
the credentials:

```bash
python ingest_sample_kb.py
```

Then start the web app:

```bash
python run.py
```

Use **Add a document** in the app to index PDF, DOCX, TXT, Markdown, CSV, or XLSX
files up to 25 MB. A document must contain readable text and a valid admin key to
be indexed.

Gemini embedding requests are paced to `GEMINI_EMBEDDING_REQUESTS_PER_MINUTE`
(default `80`) to reduce free-tier rate-limit failures. Set this value below the
active limit shown for your Gemini API project. If that quota is already exhausted,
the upload endpoint returns HTTP 429 with a retry message; wait for the quota window
to reset and retry the upload.

## Technologies
- Python
- FastApi
- Agentic AI
- Retrieval-Augmented Generation (RAG)
- Large Language Models (LLMs)
