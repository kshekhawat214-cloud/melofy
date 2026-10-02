import os
import re
import uuid
import yt_dlp
import logging
import asyncio
import shutil
import requests
import imageio_ffmpeg
from pathlib import Path
from typing import List, Optional, Dict, Any
from difflib import SequenceMatcher
import spotipy
from spotipy.oauth2 import SpotifyClientCredentials
from dotenv import load_dotenv

# Mutagen for metadata tagging
from mutagen.mp3 import MP3
from mutagen.id3 import ID3, APIC, TIT2, TPE1, TALB, TYER, USLT, error
from mutagen.mp4 import MP4, MP4Cover
from mutagen.flac import FLAC, Picture

logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).parent.parent
load_dotenv(BASE_DIR / ".env.local")
load_dotenv(BASE_DIR / ".env")

AUDIO_DIR = BASE_DIR / "local_storage" / "audio"
AUDIO_DIR.mkdir(parents=True, exist_ok=True)

# --------------------------
# Environment Discovery (Universal)
# --------------------------

def _get_ffmpeg_path():
    """Portable FFmpeg discovery via imageio-ffmpeg."""
    try:
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return shutil.which("ffmpeg")

def _get_node_path():
    """Dynamic Node.js discovery for signature solving."""
    # 1. Check system path
    for cmd in ["node", "nodejs"]:
        node_path = shutil.which(cmd)
        if node_path:
            return node_path
    
    # 2. Check common Windows paths
    common_windows_paths = [
        r"C:\Program Files\nodejs\node.exe",
        r"C:\Program Files (x86)\nodejs\node.exe",
        os.path.expandvars(r"%APPDATA%\npm\node.exe"),
        os.path.expandvars(r"%LOCALAPPDATA%\Programs\nodejs\node.exe")
    ]
    for p in common_windows_paths:
        if os.path.exists(p):
            return p
            
    # 3. Check Mac/Linux defaults
    common_unix_paths = ["/usr/local/bin/node", "/usr/bin/node", "/usr/bin/nodejs", "/usr/local/bin/nodejs", "/opt/homebrew/bin/node"]
    for p in common_unix_paths:
        if os.path.exists(p):
            return p
            
    return None

# --------------------------
# Spotify Client
# --------------------------

def _get_spotify_client():
    cid = os.getenv("SPOTIFY_CLIENT_ID")
    secret = os.getenv("SPOTIFY_CLIENT_SECRET")
    if not cid or not secret:
        logger.warning("Spotify credentials missing — falling back to search only.")
        return None
    try:
        return spotipy.Spotify(auth_manager=SpotifyClientCredentials(client_id=cid, client_secret=secret))
    except Exception as e:
        logger.error(f"Spotify auth error: {e}")
        return None

# --------------------------
# Metadata Embedding Logic
# --------------------------

def embed_metadata(file_path: str, meta: Dict[str, Any]):
    """Embeds Spotify metadata and cover art into the audio file."""
    if not os.path.exists(file_path):
        return

    ext = os.path.splitext(file_path)[1].lower()
    
    # Download artwork
    artwork_data = None
    if meta.get("thumbnail_url"):
        try:
            r = requests.get(meta["thumbnail_url"], timeout=10)
            if r.status_code == 200:
                artwork_data = r.content
        except Exception as e:
            logger.warning(f"Failed to download artwork: {e}")

    try:
        if ext == ".mp3":
            _embed_mp3(file_path, meta, artwork_data)
        elif ext == ".m4a":
            _embed_m4a(file_path, meta, artwork_data)
        logger.info(f"Successfully embedded metadata into {file_path}")
    except Exception as e:
        logger.error(f"Failed to embed metadata: {e}")

def _embed_mp3(path, meta, artwork):
    audio = MP3(path, ID3=ID3)
    try:
        audio.add_tags()
    except error:
        pass

    audio.tags.add(TIT2(encoding=3, text=meta.get("title", "")))
    audio.tags.add(TPE1(encoding=3, text=meta.get("artist", "")))
    audio.tags.add(TALB(encoding=3, text=meta.get("album", "")))
    
    if artwork:
        audio.tags.add(APIC(
            encoding=3,
            mime='image/jpeg',
            type=3, 
            desc=u'Cover',
            data=artwork
        ))
    audio.save()

def _embed_m4a(path, meta, artwork):
    audio = MP4(path)
    audio["\xa9nam"] = meta.get("title", "")
    audio["\xa9ART"] = meta.get("artist", "")
    audio["\xa9alb"] = meta.get("album", "")
    
    if artwork:
        audio["covr"] = [MP4Cover(artwork, imageformat=MP4Cover.FORMAT_JPEG)]
    audio.save()

