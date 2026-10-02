"""
Likes Router: Manage Liked Songs for the guest user.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime

from database.models import LikedSong, Song, User, Interaction, get_db
from routers.songs import _serialize

router = APIRouter(prefix="/api/me/liked", tags=["Likes"])


@router.get("")
def get_liked_songs(db: Session = Depends(get_db)):
    """Returns all songs saved to Liked Songs."""
    likes = db.query(LikedSong).filter(LikedSong.user_id == "1").order_by(LikedSong.created_at.desc()).all()
    songs = []
    for l in likes:
        if l.song:
            s_dict = _serialize(l.song)
            s_dict["likedAt"] = l.created_at.isoformat() if l.created_at else None
            songs.append(s_dict)
    return {
        "title": "Liked Songs",
        "description": "Songs you've saved to your library",
        "owner": "Guest",
        "songCount": len(songs),
        "totalDuration": sum(s.get("duration", 0) or 0 for s in songs),
        "songs": songs,
    }


@router.get("/ids")
def get_liked_song_ids(db: Session = Depends(get_db)):
    """Returns list of liked song IDs for fast UI heart badge lookup."""
    likes = db.query(LikedSong.song_id).filter(LikedSong.user_id == "1").all()
    return [l[0] for l in likes]


@router.get("/{song_id}/check")
def check_is_liked(song_id: str, db: Session = Depends(get_db)):
    liked = db.query(LikedSong).filter(LikedSong.user_id == "1", LikedSong.song_id == song_id).first()
    return {"songId": song_id, "isLiked": liked is not None}


@router.post("/{song_id}")
def like_song(song_id: str, db: Session = Depends(get_db)):
    song = db.query(Song).filter(Song.id == song_id).first()
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")

    existing = db.query(LikedSong).filter(LikedSong.user_id == "1", LikedSong.song_id == song_id).first()
    if not existing:
        liked = LikedSong(user_id="1", song_id=song_id, created_at=datetime.utcnow())
        db.add(liked)

        # Record LIKE interaction for AI recommendation engine
        interaction = Interaction(
            user_id="1",
            song_id=song_id,
            interaction_type="LIKE",
            timestamp=datetime.utcnow()
        )
        db.add(interaction)
        db.commit()

    return {"status": "success", "isLiked": True, "message": f"Added '{song.title}' to Liked Songs"}


@router.delete("/{song_id}")
def unlike_song(song_id: str, db: Session = Depends(get_db)):
    existing = db.query(LikedSong).filter(LikedSong.user_id == "1", LikedSong.song_id == song_id).first()
    if existing:
        db.delete(existing)
        db.commit()

    return {"status": "success", "isLiked": False, "message": "Removed from Liked Songs"}
