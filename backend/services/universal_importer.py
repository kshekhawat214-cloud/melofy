"""
Universal Library Importer Service.
Enables transferring and importing playlists, albums, and tracks from:
- Spotify (playlists, albums, tracks)
- YouTube & YouTube Music (playlists, videos)
- Apple Music (public playlists, albums)
- SoundCloud (sets, tracks)
- CSV / Text / TuneMyMusic / Soundiiz exports
"""
import os
import re
import csv
import io
import json
import uuid
import logging
import asyncio
import requests
from typing import List, Dict, Any, Tuple, Optional
from pathlib import Path
from sqlalchemy.orm import Session

from database.models import Song, Playlist, PlaylistTrack, LikedSong, get_db, SessionLocal
from services.downloader import smart_download, _get_spotify_embed_entity, _scrape_spotify_track, _scrape_spotify_playlist, ydl_opts, AUDIO_DIR
from services.job_store import update_job
import yt_dlp

logger = logging.getLogger(__name__)


def parse_csv_or_text(text: str) -> Tuple[Optional[str], List[Dict[str, Any]]]:
    """
    Parse raw text, copy-pasted tracklist, or CSV export (TuneMyMusic, Soundiiz, etc.)
    into (detected_playlist_name, structured_tracks_list).
    """
    tracks = []
    detected_playlist: Optional[str] = None
    lines = [line.strip() for line in text.strip().splitlines() if line.strip()]
    if not lines:
        return None, []

    # Check for metadata comments at top like: # Playlist: Chill Vibes
    content_lines = []
    for line in lines:
        if line.startswith("#") or line.startswith("//"):
            lower = line.lower()
            if "playlist:" in lower or "title:" in lower or "name:" in lower:
                detected_playlist = line.split(":", 1)[1].strip()
            continue
        content_lines.append(line)

    if not content_lines:
        return detected_playlist, []

    # Detect delimiter for CSV (comma, semicolon, tab)
    header_line = content_lines[0]
    delimiter = ","
    if ";" in header_line and header_line.count(";") >= header_line.count(","):
        delimiter = ";"
    elif "\t" in header_line:
        delimiter = "\t"

    header_lower = header_line.lower()
    is_csv_header = any(keyword in header_lower for keyword in ["track", "title", "artist", "song", "album", "name"])

    if delimiter in header_line and is_csv_header:
        try:
            reader = csv.DictReader(io.StringIO("\n".join(content_lines)), delimiter=delimiter)
            for row in reader:
                # Normalize keys (strip quotes and whitespace, lowercase)
                norm_row = {str(k).strip().lower(): str(v).strip() for k, v in row.items() if k is not None}
                
                # Title lookup
                title = (
                    norm_row.get("track name")
                    or norm_row.get("track_name")
                    or norm_row.get("title")
                    or norm_row.get("track")
                    or norm_row.get("song")
                    or norm_row.get("song name")
                    or norm_row.get("name")
                    or ""
                )
                
                # Artist lookup
                artist = (
                    norm_row.get("artist name")
                    or norm_row.get("artist_name")
                    or norm_row.get("artist")
                    or norm_row.get("artists")
                    or norm_row.get("performer")
                    or norm_row.get("channel")
                    or "Unknown Artist"
                )
                
                # Album lookup
                album = (
                    norm_row.get("album name")
                    or norm_row.get("album_name")
                    or norm_row.get("album")
                    or ""
                )
                
                # Auto-detect playlist name from CSV row if present (TuneMyMusic column: Playlist name)
                if not detected_playlist:
                    pl_col = (
                        norm_row.get("playlist name")
                        or norm_row.get("playlist_name")
                        or norm_row.get("playlist")
                    )
                    if pl_col and pl_col.strip():
                        detected_playlist = pl_col.strip()

                if title.strip():
                    tracks.append({
                        "id": str(uuid.uuid4()),
                        "title": title.strip(),
                        "artist": artist.strip(),
                        "album": album.strip(),
                        "duration": 0,
                        "thumbnail_url": None,
                    })
            if tracks:
                return detected_playlist, tracks
        except Exception as e:
            logger.warning(f"CSV DictReader failed, falling back to line parsing: {e}")

    # Plain text line-by-line format:
    # "Song Title - Artist" OR "Artist - Song Title" OR "Song Title by Artist" OR "1. Song Title - Artist"
    for line in content_lines:
        cleaned = re.sub(r"^\d+[\.\-\)]\s*", "", line).strip()
        if not cleaned:
            continue

        title = cleaned
        artist = "Unknown Artist"

        if " - " in cleaned:
            parts = cleaned.split(" - ", 1)
            title = parts[0].strip()
            artist = parts[1].strip()
        elif " by " in cleaned.lower():
            parts = re.split(r"\s+by\s+", cleaned, maxsplit=1, flags=re.IGNORECASE)
            title = parts[0].strip()
            artist = parts[1].strip()
        elif "," in cleaned:
            parts = cleaned.split(",", 1)
            title = parts[0].strip()
            artist = parts[1].strip()

        # Remove surrounding quotes if present
        title = title.strip("\"'")
        artist = artist.strip("\"'")

        if title:
            tracks.append({
                "id": str(uuid.uuid4()),
                "title": title,
                "artist": artist,
                "album": "",
                "duration": 0,
                "thumbnail_url": None,
            })

    return detected_playlist, tracks


