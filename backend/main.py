# backend/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import asyncio

from routers import upload, session, enrichment, analysis, export
from utils.session_store import cleanup_expired_sessions

SESSION_DIR = "/tmp/result_sessions"
TTL_HOURS = 24

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Start background cleanup task
    task = asyncio.create_task(cleanup_expired_sessions(SESSION_DIR, TTL_HOURS))
    yield
    task.cancel()

app = FastAPI(
    title="Student Result Analyzer API",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(upload.router, prefix="/api/upload", tags=["upload"])
app.include_router(session.router, prefix="/api/session", tags=["session"])
app.include_router(enrichment.router, prefix="/api/enrichment", tags=["enrichment"])
app.include_router(analysis.router, prefix="/api/analysis", tags=["analysis"])
app.include_router(export.router, prefix="/api/export", tags=["export"])

@app.get("/api/health")
def health():
    return {"status": "ok"}
