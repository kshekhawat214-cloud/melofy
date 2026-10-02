"""
Songs Router: CRUD + Stream audio + Download endpoint.
Serves audio files as streams directly from local_storage.
"""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, RedirectResponse
from sqlalchemy.orm import Session
from database.models import Song, get_db
from pathlib import Path
import os
import mimetypes

BASE_DIR = Path(__file__).parent.parent
router = APIRouter(prefix="/api", tags=["Songs"])


@router.get("/songs")
def get_all_songs(db: Session = Depends(get_db)):
    songs = db.query(Song).order_by(Song.created_at.desc()).all()
    return [_serialize(s) for s in songs]


@router.get("/songs/{song_id}")
def get_song(song_id: str, db: Session = Depends(get_db)):
    song = db.query(Song).filter(Song.id == song_id).first()
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")
    return _serialize(song)


@router.get("/songs/{song_id}/stream")
async def stream_audio(song_id: str, db: Session = Depends(get_db)):
    """
    Streams the audio file from local storage with HTTP 206 Range support.
    Smart On-Demand Resolver: If audio is not yet cached locally, resolves and
    downloads the audio on-the-fly, updates the database, and streams immediately!
    """
    from main import logger
    logger.info(f"Stream request for song: {song_id}")
    song = db.query(Song).filter(Song.id == song_id).first()
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")

    # 1. If audio is an external URL, redirect immediately
    if song.audio_path and (song.audio_path.startswith("http://") or song.audio_path.startswith("https://")):
        return RedirectResponse(url=song.audio_path)

    path = None
    if song.audio_path:
        p = Path(song.audio_path)
        path = p if p.is_absolute() else BASE_DIR / p

    # Also check if file exists in audio storage by song ID
    if not path or not path.exists() or path.stat().st_size < 1024 * 50:
        alt_path = BASE_DIR / "local_storage" / "audio" / f"{song.id}.mp3"
        if alt_path.exists() and alt_path.stat().st_size > 1024 * 50:
            path = alt_path
            song.audio_path = str(alt_path)
            db.commit()

    # Trigger Smart On-Demand Resolver if file is missing, not on disk, or too small
    if not path or not path.exists() or path.stat().st_size < 1024 * 50:
        logger.info(f"Smart Resolver triggered on-demand for '{song.title}' by '{song.artist}' ({song_id})")
        from services.downloader import smart_download
        track_meta = {
            "id": song.id,
            "title": song.title,
            "artist": song.artist,
            "album": song.album,
            "duration": song.duration,
            "thumbnail_url": song.thumbnail_url,
            "source_url": song.source_url,
        }
        try:
            downloaded = await smart_download(song.source_url or "", track_meta)
            if downloaded and downloaded.get("audio_path") and Path(downloaded["audio_path"]).exists():
                path = Path(downloaded["audio_path"])
                song.audio_path = str(path)
                if downloaded.get("duration") and not song.duration:
                    song.duration = downloaded["duration"]
                db.commit()
                db.refresh(song)
                logger.info(f"Smart Resolver completed for '{song.title}' -> {path}")
            else:
                raise HTTPException(status_code=502, detail="Smart Resolver could not locate audio stream")
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Smart Resolver failed for {song_id}: {e}")
            raise HTTPException(status_code=502, detail=f"Audio resolution failed: {str(e)}")

    # Dynamic media type detection
    mime_type, _ = mimetypes.guess_type(path)
    if not mime_type:
        mime_type = "audio/mpeg"

    return FileResponse(
        path=str(path),
        media_type=mime_type,
        headers={"Accept-Ranges": "bytes"},
    )


