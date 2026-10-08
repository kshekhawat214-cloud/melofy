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
import json
import urllib.parse
from concurrent.futures import ThreadPoolExecutor
from typing import List, Optional, Dict, Any, Tuple
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
        elif ext in [".m4a", ".mp4"]:
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
    "reels", "ringtone", "unplugged", "parody", "reaction", "review",
    "choreography", "teaser", "trailer", "female version", "male version",
    "stripped", "extended", "drill", "remake", "female cover", "male cover",
    "piano cover", "guitar cover", "shorts",
    # Specific dance/club/jhankar remixes that previously corrupted Bollywood & Punjabi tracks
    "jhankar", "dj mix", "club mix", "dance mix", "hip hop mix", "dholki", "trap mix", "dhol mix",
    "trance mix", "house mix", "lo-fi mix", "mash up"
]

VERSION_PATTERNS = [
    r"\blive\b",
    r"\bconcert\b",
    r"\broyal albert hall\b",
    r"\bacoustic\b",
    r"\bunplugged\b",
    r"\bstripped\b",
    r"\bremix\b",
    r"\bclub mix\b",
    r"\bdj mix\b",
    r"\borchestral\b",
    r"\bsymphon(?:ic|y)\b",
    r"\bkaraoke\b",
    r"\binstrumental\b",
    r"\bslowed\b",
    r"\breverb\b",
    r"\bsped up\b",
    r"\bextended\b",
    r"\bdeluxe\b",
    r"\bradio edit\b",
    r"\bdemo\b",
    r"\btiny desk\b",
    r"\blive lounge\b",
]

def extract_version_tags(text: str) -> set:
    """Extracts distinctive version tags (live, acoustic, remix, royal albert hall, etc.) from title/text."""
    if not text:
        return set()
    found = set()
    t_lower = text.lower()
    for pat in VERSION_PATTERNS:
        match = re.search(pat, t_lower)
        if match:
            found.add(match.group(0).strip())
    return found

def clean_album_name(album: str) -> str:
    """Removes EP, Deluxe, Soundtrack suffixes from album name to allow accurate comparison."""
    if not album:
        return ""
    a = album
    a = re.sub(r" \(Original Motion Picture Soundtrack.*?\)", "", a, flags=re.IGNORECASE)
    a = re.sub(r" - Original Motion Picture Soundtrack.*", "", a, flags=re.IGNORECASE)
    a = re.sub(r" \(From \".*?\"\)", "", a, flags=re.IGNORECASE)
    a = re.sub(r" - EP\b", "", a, flags=re.IGNORECASE)
    a = re.sub(r" \[Deluxe.*?\]", "", a, flags=re.IGNORECASE)
    a = re.sub(r" \(Deluxe.*?\)", "", a, flags=re.IGNORECASE)
    a = re.sub(r" - Single\b", "", a, flags=re.IGNORECASE)
    return a.strip()

GENERIC_ALBUMS = {
    "single", "single version", "unknown album", "playlist", "imported playlist",
    "spotify playlist", "tunely", "music", "various artists", "top tracks", "hits"
}

def is_generic_album(album: str) -> bool:
    if not album:
        return True
    a_lower = album.strip().lower()
    return a_lower in GENERIC_ALBUMS or len(a_lower) < 2

COMPILATION_ALBUM_KEYWORDS = [
    "greatest hits", "best of", "collection", "anthology", "gold",
    "the singles", "daddy cool", "hits", "deluxe edition", "anniversary"
]