# --------------------------
# Similarity (AI Matching Lite)
# --------------------------

def similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, str(a).lower(), str(b).lower()).ratio()

# --------------------------
# yt-dlp Config
# --------------------------

def ydl_opts(track_id):
    ffmpeg_path = _get_ffmpeg_path()
    node_path = _get_node_path()
    
    # CRITICAL: Add node's directory to PATH so yt-dlp subprocesses can find it
    if node_path:
        node_dir = os.path.dirname(node_path)
        if node_dir not in os.environ["PATH"]:
            os.environ["PATH"] = node_dir + os.pathsep + os.environ["PATH"]
        logger.info(f"Using JS runtime at: {node_path}")
    else:
        logger.warning("No JS runtime found. Some restricted tracks may fail.")

    opts = {
        "format": "bestaudio/best",
        "outtmpl": str(AUDIO_DIR / f"{track_id}.%(ext)s"),
        "quiet": True,
        "noplaylist": True,
        "nocheckcertificate": True,
        "ignoreerrors": True,
        "ffmpeg_location": ffmpeg_path,
        "extractor_args": {
            "youtube": {
                "player_client": ["tv_embedded", "mweb", "ios", "android", "web"]
            }
        },
        "http_headers": {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        }
    }

    if node_path:
        opts["javascript_runtime"] = node_path

    if ffmpeg_path:
        opts["postprocessors"] = [{
            "key": "FFmpegExtractAudio",
            "preferredcodec": "mp3",
            "preferredquality": "192",
        }]
    
    return opts

# --------------------------
# Smart Download (AI ranking)
# --------------------------