@router.get("/songs/{song_id}/download")
async def download_song(song_id: str, db: Session = Depends(get_db)):
    """Triggers a browser download for a given song, resolving on-demand if needed."""
    from main import logger
    song = db.query(Song).filter(Song.id == song_id).first()
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")

    path = Path(song.audio_path) if song.audio_path else None
    if not path or not path.exists() or path.stat().st_size < 1024 * 50:
        from services.downloader import smart_download
        track_meta = {
            "id": song.id,
            "title": song.title,
            "artist": song.artist,
            "album": song.album,
            "duration": song.duration,
            "thumbnail_url": song.thumbnail_url,
            "source_url": song.source_url,
        }
        downloaded = await smart_download("", track_meta)
        if downloaded and downloaded.get("audio_path") and Path(downloaded["audio_path"]).exists():
            path = Path(downloaded["audio_path"])
            song.audio_path = str(path)
            db.commit()
            db.refresh(song)
        else:
            raise HTTPException(status_code=404, detail="Audio file could not be resolved")

    ext = path.suffix
    safe_name = f"{song.title} - {song.artist}{ext}".replace("/", "_")

    mime_type, _ = mimetypes.guess_type(path)
    if not mime_type:
        mime_type = "audio/mpeg"

    return FileResponse(
        path=str(path),
        media_type=mime_type,
        filename=safe_name,
        headers={"Content-Disposition": f"attachment; filename=\"{safe_name}\""},
    )


from fastapi.responses import FileResponse, RedirectResponse

@router.get("/songs/{song_id}/cover")
def get_cover(song_id: str, db: Session = Depends(get_db)):
    """Returns the local album cover or redirects to Spotify CDN if missing."""
    from main import logger
    logger.info(f"Cover request for song: {song_id}")
    song = db.query(Song).filter(Song.id == song_id).first()
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")

    # If no local cover, redirect to Spotify's high-speed CDN (thumbnail_url)
    if not song.cover_path or not os.path.exists(song.cover_path):
        if song.thumbnail_url:
            return RedirectResponse(url=song.thumbnail_url)
        raise HTTPException(status_code=404, detail="Cover art not available")

    path = Path(song.cover_path)
    ext = path.suffix.lower()
    media_map = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}
    return FileResponse(path=str(path), media_type=media_map.get(ext, "image/jpeg"))


@router.get("/songs/{song_id}/lyrics")
def get_lyrics(song_id: str):
    """Returns the lyrics for a song if available (.lrc or .txt)."""
    lyrics_dir = Path("backend/local_storage/lyrics")
    lrc_path = lyrics_dir / f"{song_id}.lrc"
    txt_path = lyrics_dir / f"{song_id}.txt"

    if lrc_path.exists():
        return FileResponse(path=str(lrc_path), media_type="text/plain")
    elif txt_path.exists():
        return FileResponse(path=str(txt_path), media_type="text/plain")
    
    raise HTTPException(status_code=404, detail="Lyrics not found")


def _serialize(s: Song) -> dict:
    """Standardizes song data for the frontend with Smart Resolver stream links."""
    is_url = bool(s.audio_path and (s.audio_path.startswith("http://") or s.audio_path.startswith("https://")))
    
    local_p = None
    if s.audio_path and not is_url:
        p = Path(s.audio_path)
        local_p = p if p.is_absolute() else BASE_DIR / p
    
    if not local_p or not local_p.exists():
        alt = BASE_DIR / "local_storage" / "audio" / f"{s.id}.mp3"
        if alt.exists():
            local_p = alt

    is_cached = is_url or bool(local_p and local_p.exists() and local_p.stat().st_size > 1024 * 50)
    
    if is_url:
        stream_url = s.audio_path
    elif is_cached:
        stream_url = f"/static/audio/{s.id}.mp3"
    else:
        stream_url = f"/api/songs/{s.id}/stream"

    return {
        "id": s.id,
        "title": s.title,
        "artist": s.artist,
        "album": s.album,
        "genre": s.genre,
        "mood": s.mood,
        "energy": s.energy,
        "duration": s.duration,
        "popularity": s.popularity,
        "sourceUrl": s.source_url,
        "thumbnailUrl": s.thumbnail_url,
        "streamUrl": stream_url,
        "downloadUrl": f"/api/songs/{s.id}/download",
        "coverUrl": f"/api/songs/{s.id}/cover",
        "isCached": is_cached,
        "createdAt": s.created_at.isoformat() if s.created_at else None,
    }
