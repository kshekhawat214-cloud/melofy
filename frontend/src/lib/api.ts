import { APP_CONFIG } from "@/config"

export const API_BASE = APP_CONFIG.apiBase

export interface Song {
  id: string
  title: string
  artist: string
  artistId?: string
  album?: string
  albumId?: string
  genre?: string
  mood?: string
  energy?: number
  duration?: number
  thumbnailUrl?: string
  streamUrl: string
  downloadUrl: string
  coverUrl: string
  lyricsLrc?: string
  addedAt?: string
  isCached?: boolean
}

export interface Artist {
  id: string
  name: string
  bio?: string
  imageUrl?: string
  verified: boolean
  monthlyListeners: number
  topTracks?: Song[]
  albums?: Album[]
}

export interface Album {
  id: string
  title: string
  coverUrl: string
  artist: string
  artistId?: string
  releaseDate?: string
  type?: string
  songCount?: number
  totalDuration?: number
  tracks?: Song[]
}

export interface Playlist {
  id: string
  name: string
  description?: string
  coverUrl?: string
  owner: string
  ownerUsername?: string
  ownerId?: string
  isOwner?: boolean
  isSaved?: boolean
  isPublic?: boolean
  songCount: number
  totalDuration: number
  createdAt?: string
  updatedAt?: string
  tracks?: Song[]
}

export interface Shelf {
  id: string
  title: string
  songs: Song[]
}

export interface Genre {
  id: string
  name: string
  color: string
  gradient?: string
  image?: string
}

export interface SearchResult {
  query: string
  topResult?: {
    type: "song" | "artist"
    id: string
    title: string
    subtitle: string
    coverUrl: string
    raw?: Song
  }
  songs: Song[]
  artists: Artist[]
  albums: Album[]
  playlists: Playlist[]
}

export interface UserProfile {
  id: string
  displayName: string
  avatarUrl: string
  publicPlaylistsCount: number
  likedSongsCount: number
  followersCount: number
  followingCount: number
}

export interface UserSettings {
  displayName: string
  audioQuality: string
  crossfadeMs: number
  autoplay: boolean
  accentColor: string
}

export function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("melofy_auth_token")
    if (token) {
      headers["Authorization"] = `Bearer ${token}`
    }
    const userStr = localStorage.getItem("melofy_auth_user")
    if (userStr) {
      try {
        const u = JSON.parse(userStr)
        if (u?.id) headers["X-User-Id"] = u.id
      } catch {}
    }
  }
  return headers
}

export function getCurrentUserId(): string {
  if (typeof window !== "undefined") {
    const userStr = localStorage.getItem("melofy_auth_user")
    if (userStr) {
      try {
        const u = JSON.parse(userStr)
        if (u?.id) return u.id
      } catch {}
    }
  }
  return "1"
}

// --- Home Feed & Songs ---
export async function getHomeFeed(userId?: string): Promise<Shelf[]> {
  try {
    const uid = userId || getCurrentUserId()
    const res = await fetch(`${API_BASE}/api/home/${uid}`, {
      headers: getAuthHeaders(),
      cache: "no-store",
    })
    if (!res.ok) throw new Error("Failed to fetch home feed")
    const data = await res.json()
    return data.shelves as Shelf[]
  } catch {
    return []
  }
}

export async function getAllSongs(): Promise<Song[]> {
  try {
    const res = await fetch(`${API_BASE}/api/songs`, { cache: "no-store" })
    if (!res.ok) return []
    return res.json()
  } catch {
    return []
  }
}

