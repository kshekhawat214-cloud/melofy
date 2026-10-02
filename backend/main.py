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
create_tables()

app = FastAPI(
    title="AI Music Smart Engine",
    description="Backend API powering the personalized AI Music App.",
    version="1.0.0",
)

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
