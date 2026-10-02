"""
SQLAlchemy models and database setup using SQLite for local dev.
Supports full Spotify clone data schema: Songs, Artists, Albums, Playlists, Liked Songs, Genres.
"""
from sqlalchemy import create_engine, Column, String, Float, Integer, DateTime, Text, ForeignKey
from sqlalchemy.orm import declarative_base, sessionmaker, relationship
from datetime import datetime
from pathlib import Path
import os
import logging

logger = logging.getLogger(__name__)

DB_DIR = Path(__file__).parent.parent / "local_storage"
DB_DIR.mkdir(parents=True, exist_ok=True)
DEFAULT_SQLITE_URL = f"sqlite:///{DB_DIR / 'music.db'}"

DATABASE_URL = os.getenv("DATABASE_URL", "").strip()
if not DATABASE_URL:
    turso_url = os.getenv("TURSO_DB_URL", "").strip()
    if turso_url:
        DATABASE_URL = turso_url
    else:
        DATABASE_URL = DEFAULT_SQLITE_URL

# Normalize Postgres URLs (e.g. Supabase postgres:// -> postgresql://)
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

# Normalize Turso URLs (libsql:// -> sqlite+libsql://, https://...turso.io -> sqlite+libsql://...)
if DATABASE_URL.startswith("libsql://"):
    DATABASE_URL = DATABASE_URL.replace("libsql://", "sqlite+libsql://", 1)
elif DATABASE_URL.startswith("https://") and "turso.io" in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.replace("https://", "sqlite+libsql://", 1)

connect_args = {}

if "libsql" in DATABASE_URL:
    try:
        import importlib
        import urllib.parse
        importlib.import_module("sqlalchemy_libsql")

        # 1. Discover auth token from env vars first
        auth_token = (
            os.getenv("TURSO_AUTH_TOKEN", "").strip()
            or os.getenv("TURSO_TOKEN", "").strip()
            or os.getenv("LIBSQL_AUTH_TOKEN", "").strip()
        )

        # If token is embedded in the URL, extract it and REMOVE it from the URL.
        # libsql_experimental MUST NOT have authToken in the URL — it appends the
        # full query string to the HTTP path (/v3/pipeline?authToken=...) causing 404.
        parsed = urllib.parse.urlparse(DATABASE_URL)
        qs = urllib.parse.parse_qs(parsed.query, keep_blank_values=True)

        if not auth_token:
            tokens = qs.get("authToken") or qs.get("auth_token") or [""]
            auth_token = tokens[0].strip()

        # Strip authToken / auth_token from URL — keep only secure=true
        qs.pop("authToken", None)
        qs.pop("auth_token", None)
        qs["secure"] = ["true"]

        clean_query = urllib.parse.urlencode({k: v[0] for k, v in qs.items()})
        DATABASE_URL = urllib.parse.urlunparse(
            (parsed.scheme, parsed.netloc, parsed.path, parsed.params, clean_query, parsed.fragment)
        )

        # 2. Pass auth_token (snake_case) via connect_args to libsql_experimental DBAPI
        if auth_token:
            connect_args["auth_token"] = auth_token
            logger.info("Turso/LibSQL: auth_token set via connect_args (not URL).")
        else:
            logger.warning("Turso/LibSQL: NO auth_token found — connection will fail with 401.")

    except ImportError:
        logger.warning("sqlalchemy-libsql not available. Falling back to local SQLite.")
        DATABASE_URL = DEFAULT_SQLITE_URL

if "sqlite" in DATABASE_URL and "libsql" not in DATABASE_URL:
    connect_args["check_same_thread"] = False

engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class Artist(Base):
    __tablename__ = "artists"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False, index=True)
    bio = Column(Text, nullable=True)
    image_url = Column(String, nullable=True)
    verified = Column(Integer, default=1)
    monthly_listeners = Column(Integer, default=1250000)

    albums = relationship("Album", back_populates="artist")
    songs = relationship("Song", back_populates="artist_obj")


