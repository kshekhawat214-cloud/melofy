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

# --------------------------
# Anti-Noise & Version Keywords (AI Ranking Lite)
# --------------------------

UNWANTED_VERSION_KEYWORDS = [
    "remix", "reverb", "slowed", "slow", "speed", "sped", "sped up", "speed up",
    "bass boosted", "bassboosted", "8d", "lofi", "lo-fi", "cover", "acoustic",
    "mashup", "live", "concert", "karaoke", "instrumental", "status", "tiktok",
    "reels", "ringtone", "unplugged", "parody", "reaction", "review", "dance",
    "choreography", "teaser", "trailer", "female version", "male version",
    "stripped", "extended", "drill", "remake", "female cover", "male cover",
    "piano cover", "guitar cover", "shorts"
]

JIOSAAVN_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "X-Forwarded-For": "103.208.71.1",
    "Client-IP": "103.208.71.1",
    "X-Real-IP": "103.208.71.1",
    "Accept-Language": "en-IN,en;q=0.9,hi;q=0.8",
}


def clean_song_title(title: str) -> str:
    """Removes movie/OST suffixes, remastered tags, and bracket noise while preserving core title."""
    clean = re.sub(r" - From \".*?\"", "", title, flags=re.IGNORECASE)
    clean = re.sub(r" \(From \".*?\"\)", "", clean, flags=re.IGNORECASE)
    clean = re.sub(r" - [0-9]{4} Remaster.*", "", clean, flags=re.IGNORECASE)
    clean = re.sub(r" \([0-9]{4} Remaster.*?\)", "", clean, flags=re.IGNORECASE)
    clean = re.sub(r" - [0-9]{4} Mix.*", "", clean, flags=re.IGNORECASE)
    clean = re.sub(r" - Remastered.*", "", clean, flags=re.IGNORECASE)
    clean = re.sub(r" \(Remastered.*?\)", "", clean, flags=re.IGNORECASE)
    clean = re.sub(r" - Single Version", "", clean, flags=re.IGNORECASE)
    clean = re.sub(r" - Original Motion Picture Soundtrack", "", clean, flags=re.IGNORECASE)
    clean = re.sub(r" \(Original Motion Picture Soundtrack\)", "", clean, flags=re.IGNORECASE)
    clean = re.sub(r" - Original Soundtrack", "", clean, flags=re.IGNORECASE)
    clean = re.sub(r" \(Original Soundtrack\)", "", clean, flags=re.IGNORECASE)
    return clean.strip()


def resolve_jiosaavn_candidate(clean_expected: str, lead_artist: str, expected_title: str, expected_duration: float) -> Optional[Dict[str, Any]]:
    """
    Queries JioSaavn with Indian localized headers and strictly filters for the original version.
    Disqualifies any covers, slowed+reverb, remixes, or artist mismatches.
    """
    try:
        saavn_q = f"{clean_expected} {lead_artist}".strip()
        saavn_api = f"https://www.jiosaavn.com/api.php?__call=autocomplete.get&query={requests.utils.quote(saavn_q)}&_format=json&_marker=0&ctx=web6dot0"
        s_res = requests.get(saavn_api, headers=JIOSAAVN_HEADERS, timeout=4)
        if s_res.status_code != 200:
            return None
        
        s_data = s_res.json()
        s_songs = s_data.get("songs", {}).get("data", [])
        if not s_songs:
            return None
            
        c_lower = clean_expected.lower()
        lead_lower = lead_artist.lower()
        
        for candidate in s_songs:
            cand_title = candidate.get("title", "")
            cand_url = candidate.get("url", "")
            cand_artists = candidate.get("more_info", {}).get("primary_artists", "") or candidate.get("description", "")
            
            if not cand_url or "jiosaavn.com" not in cand_url:
                continue
                
            t_lower = cand_title.lower()
            a_lower = cand_artists.lower()
            
            # 1. Strict Anti-Noise: Disqualify unwanted keywords unless present in expected_title
            has_unwanted = False
            for kw in UNWANTED_VERSION_KEYWORDS:
                if kw in t_lower and kw not in expected_title.lower():
                    has_unwanted = True
                    break
            if has_unwanted:
                logger.info(f"JioSaavn candidate disqualified (unwanted version): '{cand_title}'")
                continue
                
            # 2. Artist Verification: Lead artist must appear in candidate artists
            if lead_lower and (lead_lower not in a_lower and similarity(lead_lower, a_lower) < 0.35):
                logger.info(f"JioSaavn candidate disqualified (artist mismatch): '{cand_title}' by '{cand_artists}' != '{lead_artist}'")
                continue
                
            # 3. Title Verification: Clean title similarity or containment
            if c_lower not in t_lower and similarity(c_lower, t_lower) < 0.45:
                logger.info(f"JioSaavn candidate disqualified (title mismatch): '{cand_title}' != '{clean_expected}'")
                continue
                
            # Valid original candidate found!
            logger.info(f"JioSaavn validated original candidate: '{cand_title}' by '{cand_artists}' -> {cand_url}")
            return candidate
            
    except Exception as e:
        logger.info(f"JioSaavn resolution error: {e}")
    return None


