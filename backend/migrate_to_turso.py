import sqlite3
import requests
import json
from pathlib import Path

import os
from dotenv import load_dotenv

load_dotenv()

TURSO_URL = (os.getenv("TURSO_DB_URL") or "").rstrip("/") + "/v2/pipeline"
TOKEN = os.getenv("TURSO_AUTH_TOKEN", "")

HEADERS = {
    "Authorization": f"Bearer {TOKEN}",
    "Content-Type": "application/json",
}

def to_arg(val):
    if val is None:
        return {"type": "null"}
    elif isinstance(val, (int, bool)):
        return {"type": "integer", "value": str(int(val))}
    elif isinstance(val, float):
        return {"type": "float", "value": val}
    else:
        return {"type": "text", "value": str(val)}

def execute_pipeline(stmts_with_args):
    requests_payload = []
    for stmt, args in stmts_with_args:
        payload = {"sql": stmt}
        if args:
            payload["args"] = [to_arg(a) for a in args]
        requests_payload.append({
            "type": "execute",
            "stmt": payload
        })
    requests_payload.append({"type": "close"})
    
    resp = requests.post(TURSO_URL, json={"requests": requests_payload}, headers=HEADERS)
    if resp.status_code != 200:
        raise Exception(f"Turso HTTP Error {resp.status_code}: {resp.text}")
    data = resp.json()
    for i, res in enumerate(data.get("results", [])):
        if res.get("type") == "error":
            stmt_sql = requests_payload[i].get("stmt", {}).get("sql", "N/A") if i < len(requests_payload) else "N/A"
            raise Exception(f"Turso Error at step {i}: {res.get('error')}\nSQL: {stmt_sql}")
    return data

