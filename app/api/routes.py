import json
import logging
import uuid
from pathlib import Path
from pydantic import BaseModel, Field
from fastapi import APIRouter, UploadFile, File, HTTPException, Header
from fastapi.responses import StreamingResponse
from app.core.config import get_settings
from app.rag.vector_store import add_documents_to_vector_store
from app.rag.work_flow import ask_stream, ask
from app.services.ingestion import load_file, split_documents, SUPPORTED_FILE_TYPES
from app.services.audit import write_audit

router = APIRouter(prefix="/api")
settings = get_settings()
logger = logging.getLogger(__name__)

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
                          , admin_key: str = Header(..., description="Admin password for authentication")):
    """Uploads a document, parses it, chunks it, and adds it to the Pinecone vector store."""
    if admin_key != settings.admin_password:
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
        contents = await file.read()
        if not contents:
            raise HTTPException(status_code=400, detail="The uploaded file is empty.")
        with open(file_path, "wb") as f:
            f.write(contents)
            
        # Load and split documents
        raw_documents = list(load_file(str(file_path)))
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
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process file upload: {str(e)}")
    finally:
        if file_path.exists():
            file_path.unlink()