def parse_apple_music(url: str) -> Tuple[str, Optional[str], List[Dict[str, Any]]]:
    """Scrape Apple Music playlist or album JSON-LD."""
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
    }
    r = requests.get(url, headers=headers, timeout=12)
    if r.status_code != 200:
        return "Apple Music Import", None, []

    matches = re.findall(r'<script[^>]*type="application/ld\+json"[^>]*>(.*?)</script>', r.text, re.DOTALL)
    for m in matches:
        try:
            data = json.loads(m.strip())
            dtype = data.get("@type", "")
            if "Playlist" in dtype or "Album" in dtype or "MusicRecording" in dtype:
                title = data.get("name") or "Apple Music Playlist"
                raw_tracks = data.get("track", [])
                tracks = []
                for t in raw_tracks:
                    t_name = t.get("name", "Unknown Title")
                    by = t.get("byArtist", {})
                    t_artist = by.get("name", "") if isinstance(by, dict) else by[0].get("name", "") if by else "Unknown Artist"
                    tracks.append({
                        "id": str(uuid.uuid4()),
                        "title": t_name,
                        "artist": t_artist,
                        "album": title,
                        "duration": 0,
                        "thumbnail_url": None,
                    })
                return title, None, tracks
        except Exception:
            continue

    return "Apple Music Import", None, []


def parse_youtube_playlist(url: str) -> Tuple[str, Optional[str], List[Dict[str, Any]]]:
    """Fast flat extraction of YouTube or YouTube Music playlist."""
    opts = {
        "extract_flat": "in_playlist",
        "quiet": True,
        "skip_download": True,
        "nocheckcertificate": True,
        "ignoreerrors": True,
    }
    with yt_dlp.YoutubeDL(opts) as ydl:
        res = ydl.extract_info(url, download=False)
        if not res:
            return "YouTube Playlist", None, []

        title = res.get("title") or "YouTube Playlist"
        entries = res.get("entries", [])
        tracks = []
        for e in entries:
            if not e:
                continue
            e_title = e.get("title", "")
            # Filter deleted or private videos
            if "[deleted video]" in e_title.lower() or "[private video]" in e_title.lower():
                continue

            tracks.append({
                "id": e.get("id") or str(uuid.uuid4()),
                "title": e_title,
                "artist": e.get("uploader") or e.get("channel") or "Unknown Artist",
                "album": title,
                "duration": e.get("duration", 0),
                "thumbnail_url": e.get("thumbnail") or e.get("thumbnails", [{}])[0].get("url") if e.get("thumbnails") else None,
                "source_url": e.get("url") or f"https://www.youtube.com/watch?v={e.get('id')}",
            })
        return title, None, tracks