async def smart_download(query: str, expected_meta: Dict[str, Any]):
    track_id = expected_meta.get("id") or str(uuid.uuid4())
    expected_title = expected_meta.get("title", "")
    expected_artist = expected_meta.get("artist", "")
    expected_duration = expected_meta.get("duration", 0)

    clean_expected = re.sub(r" - From \".*?\"", "", expected_title, flags=re.IGNORECASE)
    clean_expected = re.sub(r" \(From \".*?\"\)", "", clean_expected, flags=re.IGNORECASE)
    clean_expected = re.sub(r" - [0-9]{4} Remaster.*", "", clean_expected, flags=re.IGNORECASE).strip()
    lead_artist = expected_artist.split(",")[0].strip() if expected_artist else ""

    search_queries = [
        f"{clean_expected} {lead_artist} official audio",
        f"{clean_expected} {lead_artist}",
        f"{clean_expected} {expected_artist}",
    ]
    
    # Check cache first
    for ext in ["mp3", "m4a", "webm", "opus", "aac", "wav"]:
        potential_path = AUDIO_DIR / f"{track_id}.{ext}"
        if potential_path.exists():
            if potential_path.stat().st_size > 1024 * 100:  # 100KB
                logger.info(f"Using cached file: {track_id}.{ext}")
                return {**expected_meta, "audio_path": str(potential_path)}
            else:
                logger.info(f"Existing file {track_id}.{ext} is too small, retrying.")

    loop = asyncio.get_event_loop()

    # If direct source URL is provided, attempt download directly first!
    direct_url = None
    if query and query.startswith("http"):
        direct_url = query
    elif expected_meta.get("source_url") and expected_meta["source_url"].startswith("http"):
        direct_url = expected_meta["source_url"]

    if direct_url:
        logger.info(f"Direct source URL available: {direct_url}. Attempting immediate download.")
        try:
            with yt_dlp.YoutubeDL(ydl_opts(track_id)) as ydl:
                data = await loop.run_in_executor(None, lambda: ydl.extract_info(direct_url, download=True))
                for ext in ["mp3", "m4a", "webm", "opus", "aac", "wav"]:
                    p = AUDIO_DIR / f"{track_id}.{ext}"
                    if p.exists() and p.stat().st_size > 1024 * 50:
                        embed_metadata(str(p), expected_meta)
                        return {
                            **expected_meta,
                            "id": track_id,
                            "audio_path": str(p),
                            "duration": (data or {}).get("duration") or expected_duration,
                            "source_url": direct_url,
                            "thumbnail_url": expected_meta.get("thumbnail_url")
                        }
        except Exception as direct_err:
            logger.warning(f"Direct URL download failed for {direct_url}: {direct_err}")

    for q in search_queries:
        try:
            logger.info(f"Searching YouTube with: {q}")
            with yt_dlp.YoutubeDL(ydl_opts(track_id)) as ydl:
                info = await loop.run_in_executor(None, lambda: ydl.extract_info(f"ytsearch5:{q}", download=False))
                
                entries = [e for e in info.get("entries", []) if e]
                if not entries:
                    continue

                matches = []
                for entry in entries:
                    title = entry.get("title", "")
                    uploader = entry.get("uploader", "")
                    yt_duration = entry.get("duration", 0)
                    t_lower = title.lower()
                    c_lower = clean_expected.lower()

                    score = 0.0

                    # 1. Exact or partial title containment
                    if c_lower in t_lower:
                        score += 0.5
                    else:
                        score += similarity(t_lower, c_lower) * 0.4

                    # 2. Artist containment
                    if lead_artist and lead_artist.lower() in t_lower:
                        score += 0.3
                    elif expected_artist and any(part.strip().lower() in t_lower for part in expected_artist.split(",") if len(part.strip()) > 3):
                        score += 0.25
                    elif uploader and lead_artist and similarity(uploader.lower(), lead_artist.lower()) > 0.5:
                        score += 0.2

                    # 3. Duration Check
                    if expected_duration > 0 and yt_duration > 0:
                        diff = abs(expected_duration - yt_duration)
                        if diff < 15:
                            score += 0.2
                        elif diff < 40:
                            score += 0.1
                        elif diff > 120:
                            score -= 0.5  # Likely compilation or loop

                    # 4. Version Consistency
                    version_keywords = ["remix", "cover", "acoustic", "live", "instrumental"]
                    for kw in version_keywords:
                        in_expected = kw in expected_title.lower()
                        in_found = kw in t_lower
                        if in_expected != in_found:
                            score -= 0.35

                    # 5. Official / Topic Boost
                    if "official" in t_lower or "topic" in uploader.lower():
                        score += 0.1

                    matches.append((score, entry))

                # Sort by score descending
                matches = sorted(matches, key=lambda x: x[0], reverse=True)

                for score, entry in matches:
                    # Allow anything with positive score, or top result if score is non-negative
                    if score < 0.1 and entry != matches[0][1]:
                        continue

                    url_to_download = entry.get("webpage_url") or f"https://www.youtube.com/watch?v={entry.get('id')}"
                    logger.info(f"Attempting download (Score: {score:.2f}, Dur: {entry.get('duration')}s): {entry.get('title')}")
                    try:
                        data = await loop.run_in_executor(None, lambda: ydl.extract_info(url_to_download, download=True))
                        
                        # Find the final file
                        for ext in ["mp3", "m4a", "webm", "opus", "aac", "wav"]:
                            p = AUDIO_DIR / f"{track_id}.{ext}"
                            if p.exists() and p.stat().st_size > 1024 * 50:
                                # Embed metadata after download
                                embed_metadata(str(p), expected_meta)
                                
                                return {
                                    **expected_meta,
                                    "id": track_id,
                                    "audio_path": str(p),
                                    "duration": data.get("duration") or expected_duration,
                                    "source_url": url_to_download,
                                    "thumbnail_url": expected_meta.get("thumbnail_url") or entry.get("thumbnail")
                                }
                    except Exception as download_err:
                        logger.warning(f"Download failed for {entry.get('title', 'Unknown')}: {str(download_err)[:100]}")
                        continue 
                        
        except Exception as search_err:
            logger.warning(f"Search failed for query '{q}': {search_err}")
            continue

    logger.error(f"Completely failed to download any version of: {expected_title}")
    return None

# --------------------------
# Spotify → Queries
# --------------------------

def _get_spotify_embed_entity(ctype: str, cid: str) -> Optional[Dict[str, Any]]:
    """Fetch structured metadata from Spotify's public embed page (__NEXT_DATA__)."""
    url = f"https://open.spotify.com/embed/{ctype}/{cid}"
    logger.info(f"Fetching Spotify embed metadata from: {url}")
    try:
        import json
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9",
        }
        res = requests.get(url, headers=headers, timeout=12)
        if res.status_code == 200:
            match = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', res.text, re.DOTALL)
            if match:
                data = json.loads(match.group(1))
                return data.get("props", {}).get("pageProps", {}).get("state", {}).get("data", {}).get("entity", {})
    except Exception as e:
        logger.warning(f"Error fetching Spotify embed data for {ctype}/{cid}: {e}")
    return None


