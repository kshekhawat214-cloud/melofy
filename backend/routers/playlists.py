"""
Playlists Router: Full Spotify-style Playlist Management API.
Supports creation, listing, updating, deleting, adding/removing tracks, and reordering.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from sqlalchemy.orm import Session, joinedload
from datetime import datetime
import uuid

from database.models import Playlist, PlaylistTrack, Song, User, SavedPlaylist, get_db
from routers.songs import _serialize
from routers.auth import get_current_user_id
from fastapi import Query, Header

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


def _serialize_playlist(
    p: Playlist,
    current_user_id: Optional[str] = None,
    is_saved: bool = False,
    include_tracks: bool = False
) -> dict:
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

    is_owner = bool(current_user_id and p.owner_id == current_user_id)
    owner_name = p.owner.name if p.owner and p.owner.name else "Guest"
    owner_username = p.owner.username if p.owner and p.owner.username else "guest"

    return {
        "id": p.id,
        "name": p.name,
        "description": p.description or "",
        "coverUrl": cover,
        "owner": owner_name,
        "ownerUsername": owner_username,
        "ownerId": p.owner_id,
        "isOwner": is_owner,
        "isSaved": is_saved,
        "isPublic": bool(p.is_public),
        "songCount": len(p.tracks) if p.tracks else 0,
        "totalDuration": int(total_duration),
        "createdAt": p.created_at.isoformat() if p.created_at else None,
        "updatedAt": p.updated_at.isoformat() if p.updated_at else None,
        "tracks": tracks_list if include_tracks else [],
    }


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
    Returns playlists isolated for the active user:
    1. Playlists created and owned by this user
    2. Playlists this user has saved to their library from others
    Other users' private/public playlists are NOT dumped into this user's library.
    """
    target_user = (user_id or "1").strip()

    # 1. Owned playlists
    owned = (
        db.query(Playlist)
        .options(joinedload(Playlist.tracks))
        .filter(Playlist.owner_id == target_user)
        .order_by(Playlist.updated_at.desc())
        .all()
    )

    # 2. Saved / followed playlists from other users
    saved_records = (
        db.query(SavedPlaylist)
        .filter(SavedPlaylist.user_id == target_user)
        .order_by(SavedPlaylist.created_at.desc())
        .all()
    )
    saved_ids = [sr.playlist_id for sr in saved_records]
    saved_playlists = (
        db.query(Playlist)
        .options(joinedload(Playlist.tracks))
        .filter(Playlist.id.in_(saved_ids), Playlist.owner_id != target_user)
        .all()
    ) if saved_ids else []

    saved_dict = {p.id: p for p in saved_playlists}
    ordered_saved = [saved_dict[sid] for sid in saved_ids if sid in saved_dict]

    results = []
    for p in owned:
        results.append(_serialize_playlist(p, current_user_id=target_user, is_saved=False, include_tracks=False))
    for p in ordered_saved:
        results.append(_serialize_playlist(p, current_user_id=target_user, is_saved=True, include_tracks=False))

    return results


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
    return _serialize_playlist(playlist, current_user_id=user_id, is_saved=False, include_tracks=True)


@router.get("/{playlist_id}")
def get_playlist(
    playlist_id: str,
    user_id: Optional[str] = Depends(resolve_user_id),
    db: Session = Depends(get_db)
):
    playlist = (
        db.query(Playlist)
        .options(joinedload(Playlist.tracks).joinedload(PlaylistTrack.song))
        .filter(Playlist.id == playlist_id)
        .first()
    )
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")

    target_user = (user_id or "1").strip()
    is_saved = bool(
        db.query(SavedPlaylist)
        .filter(SavedPlaylist.user_id == target_user, SavedPlaylist.playlist_id == playlist_id)
        .first()
    )
    return _serialize_playlist(playlist, current_user_id=target_user, is_saved=is_saved, include_tracks=True)


