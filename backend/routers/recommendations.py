"""
Recommendations Router + User Interaction Tracker.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database.models import User, Interaction, get_db
from services.recommender import build_dynamic_shelves, update_user_profile
import uuid

router = APIRouter(prefix="/api", tags=["Recommendations"])

DEFAULT_USER_ID = "1"


class InteractionRequest(BaseModel):
    user_id: str = DEFAULT_USER_ID
    song_id: str
    interaction_type: str  # PLAY, LIKE, SKIP, REPLAY, DOWNLOAD


def _get_or_create_user(db: Session, user_id: str) -> User:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        user = User(
            id=user_id,
            name="Guest",
            email=f"{user_id}@aimusic.app",
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    return user


@router.get("/home/{user_id}")
def get_home_feed(user_id: str = DEFAULT_USER_ID, db: Session = Depends(get_db)):
    """
    Core personalization endpoint.
    Returns dynamic shelves tailored for the specific user.
    """
    _get_or_create_user(db, user_id)
    shelves = build_dynamic_shelves(db, user_id)
    return {"user_id": user_id, "shelves": shelves}


@router.post("/interaction")
def record_interaction(
    request: InteractionRequest,
    db: Session = Depends(get_db),
):
    """Records a user-song interaction and updates their preference vector."""
    valid_types = {"PLAY", "LIKE", "SKIP", "REPLAY", "DOWNLOAD"}
    if request.interaction_type not in valid_types:
        raise HTTPException(status_code=400, detail=f"Invalid interaction type. Must be one of {valid_types}")

    _get_or_create_user(db, request.user_id)

    interaction = Interaction(
        user_id=request.user_id,
        song_id=request.song_id,
        interaction_type=request.interaction_type,
    )
    db.add(interaction)

    # This is the core reinforcement update
    update_user_profile(db, request.user_id, request.song_id, request.interaction_type)

    db.commit()
    return {"status": "ok", "message": f"Recorded {request.interaction_type} on song {request.song_id}"}