def are_artists_compatible(art1: str, art2: str) -> bool:
    """
    Checks if two artist strings share compatible primary artists or singers,
    preventing merging different artists (e.g. Shankar Mahadevan vs Shankar Ehsaan Loy).
    Handles HTML entities, non-breaking spaces, and hyphenated duo names.
    """
    if not art1 or not art2:
        return True

    import html
    art1 = html.unescape(art1).replace("\xa0", " ")
    art2 = html.unescape(art2).replace("\xa0", " ")

    def get_tokens(s: str) -> list:
        parts = re.split(r"[,&/+—–-]|\band\b|\bfeat\.?\b|\bft\.?\b|\bfeaturing\b", s, flags=re.IGNORECASE)
        tokens = []
        for p in parts:
            p_clean = re.sub(r"[^\w\s]", "", p).strip().lower()
            if len(p_clean) >= 3:
                tokens.append(p_clean)
        return tokens

    toks1 = get_tokens(art1)
    toks2 = get_tokens(art2)

    if not toks1 or not toks2:
        return True

    for t1 in toks1:
        for t2 in toks2:
            if t1 == t2:
                return True
            if similarity(t1, t2) >= 0.85:
                return True

    all_words1 = {w for t in toks1 for w in t.split() if len(w) >= 3}
    all_words2 = {w for t in toks2 for w in t.split() if len(w) >= 3}
    shared = all_words1.intersection(all_words2)

    COMMON_FIRST_NAMES = {"shankar", "kumar", "singh", "mohammed", "khan", "sharma", "ali", "john", "michael"}
    if shared.issubset(COMMON_FIRST_NAMES):
        diff1 = all_words1 - shared
        diff2 = all_words2 - shared
        if diff1 and diff2:
            return False

    return len(shared) > 0