def parse_universal_source(
    url_or_text: str,
    platform: str = "auto"
) -> Tuple[str, Optional[str], List[Dict[str, Any]]]:
    """
    Universal entry point: parses any input source into (playlist_name, cover_url, tracks).
    """
    clean_input = url_or_text.strip()

    # 1. Plain text / CSV / TuneMyMusic file detection
    if platform in ("text", "csv", "tunemymusic") or "\n" in clean_input or (not clean_input.startswith("http://") and not clean_input.startswith("https://")):
        pl_name, tracks = parse_csv_or_text(clean_input)
        return pl_name or "Imported Playlist", None, tracks

    # 2. Spotify URL
    if "spotify.com" in clean_input:
        match = re.search(r"(?:playlist|track|album)[:/]([a-zA-Z0-9]{22})", clean_input)
        if not match:
            return "Spotify Import", None, []
        ctype = "track" if "track" in clean_input else "album" if "album" in clean_input else "playlist"
        cid = match.group(1)

        if ctype == "track":
            t = _scrape_spotify_track(cid)
            return (t["title"] if t else "Spotify Track"), (t.get("thumbnail_url") if t else None), ([t] if t else [])
        else:
            # Playlist or album
            entity = _get_spotify_embed_entity(ctype, cid)
            name = (entity.get("name") or entity.get("title") or "Spotify Playlist") if entity else "Spotify Playlist"
            images = entity.get("visualIdentity", {}).get("image", []) if entity else []
            cover = images[0].get("url") if images else None
            tracks = _scrape_spotify_playlist(cid)
            return name, cover, tracks

    # 3. YouTube / YouTube Music URL
    if "youtube.com" in clean_input or "youtu.be" in clean_input:
        if "playlist?list=" in clean_input or "&list=" in clean_input:
            return parse_youtube_playlist(clean_input)
        else:
            # Single YouTube video
            track_id = str(uuid.uuid4())
            with yt_dlp.YoutubeDL({"quiet": True, "skip_download": True}) as ydl:
                info = ydl.extract_info(clean_input, download=False)
                t_title = info.get("title", "YouTube Audio") if info else "YouTube Audio"
                t_uploader = info.get("uploader", "Unknown Artist") if info else "Unknown Artist"
                thumb = info.get("thumbnail") if info else None
                return t_title, thumb, [{
                    "id": track_id,
                    "title": t_title,
                    "artist": t_uploader,
                    "duration": info.get("duration", 0) if info else 0,
                    "thumbnail_url": thumb,
                    "source_url": clean_input,
                }]

    # 4. Apple Music URL
    if "music.apple.com" in clean_input:
        return parse_apple_music(clean_input)

    # 5. Generic fallback (treat as text/CSV query)
    pl_name, tracks = parse_csv_or_text(clean_input)
    return pl_name or "Imported Music", None, tracks


