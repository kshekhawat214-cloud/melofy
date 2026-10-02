"""
Catalog Router: Search, Artists, Albums, Genres, User Profile and Settings.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import Optional, List
from pydantic import BaseModel

from database.models import Song, Artist, Album, Playlist, User, get_db
from routers.songs import _serialize

router = APIRouter(prefix="/api", tags=["Catalog"])

GENRES_DATA = [
    {"id": "pop", "name": "Pop", "color": "#148a08", "gradient": "from-emerald-700 to-green-950", "image": "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&q=80"},
    {"id": "hiphop", "name": "Hip-Hop", "color": "#bc5900", "gradient": "from-amber-700 to-stone-900", "image": "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=300&q=80"},
    {"id": "rock", "name": "Rock", "color": "#e91429", "gradient": "from-red-700 to-neutral-900", "image": "https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?w=300&q=80"},
    {"id": "electronic", "name": "Dance/Electronic", "color": "#d84000", "gradient": "from-orange-700 to-zinc-900", "image": "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=300&q=80"},
    {"id": "chill", "name": "Chill & Lo-Fi", "color": "#1e3264", "gradient": "from-blue-700 to-slate-950", "image": "https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=300&q=80"},
    {"id": "indie", "name": "Indie", "color": "#608108", "gradient": "from-lime-800 to-stone-900", "image": "https://images.unsplash.com/photo-1465847899084-d164df4dedc6?w=300&q=80"},
    {"id": "rnb", "name": "R&B", "color": "#8400e7", "gradient": "from-purple-700 to-indigo-950", "image": "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&q=80"},
    {"id": "mood", "name": "Mood & Focus", "color": "#e1118c", "gradient": "from-pink-700 to-slate-900", "image": "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=300&q=80"},
    {"id": "charts", "name": "Top Charts", "color": "#8d67ab", "gradient": "from-violet-700 to-zinc-900", "image": "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=300&q=80"},
    {"id": "workout", "name": "Workout", "color": "#777777", "gradient": "from-neutral-700 to-black", "image": "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=300&q=80"},
]


class SettingsUpdate(BaseModel):
    displayName: Optional[str] = None
    audioQuality: Optional[str] = "high"
    crossfadeMs: Optional[int] = 0
    autoplay: Optional[bool] = True
    accentColor: Optional[str] = "#1db954"


@router.get("/genres")
def get_genres():
    return GENRES_DATA


@router.get("/search")
def search_catalog(
    q: str = Query(..., min_length=1),
    type: Optional[str] = "all",
    db: Session = Depends(get_db)
):
    query_str = f"%{q.strip()}%"

    # Search Songs
    songs = db.query(Song).filter(
        or_(
            Song.title.ilike(query_str),
            Song.artist.ilike(query_str),
            Song.album.ilike(query_str),
            Song.genre.ilike(query_str)
        )
    ).limit(20).all()

    # Search Artists
    artists = db.query(Artist).filter(Artist.name.ilike(query_str)).limit(10).all()
    # Search Albums
    albums = db.query(Album).filter(Album.title.ilike(query_str)).limit(10).all()
    # Search Playlists
    playlists = db.query(Playlist).filter(Playlist.name.ilike(query_str)).limit(10).all()

    # Determine Top Result
    top_result = None
    if songs:
        top_result = {
            "type": "song",
            "id": songs[0].id,
            "title": songs[0].title,
            "subtitle": songs[0].artist,
            "coverUrl": songs[0].thumbnail_url or f"/api/songs/{songs[0].id}/cover",
            "raw": _serialize(songs[0])
        }
    elif artists:
        top_result = {
            "type": "artist",
            "id": artists[0].id,
            "title": artists[0].name,
            "subtitle": "Artist",
            "coverUrl": artists[0].image_url or "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400&q=80",
        }

    return {
        "query": q,
        "topResult": top_result,
        "songs": [_serialize(s) for s in songs],
        "artists": [
            {
                "id": a.id,
                "name": a.name,
                "imageUrl": a.image_url,
                "monthlyListeners": a.monthly_listeners,
                "verified": bool(a.verified),
            } for a in artists
        ],
        "albums": [
            {
                "id": al.id,
                "title": al.title,
                "coverUrl": al.cover_url,
                "artist": al.artist.name if al.artist else "Unknown Artist",
                "artistId": al.artist_id,
                "releaseDate": al.release_date,
            } for al in albums
        ],
        "playlists": [
            {
                "id": p.id,
                "name": p.name,
                "description": p.description,
                "coverUrl": p.cover_url,
                "owner": p.owner.name if p.owner else "Guest",
                "songCount": len(p.tracks),
            } for p in playlists
        ],
    }


@router.get("/artists/{artist_id}")
def get_artist(artist_id: str, db: Session = Depends(get_db)):
    artist = db.query(Artist).filter(Artist.id == artist_id).first()
    if not artist:
        # Fallback: check if we have songs with this artist name
        songs = db.query(Song).filter(Song.artist.ilike(f"%{artist_id}%")).all()
        if songs:
            artist_name = songs[0].artist
            return {
                "id": artist_id,
                "name": artist_name,
                "bio": f"{artist_name} is a featured artist in your Tunely library.",
                "imageUrl": songs[0].thumbnail_url or "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400&q=80",
                "verified": True,
                "monthlyListeners": 1845000,
                "topTracks": [_serialize(s) for s in songs[:10]],
                "albums": [],
            }
        raise HTTPException(status_code=404, detail="Artist not found")

    top_tracks = db.query(Song).filter(
        or_(Song.artist_id == artist.id, Song.artist.ilike(f"%{artist.name}%"))
    ).order_by(Song.popularity.desc()).limit(10).all()

    return {
        "id": artist.id,
        "name": artist.name,
        "bio": artist.bio or f"{artist.name} is a global recording artist.",
        "imageUrl": artist.image_url or "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400&q=80",
        "verified": bool(artist.verified),
        "monthlyListeners": artist.monthly_listeners or 1250000,
        "topTracks": [_serialize(s) for s in top_tracks],
        "albums": [
            {
                "id": al.id,
                "title": al.title,
                "coverUrl": al.cover_url,
                "releaseDate": al.release_date,
                "type": al.type,
            } for al in artist.albums
        ],
    }


@router.get("/albums/{album_id}")
def get_album(album_id: str, db: Session = Depends(get_db)):
    album = db.query(Album).filter(Album.id == album_id).first()
    if not album:
        # Fallback to search songs matching album
        songs = db.query(Song).filter(Song.album.ilike(f"%{album_id}%")).all()
        if songs:
            first = songs[0]
            return {
                "id": album_id,
                "title": first.album or "Album",
                "coverUrl": first.thumbnail_url or f"/api/songs/{first.id}/cover",
                "artist": first.artist,
                "artistId": first.artist_id or "artist_1",
                "releaseDate": "2024",
                "songCount": len(songs),
                "totalDuration": sum((s.duration or 0) for s in songs),
                "tracks": [_serialize(s) for s in songs],
            }
        raise HTTPException(status_code=404, detail="Album not found")

    songs = db.query(Song).filter(Song.album_id == album.id).all()
    return {
        "id": album.id,
        "title": album.title,
        "coverUrl": album.cover_url or "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=400&q=80",
        "artist": album.artist.name if album.artist else "Unknown Artist",
        "artistId": album.artist_id,
        "releaseDate": album.release_date or "2024",
        "songCount": len(songs),
        "totalDuration": sum((s.duration or 0) for s in songs),
        "tracks": [_serialize(s) for s in songs],
    }


@router.get("/me/profile")
def get_profile(db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == "1").first()
    playlists = db.query(Playlist).filter(Playlist.owner_id == "1").all()
    from database.models import LikedSong
    liked_count = db.query(LikedSong).filter(LikedSong.user_id == "1").count()

    return {
        "id": "1",
        "displayName": user.name if user else "Guest",
        "avatarUrl": "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&q=80",
        "publicPlaylistsCount": len(playlists),
        "likedSongsCount": liked_count,
        "followersCount": 42,
        "followingCount": 18,
    }


# In-memory settings fallback for seamless client sync
_USER_SETTINGS = {
    "displayName": "Guest",
    "audioQuality": "high",
    "crossfadeMs": 3000,
    "autoplay": True,
    "accentColor": "#1db954"
}

@router.get("/me/settings")
def get_settings():
    return _USER_SETTINGS


@router.patch("/me/settings")
def update_settings(data: SettingsUpdate):
    if data.displayName:
        _USER_SETTINGS["displayName"] = data.displayName
    if data.audioQuality:
        _USER_SETTINGS["audioQuality"] = data.audioQuality
    if data.crossfadeMs is not None:
        _USER_SETTINGS["crossfadeMs"] = data.crossfadeMs
    if data.autoplay is not None:
        _USER_SETTINGS["autoplay"] = data.autoplay
    if data.accentColor:
        _USER_SETTINGS["accentColor"] = data.accentColor
    return _USER_SETTINGS
