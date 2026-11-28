import json
import logging
import secrets
import uuid
from pathlib import Path
from pydantic import BaseModel, Field
from fastapi import APIRouter, UploadFile, File, HTTPException, Header
from fastapi.responses import StreamingResponse
from app.core.config import get_settings
from app.rag.vector_store import add_documents_to_vector_store, EmbeddingQuotaError
from app.rag.work_flow import ask_stream, ask
from app.services.ingestion import load_file, split_documents, SUPPORTED_FILE_TYPES
from app.services.audit import write_audit

router = APIRouter(prefix="/api")
settings = get_settings()
logger = logging.getLogger(__name__)
MAX_UPLOAD_SIZE = 25 * 1024 * 1024

class ChatRequest(BaseModel):
    question: str = Field(..., description="The question to ask the RAG system.", min_length=2, max_length=3000)

@router.get("/health")
def health_check():
    return {"status": "ok", "app_name": settings.app_name}

@router.post("/chat")
def chat(payload: ChatRequest):
    try:
        response = ask(payload.question)
        try:
            write_audit(payload.question, response['source_used'], response.get('trace', []))
        except Exception:
            logger.exception("Could not write chat audit record")
        return {
            "answer": response['answer'],
            "source_used": response['source_used'],
            "trace": response.get('trace', []),
            "citations": response.get('citations', [])
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/chat/stream")
async def chat_stream(payload: ChatRequest):
    """Streams token chunks, trace steps, and metadata using Server-Sent Events (SSE)."""
    async def event_generator():
        source_used = ""
        trace_list = []
        
        try:
            for event in ask_stream(payload.question):
                if event["type"] == "trace":
                    trace_list.append(event["step"])
                elif event["type"] == "metadata":
                    source_used = event.get("source_used", "")
                
                # Format each chunk as a Server-Sent Event
                yield f"data: {json.dumps(event)}\n\n"
            
            # Write audit log after stream finishes successfully
            try:
                write_audit(payload.question, source_used or "unknown", trace_list)
            except Exception:
                logger.exception("Could not write streamed chat audit record")
            
            # Send completion signal
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
            
        except Exception as e:
            error_event = {"type": "error", "detail": str(e)}
            yield f"data: {json.dumps(error_event)}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")

@router.post("/ingest")
async def upload_document(file: UploadFile = File(...)
                          , admin_key: str = Header(..., alias="admin-key", description="Admin password for authentication")):
    """Uploads a document, parses it, chunks it, and adds it to the Pinecone vector store."""
    if not settings.admin_password:
        raise HTTPException(status_code=503, detail="Document uploads are not configured. Set ADMIN_PASSWORD on the server.")
    if not secrets.compare_digest(
        admin_key.encode("utf-8"), settings.admin_password.encode("utf-8")
    ):
        raise HTTPException(status_code=403, detail="Unauthorized: Invalid admin password.")
    if not file.filename:
        raise HTTPException(status_code=400, detail="The uploaded file has no filename.")
    filename = Path(file.filename).name
    file_extension = Path(filename).suffix.lower()
    if file_extension not in SUPPORTED_FILE_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{file_extension}'. Supported types are: {list(SUPPORTED_FILE_TYPES)}"
        )
    
    # Save uploaded file temporarily to disk for processing
    upload_dir = Path(settings.upload_dir)
    upload_dir.mkdir(parents=True, exist_ok=True)
    file_path = upload_dir / f"{uuid.uuid4().hex}{file_extension}"
    
    try:
        contents = await file.read(MAX_UPLOAD_SIZE + 1)
        if len(contents) > MAX_UPLOAD_SIZE:
            raise HTTPException(status_code=413, detail="The file is too large. Maximum upload size is 25 MB.")
        if not contents:
            raise HTTPException(status_code=400, detail="The uploaded file is empty.")
        with open(file_path, "wb") as f:
            f.write(contents)
            
        # Load and split documents
        try:
            raw_documents = list(load_file(str(file_path)))
        except Exception as exc:
            raise HTTPException(
                status_code=400,
                detail="The file could not be read. Check that it is valid and not password protected.",
            ) from exc
        if not raw_documents or not any(doc.page_content.strip() for doc in raw_documents):
            raise HTTPException(status_code=400, detail="No readable text was found in the uploaded document.")
        for document in raw_documents:
            document.metadata["source"] = filename
        split_docs = split_documents(raw_documents)
        if not split_docs:
            raise HTTPException(status_code=400, detail="No readable text was found in the uploaded document.")
        
        # Add to vector store
        add_documents_to_vector_store(split_docs)
        
        return {
            "status": "success",
            "filename": filename,
            "chunks_added": len(split_docs),
            "message": f"Successfully processed and indexed {filename}."
        }
        
    except HTTPException:
        raise
    except EmbeddingQuotaError as exc:
        logger.warning("Document indexing paused because Gemini embedding quota is exhausted")
        raise HTTPException(
            status_code=429,
            detail=str(exc),
            headers={"Retry-After": "60"},
        ) from exc
    except Exception:
        logger.exception("Failed to index uploaded document")
        raise HTTPException(
            status_code=500,
            detail="The document could not be indexed. Check the server logs and Gemini/Pinecone configuration.",
        )
    finally:
        await file.close()
        file_path.unlink(missing_ok=True)
