"""
Two-Way Sync Utility for Turso Edge SQLite Cloud <-> Local SQLite Database.
Usage:
    python sync_turso.py status   # Shows song & playlist count in local vs Turso cloud
    python sync_turso.py push     # Pushes local songs & playlists up to Turso
    python sync_turso.py pull     # Pulls cloud songs & playlists down to local SQLite
"""
import sys
import os
import json
import sqlite3
import requests
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

TURSO_URL = (os.getenv("TURSO_DB_URL") or "").rstrip("/") + "/v2/pipeline"
TOKEN = os.getenv("TURSO_AUTH_TOKEN", "")

HEADERS = {
    "Authorization": f"Bearer {TOKEN}",
    "Content-Type": "application/json",
}

LOCAL_DB_PATH = Path(__file__).parent / "local_storage" / "music.db"

def to_arg(val):
    if val is None:
        return {"type": "null"}
    elif isinstance(val, (int, bool)):
        return {"type": "integer", "value": str(int(val))}
    elif isinstance(val, float):
        return {"type": "float", "value": val}
    else:
        return {"type": "text", "value": str(val)}

def execute_turso_pipeline(stmts_with_args):
    requests_payload = []
    for stmt, args in stmts_with_args:
        payload = {"sql": stmt}
        if args:
            payload["args"] = [to_arg(a) for a in args]
        requests_payload.append({"type": "execute", "stmt": payload})
    requests_payload.append({"type": "close"})
    
    resp = requests.post(TURSO_URL, json={"requests": requests_payload}, headers=HEADERS)
    if resp.status_code != 200:
        raise Exception(f"Turso HTTP Error {resp.status_code}: {resp.text}")
    data = resp.json()
    for i, res in enumerate(data.get("results", [])):
        if res.get("type") == "error":
            raise Exception(f"Turso SQL Error at step {i}: {res.get('error')}")
    return data

def get_counts():
    # Local
    conn = sqlite3.connect(LOCAL_DB_PATH)
    cur = conn.cursor()
    local_songs = cur.execute("SELECT count(*) FROM songs;").fetchone()[0]
    local_playlists = cur.execute("SELECT count(*) FROM playlists;").fetchone()[0]
    local_artists = cur.execute("SELECT count(*) FROM artists;").fetchone()[0]
    conn.close()

    # Cloud
    res = execute_turso_pipeline([
        ("SELECT count(*) FROM songs;", None),
        ("SELECT count(*) FROM playlists;", None),
        ("SELECT count(*) FROM artists;", None)
    ])
    cloud_songs = int(res["results"][0]["response"]["result"]["rows"][0][0]["value"])
    cloud_playlists = int(res["results"][1]["response"]["result"]["rows"][0][0]["value"])
    cloud_artists = int(res["results"][2]["response"]["result"]["rows"][0][0]["value"])

    return {
        "local": {"songs": local_songs, "playlists": local_playlists, "artists": local_artists},
        "cloud": {"songs": cloud_songs, "playlists": cloud_playlists, "artists": cloud_artists}
    }

def print_status():
    counts = get_counts()
    print("\n========================================================")
    print("           TURSO CLOUD <-> LOCAL SYNC STATUS            ")
    print("========================================================")
    print(f"  {'Entity':<15} | {'Local SQLite':<15} | {'Turso Cloud':<15}")
    print("  " + "-" * 50)
    print(f"  {'Songs':<15} | {counts['local']['songs']:<15} | {counts['cloud']['songs']:<15}")
    print(f"  {'Playlists':<15} | {counts['local']['playlists']:<15} | {counts['cloud']['playlists']:<15}")
    print(f"  {'Artists':<15} | {counts['local']['artists']:<15} | {counts['cloud']['artists']:<15}")
    print("========================================================\n")

def pull_from_turso():
    print("[*] Pulling latest catalog from Turso Cloud to local SQLite...")
    res = execute_turso_pipeline([
        ("SELECT id, title, artist, artist_id, album, album_id, genre, mood, tempo, energy, popularity, play_count, duration, audio_path, cover_path, source_url, thumbnail_url, lyrics_lrc, created_at FROM songs;", None)
    ])
    raw_rows = res["results"][0]["response"]["result"]["rows"]
    
    conn = sqlite3.connect(LOCAL_DB_PATH)
    cur = conn.cursor()
    saved = 0
    for r in raw_rows:
        vals = [col.get("value") for col in r]
        cur.execute("""
            INSERT OR REPLACE INTO songs (
                id, title, artist, artist_id, album, album_id, genre, mood, tempo, energy, popularity, play_count, duration, audio_path, cover_path, source_url, thumbnail_url, lyrics_lrc, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        """, vals)
        saved += 1
    conn.commit()
    conn.close()
    print(f"[+] Successfully synchronized {saved} songs to local database!")

if __name__ == "__main__":
    action = sys.argv[1] if len(sys.argv) > 1 else "status"
    if action == "status":
        print_status()
    elif action == "push":
        from migrate_to_turso import main as push_main
        push_main()
    elif action == "pull":
        pull_from_turso()
    else:
        print("Usage: python sync_turso.py [status|push|pull]")