@router.post("/{playlist_id}/save")
def save_playlist_to_library(
    playlist_id: str,
    user_id: str = Depends(resolve_user_id),
    db: Session = Depends(get_db)
):
    playlist = db.query(Playlist).filter(Playlist.id == playlist_id).first()
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")

    target_user = (user_id or "1").strip()
    existing = (
        db.query(SavedPlaylist)
        .filter(SavedPlaylist.user_id == target_user, SavedPlaylist.playlist_id == playlist_id)
        .first()
    )
    if not existing:
        saved = SavedPlaylist(user_id=target_user, playlist_id=playlist_id)
        db.add(saved)
        db.commit()

    return {"status": "success", "isSaved": True, "message": "Saved to your library"}


@router.delete("/{playlist_id}/save")
def unsave_playlist_from_library(
    playlist_id: str,
    user_id: str = Depends(resolve_user_id),
    db: Session = Depends(get_db)
):
    target_user = (user_id or "1").strip()
    existing = (
        db.query(SavedPlaylist)
        .filter(SavedPlaylist.user_id == target_user, SavedPlaylist.playlist_id == playlist_id)
        .first()
    )
    if existing:
        db.delete(existing)
        db.commit()

    return {"status": "success", "isSaved": False, "message": "Removed from your library"}


@router.post("/{playlist_id}/clone")
def clone_playlist_to_user(
    playlist_id: str,
    user_id: str = Depends(resolve_user_id),
    db: Session = Depends(get_db)
):
    source = db.query(Playlist).filter(Playlist.id == playlist_id).first()
    if not source:
        raise HTTPException(status_code=404, detail="Playlist not found")

    target_user = (user_id or "1").strip()
    new_id = f"pl_{uuid.uuid4().hex[:8]}"
    new_playlist = Playlist(
        id=new_id,
        owner_id=target_user,
        name=f"{source.name} (Copy)",
        description=source.description or f"Copy of playlist by {source.owner.name if source.owner else 'user'}",
        cover_url=source.cover_url,
        is_public=1,
    )
    db.add(new_playlist)
    db.flush()

    if source.tracks:
        for idx, pt in enumerate(source.tracks):
            new_pt = PlaylistTrack(
                playlist_id=new_id,
                song_id=pt.song_id,
                position=idx,
                added_at=datetime.utcnow()
            )
            db.add(new_pt)

    db.commit()
    db.refresh(new_playlist)
    return _serialize_playlist(new_playlist, current_user_id=target_user, is_saved=False, include_tracks=True)


@router.patch("/{playlist_id}")
def update_playlist(
    playlist_id: str,
    data: PlaylistUpdate,
    user_id: Optional[str] = Depends(resolve_user_id),
    db: Session = Depends(get_db)
):
    playlist = db.query(Playlist).filter(Playlist.id == playlist_id).first()
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")

    target_user = (user_id or "1").strip()
    if playlist.owner_id != target_user and target_user != "1":
        raise HTTPException(status_code=403, detail="Only the playlist owner can edit this playlist")

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
    return _serialize_playlist(playlist, current_user_id=target_user, is_saved=False, include_tracks=True)


@router.delete("/{playlist_id}")
def delete_playlist(
    playlist_id: str,
    user_id: Optional[str] = Depends(resolve_user_id),
    db: Session = Depends(get_db)
):
    playlist = db.query(Playlist).filter(Playlist.id == playlist_id).first()
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")

    target_user = (user_id or "1").strip()

    # If the user is not the owner, but had saved it to their library, remove the save
    if playlist.owner_id != target_user and target_user != "1":
        saved = (
            db.query(SavedPlaylist)
            .filter(SavedPlaylist.user_id == target_user, SavedPlaylist.playlist_id == playlist_id)
            .first()
        )
        if saved:
            db.delete(saved)
            db.commit()
            return {"status": "success", "message": "Removed from your library"}
        raise HTTPException(status_code=403, detail="You do not own this playlist")

    # If owner, delete playlist and any saved records
    db.query(SavedPlaylist).filter(SavedPlaylist.playlist_id == playlist_id).delete()
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
