"""
GET  /api/enrichment/{session_id}           → get current enrichment data
POST /api/enrichment/{session_id}           → save staff info / class strength input
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from utils.session_store import session_exists, save_enrichment, load_enrichment

router = APIRouter()

class SubjectEnrichment(BaseModel):
    staff_name: str = ""
    class_strength: int = 0

class EnrichmentPayload(BaseModel):
    # Keys are course codes
    subjects: dict[str, SubjectEnrichment]

@router.get("/{session_id}")
def get_enrichment(session_id: str):
    if not session_exists(session_id):
        raise HTTPException(404, "Session not found")
    return load_enrichment(session_id)

@router.post("/{session_id}")
def save_enrichment_data(session_id: str, payload: EnrichmentPayload):
    if not session_exists(session_id):
        raise HTTPException(404, "Session not found")
    enrichment = {
        code: {"staff_name": v.staff_name, "class_strength": v.class_strength}
        for code, v in payload.subjects.items()
    }
    save_enrichment(session_id, enrichment)
    return {"message": "Enrichment saved"}