def _scrape_spotify_track(track_id: str) -> Optional[Dict[str, Any]]:
    """Scrape Spotify track metadata using embed page, with oEmbed fallback."""
    entity = _get_spotify_embed_entity("track", track_id)
    if entity:
        title = entity.get("title") or entity.get("name") or f"Spotify Track {track_id}"
        artist_items = entity.get("artists", [])
        if artist_items:
            artist = ", ".join([a.get("name", "") for a in artist_items if a.get("name")])
        else:
            artist = entity.get("subtitle") or "Unknown Artist"

        duration = (entity.get("duration") or 0) / 1000.0
        images = entity.get("visualIdentity", {}).get("image", [])
        thumbnail = None
        if images:
            sorted_imgs = sorted(images, key=lambda x: x.get("maxWidth", 0), reverse=True)
            thumbnail = sorted_imgs[0].get("url")

        logger.info(f"Successfully scraped track via embed: '{title}' by '{artist}' ({duration:.0f}s)")
        return {
            "id": track_id,
            "title": title,
            "artist": artist,
            "album": entity.get("album", {}).get("name", ""),
            "thumbnail_url": thumbnail,
            "duration": duration,
            "popularity": 0,
        }

    # Fallback to official Spotify oEmbed endpoint
    try:
        logger.info(f"Falling back to oEmbed for track {track_id}")
        oembed_url = f"https://open.spotify.com/oembed?url=https://open.spotify.com/track/{track_id}"
        res = requests.get(oembed_url, timeout=10)
        if res.status_code == 200:
            data = res.json()
            title = data.get("title", f"Spotify Track {track_id}")
            thumb = data.get("thumbnail_url")
            return {
                "id": track_id,
                "title": title,
                "artist": "Unknown Artist",
                "album": "",
                "thumbnail_url": thumb,
                "duration": 0,
                "popularity": 0,
            }
    except Exception as e:
        logger.warning(f"oEmbed fallback failed: {e}")

    return None


def _scrape_spotify_playlist(playlist_id: str) -> List[Dict[str, Any]]:
    """Extract all tracks from a Spotify playlist or album using embed page."""
    entity = _get_spotify_embed_entity("playlist", playlist_id)
    if not entity:
        entity = _get_spotify_embed_entity("album", playlist_id)
    if not entity:
        logger.warning(f"Failed to extract playlist/album {playlist_id} via embed")
        return []

    track_list = entity.get("trackList", [])
    pl_images = entity.get("visualIdentity", {}).get("image", [])
    default_thumb = pl_images[0].get("url") if pl_images else None
    pl_name = entity.get("name") or entity.get("title") or "Spotify Playlist"

    tracks = []
    for t in track_list:
        uri = t.get("uri", "")
        tid = uri.split(":track:")[-1] if ":track:" in uri else str(uuid.uuid4())
        tracks.append({
            "id": tid,
            "title": t.get("title") or t.get("name") or "Unknown Title",
            "artist": t.get("subtitle") or "Unknown Artist",
            "album": pl_name,
            "thumbnail_url": default_thumb,
            "duration": (t.get("duration") or 0) / 1000.0,
            "popularity": 0,
        })

    logger.info(f"Embed scraper extracted {len(tracks)} tracks from '{pl_name}'")
    return tracks


def spotify_queries(url: str) -> List[Dict[str, Any]]:
    """Resolve a Spotify URL (track, album, playlist) into normalized track metadata dicts."""
    logger.info(f"Fetching Spotify metadata for: {url}")
    match = re.search(r"(?:playlist|track|album)[:/]([a-zA-Z0-9]{22})", url)
    if not match:
        logger.warning(f"URL did not match Spotify pattern: {url}")
        return []

    ctype = "track" if "track" in url else "album" if "album" in url else "playlist"
    cid = match.group(1)
    logger.info(f"Detected Spotify {ctype} with ID: {cid}")

    if ctype == "track":
        track = _scrape_spotify_track(cid)
        return [track] if track else []
    elif ctype in ("playlist", "album"):
        return _scrape_spotify_playlist(cid)

    return []

# --------------------------
# Async Pipeline
# --------------------------

async def process_queries(tracks, limit=50):
    results = []
    sem = asyncio.Semaphore(5)  

    async def worker(track_meta):
        async with sem:
            return await smart_download("", track_meta)

    tasks = [worker(t) for t in tracks[:limit]]
    outputs = await asyncio.gather(*tasks)

    for r in outputs:
        if r:
            results.append(r)

    return results

# --------------------------
# Main Entry
# --------------------------

async def download_audio(url: str):
    url = url.strip()

    if "spotify.com" in url:
        tracks = spotify_queries(url)
        if not tracks:
            logger.warning(f"No tracks found for Spotify link: {url}")
            return []
        
        return await process_queries(tracks)

    # YouTube or direct search
    fake_meta = {
        "id": str(uuid.uuid4()),
        "title": url if "http" not in url else "Search Result",
        "artist": "Various",
    }
    return await process_queries([fake_meta])
