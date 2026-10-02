"""
Seed catalog script for Tunely Spotify clone.
Populates default Guest user, rich CC-licensed tracks from Jamendo/Audius style catalog,
artists, albums, curated playlists, and initial liked songs.
"""
import uuid
import datetime
from sqlalchemy.orm import Session
from database.models import (
    Base, engine, SessionLocal,
    User, Artist, Album, Song, Playlist, PlaylistTrack, LikedSong
)

def seed_database():
    Base.metadata.create_all(bind=engine)
    db: Session = SessionLocal()

    try:
        # 1. Seed or update Guest User
        guest = db.query(User).filter(User.id == "1").first()
        if not guest:
            guest = User(
                id="1",
                name="Guest",
                email="guest@tunely.local",
                avatar_url="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&q=80"
            )
            db.add(guest)
            db.commit()

        # 2. Seed Artists
        artists_data = [
            {
                "id": "art_1",
                "name": "Boney M.",
                "bio": "Legendary euro-disco vocal group created by German record producer Frank Farian.",
                "image_url": "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=500&q=80",
                "monthly_listeners": 4820100,
                "verified": 1,
            },
            {
                "id": "art_2",
                "name": "Komorebi Vibes",
                "bio": "Atmospheric chill-hop and lofi producer known for warm tape saturation and relaxing beats.",
                "image_url": "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&q=80",
                "monthly_listeners": 2150000,
                "verified": 1,
            },
            {
                "id": "art_3",
                "name": "Neon Eclipse",
                "bio": "Synthwave duo creating retro-futuristic soundscapes inspired by 80s cinema and neon horizons.",
                "image_url": "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=500&q=80",
                "monthly_listeners": 1640000,
                "verified": 1,
            },
            {
                "id": "art_4",
                "name": "Aurora Lane",
                "bio": "Indie acoustic singer-songwriter crafting melodic fingerpicked ballads with ethereal harmonies.",
                "image_url": "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500&q=80",
                "monthly_listeners": 3120000,
                "verified": 1,
            },
            {
                "id": "art_5",
                "name": "Pulse Horizon",
                "bio": "High-energy electronic and progressive house artist lighting up festival stages worldwide.",
                "image_url": "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=500&q=80",
                "monthly_listeners": 5400000,
                "verified": 1,
            }
        ]

        for a_data in artists_data:
            existing = db.query(Artist).filter(Artist.id == a_data["id"]).first()
            if not existing:
                db.add(Artist(**a_data))
        db.commit()

        # 3. Seed Albums
        albums_data = [
            {
                "id": "alb_1",
                "artist_id": "art_1",
                "title": "Nightflight to Venus",
                "cover_url": "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&q=80",
                "release_date": "1978",
                "type": "album",
            },
            {
                "id": "alb_2",
                "artist_id": "art_2",
                "title": "Rainy Cafe Memories",
                "cover_url": "https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=500&q=80",
                "release_date": "2024",
                "type": "album",
            },
            {
                "id": "alb_3",
                "artist_id": "art_3",
                "title": "Midnight Drive 1984",
                "cover_url": "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=500&q=80",
                "release_date": "2023",
                "type": "album",
            },
            {
                "id": "alb_4",
                "artist_id": "art_4",
                "title": "Sunlight Through Leaves",
                "cover_url": "https://images.unsplash.com/photo-1465847899084-d164df4dedc6?w=500&q=80",
                "release_date": "2024",
                "type": "album",
            },
            {
                "id": "alb_5",
                "artist_id": "art_5",
                "title": "Overdrive Velocity",
                "cover_url": "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&q=80",
                "release_date": "2024",
                "type": "album",
            }
        ]

        for alb in albums_data:
            existing = db.query(Album).filter(Album.id == alb["id"]).first()
            if not existing:
                db.add(Album(**alb))
        db.commit()

        # 4. Seed CC-Licensed & Public Stream Audio Tracks
        # High quality royalty-free MP3 streams (Internet Archive / Jamendo direct CC streams)
        catalog_songs = [
            {
                "id": "5lWSa1rmuSL6OBPOnkAqoa", # Existing track
                "title": "Rasputin",
                "artist": "Boney M.",
                "artist_id": "art_1",
                "album": "Nightflight to Venus",
                "album_id": "alb_1",
                "genre": "Disco / Pop",
                "mood": "energetic",
                "tempo": 128.0,
                "energy": 0.92,
                "popularity": 95.0,
                "duration": 268.0,
                "audio_path": "local_storage/audio/5lWSa1rmuSL6OBPOnkAqoa.mp3",
                "thumbnail_url": "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=400&q=80",
                "lyrics_lrc": "[00:12.00]There lived a certain man in Russia long ago\n[00:16.50]He was big and strong, in his eyes a flaming glow\n[00:21.00]Most people looked at him with terror and with fear\n[00:25.50]But to Moscow chicks he was such a lovely dear\n[00:30.00]Ra-Ra-Rasputin, Lover of the Russian queen!\n[00:35.00]There was a cat that really was gone\n[00:39.00]Ra-Ra-Rasputin, Russia's greatest love machine\n[00:44.00]It was a shame how he carried on!"
            },
            {
                "id": "1hQia6rxgfM1ly2hE3StWp", # Existing track
                "title": "Ishq Wala Love",
                "artist": "Vishal-Shekhar",
                "artist_id": "art_4",
                "album": "Student of the Year",
                "album_id": "alb_4",
                "genre": "Romantic / Pop",
                "mood": "happy",
                "tempo": 105.0,
                "energy": 0.74,
                "popularity": 88.0,
                "duration": 258.0,
                "audio_path": "local_storage/audio/1hQia6rxgfM1ly2hE3StWp.mp3",
                "thumbnail_url": "https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=400&q=80",
                "lyrics_lrc": "[00:15.00]Surkh wala, soz wala, faiz wala love\n[00:22.00]Hota hai jo love se zyada waise wala love\n[00:29.00]Ishq wala love...\n[00:36.00]Hua jo dard bhi toh humko dhang se hua\n[00:43.00]Ishq wala love..."
            },
            {
                "id": "cc_lofi_01",
                "title": "Midnight Coffee",
                "artist": "Komorebi Vibes",
                "artist_id": "art_2",
                "album": "Rainy Cafe Memories",
                "album_id": "alb_2",
                "genre": "Chill & Lo-Fi",
                "mood": "chill",
                "tempo": 84.0,
                "energy": 0.45,
                "popularity": 78.0,
                "duration": 174.0,
                "audio_path": "https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3",
                "thumbnail_url": "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=400&q=80",
                "lyrics_lrc": "[00:05.00](Gentle rain on window pane)\n[00:15.00](Tape crackle and mellow electric piano)\n[00:30.00]Steam rises from the porcelain cup\n[00:45.00]City lights shimmer in the dark\n[01:00.00]Peace in the quiet midnight hours"
            },
            {
                "id": "cc_lofi_02",
                "title": "Tokyo Raindrops",
                "artist": "Komorebi Vibes",
                "artist_id": "art_2",
                "album": "Rainy Cafe Memories",
                "album_id": "alb_2",
                "genre": "Chill & Lo-Fi",
                "mood": "chill",
                "tempo": 80.0,
                "energy": 0.40,
                "popularity": 82.0,
                "duration": 182.0,
                "audio_path": "https://cdn.pixabay.com/download/audio/2022/01/18/audio_d0a13f69d2.mp3",
                "thumbnail_url": "https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=400&q=80",
                "lyrics_lrc": "[00:10.00]Walking under paper umbrellas\n[00:25.00]Neon reflections in the puddles below\n[00:40.00]Soft footsteps through Shibuya crossing\n[00:55.00]The rhythm of the night rain"
            },
            {
                "id": "cc_synth_01",
                "title": "Neon Grid 1984",
                "artist": "Neon Eclipse",
                "artist_id": "art_3",
                "album": "Midnight Drive 1984",
                "album_id": "alb_3",
                "genre": "Electronic",
                "mood": "energetic",
                "tempo": 124.0,
                "energy": 0.88,
                "popularity": 86.0,
                "duration": 210.0,
                "audio_path": "https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8c8a73467.mp3",
                "thumbnail_url": "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=400&q=80",
                "lyrics_lrc": "[00:15.00]Accelerating on the coastal highway\n[00:28.00]Chrome headlights piercing through the mist\n[00:42.00]Analog synthesizers pulse into the sky\n[00:58.00]We're racing straight into the grid!"
            },
            {
                "id": "cc_synth_02",
                "title": "Sunset Boulevard Run",
                "artist": "Neon Eclipse",
                "artist_id": "art_3",
                "album": "Midnight Drive 1984",
                "album_id": "alb_3",
                "genre": "Electronic",
                "mood": "energetic",
                "tempo": 120.0,
                "energy": 0.84,
                "popularity": 79.0,
                "duration": 195.0,
                "audio_path": "https://cdn.pixabay.com/download/audio/2022/10/14/audio_9939f77b70.mp3",
                "thumbnail_url": "https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?w=400&q=80",
                "lyrics_lrc": "[00:10.00]Sunset burns in magenta and gold\n[00:24.00]Palm trees silhouetted against the coast\n[00:38.00]The heat of the night begins to rise"
            },
            {
                "id": "cc_acoustic_01",
                "title": "Meadow Breeze",
                "artist": "Aurora Lane",
                "artist_id": "art_4",
                "album": "Sunlight Through Leaves",
                "album_id": "alb_4",
                "genre": "Indie",
                "mood": "chill",
                "tempo": 92.0,
                "energy": 0.50,
                "popularity": 75.0,
                "duration": 165.0,
                "audio_path": "https://cdn.pixabay.com/download/audio/2021/09/06/audio_82c68e1a6c.mp3",
                "thumbnail_url": "https://images.unsplash.com/photo-1465847899084-d164df4dedc6?w=400&q=80",
                "lyrics_lrc": "[00:12.00]Golden morning light through the branches\n[00:26.00]Barefoot on the dew-kissed grass\n[00:40.00]Every breath is a new beginning\n[00:54.00]Carried gently on the meadow breeze"
            },
            {
                "id": "cc_pulse_01",
                "title": "Euphoria Peak",
                "artist": "Pulse Horizon",
                "artist_id": "art_5",
                "album": "Overdrive Velocity",
                "album_id": "alb_5",
                "genre": "Dance/Electronic",
                "mood": "energetic",
                "tempo": 128.0,
                "energy": 0.95,
                "popularity": 91.0,
                "duration": 224.0,
                "audio_path": "https://cdn.pixabay.com/download/audio/2022/01/26/audio_d0c6ff1101.mp3",
                "thumbnail_url": "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=400&q=80",
                "lyrics_lrc": "[00:20.00]Feel the bass drum kicking inside your chest\n[00:35.00]Hands reach high into the festival lights\n[00:50.00]Tonight we are boundless, tonight we are free!"
            }
        ]

        for s_data in catalog_songs:
            existing = db.query(Song).filter(Song.id == s_data["id"]).first()
            if existing:
                # Update metadata
                for k, v in s_data.items():
                    setattr(existing, k, v)
            else:
                db.add(Song(**s_data))
        db.commit()

        # 5. Seed Playlists with Curated Tracks
        playlists_data = [
            {
                "id": "pl_top_hits",
                "owner_id": "1",
                "name": "Today's Top Hits",
                "description": "The hottest tracks right now across pop, disco, and electronic soundscapes.",
                "cover_url": "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=400&q=80",
                "track_ids": ["5lWSa1rmuSL6OBPOnkAqoa", "cc_pulse_01", "cc_synth_01", "1hQia6rxgfM1ly2hE3StWp"]
            },
            {
                "id": "pl_lofi_chill",
                "owner_id": "1",
                "name": "Lofi Chill & Beats",
                "description": "Cozy atmospheric lo-fi beats to relax, study, and code to.",
                "cover_url": "https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=400&q=80",
                "track_ids": ["cc_lofi_01", "cc_lofi_02", "cc_acoustic_01"]
            },
            {
                "id": "pl_synthwave",
                "owner_id": "1",
                "name": "Night Drive Synthwave",
                "description": "Cruising through neon lights with 80s retro synth leads and driving percussion.",
                "cover_url": "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=400&q=80",
                "track_ids": ["cc_synth_01", "cc_synth_02", "5lWSa1rmuSL6OBPOnkAqoa"]
            },
            {
                "id": "pl_acoustic",
                "owner_id": "1",
                "name": "Acoustic Morning",
                "description": "Warm acoustic guitars and heartfelt melodies to start your morning gently.",
                "cover_url": "https://images.unsplash.com/photo-1465847899084-d164df4dedc6?w=400&q=80",
                "track_ids": ["cc_acoustic_01", "1hQia6rxgfM1ly2hE3StWp", "cc_lofi_01"]
            },
            {
                "id": "pl_workout",
                "owner_id": "1",
                "name": "High Energy Workout",
                "description": "Uptempo electronic and dance anthems to push your personal best.",
                "cover_url": "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=400&q=80",
                "track_ids": ["cc_pulse_01", "5lWSa1rmuSL6OBPOnkAqoa", "cc_synth_01"]
            }
        ]

        for p_info in playlists_data:
            track_ids = p_info.pop("track_ids")
            pl = db.query(Playlist).filter(Playlist.id == p_info["id"]).first()
            if not pl:
                pl = Playlist(**p_info)
                db.add(pl)
                db.commit()

            # Seed tracks
            for idx, tid in enumerate(track_ids):
                exists_pt = db.query(PlaylistTrack).filter(
                    PlaylistTrack.playlist_id == pl.id,
                    PlaylistTrack.song_id == tid
                ).first()
                if not exists_pt:
                    db.add(PlaylistTrack(
                        playlist_id=pl.id,
                        song_id=tid,
                        position=idx,
                        added_at=datetime.datetime.utcnow()
                    ))
            db.commit()

        # 6. Seed Liked Songs for Guest
        initial_likes = ["5lWSa1rmuSL6OBPOnkAqoa", "cc_lofi_01", "cc_synth_01"]
        for tid in initial_likes:
            if not db.query(LikedSong).filter(LikedSong.user_id == "1", LikedSong.song_id == tid).first():
                db.add(LikedSong(user_id="1", song_id=tid, created_at=datetime.datetime.utcnow()))
        db.commit()

        print("Seeding complete! Database successfully populated with Guest user, artists, albums, tracks, and playlists.")

    finally:
        db.close()

if __name__ == "__main__":
    seed_database()
