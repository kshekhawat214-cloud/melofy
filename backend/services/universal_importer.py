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
from sqlalchemy.orm import Session

from database.models import Song, Playlist, PlaylistTrack, LikedSong, get_db
from services.downloader import smart_download, _get_spotify_embed_entity, _scrape_spotify_track, _scrape_spotify_playlist, ydl_opts
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
    db: Session,
):
    """
    Asynchronous worker task:
    1. Parses track list from the source.
    2. Creates the target Tunely Playlist (or targets Liked Songs).
    3. Iterates and downloads/links each track with live status updates.
    """
    update_job(
        job_id,
        status="parsing",
        message="Resolving playlist and track metadata...",
        total_tracks=0,
        processed_tracks=0,
        current_track="",
    )

    try:
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
        position = 0

        for i, track_meta in enumerate(tracks):
            t_title = track_meta.get("title", f"Track {i+1}")
            t_artist = track_meta.get("artist", "Unknown Artist")

            update_job(
                job_id,
                processed_tracks=i,
                current_track=f"{t_title} - {t_artist}",
                message=f"Importing {i+1} of {total}: {t_title}",
            )

            # Check if track already exists in DB
            existing_song = None
            if track_meta.get("id"):
                existing_song = db.query(Song).filter(Song.id == track_meta["id"]).first()
            if not existing_song and track_meta.get("source_url"):
                existing_song = db.query(Song).filter(Song.source_url == track_meta["source_url"]).first()
            if not existing_song:
                # Fuzzy match by title + artist in DB to save downloads
                existing_song = db.query(Song).filter(
                    Song.title.ilike(f"%{t_title[:20]}%"),
                    Song.artist.ilike(f"%{t_artist[:15]}%")
                ).first()

            song_id = None
            if existing_song:
                logger.info(f"Reusing existing song in DB: {existing_song.title}")
                song_id = existing_song.id
                saved_tracks.append({"id": existing_song.id, "title": existing_song.title, "artist": existing_song.artist})
            else:
                # Need to download via smart_download
                try:
                    logger.info(f"Downloading track {i+1}/{total}: {t_title} by {t_artist}")
                    loop = asyncio.new_event_loop()
                    asyncio.set_event_loop(loop)
                    downloaded = loop.run_until_complete(smart_download("", track_meta))
                    loop.close()

                    if downloaded and downloaded.get("audio_path"):
                        # Deduplication check: verify this ID or audio file is not already in the database
                        existing_after_download = db.query(Song).filter(
                            (Song.id == downloaded["id"]) | 
                            (Song.audio_path == downloaded["audio_path"])
                        ).first()

                        if existing_after_download:
                            logger.info(f"Reusing existing song in DB: {existing_after_download.title} ({existing_after_download.id})")
                            song_id = existing_after_download.id
                            saved_tracks.append({"id": existing_after_download.id, "title": existing_after_download.title, "artist": existing_after_download.artist})
                        else:
                            new_song = Song(
                                id=downloaded["id"],
                                title=downloaded["title"],
                                artist=downloaded["artist"],
                                album=downloaded.get("album") or final_playlist_name,
                                genre=downloaded.get("genre") or "",
                                mood=downloaded.get("mood") or "neutral",
                                duration=downloaded.get("duration") or 0,
                                audio_path=downloaded["audio_path"],
                                cover_path=downloaded.get("cover_path") or downloaded.get("thumbnail_url"),
                                source_url=downloaded.get("source_url"),
                                thumbnail_url=downloaded.get("thumbnail_url"),
                                popularity=downloaded.get("popularity") or 50.0,
                                energy=0.7,
                            )
                            db.add(new_song)
                            db.commit()
                            song_id = new_song.id
                            saved_tracks.append({"id": new_song.id, "title": new_song.title, "artist": new_song.artist})
                except Exception as down_err:
                    logger.warning(f"Failed to download track {t_title}: {down_err}")
                    continue

            # Link to destination
            if song_id:
                if destination == "playlist" and target_playlist:
                    # Check if already in playlist
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

        # Final success update
        update_job(
            job_id,
            status="done",
            message=f"Successfully imported {len(saved_tracks)} tracks into '{final_playlist_name}'!",
            count=len(saved_tracks),
            total_tracks=total,
            processed_tracks=total,
            current_track="",
            playlist_id=target_playlist.id if target_playlist else None,
            playlist_name=final_playlist_name,
            tracks=saved_tracks,
            error=None,
        )
        logger.info(f"Import job {job_id} complete: {len(saved_tracks)}/{total} tracks imported.")

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
