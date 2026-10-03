"""
AI Recommendation Engine.

Implements a 3-layer scoring system:
  1. Content-Based Filtering  → Cosine similarity between User vector & Song vectors
  2. Behavior Weighting       → Amplify liked songs, suppress skipped songs
  3. Context-Awareness        → Time-of-day mood heuristic

Final Score = (Similarity × 0.4) + (Behavior × 0.3) + (Freshness × 0.2) + (Popularity × 0.1)

Returns dynamic, named shelves personalized per user.
"""
import json
import math
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Optional
from sqlalchemy.orm import Session
from database.models import User, Song, Interaction

logger = logging.getLogger(__name__)


# --- Context ---
def get_time_context() -> str:
    hour = datetime.utcnow().hour + 5  # IST offset rough
    if 5 <= hour < 12:
        return "morning"
    if 12 <= hour < 17:
        return "afternoon"
    if 17 <= hour < 21:
        return "evening"
    return "night"


# Mood profile for each time of day
CONTEXT_MOOD_PREFERENCE = {
    "morning": ["happy", "energetic", "chill"],
    "afternoon": ["energetic", "happy", "neutral"],
    "evening": ["chill", "neutral", "dark"],
    "night": ["dark", "sad", "chill"],
}


# --- Vector Utilities ---
def cosine_similarity(vec_a: Dict, vec_b: Dict) -> float:
    """Computes dot product similarity between two sparse dicts."""
    all_keys = set(vec_a) | set(vec_b)
    if not all_keys:
        return 0.0
    dot = sum(vec_a.get(k, 0) * vec_b.get(k, 0) for k in all_keys)
    mag_a = math.sqrt(sum(v**2 for v in vec_a.values()))
    mag_b = math.sqrt(sum(v**2 for v in vec_b.values()))
    if mag_a == 0 or mag_b == 0:
        return 0.0
    return dot / (mag_a * mag_b)


def build_song_vector(song: Song) -> Dict:
    """Converts a Song DB row into a sparse vector dict."""
    vec = {}
    if song.genre:
        vec[f"genre:{song.genre}"] = 1.0
    if song.mood:
        vec[f"mood:{song.mood}"] = 1.0
    if song.artist:
        vec[f"artist:{song.artist}"] = 0.7
    if song.energy is not None:
        vec["energy"] = song.energy
    return vec


def build_user_vector(user: User) -> Dict:
    """Merges a user's genre, mood, and artist affinities into one vector."""
    vec = {}
    for key, blob in [("genre", user.genre_affinities), ("mood", user.mood_affinities), ("artist", user.artist_affinities)]:
        try:
            data = json.loads(blob) if blob else {}
        except Exception:
            data = {}
        for name, weight in data.items():
            vec[f"{key}:{name}"] = float(weight)
    return vec


# --- Profile Updater (called on every interaction) ---
def update_user_profile(db: Session, user_id: str, song_id: str, interaction_type: str):
    """
    Reinforcement learning signal:
      LIKE / REPLAY → boost song attributes in user vector
      SKIP          → reduce song attributes in user vector
      PLAY          → mild boost
    """
    user = db.query(User).filter(User.id == user_id).first()
    song = db.query(Song).filter(Song.id == song_id).first()
    if not user or not song:
        return

    WEIGHTS = {"LIKE": 0.3, "REPLAY": 0.2, "PLAY": 0.05, "SKIP": -0.15, "DOWNLOAD": 0.25}
    delta = WEIGHTS.get(interaction_type, 0)

    def update_affinity(blob: str, key: str) -> str:
        try:
            data = json.loads(blob) if blob else {}
        except Exception:
            data = {}
        current = data.get(key, 0.0)
        # Clamp between -1.0 and 2.0
        data[key] = max(-1.0, min(2.0, current + delta))
        return json.dumps(data)

    if song.genre:
        user.genre_affinities = update_affinity(user.genre_affinities, song.genre)
    if song.mood:
        user.mood_affinities = update_affinity(user.mood_affinities, song.mood)
    if song.artist:
        user.artist_affinities = update_affinity(user.artist_affinities, song.artist)

    db.commit()