class Album(Base):
    __tablename__ = "albums"

    id = Column(String, primary_key=True, index=True)
    artist_id = Column(String, ForeignKey("artists.id"), nullable=True)
    title = Column(String, nullable=False, index=True)
    cover_url = Column(String, nullable=True)
    release_date = Column(String, nullable=True)
    type = Column(String, default="album")  # album, single, ep

    artist = relationship("Artist", back_populates="albums")
    songs = relationship("Song", back_populates="album_obj")


class Song(Base):
    __tablename__ = "songs"

    id = Column(String, primary_key=True, index=True)
    title = Column(String, nullable=False, index=True)
    artist = Column(String, nullable=False, index=True)
    artist_id = Column(String, ForeignKey("artists.id"), nullable=True)
    album = Column(String, nullable=True)
    album_id = Column(String, ForeignKey("albums.id"), nullable=True)
    genre = Column(String, nullable=True)
    mood = Column(String, nullable=True)     # "energetic", "chill", "happy", "focus"
    tempo = Column(Float, nullable=True)     # BPM
    energy = Column(Float, nullable=True)   # 0.0 - 1.0
    popularity = Column(Float, default=50.0)
    play_count = Column(Integer, default=0)
    duration = Column(Float, nullable=True) # seconds
    audio_path = Column(String, nullable=False)   # local path or URL
    cover_path = Column(String, nullable=True)    # local path
    source_url = Column(String, nullable=True)    # original URL
    thumbnail_url = Column(String, nullable=True) # remote thumbnail
    lyrics_lrc = Column(Text, nullable=True)      # Synced or plain lyrics
    created_at = Column(DateTime, default=datetime.utcnow)

    artist_obj = relationship("Artist", back_populates="songs")
    album_obj = relationship("Album", back_populates="songs")
    interactions = relationship("Interaction", back_populates="song")
    playlist_tracks = relationship("PlaylistTrack", back_populates="song")
    liked_by = relationship("LikedSong", back_populates="song")


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=True)
    avatar_url = Column(String, nullable=True)

    genre_affinities = Column(Text, default="{}")  # JSON string
    mood_affinities = Column(Text, default="{}")
    artist_affinities = Column(Text, default="{}")
    created_at = Column(DateTime, default=datetime.utcnow)

    interactions = relationship("Interaction", back_populates="user")
    playlists = relationship("Playlist", back_populates="owner")
    liked_songs = relationship("LikedSong", back_populates="user")


class Playlist(Base):
    __tablename__ = "playlists"

    id = Column(String, primary_key=True, index=True)
    owner_id = Column(String, ForeignKey("users.id"), default="1")
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    cover_url = Column(String, nullable=True)
    is_public = Column(Integer, default=1)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    owner = relationship("User", back_populates="playlists")
    tracks = relationship("PlaylistTrack", back_populates="playlist", cascade="all, delete-orphan", order_by="PlaylistTrack.position")


class PlaylistTrack(Base):
    __tablename__ = "playlist_tracks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    playlist_id = Column(String, ForeignKey("playlists.id"), nullable=False)
    song_id = Column(String, ForeignKey("songs.id"), nullable=False)
    position = Column(Integer, default=0)
    added_at = Column(DateTime, default=datetime.utcnow)

    playlist = relationship("Playlist", back_populates="tracks")
    song = relationship("Song", back_populates="playlist_tracks")


class LikedSong(Base):
    __tablename__ = "liked_songs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String, ForeignKey("users.id"), default="1")
    song_id = Column(String, ForeignKey("songs.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="liked_songs")
    song = relationship("Song", back_populates="liked_by")


class Interaction(Base):
    __tablename__ = "interactions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    song_id = Column(String, ForeignKey("songs.id"), nullable=False)
    interaction_type = Column(String, nullable=False)  # PLAY, LIKE, SKIP, REPLAY, DOWNLOAD
    context = Column(String, nullable=True)  # morning, afternoon, evening, night
    timestamp = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="interactions")
    song = relationship("Song", back_populates="interactions")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_tables():
    Base.metadata.create_all(bind=engine)
