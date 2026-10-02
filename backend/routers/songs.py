"""
Songs Router: CRUD + Stream audio + Download endpoint.
Serves audio files as streams directly from local_storage.
"""
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
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
async def stream_audio(song_id: str, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """
    Streams the audio file with instant sub-second response times.
    1. If cached on disk or remote CDN, streams immediately with HTTP 206 range support.
    2. Duration Sanity Check: If a file exists on disk but duration differs from the official track
       by > 30% (e.g. slowed/reverb/fan cover), it auto-purges the wrong file and re-resolves the genuine original!
    3. If uncached, instantly resolves a direct 320kbps CDN stream (< 1s cold start) and returns
       a 307 Redirect so user playback begins immediately, while caching to disk in the background.
    """
    from main import logger
    logger.info(f"Stream request for song: {song_id}")
    song = db.query(Song).filter(Song.id == song_id).first()
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")

    # 1. If audio is an external direct CDN URL, redirect immediately (sub-100ms)
    if song.audio_path and (song.audio_path.startswith("http://") or song.audio_path.startswith("https://")):
        return RedirectResponse(url=song.audio_path, status_code=307)

    path = None
    if song.audio_path:
        p = Path(song.audio_path)
        path = p if p.is_absolute() else BASE_DIR / p

    # Also search by song ID across all supported extensions
    if not path or not path.exists() or path.stat().st_size < 1024 * 50:
        for ext in ["m4a", "mp3", "webm", "opus", "aac", "wav"]:
            alt_path = BASE_DIR / "local_storage" / "audio" / f"{song.id}.{ext}"
            if alt_path.exists() and alt_path.stat().st_size > 1024 * 50:
                path = alt_path
                song.audio_path = f"local_storage/audio/{song.id}.{ext}"
                db.commit()
                break

    # 2. Sanity Check: Invalidate wrong versions or explicitly reported tracks needing re-resolution
    PURGE_IDS = {"5ThyDv6aRVU8AH4vXQNldF", "0xlWd9o8yjKpJ02WJy79kZ", "5PetOhEX9N0oyBB0Keqobv"}
    if path and path.exists() and song.id in PURGE_IDS:
        logger.warning(f"Purging explicitly reported song {song.id} ({song.title}) to re-resolve authentic version!")
        path.unlink(missing_ok=True)
        path = None
        song.audio_path = None
        db.commit()

    if path and path.exists() and path.stat().st_size > 1024 * 50 and song.duration and song.duration > 30:
        try:
            from mutagen import File as MutagenFile
            f_audio = MutagenFile(str(path))
            if f_audio and f_audio.info and f_audio.info.length:
                actual_dur = f_audio.info.length
                diff = abs(actual_dur - song.duration)
                if diff > 25 and (diff / song.duration) > 0.30:
                    logger.warning(
                        f"Purging mismatched audio version for '{song.title}' "
                        f"({actual_dur:.1f}s vs expected {song.duration:.1f}s) -> re-resolving genuine original!"
                    )
                    path.unlink(missing_ok=True)
                    path = None
                    song.audio_path = None
                    db.commit()
        except Exception as check_err:
            logger.info(f"Duration verification note: {check_err}")

    # 3. If valid file is available on disk, serve it with HTTP 206 Range headers
    if path and path.exists() and path.stat().st_size > 1024 * 50:
        mime_type, _ = mimetypes.guess_type(path)
        if not mime_type:
            mime_type = "audio/mp4" if path.suffix == ".m4a" else "audio/mpeg"
        return FileResponse(
            path=str(path),
            media_type=mime_type,
            headers={"Accept-Ranges": "bytes"},
        )

    # 4. Smart Sub-Second Stream Resolver (Resolves in < 1s!)
    logger.info(f"Smart Fast Resolver triggered on-demand for '{song.title}' by '{song.artist}' ({song_id})")
    from services.downloader import resolve_direct_stream, smart_download
    track_meta = {
        "id": song.id,
        "title": song.title,
        "artist": song.artist,
        "album": song.album,
        "duration": song.duration,
        "thumbnail_url": song.thumbnail_url,
        "source_url": song.source_url,
    }

    # Step A: High-speed direct CDN stream resolution (Returns in < 1s)
    try:
        resolved = await resolve_direct_stream(track_meta)
        if resolved and resolved.get("direct_url"):
            direct_url = resolved["direct_url"]
            logger.info(f"Fast CDN Stream found for '{song.title}' -> redirecting in < 1s!")

            if resolved.get("duration") and not song.duration:
                song.duration = resolved["duration"]
            if resolved.get("source_url") and not song.source_url:
                song.source_url = resolved["source_url"]
            db.commit()

            # Schedule background download to disk for permanent offline caching
            def _bg_download(s_meta, s_url):
                try:
                    import asyncio
                    from database.models import SessionLocal as BgSession
                    loop = asyncio.new_event_loop()
                    asyncio.set_event_loop(loop)
                    bg_res = loop.run_until_complete(smart_download(s_url, s_meta))
                    loop.close()
                    if bg_res and bg_res.get("audio_path"):
                        bg_db = BgSession()
                        try:
                            s_rec = bg_db.query(Song).filter(Song.id == s_meta["id"]).first()
                            if s_rec:
                                s_rec.audio_path = bg_res["audio_path"]
                                bg_db.commit()
                        finally:
                            bg_db.close()
                except Exception as bg_err:
                    logger.warning(f"Background stream cache failed: {bg_err}")

            background_tasks.add_task(_bg_download, track_meta, song.source_url or "")
            return RedirectResponse(url=direct_url, status_code=307)
    except Exception as resolve_err:
        logger.warning(f"Direct stream resolver passed to full download: {resolve_err}")

    # Step B: Fallback to full download
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

    mime_type, _ = mimetypes.guess_type(path)
    if not mime_type:
        mime_type = "audio/mp4" if path.suffix == ".m4a" else "audio/mpeg"

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
            song.audio_path = f"local_storage/audio/{song.id}.mp3"
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
        for ext in ["m4a", "mp3", "webm", "opus", "aac", "wav"]:
            alt = BASE_DIR / "local_storage" / "audio" / f"{s.id}.{ext}"
            if alt.exists() and alt.stat().st_size > 1024 * 50:
                local_p = alt
                break

    is_cached = is_url or bool(local_p and local_p.exists() and local_p.stat().st_size > 1024 * 50)
    
    if is_url:
        stream_url = s.audio_path
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
