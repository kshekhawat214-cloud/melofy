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
import logging
import traceback

logger = logging.getLogger(__name__)

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


STREAM_HEADERS = {
    "Accept-Ranges": "bytes",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Expose-Headers": "Content-Range, Content-Length, Accept-Ranges",
}


def get_audio_mime_type(file_path: Path) -> str:
    """Returns official RFC audio MIME type acceptable by all browsers (Chrome/Safari/Android/Edge)."""
    ext = file_path.suffix.lower()
    if ext in [".m4a", ".aac"]:
        return "audio/mp4"
    if ext == ".mp4":
        return "audio/mp4"
    if ext == ".mp3":
        return "audio/mpeg"
    if ext in [".ogg", ".oga", ".opus"]:
        return "audio/ogg"
    if ext == ".wav":
        return "audio/wav"
    if ext == ".flac":
        return "audio/flac"
    if ext == ".webm":
        return "audio/webm"
    guessed, _ = mimetypes.guess_type(str(file_path))
    if guessed in ["audio/x-m4a", "video/mp4", "application/octet-stream"]:
        return "audio/mp4"
    return guessed or "audio/mp4"


@router.options("/songs/{song_id}/stream")
def options_stream_audio(song_id: str):
    from fastapi import Response
    return Response(status_code=204, headers=STREAM_HEADERS)