def main():
    print("[*] Connecting to Turso Cloud Database...")
    
    # 1. Create Tables
    ddl_statements = [
        """
        CREATE TABLE IF NOT EXISTS artists (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            bio TEXT,
            image_url TEXT,
            verified INTEGER DEFAULT 1,
            monthly_listeners INTEGER DEFAULT 1250000
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS albums (
            id TEXT PRIMARY KEY,
            artist_id TEXT,
            title TEXT NOT NULL,
            cover_url TEXT,
            release_date TEXT,
            type TEXT DEFAULT 'album',
            FOREIGN KEY (artist_id) REFERENCES artists (id)
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS songs (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            artist TEXT NOT NULL,
            artist_id TEXT,
            album TEXT,
            album_id TEXT,
            genre TEXT,
            mood TEXT,
            tempo REAL,
            energy REAL,
            popularity REAL DEFAULT 50.0,
            play_count INTEGER DEFAULT 0,
            duration REAL,
            audio_path TEXT NOT NULL,
            cover_path TEXT,
            source_url TEXT,
            thumbnail_url TEXT,
            lyrics_lrc TEXT,
            created_at TEXT,
            FOREIGN KEY (artist_id) REFERENCES artists (id),
            FOREIGN KEY (album_id) REFERENCES albums (id)
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT UNIQUE,
            avatar_url TEXT,
            genre_affinities TEXT DEFAULT '{}',
            mood_affinities TEXT DEFAULT '{}',
            artist_affinities TEXT DEFAULT '{}',
            created_at TEXT
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS playlists (
            id TEXT PRIMARY KEY,
            owner_id TEXT DEFAULT '1',
            name TEXT NOT NULL,
            description TEXT,
            cover_url TEXT,
            is_public INTEGER DEFAULT 1,
            created_at TEXT,
            updated_at TEXT,
            FOREIGN KEY (owner_id) REFERENCES users (id)
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS playlist_tracks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            playlist_id TEXT NOT NULL,
            song_id TEXT NOT NULL,
            position INTEGER DEFAULT 0,
            added_at TEXT,
            FOREIGN KEY (playlist_id) REFERENCES playlists (id),
            FOREIGN KEY (song_id) REFERENCES songs (id)
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS liked_songs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT DEFAULT '1',
            song_id TEXT NOT NULL,
            created_at TEXT,
            FOREIGN KEY (user_id) REFERENCES users (id),
            FOREIGN KEY (song_id) REFERENCES songs (id)
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS interactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            song_id TEXT NOT NULL,
            interaction_type TEXT NOT NULL,
            context TEXT,
            timestamp TEXT,
            FOREIGN KEY (user_id) REFERENCES users (id),
            FOREIGN KEY (song_id) REFERENCES songs (id)
        );
        """
    ]
    
    print("[*] Creating schema on Turso...")
    execute_pipeline([(stmt, None) for stmt in ddl_statements])
    print("[+] Schema created successfully on Turso!")
    
    # 2. Check local SQLite DB
    local_db_path = Path(__file__).parent / "local_storage" / "music.db"
    if local_db_path.exists():
        print(f"[*] Migrating existing records from local SQLite ({local_db_path})...")
        conn = sqlite3.connect(local_db_path)
        cur = conn.cursor()
        
        # Migrate Users
        try:
            users = cur.execute("SELECT id, name, email, avatar_url, genre_affinities, mood_affinities, artist_affinities, created_at FROM users").fetchall()
            if users:
                user_ops = [
                    (
                        "INSERT OR REPLACE INTO users (id, name, email, avatar_url, genre_affinities, mood_affinities, artist_affinities, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?);",
                        [u[0], u[1], u[2], u[3], u[4], u[5], u[6], u[7]]
                    )
                    for u in users
                ]
                execute_pipeline(user_ops)
                print(f"  [+] Migrated {len(users)} users.")
        except Exception as e:
            print(f"  [-] Users migration notice: {e}")
        
        # Migrate Artists
        try:
            artists = cur.execute("SELECT id, name, bio, image_url, verified, monthly_listeners FROM artists").fetchall()
            if artists:
                artist_ops = [
                    (
                        "INSERT OR REPLACE INTO artists (id, name, bio, image_url, verified, monthly_listeners) VALUES (?, ?, ?, ?, ?, ?);",
                        [a[0], a[1], a[2], a[3], a[4], a[5]]
                    )
                    for a in artists
                ]
                execute_pipeline(artist_ops)
                print(f"  [+] Migrated {len(artists)} artists.")
        except Exception as e:
            print(f"  [-] Artists migration notice: {e}")
            
        # Migrate Albums
        try:
            albums = cur.execute("SELECT id, artist_id, title, cover_url, release_date, type FROM albums").fetchall()
            if albums:
                album_ops = [
                    (
                        "INSERT OR REPLACE INTO albums (id, artist_id, title, cover_url, release_date, type) VALUES (?, ?, ?, ?, ?, ?);",
                        [al[0], al[1], al[2], al[3], al[4], al[5]]
                    )
                    for al in albums
                ]
                execute_pipeline(album_ops)
                print(f"  [+] Migrated {len(albums)} albums.")
        except Exception as e:
            print(f"  [-] Albums migration notice: {e}")

        # Migrate Songs
        try:
            songs = cur.execute("SELECT id, title, artist, artist_id, album, album_id, genre, mood, tempo, energy, popularity, play_count, duration, audio_path, cover_path, source_url, thumbnail_url, lyrics_lrc, created_at FROM songs").fetchall()
            if songs:
                for i in range(0, len(songs), 20):
                    batch = songs[i:i+20]
                    song_ops = [
                        (
                            "INSERT OR REPLACE INTO songs (id, title, artist, artist_id, album, album_id, genre, mood, tempo, energy, popularity, play_count, duration, audio_path, cover_path, source_url, thumbnail_url, lyrics_lrc, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);",
                            [
                                s[0], s[1], s[2], s[3], s[4], s[5],
                                s[6], s[7], s[8], s[9], s[10], s[11],
                                s[12], s[13], s[14], s[15], s[16], s[17], s[18]
                            ]
                        )
                        for s in batch
                    ]
                    execute_pipeline(song_ops)
                print(f"  [+] Migrated {len(songs)} songs.")
        except Exception as e:
            print(f"  [-] Songs migration notice: {e}")

        # Migrate Playlists
        try:
            playlists = cur.execute("SELECT id, owner_id, name, description, cover_url, is_public, created_at, updated_at FROM playlists").fetchall()
            if playlists:
                playlist_ops = [
                    (
                        "INSERT OR REPLACE INTO playlists (id, owner_id, name, description, cover_url, is_public, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?);",
                        [p[0], p[1], p[2], p[3], p[4], p[5], p[6], p[7]]
                    )
                    for p in playlists
                ]
                execute_pipeline(playlist_ops)
                print(f"  [+] Migrated {len(playlists)} playlists.")
        except Exception as e:
            print(f"  [-] Playlists migration notice: {e}")

        # Migrate Playlist Tracks
        try:
            tracks = cur.execute("SELECT id, playlist_id, song_id, position, added_at FROM playlist_tracks").fetchall()
            if tracks:
                for i in range(0, len(tracks), 25):
                    batch = tracks[i:i+25]
                    track_ops = [
                        (
                            "INSERT OR REPLACE INTO playlist_tracks (id, playlist_id, song_id, position, added_at) VALUES (?, ?, ?, ?, ?);",
                            [t[0], t[1], t[2], t[3], t[4]]
                        )
                        for t in batch
                    ]
                    execute_pipeline(track_ops)
                print(f"  [+] Migrated {len(tracks)} playlist tracks.")
        except Exception as e:
            print(f"  [-] Playlist tracks migration notice: {e}")

        # Migrate Liked Songs
        try:
            likes = cur.execute("SELECT id, user_id, song_id, created_at FROM liked_songs").fetchall()
            if likes:
                like_ops = [
                    (
                        "INSERT OR REPLACE INTO liked_songs (id, user_id, song_id, created_at) VALUES (?, ?, ?, ?);",
                        [l[0], l[1], l[2], l[3]]
                    )
                    for l in likes
                ]
                execute_pipeline(like_ops)
                print(f"  [+] Migrated {len(likes)} liked songs.")
        except Exception as e:
            print(f"  [-] Liked songs migration notice: {e}")

        conn.close()

    # 3. Verify Turso row counts
    check_resp = execute_pipeline([
        ("SELECT count(*) as count FROM songs;", None),
        ("SELECT count(*) as count FROM playlists;", None),
        ("SELECT count(*) as count FROM artists;", None)
    ])
    
    songs_count = check_resp["results"][0]["response"]["result"]["rows"][0][0]["value"]
    playlists_count = check_resp["results"][1]["response"]["result"]["rows"][0][0]["value"]
    artists_count = check_resp["results"][2]["response"]["result"]["rows"][0][0]["value"]
    
    print("\n========================================================")
    print("  TURSO CLOUD DEPLOYMENT VERIFICATION SUCCESSFUL")
    print(f"  Total Artists:   {artists_count}")
    print(f"  Total Songs:     {songs_count}")
    print(f"  Total Playlists: {playlists_count}")
    print("========================================================")

if __name__ == "__main__":
    main()