async def resolve_direct_stream(expected_meta: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Sub-second cold-start resolver.
    Attempts to locate a direct 320kbps CDN stream URL (JioSaavn Akamai/Cloudflare CDN)
    with strict original version matching. Returns stream URL without blocking on disk download or FFmpeg.
    """
    expected_title = expected_meta.get("title", "")
    expected_artist = expected_meta.get("artist", "")
    expected_duration = float(expected_meta.get("duration") or 0)
    
    clean_expected = clean_song_title(expected_title)
    lead_artist = expected_artist.split(",")[0].strip() if expected_artist else ""
    
    loop = asyncio.get_event_loop()
    
    # 1. Check JioSaavn CDN
    candidate = await loop.run_in_executor(None, lambda: resolve_jiosaavn_candidate(clean_expected, lead_artist, expected_title, expected_duration))
    if candidate:
        cand_url = candidate.get("url")
        try:
            ydl_opts_meta = {
                "quiet": True,
                "nocheckcertificate": True,
                "socket_timeout": 5,
            }
            with yt_dlp.YoutubeDL(ydl_opts_meta) as ydl:
                info = await loop.run_in_executor(None, lambda: ydl.extract_info(cand_url, download=False))
                if info and info.get("url"):
                    cdn_url = info.get("url")
                    cand_dur = float(info.get("duration") or 0)
                    
                    # Duration check: reject if difference > 35% and > 25 seconds
                    if expected_duration > 30 and cand_dur > 10:
                        diff = abs(expected_duration - cand_dur)
                        if diff > 25 and (diff / expected_duration) > 0.35:
                            logger.warning(f"JioSaavn stream duration mismatch: {cand_dur}s vs expected {expected_duration}s - skipping")
                            return None
                    
                    return {
                        "direct_url": cdn_url,
                        "duration": cand_dur or expected_duration,
                        "source_url": cand_url,
                        "title": candidate.get("title") or expected_title,
                        "artist": candidate.get("more_info", {}).get("primary_artists") or expected_artist,
                        "thumbnail_url": expected_meta.get("thumbnail_url") or candidate.get("image"),
                        "is_cdn": True,
                    }
        except Exception as err:
            logger.info(f"Failed to extract direct CDN stream from {cand_url}: {err}")

    return None

# --------------------------
# yt-dlp Config
# --------------------------

def ydl_opts(track_id, prefer_fast=True):
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
        "format": "bestaudio[ext=m4a]/bestaudio[ext=mp3]/bestaudio/best",
        "outtmpl": str(AUDIO_DIR / f"{track_id}.%(ext)s"),
        "quiet": True,
        "noplaylist": True,
        "nocheckcertificate": True,
        "ignoreerrors": True,
        "socket_timeout": 15,
        "ffmpeg_location": ffmpeg_path,
        "extractor_args": {
            "youtube": {
                "player_client": ["visionos", "web"]
            }
        },
        "http_headers": {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        }
    }

    if node_path:
        opts["javascript_runtime"] = node_path

    # Only force full MP3 re-encoding if specifically requested (avoids 30s CPU bottleneck on Render)
    if not prefer_fast and ffmpeg_path:
        opts["postprocessors"] = [{
            "key": "FFmpegExtractAudio",
            "preferredcodec": "mp3",
            "preferredquality": "192",
        }]
    
    return opts

# --------------------------
# Smart Download (Original-First Ranking)
# --------------------------

async def smart_download(query: str, expected_meta: Dict[str, Any]):
    track_id = expected_meta.get("id") or str(uuid.uuid4())
    expected_title = expected_meta.get("title", "")
    expected_artist = expected_meta.get("artist", "")
    expected_duration = float(expected_meta.get("duration") or 0)

    clean_expected = clean_song_title(expected_title)
    lead_artist = expected_artist.split(",")[0].strip() if expected_artist else ""

    # Check cache first (with duration sanity check)
    for ext in ["mp3", "m4a", "webm", "opus", "aac", "wav"]:
        potential_path = AUDIO_DIR / f"{track_id}.{ext}"
        if potential_path.exists() and potential_path.stat().st_size > 1024 * 100:
            # Check duration mismatch if expected duration is known
            try:
                from mutagen import File as MutagenFile
                f_audio = MutagenFile(str(potential_path))
                if f_audio and f_audio.info and f_audio.info.length:
                    act_dur = f_audio.info.length
                    if expected_duration > 30 and abs(act_dur - expected_duration) > 25 and (abs(act_dur - expected_duration) / expected_duration) > 0.30:
                        logger.warning(f"Cached file {potential_path.name} is wrong version ({act_dur:.1f}s vs {expected_duration:.1f}s). Purging.")
                        potential_path.unlink(missing_ok=True)
                        continue
            except Exception:
                pass
            logger.info(f"Using cached file: {track_id}.{ext}")
            return {**expected_meta, "audio_path": str(potential_path)}

    loop = asyncio.get_event_loop()

    # If direct source URL is provided (e.g. YouTube or JioSaavn link, not Spotify)
    direct_url = None
    if query and query.startswith("http"):
        direct_url = query
    elif expected_meta.get("source_url") and expected_meta["source_url"].startswith("http"):
        direct_url = expected_meta["source_url"]

    if direct_url and "spotify.com" not in direct_url:
        logger.info(f"Direct source URL available: {direct_url}. Attempting immediate download.")
        try:
            with yt_dlp.YoutubeDL(ydl_opts(track_id, prefer_fast=True)) as ydl:
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

    # 1. High-speed JioSaavn resolution (strict original version, studio quality)
    candidate = await loop.run_in_executor(None, lambda: resolve_jiosaavn_candidate(clean_expected, lead_artist, expected_title, expected_duration))
    if candidate:
        s_url = candidate.get("url")
        if s_url and "jiosaavn.com" in s_url:
            logger.info(f"Downloading verified original via JioSaavn: '{candidate.get('title')}' -> {s_url}")
            try:
                with yt_dlp.YoutubeDL(ydl_opts(track_id, prefer_fast=True)) as ydl:
                    data = await loop.run_in_executor(None, lambda: ydl.extract_info(s_url, download=True))
                    for ext in ["m4a", "mp3", "webm", "opus", "aac", "wav"]:
                        p = AUDIO_DIR / f"{track_id}.{ext}"
                        if p.exists() and p.stat().st_size > 1024 * 50:
                            embed_metadata(str(p), expected_meta)
                            return {
                                **expected_meta,
                                "id": track_id,
                                "audio_path": str(p),
                                "duration": (data or {}).get("duration") or expected_duration,
                                "source_url": s_url,
                                "thumbnail_url": expected_meta.get("thumbnail_url") or candidate.get("image"),
                            }
            except Exception as saavn_err:
                logger.info(f"JioSaavn download failed, falling back to YouTube: {saavn_err}")

    # 2. Strict Official-First YouTube Search
    search_queries = [
        f"{clean_expected} {lead_artist} - Topic",
        f"{clean_expected} {lead_artist} Official Audio",
        f"{clean_expected} {lead_artist} Official",
        f"{clean_expected} {lead_artist}",
    ]

    for q in search_queries:
        try:
            logger.info(f"Searching YouTube (Official-First): {q}")
            with yt_dlp.YoutubeDL(ydl_opts(track_id, prefer_fast=True)) as ydl:
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
                    u_lower = uploader.lower()
                    c_lower = clean_expected.lower()

                    score = 0.0

                    # 1. Anti-Noise Disqualification: check unwanted keywords
                    has_unwanted = False
                    for kw in UNWANTED_VERSION_KEYWORDS:
                        if kw in t_lower and kw not in expected_title.lower():
                            has_unwanted = True
                            break
                    if has_unwanted:
                        score -= 10.0  # Disqualify remixes, covers, slowed+reverbs, etc.

                    # 2. Official Channel Boosts
                    if u_lower.endswith("- topic"):
                        score += 2.0  # Official YouTube Music release!
                    elif "official audio" in t_lower:
                        score += 1.2
                    elif "official music video" in t_lower or "official video" in t_lower:
                        score += 0.8
                    elif "official" in t_lower:
                        score += 0.5

                    # 3. Exact or partial title containment
                    if c_lower in t_lower:
                        score += 0.6
                    else:
                        score += similarity(t_lower, c_lower) * 0.4

                    # 4. Artist containment
                    if lead_artist and lead_artist.lower() in t_lower:
                        score += 0.4
                    elif lead_artist and lead_artist.lower() in u_lower:
                        score += 0.4
                    elif expected_artist and any(part.strip().lower() in t_lower for part in expected_artist.split(",") if len(part.strip()) > 3):
                        score += 0.3

                    # 5. Duration Check (Strict)
                    if expected_duration > 0 and yt_duration > 0:
                        diff = abs(expected_duration - yt_duration)
                        if diff < 10:
                            score += 0.5
                        elif diff < 25:
                            score += 0.2
                        elif diff > 40:
                            score -= 2.0
                        elif diff > 90:
                            score -= 10.0  # Disqualify compilations / truncated clips

                    matches.append((score, entry))

                # Sort by score descending
                matches = sorted(matches, key=lambda x: x[0], reverse=True)

                for score, entry in matches:
                    # STRICT: Never download disqualified or negative-score tracks
                    if score < 0.2:
                        continue

                    url_to_download = entry.get("webpage_url") or f"https://www.youtube.com/watch?v={entry.get('id')}"
                    logger.info(f"Attempting download (Score: {score:.2f}, Dur: {entry.get('duration')}s): {entry.get('title')}")
                    try:
                        data = await loop.run_in_executor(None, lambda: ydl.extract_info(url_to_download, download=True))
                        
                        # Find the final file
                        for ext in ["m4a", "mp3", "webm", "opus", "aac", "wav"]:
                            p = AUDIO_DIR / f"{track_id}.{ext}"
                            if p.exists() and p.stat().st_size > 1024 * 50:
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

    logger.error(f"Completely failed to download original version of: {expected_title}")
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
        raw_title = entity.get("title") or entity.get("name") or f"Spotify Track {track_id}"
        title = raw_title.replace("\xa0", " ").strip()
        artist_items = entity.get("artists", [])
        if artist_items:
            artist = ", ".join([a.get("name", "") for a in artist_items if a.get("name")])
        else:
            artist = entity.get("subtitle") or "Unknown Artist"
        artist = artist.replace("\xa0", " ").strip()

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
        raw_title = t.get("title") or t.get("name") or "Unknown Title"
        raw_artist = t.get("subtitle") or "Unknown Artist"
        tracks.append({
            "id": tid,
            "title": raw_title.replace("\xa0", " ").strip(),
            "artist": raw_artist.replace("\xa0", " ").strip(),
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
