"""
GET  /api/session/{session_id}        → check if session exists + return metadata
DELETE /api/session/{session_id}      → manually clear session
"""
from fastapi import APIRouter, HTTPException
from utils.session_store import session_exists, load_metadata, delete_session

router = APIRouter()

@router.get("/{session_id}")
def get_session(session_id: str):
    if not session_exists(session_id):
        raise HTTPException(404, "Session not found or expired")
    meta = load_metadata(session_id)
    return {"session_id": session_id, "metadata": meta}

@router.delete("/{session_id}")
def clear_session(session_id: str):
    if not session_exists(session_id):
        raise HTTPException(404, "Session not found")
    delete_session(session_id)
    return {"message": "Session cleared"}

