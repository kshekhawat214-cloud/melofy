"""
Main FastAPI application entry point.
"""
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from database.models import create_tables
from routers import ingest, songs, recommendations, playlists, likes, catalog

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)

# Create DB tables on startup
try:
    create_tables()
except Exception as e:
    logger.warning(f"Database table verification note: {e}")

import mimetypes

# Explicitly register audio MIME types for Linux/Docker environments
mimetypes.add_type("audio/mp4", ".m4a")
mimetypes.add_type("audio/mp4", ".mp4")
mimetypes.add_type("audio/x-m4a", ".m4a")
mimetypes.add_type("audio/mpeg", ".mp3")
mimetypes.add_type("audio/webm", ".webm")
mimetypes.add_type("audio/ogg", ".opus")

def verify_and_clean_audio_cache():
    """Scans local audio files and purges any file whose duration differs from official DB duration by > 30%."""
    try:
        from database.models import SessionLocal, Song
        from mutagen import File as MutagenFile
        db = SessionLocal()
        audio_dir = Path(__file__).parent / "local_storage" / "audio"
        if not audio_dir.exists():
            db.close()
            return
        
        cleaned = 0
        for f in audio_dir.iterdir():
            if f.is_file() and f.suffix in [".mp3", ".m4a", ".mp4", ".webm", ".opus"]:
                song_id = f.stem
                song = db.query(Song).filter(Song.id == song_id).first()

                if song and song.duration and song.duration > 30:
                    try:
                        mf = MutagenFile(str(f))
                        if mf and mf.info and mf.info.length:
                            act_dur = mf.info.length
                            diff = abs(act_dur - song.duration)
                            if diff > 25 and (diff / song.duration) > 0.30:
                                logger.warning(f"Startup clean: Purging mismatched cache {f.name} ({act_dur:.1f}s vs {song.duration:.1f}s)")
                                f.unlink(missing_ok=True)
                                song.audio_path = None
                                db.commit()
                                cleaned += 1
                    except Exception:
                        pass
        db.close()
        if cleaned > 0:
            logger.info(f"Startup audio verification: cleaned {cleaned} mismatched cache files.")
    except Exception as e:
        logger.info(f"Startup cache verification note: {e}")

try:
    verify_and_clean_audio_cache()
except Exception:
    pass

import threading

def run_cover_repair_background():
    """Runs database cover repair in background thread on startup to ensure all songs have authentic covers."""
    try:
        from services.downloader import repair_all_mosaic_covers
        repair_all_mosaic_covers()
    except Exception as e:
        logger.warning(f"Background cover repair note: {e}")

threading.Thread(target=run_cover_repair_background, daemon=True).start()

app = FastAPI(
    title="AI Music Smart Engine",
    description="Backend API powering the personalized AI Music App.",
    version="1.0.0",
)

@app.get("/api/health")
def health():
    return {"status": "ok", "version": "1.0.2"}

# CORS — allow Next.js frontend or any local machine
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount local_storage for direct static file serving (covers, audio previews)
LOCAL_STORAGE = Path(__file__).parent / "local_storage"
LOCAL_STORAGE.mkdir(exist_ok=True)
app.mount("/static", StaticFiles(directory=str(LOCAL_STORAGE)), name="static")

# Register route modules
app.include_router(ingest.router)
app.include_router(songs.router)
app.include_router(recommendations.router)
app.include_router(playlists.router)
app.include_router(likes.router)
app.include_router(catalog.router)


@app.get("/")
def health_check():
    return {
        "status": "AI Engine is running",
        "version": "1.0.0",
        "endpoints": {
            "POST /api/ingest": "Submit a YouTube/Spotify link to import",
            "GET /api/ingest/status/{job_id}": "Check download job status",
            "GET /api/songs": "List all songs in the library",
            "GET /api/songs/{id}/stream": "Stream a song",
            "GET /api/songs/{id}/download": "Download a song",
            "GET /api/home/{user_id}": "Get personalized home feed",
            "POST /api/interaction": "Record user interaction",
        },
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