OFFICIAL_LABEL_CHANNELS = [
    "tips official", "tips files", "tips music", "tips i miss u",
    "t-series", "t-series regional", "t-series apna punjab", "tseries",
    "zee music company", "zee music",
    "sony music india", "sony music", "sonymusicindiavevo",
    "yrf", "yash raj films",
    "saregama music", "saregama",
    "ur debut", "speed records", "geet mp3",
    "white hill music", "desi music factory", "dm - desi music factory",
    "jjust music", "vyrl originals", "aditya music", "lahari music",
    "universal music india", "warner music india", "times music"
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


def resolve_jiosaavn_candidate(
    clean_expected: str,
    lead_artist: str,
    expected_title: str,
    expected_duration: float,
    expected_album: str = "",
    all_artists: str = "",
) -> Optional[Dict[str, Any]]:
    """
    Queries JioSaavn with Indian localized headers and strictly filters for the genuine matching version.
    Disqualifies any covers, slowed+reverb, remixes, artist mismatches, album/movie soundtrack conflicts,
    or version tag mismatches (e.g. Live vs Studio).
    """
    try:
        import html
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
        exp_versions = extract_version_tags(expected_title)
        
        for candidate in s_songs:
            cand_title = html.unescape(candidate.get("title", "")).replace("\xa0", " ").strip()
            cand_url = candidate.get("url", "")
            raw_cand_artists = candidate.get("more_info", {}).get("primary_artists", "") or candidate.get("description", "") or ""
            cand_artists = html.unescape(raw_cand_artists).replace("\xa0", " ").strip()
            
            if not cand_url or "jiosaavn.com" not in cand_url:
                continue
                
            t_lower = cand_title.lower()
            
            # 1. Version Tag Integrity: If expected song is Live/Acoustic/Remix, candidate MUST match that version!
            cand_versions = extract_version_tags(cand_title)
            if exp_versions != cand_versions:
                logger.info(f"JioSaavn candidate disqualified (version tag mismatch {cand_versions} != {exp_versions}): '{cand_title}'")
                continue

            # Anti-noise: disqualify unwanted keywords not present in expected_title
            has_unwanted = False
            for kw in UNWANTED_VERSION_KEYWORDS:
                if kw in t_lower and kw not in expected_title.lower():
                    has_unwanted = True
                    break
            if has_unwanted:
                logger.info(f"JioSaavn candidate disqualified (unwanted version): '{cand_title}'")
                continue

            # 2. Artist Compatibility Verification:
            target_artist_str = all_artists or lead_artist
            if target_artist_str and cand_artists:
                if not are_artists_compatible(cand_artists, target_artist_str):
                    logger.info(f"JioSaavn candidate disqualified (artist mismatch: '{cand_artists}' != '{target_artist_str}'): '{cand_title}'")
                    continue

            # 3. Album / Movie Soundtrack Verification:
            if expected_album:
                raw_cand_alb = candidate.get("album") or candidate.get("more_info", {}).get("album") or ""
                c_cand_album = clean_album_name(html.unescape(raw_cand_alb)).replace("\xa0", " ").strip().lower()
                c_exp_album = clean_album_name(expected_album).replace("\xa0", " ").strip().lower()
                
                # If neither album is generic:
                if c_cand_album and c_exp_album and not is_generic_album(c_cand_album) and not is_generic_album(c_exp_album):
                    is_compilation = any(k in c_cand_album for k in COMPILATION_ALBUM_KEYWORDS) or any(k in c_exp_album for k in COMPILATION_ALBUM_KEYWORDS)
                    # Compilation albums (Greatest Hits, Best Of) are valid releases of the same song
                    if not is_compilation and c_cand_album != c_exp_album and similarity(c_cand_album, c_exp_album) < 0.65:
                        logger.info(f"JioSaavn candidate disqualified (album mismatch: cand='{c_cand_album}' != exp='{c_exp_album}'): '{cand_title}'")
                        continue

            # 4. Title Verification: Clean title similarity or containment
            if c_lower not in t_lower and similarity(c_lower, t_lower) < 0.45:
                logger.info(f"JioSaavn candidate disqualified (title mismatch): '{cand_title}' != '{clean_expected}'")
                continue

            # Valid authentic candidate found!
            logger.info(f"JioSaavn validated authentic candidate: '{cand_title}' by '{cand_artists}' -> {cand_url}")
            return candidate
            
    except Exception as e:
        logger.info(f"JioSaavn resolution error: {e}")
    return None


async def resolve_direct_stream(expected_meta: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Sub-second cold-start resolver (< 2s).
    3-Tier Resolution Strategy:
    1. If song has an existing YouTube/direct source_url, extracts direct audio stream URL in ~1.5s.
    2. High-speed JioSaavn 320kbps CDN stream resolution (< 1s).
    3. Fast YouTube Audio CDN stream fallback (ytsearch1:, < 2.5s) so no song ever times out!
    """
    expected_title = expected_meta.get("title", "")
    expected_artist = expected_meta.get("artist", "")
    expected_album = expected_meta.get("album", "")
    expected_duration = float(expected_meta.get("duration") or 0)
    source_url = expected_meta.get("source_url") or ""
    
    clean_expected = clean_song_title(expected_title)
    lead_artist = expected_artist.split(",")[0].strip() if expected_artist else ""
    
    loop = asyncio.get_event_loop()

    # Tier 1: Immediate Direct Stream from existing source_url (if YouTube / soundcloud / direct link)
    if source_url and "spotify.com" not in source_url and ("youtube.com" in source_url or "youtu.be" in source_url):
        try:
            ydl_opts_source = {
                "format": "ba[abr<=160]/bestaudio/best",
                "quiet": True,
                "noplaylist": True,
                "nocheckcertificate": True,
                "socket_timeout": 15,
                "extractor_args": {
                    "youtube": {
                        "player_client": ["android", "ios"],
                    }
                },
                "http_headers": {
                    "User-Agent": "com.google.android.youtube/19.29.37 (Linux; U; Android 14; en_US) gzip",
                },
            }
            with yt_dlp.YoutubeDL(ydl_opts_source) as ydl:
                info = await loop.run_in_executor(None, lambda: ydl.extract_info(source_url, download=False))
                if info and info.get("url"):
                    logger.info(f"Tier 1: Direct stream resolved from source_url for '{expected_title}'")
                    return {
                        "direct_url": info["url"],
                        "duration": info.get("duration") or expected_duration,
                        "source_url": source_url,
                        "title": expected_title,
                        "artist": expected_artist,
                        "is_cdn": True,
                    }
        except Exception as src_err:
            logger.info(f"Tier 1 source_url extraction note: {src_err}")
    
    # Tier 2: JioSaavn CDN with strict album, artist & version matching
    candidate = await loop.run_in_executor(
        None,
        lambda: resolve_jiosaavn_candidate(
            clean_expected,
            lead_artist,
            expected_title,
            expected_duration,
            expected_album,
            expected_artist,
        ),
    )
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
                    
                    # Strict duration check: reject if difference > 15 seconds (e.g. 4:15 vs 4:39)
                    if expected_duration > 30 and cand_dur > 10:
                        diff = abs(expected_duration - cand_dur)
                        if diff > 15:
                            logger.warning(
                                f"JioSaavn stream duration mismatch: {cand_dur}s vs expected {expected_duration}s "
                                f"(diff {diff:.1f}s > 15s) - skipping to preserve authentic audio version"
                            )
                            info = None
                    
                    if info:
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

    # Tier 3: YouTube Official Fast Direct Stream Fallback (< 2.5s)
    exp_version_tags = extract_version_tags(expected_title)
    if exp_version_tags:
        yt_fast_q = f"{expected_title} {lead_artist}"
    else:
        yt_fast_q = f"{clean_expected} {lead_artist} official audio"

    try:
        ydl_opts_yt = {
            "format": "ba[abr<=160]/bestaudio/best",
            "quiet": True,
            "noplaylist": True,
            "nocheckcertificate": True,
            "socket_timeout": 15,
            "extractor_args": {
                "youtube": {
                    "player_client": ["android", "ios"],
                }
            },
            "http_headers": {
                "User-Agent": "com.google.android.youtube/19.29.37 (Linux; U; Android 14; en_US) gzip",
            },
        }
        with yt_dlp.YoutubeDL(ydl_opts_yt) as ydl:
            yt_info = await loop.run_in_executor(
                None,
                lambda: ydl.extract_info(f"ytsearch3:{yt_fast_q}", download=False)
            )
            entries = yt_info.get("entries", []) if yt_info else []
            if not entries and yt_info and yt_info.get("url"):
                entries = [yt_info]

            best_entry = None
            best_diff = float("inf")

            for candidate_entry in entries:
                if not candidate_entry or not candidate_entry.get("url"):
                    continue
                cand_dur = float(candidate_entry.get("duration") or 0)
                
                # Check duration reasonableness
                if expected_duration > 30 and cand_dur > 0:
                    diff = abs(expected_duration - cand_dur)
                    # Disqualify full album uploads, loops, or tiny snippets
                    if diff > 45 or cand_dur < 25:
                        continue
                    if diff < best_diff:
                        best_diff = diff
                        best_entry = candidate_entry
                else:
                    best_entry = candidate_entry
                    break

            # Fallback if strict diff disqualified all 3 entries (e.g. single radio edit vs album version)
            if not best_entry and entries:
                for candidate_entry in entries:
                    if candidate_entry and candidate_entry.get("url"):
                        cand_dur = float(candidate_entry.get("duration") or 0)
                        if cand_dur >= 25 and (not expected_duration or cand_dur <= expected_duration * 2.5):
                            best_entry = candidate_entry
                            break

            if best_entry and best_entry.get("url"):
                yt_dur = float(best_entry.get("duration") or 0)
                logger.info(f"Tier 3: YouTube Fast Stream resolved for '{expected_title}' -> {best_entry.get('title')}")
                return {
                    "direct_url": best_entry["url"],
                    "duration": yt_dur or expected_duration,
                    "source_url": best_entry.get("webpage_url") or f"https://www.youtube.com/watch?v={best_entry.get('id')}",
                    "title": expected_title,
                    "artist": expected_artist,
                    "thumbnail_url": expected_meta.get("thumbnail_url") or best_entry.get("thumbnail"),
                    "is_cdn": True,
                }
    except Exception as yt_err:
        logger.info(f"Tier 3 YouTube Fast Stream fallback note: {yt_err}")

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
        "format": "bestaudio/best",
        "outtmpl": str(AUDIO_DIR / f"{track_id}.%(ext)s"),
        "quiet": True,
        "noplaylist": True,
        "nocheckcertificate": True,
        "ignoreerrors": True,
        "socket_timeout": 15,
        "ffmpeg_location": ffmpeg_path,
        "extractor_args": {
            "youtube": {
                "player_client": ["android", "ios"],
            }
        },
        "http_headers": {
            "User-Agent": "com.google.android.youtube/19.29.37 (Linux; U; Android 14; en_US) gzip",
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
    album = expected_meta.get("album", "")
    clean_album = ""
    if album and album.lower() not in (expected_title.lower(), "kind", "unknown album", "imported playlist", "playlist", "spotify playlist"):
        clean_album = clean_song_title(album)

    # Check cache first (with duration sanity check)
    for ext in ["mp3", "m4a", "mp4", "webm", "opus", "aac", "wav"]:
        potential_path = AUDIO_DIR / f"{track_id}.{ext}"
        if potential_path.exists() and potential_path.stat().st_size > 1024 * 100:
            # Check duration mismatch if expected duration is known
            try:
                from mutagen import File as MutagenFile
                f_audio = MutagenFile(str(potential_path))
                if f_audio and f_audio.info and f_audio.info.length:
                    act_dur = f_audio.info.length
                    if expected_duration > 30 and abs(act_dur - expected_duration) > 15:
                        logger.warning(
                            f"Cached file {potential_path.name} is wrong version ({act_dur:.1f}s vs expected {expected_duration:.1f}s). Purging."
                        )
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
                for ext in ["mp3", "m4a", "mp4", "webm", "opus", "aac", "wav"]:
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

    # 1. High-speed JioSaavn resolution (strict authentic version, album & singer matching)
    candidate = await loop.run_in_executor(
        None,
        lambda: resolve_jiosaavn_candidate(
            clean_expected,
            lead_artist,
            expected_title,
            expected_duration,
            expected_meta.get("album", ""),
            expected_meta.get("artist", ""),
        ),
    )
    if candidate:
        s_url = candidate.get("url")
        if s_url and "jiosaavn.com" in s_url:
            logger.info(f"Downloading verified authentic version via JioSaavn: '{candidate.get('title')}' -> {s_url}")
            try:
                with yt_dlp.YoutubeDL(ydl_opts(track_id, prefer_fast=True)) as ydl:
                    data = await loop.run_in_executor(None, lambda: ydl.extract_info(s_url, download=True))
                    for ext in ["m4a", "mp3", "mp4", "webm", "opus", "aac", "wav"]:
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

    # 2. Strict Official-First YouTube Search (aware of version tags and album soundtrack)
    exp_version_tags = extract_version_tags(expected_title)
    search_queries = []
    if exp_version_tags:
        # Specific version requested (e.g. Live from the Royal Albert Hall, Acoustic, Remix)
        search_queries.append(f"{expected_title} {lead_artist}")
        search_queries.append(f"{expected_title} Official")
        search_queries.append(f"{clean_expected} {' '.join(exp_version_tags)} {lead_artist}")
    else:
        # Standard studio track
        if clean_album and not is_generic_album(clean_album):
            search_queries.append(f"{clean_expected} {clean_album} {lead_artist}")
        search_queries.append(f"{clean_expected} {lead_artist} Official")
        search_queries.append(f"{clean_expected} {lead_artist} - Topic")
        search_queries.append(f"{clean_expected} {lead_artist}")

    for q in search_queries:
        try:
            logger.info(f"Searching YouTube (Official-First): {q}")
            search_opts = {
                **ydl_opts(track_id, prefer_fast=True),
                "extract_flat": "in_playlist",
            }
            with yt_dlp.YoutubeDL(search_opts) as ydl:
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
                    desc_lower = entry.get("description", "").lower() if entry.get("description") else ""

                    score = 0.0

                    # 1. Version Matching & Penalties
                    yt_version_tags = extract_version_tags(t_lower)
                    if exp_version_tags:
                        matched_v = False
                        for vt in exp_version_tags:
                            if vt in yt_version_tags or vt in t_lower:
                                matched_v = True
                                break
                        if matched_v:
                            score += 6.0  # Massive boost for genuine matching version!
                        else:
                            score -= 12.0  # Disqualify standard studio tracks when live/acoustic is requested
                    else:
                        if yt_version_tags:
                            score -= 10.0  # Disqualify live/acoustic/remixes when standard studio is requested

                    # Anti-Noise Disqualification: check unwanted keywords
                    has_unwanted = False
                    for kw in UNWANTED_VERSION_KEYWORDS:
                        if kw in t_lower and kw not in expected_title.lower():
                            has_unwanted = True
                            break
                    if has_unwanted:
                        score -= 10.0

                    # 2. Official Channel & Label Boosts
                    if u_lower.endswith("- topic"):
                        score += 3.0 if not exp_version_tags else 0.0
                    elif any(lbl in u_lower for lbl in OFFICIAL_LABEL_CHANNELS):
                        score += 2.5
                    elif "official" in u_lower or "vevo" in u_lower:
                        score += 1.5

                    # Video title badges
                    if "official audio" in t_lower:
                        score += 1.5
                    elif "official music video" in t_lower or "official video" in t_lower:
                        score += 1.2
                    elif "lyrical" in t_lower:
                        score += 0.8
                    elif "official" in t_lower:
                        score += 0.5

                    # 3. Exact or partial title containment
                    if c_lower in t_lower:
                        score += 1.0
                    else:
                        sim = similarity(t_lower, c_lower)
                        if sim > 0.6:
                            score += sim * 0.8
                        else:
                            score -= 2.0

                    # 4. Album / Movie OST match boost & conflict penalty
                    if clean_album and not is_generic_album(clean_album):
                        c_alb_lower = clean_album.lower()
                        if c_alb_lower in t_lower or c_alb_lower in desc_lower:
                            score += 4.0
                        else:
                            # Disqualify known movie soundtrack mismatches for same-title songs
                            if "chandni chowk" in t_lower and "khan" in c_alb_lower:
                                score -= 10.0
                            elif "my name is khan" in t_lower and "chandni" in c_alb_lower:
                                score -= 10.0

                    # 5. Strict Artist & Singer Matching
                    artist_parts = [p.strip().lower() for p in re.split(r"[,&/+]|\band\b", expected_artist) if len(p.strip()) >= 3]
                    artist_matched = False
                    if artist_parts:
                        for ap in artist_parts:
                            if ap in t_lower or ap in u_lower or ap in desc_lower:
                                artist_matched = True
                                score += 2.0
                                break
                        if not artist_matched:
                            score -= 5.0

                    # Specific singer check for same-title songs (e.g. Shreya Ghoshal vs Shafqat Amanat Ali)
                    if "shafqat" in expected_artist.lower():
                        if "shreya" in t_lower or "shreya" in desc_lower:
                            score -= 10.0
                    elif "shreya" in expected_artist.lower():
                        if "shafqat" in t_lower or "shafqat" in desc_lower:
                            score -= 10.0

                    # 6. Duration Verification (Strict)
                    if expected_duration > 0 and yt_duration > 0:
                        diff = abs(expected_duration - yt_duration)
                        if diff <= 6:
                            score += 2.0  # Exact match
                        elif diff <= 12:
                            score += 1.0
                        elif diff > 15:
                            score -= 3.0
                        if diff > 20:
                            score -= 8.0

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
                        with yt_dlp.YoutubeDL(ydl_opts(track_id, prefer_fast=True)) as download_ydl:
                            data = await loop.run_in_executor(None, lambda: download_ydl.extract_info(url_to_download, download=True))
                        
                        # Find the final file
                        for ext in ["m4a", "mp3", "mp4", "webm", "opus", "aac", "wav"]:
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


def resolve_song_cover_and_album(
    track_id: Optional[str],
    title: str,
    artist: str,
    current_album: str = "",
) -> Tuple[Optional[str], Optional[str]]:
    """
    Robust resolver that guarantees the song gets its authentic, individual cover
    and real album name — NEVER a playlist mosaic thumbnail or playlist title.
    Priority:
    1. If 22-char Spotify ID: Spotify Track embed metadata (individual 640x640 CDN artwork).
    2. iTunes Search API: official high-res 600x600 artwork and genuine collection/album name.
    3. JioSaavn candidate resolver: 500x500 artwork and album name.
    """
    cover = None
    album = None

    # Step 1: Spotify Track embed scrape if valid 22-char Spotify ID
    if track_id and len(track_id) == 22 and "-" not in track_id:
        try:
            t = _scrape_spotify_track(track_id)
            if t:
                thumb = t.get("thumbnail_url")
                if thumb and "mosaic.scdn.co" not in thumb:
                    cover = thumb
                if t.get("album") and t.get("album").strip():
                    album = t.get("album").strip()
        except Exception as e:
            logger.debug(f"Spotify track embed cover fetch failed for {track_id}: {e}")

    # Step 2: iTunes Search API for official artwork and authentic collection name
    if not cover or not album:
        try:
            lead_artist = artist.split(",")[0].strip() if artist else ""
            clean_t = re.sub(r"\(.*?\)|\[.*?\]", "", title).strip()
            clean_t = clean_t.split("-")[0].strip() if "-" in clean_t else clean_t
            c_alb = clean_album_name(current_album) if current_album and not is_generic_album(current_album) else ""
            query_str = f"{clean_t} {c_alb} {lead_artist}".strip() if c_alb else f"{clean_t} {lead_artist}".strip()
            q = urllib.parse.quote(query_str)
            itunes_url = f"https://itunes.apple.com/search?term={q}&media=music&entity=song&limit=1"
            res = requests.get(itunes_url, timeout=4)
            if res.status_code == 200:
                results = res.json().get("results", [])
                if results:
                    first = results[0]
                    if not cover:
                        art = first.get("artworkUrl100", "").replace("100x100bb", "600x600bb")
                        if art and "mosaic.scdn.co" not in art:
                            cover = art
                    if not album:
                        alb_name = first.get("collectionName", "")
                        if alb_name and alb_name.strip():
                            album = alb_name.strip()
        except Exception as e:
            logger.debug(f"iTunes cover fetch error for {title}: {e}")

    # Step 3: JioSaavn candidate fallback (500x500 high-res image and album)
    if not cover or not album:
        try:
            clean_t = clean_song_title(title)
            lead_artist = artist.split(",")[0].strip() if artist else ""
            cand = resolve_jiosaavn_candidate(clean_t, lead_artist, title, 0, current_album, artist)
            if cand:
                if not cover and cand.get("image"):
                    img = cand["image"].replace("50x50.jpg", "500x500.jpg").replace("150x150.jpg", "500x500.jpg")
                    if img and "mosaic.scdn.co" not in img:
                        cover = img
                if not album and cand.get("album") and cand.get("album").strip():
                    album = cand["album"].strip()
        except Exception as e:
            logger.debug(f"JioSaavn fallback cover error for {title}: {e}")

    # Final sanity cleanup
    if cover and "mosaic.scdn.co" in cover:
        cover = None
    if not album:
        album = "Single"

    return cover, album


def _scrape_spotify_playlist(playlist_id: str) -> List[Dict[str, Any]]:
    """Extract all tracks from a Spotify playlist or album using embed page, enriching with individual covers."""
    entity = _get_spotify_embed_entity("playlist", playlist_id)
    if not entity:
        entity = _get_spotify_embed_entity("album", playlist_id)
    if not entity:
        logger.warning(f"Failed to extract playlist/album {playlist_id} via embed")
        return []

    track_list = entity.get("trackList", [])
    pl_name = entity.get("name") or entity.get("title") or "Spotify Playlist"

    raw_tracks = []
    for t in track_list:
        uri = t.get("uri", "")
        tid = uri.split(":track:")[-1] if ":track:" in uri else str(uuid.uuid4())
        raw_title = t.get("title") or t.get("name") or "Unknown Title"
        raw_artist = t.get("subtitle") or "Unknown Artist"
        raw_tracks.append({
            "id": tid,
            "title": raw_title.replace("\xa0", " ").strip(),
            "artist": raw_artist.replace("\xa0", " ").strip(),
            "album": "",
            "thumbnail_url": None,
            "duration": (t.get("duration") or 0) / 1000.0,
            "popularity": 0,
        })

    def _enrich_track(item):
        try:
            cov, alb = resolve_song_cover_and_album(item["id"], item["title"], item["artist"], "")
            if cov and "mosaic.scdn.co" not in cov:
                item["thumbnail_url"] = cov
            if alb:
                item["album"] = alb
            elif not item.get("album"):
                item["album"] = "Single"
        except Exception as err:
            logger.warning(f"Failed to enrich track {item.get('title')}: {err}")
            if not item.get("album"):
                item["album"] = "Single"
        return item

    # Concurrently enrich tracks with their original album covers and album titles
    if raw_tracks:
        workers = min(12, len(raw_tracks))
        with ThreadPoolExecutor(max_workers=workers) as executor:
            tracks = list(executor.map(_enrich_track, raw_tracks))
    else:
        tracks = []

    logger.info(f"Embed scraper extracted & enriched {len(tracks)} tracks from '{pl_name}'")
    return tracks


def repair_all_mosaic_covers() -> dict:
    """
    Scans the database for any songs with mosaic thumbnails or missing covers/albums,
    and updates them with authentic original individual covers and album titles.
    """
    from database.models import SessionLocal, Song
    from sqlalchemy import or_

    db = SessionLocal()
    try:
        # Find all songs with mosaic thumbnails, missing thumbnails, or generic album names
        songs = db.query(Song).filter(
            or_(
                Song.thumbnail_url.like("%mosaic.scdn.co%"),
                Song.thumbnail_url == None,
                Song.thumbnail_url == "",
                Song.cover_path.like("%mosaic.scdn.co%"),
            )
        ).all()

        if not songs:
            logger.info("Cover repair check: No mosaic or missing song covers found.")
            return {"scanned": 0, "repaired": 0, "status": "clean"}

        logger.info(f"Starting cover repair for {len(songs)} songs with mosaic/missing covers...")

        def _repair_worker(song_tuple):
            s_id, s_title, s_artist, s_album = song_tuple
            c, a = resolve_song_cover_and_album(s_id, s_title, s_artist, s_album)
            return s_id, c, a

        tasks = [(s.id, s.title, s.artist, s.album) for s in songs]
        workers = min(12, len(tasks))
        with ThreadPoolExecutor(max_workers=workers) as executor:
            results = list(executor.map(_repair_worker, tasks))

        repaired_count = 0
        for s_id, cov, alb in results:
            s = db.query(Song).filter(Song.id == s_id).first()
            if not s:
                continue
            updated = False
            if cov and "mosaic.scdn.co" not in cov:
                s.thumbnail_url = cov
                s.cover_path = cov
                updated = True
            if alb and (not s.album or s.album in ("kind", "Massala", "Imported Playlist", "Spotify Playlist")):
                s.album = alb
                updated = True
            if updated:
                repaired_count += 1

        db.commit()
        logger.info(f"Cover repair completed successfully: {repaired_count}/{len(songs)} songs updated.")
        return {"scanned": len(songs), "repaired": repaired_count, "status": "success"}
    except Exception as e:
        logger.error(f"Error repairing covers: {e}")
        return {"error": str(e), "status": "failed"}
    finally:
        db.close()


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