# --- Freshness Score ---
def freshness_score(song: Song) -> float:
    """Songs added in the last 7 days get higher freshness."""
    if not song.created_at:
        return 0.0
    age_days = (datetime.utcnow() - song.created_at).days
    if age_days <= 1:
        return 1.0
    if age_days <= 7:
        return 0.75
    if age_days <= 30:
        return 0.4
    return 0.1


# --- Main Recommendation Function ---
def get_recommendations(db: Session, user_id: str, limit: int = 30) -> List[Dict]:
    """
    Full recommendation pipeline:
    1. Get user vector
    2. Get all songs + compute scores
    3. Sort by score, group into shelves
    """
    user = db.query(User).filter(User.id == user_id).first()
    all_songs = db.query(Song).all()

    if not all_songs:
        return []

    context = get_time_context()
    preferred_moods = CONTEXT_MOOD_PREFERENCE.get(context, [])

    # Get interaction history for behavior scoring
    user_interactions = {}
    if user:
        interactions = db.query(Interaction).filter(Interaction.user_id == user_id).all()
        for ia in interactions:
            if ia.song_id not in user_interactions:
                user_interactions[ia.song_id] = []
            user_interactions[ia.song_id].append(ia.interaction_type)

    user_vec = build_user_vector(user) if user else {}

    scored_songs = []
    for song in all_songs:
        song_vec = build_song_vector(song)

        # 1. Content-based similarity
        sim_score = cosine_similarity(user_vec, song_vec) if user_vec else 0.5

        # 2. Behaviour score
        song_history = user_interactions.get(song.id, [])
        behavior = 0.5  # neutral default for new users
        if "LIKE" in song_history:
            behavior = min(1.0, behavior + 0.4)
        if "REPLAY" in song_history:
            behavior = min(1.0, behavior + 0.25)
        if "DOWNLOAD" in song_history:
            behavior = min(1.0, behavior + 0.2)
        if "SKIP" in song_history:
            behavior = max(0.0, behavior - 0.3)

        # 3. Freshness
        fresh = freshness_score(song)

        # 4. Popularity (0-1 normalized)
        pop = min(1.0, (song.popularity or 0) / 100.0)

        # 5. Context boost
        context_boost = 0.0
        if song.mood and song.mood in preferred_moods:
            idx = preferred_moods.index(song.mood)
            context_boost = 0.15 * (1 - idx * 0.4)

        final_score = (sim_score * 0.4 + behavior * 0.3 + fresh * 0.2 + pop * 0.1 + context_boost)

        scored_songs.append({
            "song": song,
            "score": final_score,
            "mood": song.mood,
            "genre": song.genre,
        })

    # Sort by score descending
    scored_songs.sort(key=lambda x: x["score"], reverse=True)

    return scored_songs[:limit]


