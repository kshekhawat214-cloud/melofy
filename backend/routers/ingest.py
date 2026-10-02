"""
Ingest Router: handles link submission + async background download.
Uses file-based job store so status survives server hot-reloads.
"""
import uuid
import logging
import asyncio
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional
from database.models import Song, get_db
from services.universal_importer import execute_import_job
from services.job_store import set_job, get_job, update_job

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["Ingest"])


class IngestRequest(BaseModel):
    url: Optional[str] = None
    text_data: Optional[str] = None
    platform: Optional[str] = "auto"
    destination: Optional[str] = "playlist"
    playlist_name: Optional[str] = None


class IngestResponse(BaseModel):
    job_id: str
    status: str
    message: str


@router.post("/ingest", response_model=IngestResponse)
async def ingest_link(
    request: IngestRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    raw_input = (request.url or request.text_data or "").strip()
    if not raw_input or len(raw_input) < 3:
        raise HTTPException(status_code=400, detail="A valid URL, tracklist, or CSV text is required.")

    job_id = str(uuid.uuid4())
    # Initial job payload with live tracking metrics
    set_job(job_id, {
        "status": "queued",
        "message": "Transfer queued. Resolving playlist and track metadata...",
        "tracks": [],
        "count": 0,
        "total_tracks": 0,
        "processed_tracks": 0,
        "current_track": "",
        "error": None,
        "url": request.url,
        "platform": request.platform or "auto",
        "destination": request.destination or "playlist",
        "playlist_name": request.playlist_name,
        "playlist_id": None,
    })

    background_tasks.add_task(
        execute_import_job,
        job_id,
        raw_input,
        request.platform or "auto",
        request.destination or "playlist",
        request.playlist_name,
        db,
    )

    return IngestResponse(
        job_id=job_id,
        status="queued",
        message="Import queued. Polling progress...",
    )


@router.get("/ingest/status/{job_id}")
@router.get("/ingest/{job_id}")
async def get_ingest_status(job_id: str):
    job = get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found. The server may have restarted.")
    return job


@router.get("/ingest/cookies-status")
async def get_cookies_status():
    from pathlib import Path
    cookie_file = Path(__file__).parent.parent / "local_storage" / "spotify_cookies.txt"
    cookie_file2 = Path(__file__).parent.parent / "local_storage" / "spotify_cookies.txt.txt"
    exists = cookie_file.exists() or cookie_file2.exists()
    return {
        "cookies_available": exists,
        "cookies_path": str(cookie_file if cookie_file.exists() else cookie_file2)
    }