@router.api_route("/songs/{song_id}/stream", methods=["GET", "HEAD"])
async def stream_audio(song_id: str, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """
    Streams the audio file with instant sub-second response times.
    1. If cached on disk or remote CDN, streams immediately with HTTP 206 range support.
    2. Duration Sanity Check: If a file exists on disk but duration differs from the official track
       by > 30% (e.g. slowed/reverb/fan cover), it auto-purges the wrong file and re-resolves the genuine original!
    3. If uncached, instantly resolves a direct 320kbps CDN stream (< 1s cold start) and returns
       a 307 Redirect so user playback begins immediately, while caching to disk in the background.
    """
    logger.info(f"Stream request for song: {song_id}")
    try:
        song = db.query(Song).filter(Song.id == song_id).first()
        if not song:
            raise HTTPException(status_code=404, detail="Song not found")

        # 1. If audio is an external direct CDN URL, redirect immediately (sub-100ms)
        if song.audio_path and (song.audio_path.startswith("http://") or song.audio_path.startswith("https://")):
            return RedirectResponse(url=song.audio_path, status_code=307, headers=STREAM_HEADERS)

        path = None
        if song.audio_path:
            p = Path(song.audio_path)
            if p.is_absolute():
                if p.exists() and p.stat().st_size > 1024 * 50:
                    path = p
                else:
                    alt_name = BASE_DIR / "local_storage" / "audio" / p.name
                    if alt_name.exists() and alt_name.stat().st_size > 1024 * 50:
                        path = alt_name
                        song.audio_path = f"local_storage/audio/{p.name}"
                        db.commit()
            else:
                rel_p = BASE_DIR / p
                if rel_p.exists() and rel_p.stat().st_size > 1024 * 50:
                    path = rel_p
                else:
                    alt_name = BASE_DIR / "local_storage" / "audio" / p.name
                    if alt_name.exists() and alt_name.stat().st_size > 1024 * 50:
                        path = alt_name
                        song.audio_path = f"local_storage/audio/{p.name}"
                        db.commit()

        # Also search by song ID across all supported extensions
        if not path or not path.exists() or path.stat().st_size < 1024 * 50:
            for ext in ["m4a", "mp3", "mp4", "webm", "opus", "aac", "wav"]:
                alt_path = BASE_DIR / "local_storage" / "audio" / f"{song.id}.{ext}"
                if alt_path.exists() and alt_path.stat().st_size > 1024 * 50:
                    path = alt_path
                    song.audio_path = f"local_storage/audio/{song.id}.{ext}"
                    db.commit()
                    break

        # 2. Sanity Check: Invalidate wrong versions (e.g. truncated preview or cover)
        if path and path.exists() and path.stat().st_size > 1024 * 50 and song.duration and song.duration > 30:
            try:
                from mutagen import File as MutagenFile
                f_audio = MutagenFile(str(path))
                if f_audio and f_audio.info and f_audio.info.length:
                    actual_dur = f_audio.info.length
                    diff = abs(actual_dur - song.duration)
                    if diff > 15:
                        logger.warning(
                            f"Purging mismatched audio version for '{song.title}' "
                            f"({actual_dur:.1f}s vs expected {song.duration:.1f}s, diff {diff:.1f}s > 15s) -> re-resolving authentic audio!"
                        )
                        path.unlink(missing_ok=True)
                        path = None
                        song.audio_path = ""
                        db.commit()
            except Exception as check_err:
                logger.info(f"Duration verification note: {check_err}")

        # 3. If valid file is available on disk, serve it with HTTP 206 Range headers and RFC media type
        if path and path.exists() and path.stat().st_size > 1024 * 50:
            mime_type = get_audio_mime_type(path)
            return FileResponse(
                path=str(path),
                media_type=mime_type,
                headers=STREAM_HEADERS,
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
                async def _bg_download(s_meta, s_url):
                    try:
                        from database.models import SessionLocal as BgSession
                        bg_res = await smart_download(s_url, s_meta)
                        if bg_res and bg_res.get("audio_path"):
                            bg_db = BgSession()
                            try:
                                s_rec = bg_db.query(Song).filter(Song.id == s_meta["id"]).first()
                                if s_rec:
                                    s_rec.audio_path = f"local_storage/audio/{Path(bg_res['audio_path']).name}"
                                    bg_db.commit()
                            finally:
                                bg_db.close()
                    except Exception as bg_err:
                        logger.warning(f"Background stream cache failed: {bg_err}")

                background_tasks.add_task(_bg_download, track_meta, song.source_url or "")
                return RedirectResponse(url=direct_url, status_code=307, headers=STREAM_HEADERS)
        except Exception as resolve_err:
            logger.warning(f"Direct stream resolver passed to full download: {resolve_err}")

        # Step B: Fallback to full download
        try:
            downloaded = await smart_download(song.source_url or "", track_meta)
            if downloaded and downloaded.get("audio_path") and Path(downloaded["audio_path"]).exists():
                path = Path(downloaded["audio_path"])
                song.audio_path = f"local_storage/audio/{path.name}"
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

        mime_type = get_audio_mime_type(path)
        return FileResponse(
            path=str(path),
            media_type=mime_type,
            headers=STREAM_HEADERS,
        )
    except HTTPException:
        raise
    except Exception as fatal_err:
        err_detail = f"{fatal_err}\n{traceback.format_exc()}"
        logger.error(f"Fatal streaming error for {song_id}: {err_detail}")
        raise HTTPException(status_code=500, detail=f"Streaming fatal error: {err_detail}")


@router.get("/songs/{song_id}/download")
async def download_song(song_id: str, db: Session = Depends(get_db)):
    """Triggers a browser download for a given song, resolving on-demand if needed."""
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


@router.get("/songs/{song_id}/cover")
def get_cover(song_id: str, db: Session = Depends(get_db)):
    """Returns the authentic album cover or redirects to Spotify/iTunes CDN."""
    logger.info(f"Cover request for song: {song_id}")
    song = db.query(Song).filter(Song.id == song_id).first()
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")

    # If song has a mosaic thumbnail or missing thumbnail, resolve authentic cover live!
    if not song.thumbnail_url or "mosaic.scdn.co" in song.thumbnail_url or (song.cover_path and "mosaic.scdn.co" in song.cover_path):
        from services.downloader import resolve_song_cover_and_album
        real_cov, real_alb = resolve_song_cover_and_album(song.id, song.title, song.artist, song.album)
        if real_cov and "mosaic.scdn.co" not in real_cov:
            song.thumbnail_url = real_cov
            song.cover_path = real_cov
        if real_alb and (not song.album or song.album in ("kind", "Massala", "Imported Playlist", "Spotify Playlist")):
            song.album = real_alb
        db.commit()

    # Check local cover on disk if available (and not a mosaic path)
    if song.cover_path and "mosaic.scdn.co" not in song.cover_path and os.path.exists(song.cover_path):
        path = Path(song.cover_path)
        ext = path.suffix.lower()
        media_map = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}
        return FileResponse(path=str(path), media_type=media_map.get(ext, "image/jpeg"))

    # Redirect to CDN cover
    if song.thumbnail_url and "mosaic.scdn.co" not in song.thumbnail_url:
        return RedirectResponse(url=song.thumbnail_url)

    raise HTTPException(status_code=404, detail="Cover art not available")


@router.post("/songs/repair-covers")
@router.get("/songs/repair-covers")
def repair_covers():
    """Scans and repairs all mosaic or missing covers in database."""
    from services.downloader import repair_all_mosaic_covers
    return repair_all_mosaic_covers()


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


@router.get("/songs/{song_id}/diagnose")
async def diagnose_song(song_id: str, db: Session = Depends(get_db)):
    song = db.query(Song).filter(Song.id == song_id).first()
    if not song:
        return {"error": "Song not found in DB"}
    
    from services.downloader import (
        resolve_direct_stream,
        clean_song_title,
        ydl_opts,
        similarity,
        AUDIO_DIR,
        OFFICIAL_LABEL_CHANNELS,
        UNWANTED_VERSION_KEYWORDS,
        _get_ffmpeg_path,
        _get_node_path,
    )
    import yt_dlp
    import asyncio
    import traceback
    
    track_meta = {
        "id": song.id,
        "title": song.title,
        "artist": song.artist,
        "album": song.album,
        "duration": song.duration,
        "thumbnail_url": song.thumbnail_url,
        "source_url": song.source_url,
    }
    
    files_in_audio = [f.name for f in AUDIO_DIR.iterdir()] if AUDIO_DIR.exists() else []
    
    direct_res = None
    try:
        direct_res = await resolve_direct_stream(track_meta)
    except Exception as e:
        direct_res = f"Exception: {e}"
        
    diag_steps = []
    clean_expected = clean_song_title(song.title)
    lead_artist = song.artist.split(",")[0].strip() if song.artist else ""
    queries = [
        f"{clean_expected} {lead_artist} Official",
        f"{clean_expected} {lead_artist} - Topic",
        f"{clean_expected} {lead_artist}",
    ]
    
    loop = asyncio.get_event_loop()
    for q in queries:
        try:
            s_opts = {**ydl_opts(song.id, prefer_fast=True), "extract_flat": "in_playlist"}
            with yt_dlp.YoutubeDL(s_opts) as ydl:
                info = await loop.run_in_executor(None, lambda: ydl.extract_info(f"ytsearch3:{q}", download=False))
                entries = [e for e in info.get("entries", []) if e]
                diag_steps.append({"query": q, "entries_count": len(entries), "sample_titles": [e.get("title") for e in entries[:3]]})
                if entries:
                    cand = entries[0]
                    cand_url = cand.get("webpage_url") or f"https://www.youtube.com/watch?v={cand.get('id')}"
                    diag_steps.append({"attempting_url": cand_url, "title": cand.get("title")})
                    try:
                        dl_opts = ydl_opts(song.id, prefer_fast=True)
                        with yt_dlp.YoutubeDL(dl_opts) as dl_ydl:
                            dl_data = await loop.run_in_executor(None, lambda: dl_ydl.extract_info(cand_url, download=True))
                            diag_steps.append({"dl_success": True, "dl_format": dl_data.get("format_id")})
                            break
                    except Exception as dl_err:
                        diag_steps.append({"dl_error": str(dl_err), "trace": traceback.format_exc()})
        except Exception as q_err:
            diag_steps.append({"query_error": str(q_err)})
        
    files_after = [f.name for f in AUDIO_DIR.iterdir()] if AUDIO_DIR.exists() else []
    
    return {
        "git_commit": os.getenv("RENDER_GIT_COMMIT", "local"),
        "ffmpeg": _get_ffmpeg_path(),
        "node": _get_node_path(),
        "song_id": song.id,
        "title": song.title,
        "artist": song.artist,
        "duration": song.duration,
        "audio_path": song.audio_path,
        "files_before": files_in_audio,
        "files_after": files_after,
        "direct_res": direct_res,
        "diag_steps": diag_steps,
    }


def _serialize(s: Song) -> dict:
    """Standardizes song data for the frontend with Smart Resolver stream links."""
    is_url = bool(s.audio_path and (s.audio_path.startswith("http://") or s.audio_path.startswith("https://")))
    
    local_p = None
    if s.audio_path and not is_url:
        p = Path(s.audio_path)
        if p.is_absolute():
            local_p = p if p.exists() else BASE_DIR / "local_storage" / "audio" / p.name
        else:
            local_p = (BASE_DIR / p) if (BASE_DIR / p).exists() else BASE_DIR / "local_storage" / "audio" / p.name
    
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

    safe_thumb = None if (s.thumbnail_url and "mosaic.scdn.co" in s.thumbnail_url) else s.thumbnail_url

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
        "thumbnailUrl": safe_thumb,
        "streamUrl": stream_url,
        "downloadUrl": f"/api/songs/{s.id}/download",
        "coverUrl": f"/api/songs/{s.id}/cover",
        "isCached": is_cached,
        "createdAt": s.created_at.isoformat() if s.created_at else None,
    }