def build_dynamic_shelves(db: Session, user_id: str) -> List[Dict]:
    """
    Groups recommendations into named shelves based on:
    - Top picks (highest scores)
    - Genre clusters (group by genre)
    - Time/Context based mood
    - Freshly added (newest songs)
    """
    scored = get_recommendations(db, user_id, limit=50)
    if not scored:
        all_songs = db.query(Song).limit(50).all()
        scored = [{"song": s, "score": 0.5, "mood": s.mood, "genre": s.genre} for s in all_songs]

    context = get_time_context()

    def song_to_dict(s: Song) -> Dict:
        """Serializes a Song object using the canonical song serializer with robust stream links."""
        from routers.songs import _serialize
        return _serialize(s)

    top_picks = [song_to_dict(item["song"]) for item in scored[:10]]

    # Genre shelf: find dominant genre
    genre_map: Dict[str, List] = {}
    for item in scored:
        g = item.get("genre") or "Unknown"
        genre_map.setdefault(g, []).append(song_to_dict(item["song"]))

    genre_shelves = []
    for genre, songs in sorted(genre_map.items(), key=lambda x: len(x[1]), reverse=True)[:3]:
        if genre and genre != "Unknown":
            genre_shelves.append({
                "id": f"shelf_genre_{genre}",
                "title": f"Best of {genre}",
                "songs": songs[:10],
            })

    # Context shelf
    mood_match = [s for s in scored if s.get("mood") in CONTEXT_MOOD_PREFERENCE.get(context, [])]
    context_shelf = {
        "id": "shelf_context",
        "title": f"Perfect for {context.capitalize()}",
        "songs": [song_to_dict(item["song"]) for item in mood_match[:10]],
    }

    # Freshness shelf
    fresh_songs = db.query(Song).order_by(Song.created_at.desc()).limit(10).all()
    fresh_shelf = {
        "id": "shelf_fresh",
        "title": "Fresh Imports",
        "songs": [song_to_dict(s) for s in fresh_songs],
    }

    user = db.query(User).filter(User.id == user_id).first()
    user_display = user.name if user and user.name and user.name != "Guest" else "You"

    # Jump Back In: recently played songs by this user
    jump_back_in_songs = []
    try:
        recent_interactions = (
            db.query(Interaction)
            .filter(Interaction.user_id == user_id, Interaction.interaction_type.in_(["PLAY", "REPLAY", "LIKE"]))
            .order_by(Interaction.timestamp.desc())
            .limit(25)
            .all()
        )
        seen_ids = set()
        recent_ids = []
        for ri in recent_interactions:
            if ri.song_id not in seen_ids:
                seen_ids.add(ri.song_id)
                recent_ids.append(ri.song_id)

        if recent_ids:
            found_songs = {s.id: s for s in db.query(Song).filter(Song.id.in_(recent_ids[:10])).all()}
            for sid in recent_ids[:10]:
                if sid in found_songs:
                    jump_back_in_songs.append(song_to_dict(found_songs[sid]))
    except Exception as e:
        logger.info(f"Jump back in resolution note: {e}")

    shelves = []
    if jump_back_in_songs:
        shelves.append({"id": "shelf_jump_back", "title": "Jump Back In", "songs": jump_back_in_songs})

    shelves.append({"id": "shelf_top", "title": f"Made For {user_display}", "songs": top_picks})
    shelves.append(context_shelf)
    shelves.extend(genre_shelves)
    shelves.append(fresh_shelf)

    # Filter empty shelves
    return [s for s in shelves if s["songs"]]


