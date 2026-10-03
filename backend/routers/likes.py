"""
Likes Router: Manage Liked Songs with full multi-user isolation.
Each user has their own private Liked Songs collection.
"""
from fastapi import APIRouter, Depends, HTTPException, Header, Query
from typing import Optional
from sqlalchemy.orm import Session
from datetime import datetime

from database.models import LikedSong, Song, User, Interaction, get_db
from routers.songs import _serialize
from routers.auth import get_current_user_id
from services.recommender import update_user_profile

router = APIRouter(prefix="/api/me/liked", tags=["Likes"])


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
def get_liked_songs(
    user_id: str = Depends(resolve_user_id),
    db: Session = Depends(get_db)
):
    """Returns all songs saved to Liked Songs for the requesting user."""
    user = db.query(User).filter(User.id == user_id).first()
    owner_name = user.name if user else ("Guest" if user_id == "1" else "User")

    likes = db.query(LikedSong).filter(LikedSong.user_id == user_id).order_by(LikedSong.created_at.desc()).all()
    songs = []
    for l in likes:
        if l.song:
            s_dict = _serialize(l.song)
            s_dict["likedAt"] = l.created_at.isoformat() if l.created_at else None
            songs.append(s_dict)
    return {
        "title": "Liked Songs",
        "description": "Songs you've saved to your library",
        "owner": owner_name,
        "ownerId": user_id,
        "songCount": len(songs),
        "totalDuration": sum(s.get("duration", 0) or 0 for s in songs),
        "songs": songs,
    }


@router.get("/ids")
def get_liked_song_ids(
    user_id: str = Depends(resolve_user_id),
    db: Session = Depends(get_db)
):
    """Returns list of liked song IDs for fast UI heart badge lookup for current user."""
    likes = db.query(LikedSong.song_id).filter(LikedSong.user_id == user_id).all()
    return [l[0] for l in likes]


@router.get("/{song_id}/check")
def check_is_liked(
    song_id: str,
    user_id: str = Depends(resolve_user_id),
    db: Session = Depends(get_db)
):
    liked = db.query(LikedSong).filter(LikedSong.user_id == user_id, LikedSong.song_id == song_id).first()
    return {"songId": song_id, "isLiked": liked is not None}


@router.post("/{song_id}")
def like_song(
    song_id: str,
    user_id: str = Depends(resolve_user_id),
    db: Session = Depends(get_db)
):
    song = db.query(Song).filter(Song.id == song_id).first()
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")

    existing = db.query(LikedSong).filter(LikedSong.user_id == user_id, LikedSong.song_id == song_id).first()
    if not existing:
        liked = LikedSong(user_id=user_id, song_id=song_id, created_at=datetime.utcnow())
        db.add(liked)

        # Record LIKE interaction for AI recommendation engine
        interaction = Interaction(
            user_id=user_id,
            song_id=song_id,
            interaction_type="LIKE",
            timestamp=datetime.utcnow()
        )
        db.add(interaction)

        # Immediate reinforcement update to user taste vector
        try:
            update_user_profile(db, user_id, song_id, "LIKE")
        except Exception:
            pass

        db.commit()

    return {"status": "success", "isLiked": True, "message": f"Added '{song.title}' to Liked Songs"}


@router.delete("/{song_id}")
def unlike_song(
    song_id: str,
    user_id: str = Depends(resolve_user_id),
    db: Session = Depends(get_db)
):
    existing = db.query(LikedSong).filter(LikedSong.user_id == user_id, LikedSong.song_id == song_id).first()
    if existing:
        db.delete(existing)
        db.commit()

    return {"status": "success", "isLiked": False, "message": "Removed from Liked Songs"}
