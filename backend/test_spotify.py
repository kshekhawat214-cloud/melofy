
import os
import spotipy
from spotipy.oauth2 import SpotifyClientCredentials
from dotenv import load_dotenv
from pathlib import Path

BASE_DIR = Path("a:/projects/Spotify/backend")
load_dotenv(BASE_DIR / ".env.local")

cid = os.getenv("SPOTIFY_CLIENT_ID")
secret = os.getenv("SPOTIFY_CLIENT_SECRET")

print(f"CID: {cid[:5]}...")
print(f"Secret: {secret[:5]}...")

sp = spotipy.Spotify(auth_manager=SpotifyClientCredentials(client_id=cid, client_secret=secret))

playlist_id = "2Z1k7OlY40D4y5tWzzXsvA"
print(f"Fetching playlist: {playlist_id}")

try:
    results = sp.playlist_tracks(playlist_id)
    print(f"Results type: {type(results)}")
    if results:
        items = results.get('items', [])
        print(f"Found {len(items)} items in first page")
        for i, item in enumerate(items[:5]):
            track = item.get('track')
            if track:
                print(f"  {i+1}. {track.get('name')} - {track.get('artists')[0].get('name')}")
            else:
                print(f"  {i+1}. [No track info]")
    else:
        print("Results is empty or None")
except Exception as e:
    print(f"Error: {e}")