def get_vibe_queue_for_song(
    db: Session,
    seed_song_id: str,
    user_id: str = "1",
    limit: int = 30
) -> List[Dict]:
    """
    Given a seed song played by the user (first song or selected track):
    1. Analyzes the seed song's genre, mood, tempo, energy, and artist.
    2. Identifies kindred genres & vibe clusters.
    3. Scores all other songs using a multi-factor vibe similarity model.
    4. Incorporates user preferences (boosting liked artists/genres, suppressing skips).
    5. Returns an ordered queue of vibe-matching tracks.
    """
    from routers.songs import _serialize

    seed = db.query(Song).filter(Song.id == seed_song_id).first()
    all_songs = db.query(Song).all()
    if not seed or not all_songs:
        return []

    user = db.query(User).filter(User.id == user_id).first()

    # Seed attributes
    seed_genre = (seed.genre or "").strip().lower()
    seed_mood = (seed.mood or "").strip().lower()
    seed_energy = seed.energy if seed.energy is not None else 0.6
    seed_tempo = seed.tempo if seed.tempo is not None else 110.0
    seed_artist = (seed.artist or "").strip().lower()

    # Kindred genre clusters
    GENRE_CLUSTERS = {
        "lo-fi": ["lo-fi", "chillhop", "indie", "acoustic", "ambient", "romantic"],
        "acoustic": ["acoustic", "indie", "folk", "lo-fi", "romantic", "pop"],
        "romantic": ["romantic", "bollywood", "acoustic", "lo-fi", "pop"],
        "bollywood": ["bollywood", "romantic", "pop", "dance"],
        "pop": ["pop", "dance", "electronic", "bollywood"],
        "dance": ["dance", "electronic", "edm", "house", "party", "pop"],
        "electronic": ["electronic", "edm", "dance", "house", "ambient"],
        "hip-hop": ["hip-hop", "rap", "trap", "r&b"],
        "rock": ["rock", "alt-rock", "indie", "punk"],
    }
    kindred_genres = set()
    for cluster_key, group in GENRE_CLUSTERS.items():
        if cluster_key in seed_genre or any(g in seed_genre for g in group):
            kindred_genres.update(group)

    # User interactions for behavior weighting
    user_interactions = {}
    if user:
        interactions = db.query(Interaction).filter(Interaction.user_id == user_id).all()
        for ia in interactions:
            user_interactions.setdefault(ia.song_id, []).append(ia.interaction_type)

    candidates = []
    for s in all_songs:
        if s.id == seed.id:
            continue  # Exclude seed song from recommendation queue

        cand_genre = (s.genre or "").strip().lower()
        cand_mood = (s.mood or "").strip().lower()
        cand_artist = (s.artist or "").strip().lower()
        cand_energy = s.energy if s.energy is not None else 0.6
        cand_tempo = s.tempo if s.tempo is not None else 110.0

        # 1. Genre Score (0.0 to 1.0)
        genre_score = 0.15
        if seed_genre and cand_genre:
            if seed_genre == cand_genre:
                genre_score = 1.0
            elif seed_genre in cand_genre or cand_genre in seed_genre:
                genre_score = 0.9
            elif cand_genre in kindred_genres or any(kg in cand_genre for kg in kindred_genres):
                genre_score = 0.75
            else:
                genre_score = 0.2

        # 2. Mood / Vibe Score (0.0 to 1.0)
        mood_score = 0.3
        if seed_mood and cand_mood:
            if seed_mood == cand_mood:
                mood_score = 1.0
            elif (seed_mood in ["chill", "romantic"] and cand_mood in ["chill", "romantic"]) or \
                 (seed_mood in ["energetic", "party", "happy"] and cand_mood in ["energetic", "party", "happy"]) or \
                 (seed_mood in ["dark", "sad"] and cand_mood in ["dark", "sad"]):
                mood_score = 0.85
            else:
                mood_score = 0.25

        # 3. Energy proximity (0.0 to 1.0)
        energy_diff = abs(cand_energy - seed_energy)
        energy_score = max(0.0, 1.0 - (energy_diff * 2.0))

        # 4. Tempo proximity (0.0 to 1.0)
        tempo_diff = abs(cand_tempo - seed_tempo)
        tempo_score = max(0.0, 1.0 - (tempo_diff / 60.0))

        # 5. Artist Affinity
        artist_score = 0.0
        if seed_artist and cand_artist and (seed_artist in cand_artist or cand_artist in seed_artist):
            artist_score = 0.8

        # 6. User Behavior / Preference
        hist = user_interactions.get(s.id, [])
        behavior_boost = 0.0
        if "LIKE" in hist:
            behavior_boost += 0.3
        if "REPLAY" in hist:
            behavior_boost += 0.2
        if "SKIP" in hist:
            behavior_boost -= 0.4

        # Total Vibe Score: Genre 35%, Mood 30%, Energy 15%, Tempo 10%, Artist 10%
        vibe_score = (
            (genre_score * 0.35) +
            (mood_score * 0.30) +
            (energy_score * 0.15) +
            (tempo_score * 0.10) +
            (artist_score * 0.10) +
            behavior_boost
        )

        candidates.append({"song": s, "score": vibe_score})

    # Sort descending by vibe_score
    candidates.sort(key=lambda x: x["score"], reverse=True)
    return [_serialize(c["song"]) for c in candidates[:limit]]

