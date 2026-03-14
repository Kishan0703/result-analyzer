# backend/utils/session_store.py
"""
File-based session storage.
Each session is a directory: /tmp/result_sessions/<session_id>/
  - raw_merged.parquet     : merged dataframe
  - enrichment.json        : staff names, class strength
  - metadata.json          : created_at, semester, groups found, upload filenames
  - analysis_cache.json    : cached analysis output (invalidated on new upload)
"""
import os
import json
import time
import shutil
import asyncio
import uuid
import pandas as pd
from pathlib import Path

SESSION_DIR = "/tmp/result_sessions"


def create_session() -> str:
    session_id = str(uuid.uuid4())
    path = os.path.join(SESSION_DIR, session_id)
    os.makedirs(path, exist_ok=True)
    metadata = {
        "created_at": time.time(),
        "session_id": session_id,
        "has_data": False,
    }
    _write_json(path, "metadata.json", metadata)
    return session_id


def session_exists(session_id: str) -> bool:
    path = os.path.join(SESSION_DIR, session_id)
    return os.path.isdir(path) and os.path.exists(os.path.join(path, "metadata.json"))


def save_merged_df(session_id: str, df: pd.DataFrame):
    path = _session_path(session_id)
    df.to_parquet(os.path.join(path, "raw_merged.parquet"), index=False)
    _invalidate_analysis_cache(session_id)


def load_merged_df(session_id: str) -> pd.DataFrame:
    path = _session_path(session_id)
    parquet_path = os.path.join(path, "raw_merged.parquet")
    if not os.path.exists(parquet_path):
        raise FileNotFoundError(f"No data found for session {session_id}")
    return pd.read_parquet(parquet_path)


def save_enrichment(session_id: str, enrichment: dict):
    path = _session_path(session_id)
    _write_json(path, "enrichment.json", enrichment)
    _invalidate_analysis_cache(session_id)


def load_enrichment(session_id: str) -> dict:
    path = _session_path(session_id)
    return _read_json(path, "enrichment.json", default={})


def save_metadata(session_id: str, updates: dict):
    path = _session_path(session_id)
    meta = _read_json(path, "metadata.json", default={})
    meta.update(updates)
    _write_json(path, "metadata.json", meta)


def load_metadata(session_id: str) -> dict:
    path = _session_path(session_id)
    return _read_json(path, "metadata.json", default={})


def save_analysis_cache(session_id: str, results: dict):
    path = _session_path(session_id)
    _write_json(path, "analysis_cache.json", results)


def load_analysis_cache(session_id: str) -> dict | None:
    path = _session_path(session_id)
    cache_path = os.path.join(path, "analysis_cache.json")
    if not os.path.exists(cache_path):
        return None
    return _read_json(path, "analysis_cache.json", default=None)


def delete_session(session_id: str):
    path = os.path.join(SESSION_DIR, session_id)
    if os.path.isdir(path):
        shutil.rmtree(path)


# --- Internal helpers ---

def _session_path(session_id: str) -> str:
    path = os.path.join(SESSION_DIR, session_id)
    if not os.path.isdir(path):
        raise ValueError(f"Session {session_id} does not exist")
    return path


def _write_json(dir_path: str, filename: str, data: dict):
    with open(os.path.join(dir_path, filename), "w") as f:
        json.dump(data, f, indent=2, default=str)


def _read_json(dir_path: str, filename: str, default=None):
    full_path = os.path.join(dir_path, filename)
    if not os.path.exists(full_path):
        return default
    with open(full_path) as f:
        return json.load(f)


def _invalidate_analysis_cache(session_id: str):
    path = os.path.join(SESSION_DIR, session_id, "analysis_cache.json")
    if os.path.exists(path):
        os.remove(path)


async def cleanup_expired_sessions(session_dir: str, ttl_hours: int = 24):
    """Background task: runs every hour, deletes expired sessions."""
    os.makedirs(session_dir, exist_ok=True)
    while True:
        now = time.time()
        try:
            for session_id in os.listdir(session_dir):
                session_path = os.path.join(session_dir, session_id)
                meta_path = os.path.join(session_path, "metadata.json")
                try:
                    with open(meta_path) as f:
                        meta = json.load(f)
                    created_at = meta.get("created_at", 0)
                    if now - created_at > ttl_hours * 3600:
                        shutil.rmtree(session_path)
                except Exception:
                    pass
        except Exception:
            pass
        await asyncio.sleep(3600)
