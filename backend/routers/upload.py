"""
POST /api/upload/files
  - Accept multiple xlsx files
  - Create or reuse session
  - Merge files, detect groups
  - Return session_id, warnings, detected groups, subject list (for enrichment step)
"""
import os, shutil, tempfile
from fastapi import APIRouter, UploadFile, File, Header, HTTPException
from typing import Optional

from services.merger import merge_files, detect_grouping
from utils.session_store import (
    create_session, session_exists, save_merged_df,
    save_metadata, load_metadata
)

router = APIRouter()

@router.post("/files")
async def upload_files(
    files: list[UploadFile] = File(...),
    x_session_id: Optional[str] = Header(None)
):
    """
    Upload one or more xlsx files.
    Returns session_id, warnings, detected groups and subjects.
    """
    if not files:
        raise HTTPException(400, "No files provided")

    # Validate file types
    for f in files:
        if not f.filename.endswith((".xlsx", ".xls")):
            raise HTTPException(400, f"Invalid file type: {f.filename}. Only xlsx/xls allowed.")

    # Enforce max file size per file
    MAX_FILE_SIZE_MB = 20
    for f in files:
        content = await f.read()
        if len(content) > MAX_FILE_SIZE_MB * 1024 * 1024:
            raise HTTPException(400, f"{f.filename} exceeds {MAX_FILE_SIZE_MB}MB limit")
        await f.seek(0)

    # Create or validate session
    session_id = x_session_id
    if not session_id or not session_exists(session_id):
        session_id = create_session()

    # Save uploaded files to temp dir
    tmp_dir = tempfile.mkdtemp()
    tmp_paths = []
    try:
        for f in files:
            tmp_path = os.path.join(tmp_dir, f.filename)
            with open(tmp_path, "wb") as out:
                content = await f.read()
                out.write(content)
            tmp_paths.append(tmp_path)

        # Merge all files
        merged_df, warnings = merge_files(tmp_paths)

        # Detect section/cluster grouping
        merged_df = detect_grouping(merged_df)

        # Save to session
        save_merged_df(session_id, merged_df)

        # Build metadata
        groups = sorted(merged_df["group"].unique().tolist())
        semesters = sorted(merged_df["semester"].dropna().unique().tolist()) if "semester" in merged_df.columns else []

        # Build subject list for enrichment step
        credit_subjects = merged_df[merged_df["credits_registered"] > 0]
        subjects = (
            credit_subjects
            .drop_duplicates(subset=["course_code"])[["course_code", "course_title"]]
            .sort_values("course_code")
            .to_dict(orient="records")
        )

        save_metadata(session_id, {
            "has_data": True,
            "file_names": [f.filename for f in files],
            "groups": groups,
            "semesters": [str(s) for s in semesters],
            "total_students": merged_df["usn"].nunique(),
            "total_rows": len(merged_df),
        })

        return {
            "session_id": session_id,
            "warnings": warnings,
            "groups": groups,
            "semesters": semesters,
            "total_students": merged_df["usn"].nunique(),
            "subjects": subjects,
        }

    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)

