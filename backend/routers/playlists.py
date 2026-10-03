"""
Playlists Router: Full Spotify-style Playlist Management API.
Supports creation, listing, updating, deleting, adding/removing tracks, and reordering.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from sqlalchemy.orm import Session
from datetime import datetime
import uuid

from database.models import Playlist, PlaylistTrack, Song, User, get_db
from routers.songs import _serialize

router = APIRouter(prefix="/api/playlists", tags=["Playlists"])


class PlaylistCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    cover_url: Optional[str] = ""
    is_public: Optional[bool] = True


class PlaylistUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    cover_url: Optional[str] = None
    is_public: Optional[bool] = None


class AddTrackRequest(BaseModel):
    song_id: str


class ReorderRequest(BaseModel):
    song_ids: List[str]


def _serialize_playlist(p: Playlist, include_tracks: bool = False) -> dict:
    tracks_list = []
    total_duration = 0
    if include_tracks and p.tracks:
        for pt in p.tracks:
            if pt.song:
                s_dict = _serialize(pt.song)
                s_dict["addedAt"] = pt.added_at.isoformat() if pt.added_at else None
                tracks_list.append(s_dict)
                total_duration += (pt.song.duration or 0)

    # Pick first song cover if no playlist cover set
    cover = p.cover_url
    if not cover and p.tracks and p.tracks[0].song:
        cover = p.tracks[0].song.thumbnail_url or f"/api/songs/{p.tracks[0].song.id}/cover"
    if not cover:
        cover = "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400&q=80"

    return {
        "id": p.id,
        "name": p.name,
        "description": p.description or "",
        "coverUrl": cover,
        "owner": p.owner.name if p.owner else "Guest",
        "ownerId": p.owner_id,
        "isPublic": bool(p.is_public),
        "songCount": len(p.tracks) if p.tracks else 0,
        "totalDuration": int(total_duration),
        "createdAt": p.created_at.isoformat() if p.created_at else None,
        "updatedAt": p.updated_at.isoformat() if p.updated_at else None,
        "tracks": tracks_list if include_tracks else [],
    }


from routers.auth import get_current_user_id
from fastapi import Query, Header


def resolve_user_id(
    user_id: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
    x_user_id: Optional[str] = Header(None),
) -> str:
    """Resolves target user ID from query param, auth bearer token, or x-user-id header."""
    if user_id:
        return user_id.strip()
    return get_current_user_id(authorization, x_user_id)


@router.get("")
def list_playlists(
    user_id: Optional[str] = Depends(resolve_user_id),
    db: Session = Depends(get_db)
):
    """
    Returns playlists. If user_id is provided, returns playlists owned by the user,
    plus public playlists, with the user's playlists listed first.
    """
    if user_id and user_id != "1":
        user_playlists = db.query(Playlist).filter(Playlist.owner_id == user_id).order_by(Playlist.updated_at.desc()).all()
        public_other = db.query(Playlist).filter(Playlist.owner_id != user_id, Playlist.is_public == 1).order_by(Playlist.updated_at.desc()).all()
        playlists = user_playlists + public_other
    else:
        playlists = db.query(Playlist).order_by(Playlist.updated_at.desc()).all()

    return [_serialize_playlist(p, include_tracks=False) for p in playlists]


@router.post("")
def create_playlist(
    data: PlaylistCreate,
    user_id: str = Depends(resolve_user_id),
    db: Session = Depends(get_db)
):
    # Ensure user exists
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        user = User(id=user_id, name="User" if user_id != "1" else "Guest", email=f"{user_id}@tunely.local")
        db.add(user)
        db.commit()

    playlist_id = f"pl_{uuid.uuid4().hex[:8]}"
    playlist = Playlist(
        id=playlist_id,
        owner_id=user_id,
        name=data.name.strip() or "My Playlist",
        description=data.description,
        cover_url=data.cover_url,
        is_public=1 if data.is_public else 0,
    )
    db.add(playlist)
    db.commit()
    db.refresh(playlist)
    return _serialize_playlist(playlist, include_tracks=True)


@router.get("/{playlist_id}")
def get_playlist(playlist_id: str, db: Session = Depends(get_db)):
    playlist = db.query(Playlist).filter(Playlist.id == playlist_id).first()
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")
    return _serialize_playlist(playlist, include_tracks=True)


@router.patch("/{playlist_id}")
def update_playlist(playlist_id: str, data: PlaylistUpdate, db: Session = Depends(get_db)):
    playlist = db.query(Playlist).filter(Playlist.id == playlist_id).first()
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")

    if data.name is not None:
        playlist.name = data.name.strip()
    if data.description is not None:
        playlist.description = data.description
    if data.cover_url is not None:
        playlist.cover_url = data.cover_url
    if data.is_public is not None:
        playlist.is_public = 1 if data.is_public else 0

    playlist.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(playlist)
    return _serialize_playlist(playlist, include_tracks=True)


@router.delete("/{playlist_id}")
def delete_playlist(playlist_id: str, db: Session = Depends(get_db)):
    playlist = db.query(Playlist).filter(Playlist.id == playlist_id).first()
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")

    db.delete(playlist)
    db.commit()
    return {"status": "success", "message": f"Playlist {playlist_id} deleted"}


@router.post("/{playlist_id}/tracks")
def add_track(playlist_id: str, data: AddTrackRequest, db: Session = Depends(get_db)):
    playlist = db.query(Playlist).filter(Playlist.id == playlist_id).first()
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")

    song = db.query(Song).filter(Song.id == data.song_id).first()
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")

    # Deduplication check: verify song isn't already in this playlist
    existing_pt = db.query(PlaylistTrack).filter(
        PlaylistTrack.playlist_id == playlist_id,
        PlaylistTrack.song_id == data.song_id
    ).first()
    if existing_pt:
        return {
            "status": "exists",
            "message": f"'{song.title}' is already in this playlist",
            "songCount": len(playlist.tracks)
        }

    # Current position
    current_count = len(playlist.tracks)
    pt = PlaylistTrack(
        playlist_id=playlist_id,
        song_id=data.song_id,
        position=current_count,
        added_at=datetime.utcnow()
    )
    playlist.updated_at = datetime.utcnow()
    db.add(pt)
    db.commit()
    return {"status": "success", "message": f"Added '{song.title}' to playlist", "songCount": current_count + 1}


@router.delete("/{playlist_id}/tracks/{song_id}")
def remove_track(playlist_id: str, song_id: str, db: Session = Depends(get_db)):
    playlist = db.query(Playlist).filter(Playlist.id == playlist_id).first()
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")

    track_rel = db.query(PlaylistTrack).filter(
        PlaylistTrack.playlist_id == playlist_id,
        PlaylistTrack.song_id == song_id
    ).first()

    if not track_rel:
        raise HTTPException(status_code=404, detail="Track not in playlist")

    db.delete(track_rel)
    playlist.updated_at = datetime.utcnow()
    db.commit()
    return {"status": "success", "message": "Track removed from playlist"}


@router.put("/{playlist_id}/tracks/reorder")
def reorder_tracks(playlist_id: str, data: ReorderRequest, db: Session = Depends(get_db)):
    playlist = db.query(Playlist).filter(Playlist.id == playlist_id).first()
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")

    for idx, song_id in enumerate(data.song_ids):
        pt = db.query(PlaylistTrack).filter(
            PlaylistTrack.playlist_id == playlist_id,
            PlaylistTrack.song_id == song_id
        ).first()
        if pt:
            pt.position = idx

    playlist.updated_at = datetime.utcnow()
    db.commit()
    return {"status": "success", "message": "Playlist reordered"}