export async function getSong(songId: string): Promise<Song | null> {
  try {
    const res = await fetch(`${API_BASE}/api/songs/${songId}`, { cache: "no-store" })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

// --- Playlists API ---
export async function getPlaylists(userId?: string): Promise<Playlist[]> {
  try {
    const uid = userId || getCurrentUserId()
    const res = await fetch(`${API_BASE}/api/playlists?user_id=${encodeURIComponent(uid)}`, {
      headers: getAuthHeaders(),
      cache: "no-store",
    })
    if (!res.ok) return []
    return res.json()
  } catch {
    return []
  }
}

export async function getPlaylist(playlistId: string): Promise<Playlist | null> {
  try {
    const res = await fetch(`${API_BASE}/api/playlists/${playlistId}`, {
      headers: getAuthHeaders(),
      cache: "no-store",
    })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export async function createPlaylist(data: { name: string; description?: string; cover_url?: string }, userId?: string): Promise<Playlist | null> {
  try {
    const uid = userId || getCurrentUserId()
    const res = await fetch(`${API_BASE}/api/playlists?user_id=${encodeURIComponent(uid)}`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export async function updatePlaylist(playlistId: string, data: { name?: string; description?: string; cover_url?: string }): Promise<Playlist | null> {
  try {
    const res = await fetch(`${API_BASE}/api/playlists/${playlistId}`, {
      method: "PATCH",
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export async function deletePlaylist(playlistId: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/playlists/${playlistId}`, {
      method: "DELETE",
      headers: getAuthHeaders(),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function addTrackToPlaylist(playlistId: string, songId: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/playlists/${playlistId}/tracks`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ song_id: songId }),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function removeTrackFromPlaylist(playlistId: string, songId: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/playlists/${playlistId}/tracks/${songId}`, {
      method: "DELETE",
      headers: getAuthHeaders(),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function savePlaylist(playlistId: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/playlists/${playlistId}/save`, {
      method: "POST",
      headers: getAuthHeaders(),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function unsavePlaylist(playlistId: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/playlists/${playlistId}/save`, {
      method: "DELETE",
      headers: getAuthHeaders(),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function clonePlaylist(playlistId: string): Promise<Playlist | null> {
  try {
    const res = await fetch(`${API_BASE}/api/playlists/${playlistId}/clone`, {
      method: "POST",
      headers: getAuthHeaders(),
    })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export async function getVibeQueue(songId: string, userId?: string): Promise<Song[]> {
  try {
    const uid = userId || getCurrentUserId()
    const res = await fetch(`${API_BASE}/api/recommendations/vibe-queue/${songId}?user_id=${encodeURIComponent(uid)}`, {
      headers: getAuthHeaders(),
      cache: "no-store",
    })
    if (!res.ok) return []
    const data = await res.json()
    return data.songs || []
  } catch {
    return []
  }
}

// --- Liked Songs API ---
export async function getLikedSongs(userId?: string): Promise<{ songs: Song[]; songCount: number; totalDuration: number }> {
  try {
    const uid = userId || getCurrentUserId()
    const res = await fetch(`${API_BASE}/api/me/liked?user_id=${encodeURIComponent(uid)}`, {
      headers: getAuthHeaders(),
      cache: "no-store",
    })
    if (!res.ok) return { songs: [], songCount: 0, totalDuration: 0 }
    return res.json()
  } catch {
    return { songs: [], songCount: 0, totalDuration: 0 }
  }
}

export async function getLikedSongIds(userId?: string): Promise<string[]> {
  try {
    const uid = userId || getCurrentUserId()
    const res = await fetch(`${API_BASE}/api/me/liked/ids?user_id=${encodeURIComponent(uid)}`, {
      headers: getAuthHeaders(),
      cache: "no-store",
    })
    if (!res.ok) return []
    return res.json()
  } catch {
    return []
  }
}

export async function likeSong(songId: string, userId?: string): Promise<boolean> {
  try {
    const uid = userId || getCurrentUserId()
    const res = await fetch(`${API_BASE}/api/me/liked/${songId}?user_id=${encodeURIComponent(uid)}`, {
      method: "POST",
      headers: getAuthHeaders(),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function unlikeSong(songId: string, userId?: string): Promise<boolean> {
  try {
    const uid = userId || getCurrentUserId()
    const res = await fetch(`${API_BASE}/api/me/liked/${songId}?user_id=${encodeURIComponent(uid)}`, {
      method: "DELETE",
      headers: getAuthHeaders(),
    })
    return res.ok
  } catch {
    return false
  }
}

// --- Catalog: Artists, Albums, Search, Genres ---
export async function getArtist(artistId: string): Promise<Artist | null> {
  try {
    const res = await fetch(`${API_BASE}/api/artists/${artistId}`, { cache: "no-store" })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export async function getAlbum(albumId: string): Promise<Album | null> {
  try {
    const res = await fetch(`${API_BASE}/api/albums/${albumId}`, { cache: "no-store" })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export async function getGenres(): Promise<Genre[]> {
  try {
    const res = await fetch(`${API_BASE}/api/genres`, { cache: "no-store" })
    if (!res.ok) return []
    return res.json()
  } catch {
    return []
  }
}

export async function searchCatalog(query: string): Promise<SearchResult> {
  try {
    const res = await fetch(`${API_BASE}/api/search?q=${encodeURIComponent(query)}`, { cache: "no-store" })
    if (!res.ok) return { query, songs: [], artists: [], albums: [], playlists: [] }
    return res.json()
  } catch {
    return { query, songs: [], artists: [], albums: [], playlists: [] }
  }
}

// --- Profile & Settings ---
export async function getUserProfile(): Promise<UserProfile | null> {
  try {
    const res = await fetch(`${API_BASE}/api/me/profile`, { cache: "no-store" })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export async function getUserSettings(): Promise<UserSettings> {
  try {
    const res = await fetch(`${API_BASE}/api/me/settings`, { cache: "no-store" })
    if (!res.ok) throw new Error()
    return res.json()
  } catch {
    return {
      displayName: "Guest",
      audioQuality: "high",
      crossfadeMs: 3000,
      autoplay: true,
      accentColor: "#1db954",
    }
  }
}

export async function updateUserSettings(data: Partial<UserSettings>): Promise<UserSettings | null> {
  try {
    const res = await fetch(`${API_BASE}/api/me/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

// --- Ingest & Interactions ---
export interface IngestOptions {
  url?: string
  text_data?: string
  platform?: string
  destination?: 'playlist' | 'liked'
  playlist_name?: string
}

export async function ingestLink(options: string | IngestOptions): Promise<{ job_id: string; status: string; message: string }> {
  const body = typeof options === 'string' ? { url: options } : options
  const res = await fetch(`${API_BASE}/api/ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || "Failed to submit transfer request")
  }
  return res.json()
}

export async function getIngestStatus(jobId: string) {
  const res = await fetch(`${API_BASE}/api/ingest/status/${jobId}`, { cache: "no-store" })
  return res.json()
}

export async function recordInteraction(userId: string, songId: string, interactionType: string) {
  try {
    const uid = userId || getCurrentUserId()
    await fetch(`${API_BASE}/api/interaction`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({
        user_id: uid,
        song_id: songId,
        interaction_type: interactionType,
      }),
    })
  } catch (e) {
    console.error("Failed to record interaction", e)
  }
}

export function getSongCover(song: Partial<Song> | null | undefined, fallbackSize: number = 300): string {
  if (!song) {
    return `https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=${fallbackSize}&q=80`
  }
  // Reject mosaic playlist thumbnails so individual tracks never display composite covers
  if (song.thumbnailUrl && !song.thumbnailUrl.includes("mosaic.scdn.co")) {
    return song.thumbnailUrl
  }
  if (song.coverUrl && !song.coverUrl.includes("mosaic.scdn.co")) {
    return song.coverUrl.startsWith("http") ? song.coverUrl : `${API_BASE}${song.coverUrl}`
  }
  if (song.id) {
    return `${API_BASE}/api/songs/${song.id}/cover`
  }
  return `https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=${fallbackSize}&q=80`
}