def execute_import_job(
    job_id: str,
    raw_input: str,
    platform: str,
    destination: str,
    custom_playlist_name: Optional[str],
    db: Optional[Session] = None,
):
    """
    Asynchronous worker task:
    1. Parses track list from the source.
    2. Creates the target Playlist (or Liked Songs).
    3. Guarantees 100% track retention: immediately creates and links ALL songs in the database.
    4. Triggers non-blocking background audio pre-caching.
    """
    should_close_db = False
    if db is None:
        db = SessionLocal()
        should_close_db = True

    try:
        update_job(
            job_id,
            status="parsing",
            message="Resolving playlist and track metadata...",
            total_tracks=0,
            processed_tracks=0,
            current_track="",
        )

        title, cover_url, tracks = parse_universal_source(raw_input, platform)
        if not tracks:
            update_job(
                job_id,
                status="failed",
                error="No tracks could be found or extracted from the provided source.",
                count=0,
            )
            return

        final_playlist_name = custom_playlist_name.strip() if custom_playlist_name and custom_playlist_name.strip() else title
        total = len(tracks)

        target_playlist = None
        if destination == "playlist":
            target_playlist = Playlist(
                id=f"pl_{uuid.uuid4().hex[:8]}",
                owner_id="1",
                name=final_playlist_name,
                description=f"Imported from {platform.capitalize() if platform != 'auto' else 'streaming service'}",
                cover_url=cover_url or (tracks[0].get("thumbnail_url") if tracks else None),
                is_public=1,
            )
            db.add(target_playlist)
            db.commit()
            db.refresh(target_playlist)

        update_job(
            job_id,
            status="importing",
            message=f"Starting import of {total} tracks to '{final_playlist_name}'...",
            total_tracks=total,
            processed_tracks=0,
            current_track="",
            playlist_id=target_playlist.id if target_playlist else None,
            playlist_name=final_playlist_name,
            tracks=[],
        )

        saved_tracks = []
        songs_needing_cache = []
        position = 0

        # PASS 1: Guarantees 100% of tracks are in the database and linked to the playlist
        for i, track_meta in enumerate(tracks):
            t_title = (track_meta.get("title") or f"Track {i+1}").strip()
            t_artist = (track_meta.get("artist") or "Unknown Artist").strip()
            t_album = (track_meta.get("album") or final_playlist_name).strip()
            t_thumb = track_meta.get("thumbnail_url") or cover_url
            t_duration = float(track_meta.get("duration") or 0)
            t_id = track_meta.get("id") or str(uuid.uuid4())
            t_source_url = track_meta.get("source_url") or (f"https://open.spotify.com/track/{t_id}" if len(t_id) == 22 else None)

            # Check if track already exists in DB
            existing_song = None
            if t_id:
                existing_song = db.query(Song).filter(Song.id == t_id).first()
            if not existing_song and t_source_url:
                existing_song = db.query(Song).filter(Song.source_url == t_source_url).first()
            if not existing_song:
                # Fuzzy match by title + artist in DB to reuse existing songs
                existing_song = db.query(Song).filter(
                    Song.title.ilike(f"%{t_title[:20]}%"),
                    Song.artist.ilike(f"%{t_artist[:15]}%")
                ).first()

            if existing_song:
                song_id = existing_song.id
                song_obj = existing_song
                # Check if audio exists on disk
                audio_exists = False
                if existing_song.audio_path:
                    p = Path(existing_song.audio_path)
                    audio_exists = p.exists() if p.is_absolute() else (AUDIO_DIR / p.name).exists()
                if not audio_exists:
                    for ext in ["m4a", "mp3", "mp4", "webm", "opus", "aac", "wav"]:
                        p_id = AUDIO_DIR / f"{existing_song.id}.{ext}"
                        if p_id.exists() and p_id.stat().st_size > 1024 * 50:
                            existing_song.audio_path = str(p_id)
                            db.commit()
                            audio_exists = True
                            break
                if not audio_exists:
                    songs_needing_cache.append({
                        "id": existing_song.id,
                        "title": existing_song.title,
                        "artist": existing_song.artist,
                        "album": existing_song.album,
                        "duration": existing_song.duration,
                        "thumbnail_url": existing_song.thumbnail_url,
                        "source_url": existing_song.source_url,
                    })
            else:
                # Check if audio file already exists locally for this ID across formats
                audio_p = ""
                for ext in ["m4a", "mp3", "mp4", "webm", "opus", "aac", "wav"]:
                    local_audio = AUDIO_DIR / f"{t_id}.{ext}"
                    if local_audio.exists() and local_audio.stat().st_size > 1024 * 50:
                        audio_p = str(local_audio)
                        break

                new_song = Song(
                    id=t_id,
                    title=t_title,
                    artist=t_artist,
                    album=t_album,
                    genre=track_meta.get("genre") or "Pop",
                    mood="energetic",
                    duration=t_duration,
                    audio_path=audio_p,
                    cover_path=t_thumb,
                    source_url=t_source_url,
                    thumbnail_url=t_thumb,
                    popularity=float(track_meta.get("popularity") or 60.0),
                    energy=0.7,
                )
                db.add(new_song)
                db.commit()
                db.refresh(new_song)
                song_id = new_song.id
                song_obj = new_song

                if not audio_p:
                    songs_needing_cache.append({
                        "id": t_id,
                        "title": t_title,
                        "artist": t_artist,
                        "album": t_album,
                        "duration": t_duration,
                        "thumbnail_url": t_thumb,
                        "source_url": t_source_url,
                    })

            # Link to destination (playlist or liked)
            if destination == "playlist" and target_playlist:
                in_pl = db.query(PlaylistTrack).filter(
                    PlaylistTrack.playlist_id == target_playlist.id,
                    PlaylistTrack.song_id == song_id
                ).first()
                if not in_pl:
                    pt = PlaylistTrack(
                        playlist_id=target_playlist.id,
                        song_id=song_id,
                        position=position,
                    )
                    db.add(pt)
                    position += 1
                    db.commit()

            elif destination == "liked":
                in_liked = db.query(LikedSong).filter(
                    LikedSong.user_id == "1",
                    LikedSong.song_id == song_id
                ).first()
                if not in_liked:
                    db.add(LikedSong(user_id="1", song_id=song_id))
                    db.commit()

            saved_tracks.append({
                "id": song_id,
                "title": song_obj.title,
                "artist": song_obj.artist,
                "album": song_obj.album,
                "duration": song_obj.duration,
                "thumbnail_url": song_obj.thumbnail_url,
            })

            update_job(
                job_id,
                processed_tracks=i + 1,
                current_track=f"{t_title} - {t_artist}",
                message=f"Added {i + 1} of {total}: {t_title}",
                tracks=saved_tracks,
            )

        # Mark transfer complete immediately with all tracks preserved!
        update_job(
            job_id,
            status="done",
            message=f"Successfully imported all {len(saved_tracks)} tracks into '{final_playlist_name}'!",
            count=len(saved_tracks),
            total_tracks=total,
            processed_tracks=total,
            current_track="",
            playlist_id=target_playlist.id if target_playlist else None,
            playlist_name=final_playlist_name,
            tracks=saved_tracks,
            error=None,
        )
        logger.info(f"Import job {job_id} complete: all {len(saved_tracks)}/{total} tracks saved and linked.")

        # PASS 2: Background Audio Pre-caching (Best effort, does not drop any tracks)
        if songs_needing_cache:
            logger.info(f"Starting background audio pre-caching for {len(songs_needing_cache)} tracks...")
            for s_info in songs_needing_cache:
                try:
                    # Check again if cached on disk across formats
                    cached_found = False
                    for ext in ["m4a", "mp3", "mp4", "webm", "opus", "aac", "wav"]:
                        cached_p = AUDIO_DIR / f"{s_info['id']}.{ext}"
                        if cached_p.exists() and cached_p.stat().st_size > 1024 * 50:
                            s_rec = db.query(Song).filter(Song.id == s_info["id"]).first()
                            if s_rec:
                                s_rec.audio_path = str(cached_p)
                                db.commit()
                            cached_found = True
                            break
                    if cached_found:
                        continue

                    loop = asyncio.new_event_loop()
                    asyncio.set_event_loop(loop)
                    downloaded = loop.run_until_complete(smart_download("", s_info))
                    loop.close()

                    if downloaded and downloaded.get("audio_path"):
                        s_rec = db.query(Song).filter(Song.id == s_info["id"]).first()
                        if s_rec:
                            s_rec.audio_path = downloaded["audio_path"]
                            if downloaded.get("duration") and not s_rec.duration:
                                s_rec.duration = downloaded["duration"]
                            db.commit()
                            logger.info(f"Pre-cached audio for: {s_info.get('title')}")
                except Exception as cache_err:
                    logger.warning(f"Background pre-cache skipped for {s_info.get('title')}: {cache_err}")
                    continue

    except Exception as e:
        logger.error(f"Import job {job_id} failed with error: {e}", exc_info=True)
        try:
            db.rollback()
        except Exception:
            pass
        update_job(
            job_id,
            status="failed",
            error=str(e),
            message="Import failed. Please check the provided link or tracklist.",
        )
    finally:
        if should_close_db and db:
            try:
                db.close()
            except Exception:
                pass

