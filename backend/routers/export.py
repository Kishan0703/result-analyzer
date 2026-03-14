"""GET /api/export/{session_id}/excel?group=IS  → download Excel report"""
from fastapi import APIRouter, HTTPException, Query, BackgroundTasks
from fastapi.responses import FileResponse
from typing import Optional
import tempfile, os

from utils.session_store import session_exists, load_merged_df, load_enrichment, load_metadata
from services.excel_generator import generate_excel

router = APIRouter()


def _cleanup(path: str):
    try:
        os.unlink(path)
    except Exception:
        pass


@router.get("/{session_id}/excel")
def export_excel(session_id: str, background_tasks: BackgroundTasks, group: Optional[str] = Query(None)):
    if not session_exists(session_id):
        raise HTTPException(404, "Session not found or expired")

    df = load_merged_df(session_id)
    enrichment = load_enrichment(session_id)
    metadata = load_metadata(session_id)

    fd, tmp_path = tempfile.mkstemp(suffix=".xlsx")
    os.close(fd)
    try:
        generate_excel(df, enrichment, metadata, output_path=tmp_path, group_filter=group)
    except Exception as e:
        os.unlink(tmp_path)
        raise HTTPException(500, f"Excel generation failed: {str(e)}")

    filename = f"result_report_{group or 'all'}.xlsx"
    background_tasks.add_task(_cleanup, tmp_path)
    return FileResponse(
        path=tmp_path,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename=filename,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )

