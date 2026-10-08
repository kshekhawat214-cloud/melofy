"use client"
import { use, useEffect, useState } from "react"
import Header from "@/components/Header"
import {
  Play,
  Pause,
  Shuffle,
  MoreHorizontal,
  Clock3,
  Heart,
  Music,
  Trash2,
  Edit2,
  Share2,
  MoreVertical,
  Plus,
  Check,
  Copy,
} from "lucide-react"
import { usePlayerStore } from "@/store/playerStore"
import { useUIStore } from "@/store/uiStore"
import { useAuthStore } from "@/store/authStore"
import {
  getPlaylist,
  getCachedPlaylist,
  Playlist,
  Song,
  API_BASE,
  getSongCover,
  deletePlaylist,
  savePlaylist,
  unsavePlaylist,
  clonePlaylist,
} from "@/lib/api"
import { getSongMoodColor } from "@/lib/colors"
import Link from "next/link"
import { useRouter } from "next/navigation"

export default function PlaylistPage({ params }: { params: Promise<{ id: string }> }) {
  const unwrappedParams = use(params)
  const playlistId = unwrappedParams.id

  const { currentSong, isPlaying, playSongWithQueue, togglePlay, toggleShuffle, shuffle } = usePlayerStore()
  const { openContextMenu, openPlaylistModal, likedSongIds, toggleLikeSong, addToast, loadPlaylists } = useUIStore()
  const { user } = useAuthStore()
  const router = useRouter()

  const [playlist, setPlaylist] = useState<Playlist | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isSaved, setIsSaved] = useState(false)
  const [showOptionsMenu, setShowOptionsMenu] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const currentUserId = user?.id || "1"
  const isOwner = playlist?.ownerId ? playlist.ownerId === currentUserId : true

  const loadData = async (showSpinner = false) => {
    if (showSpinner) setLoading(true)
    setError(null)

    // 1. Instant cache hydration: render cached/seed playlist immediately
    const cached = getCachedPlaylist(playlistId)
    if (cached) {
      setPlaylist(cached)
      setIsSaved(Boolean(cached.isSaved))
      setLoading(false)
    }

    // 2. Fetch fresh playlist data from backend
    try {
      const data = await getPlaylist(playlistId)
      if (data) {
        setPlaylist(data)
        setIsSaved(Boolean(data.isSaved))
        setError(null)
      } else if (!cached) {
        setError("Playlist not found")
      }
    } catch (err: any) {
      if (!cached) {
        setError(err?.message || "Failed to load playlist")
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()

    const handlePlaylistUpdated = (e: any) => {
      if (e?.detail === playlistId || !e?.detail) {
        loadData()
      }
    }
    window.addEventListener("melofy_playlist_updated", handlePlaylistUpdated)
    return () => window.removeEventListener("melofy_playlist_updated", handlePlaylistUpdated)
  }, [playlistId, currentUserId])

  if (loading && !playlist) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#121212] h-full text-white">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-[#1db954]" />
      </div>
    )
  }

  if (error || !playlist) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#121212] h-full text-white space-y-4 px-6 text-center">
        <Music size={64} className="text-[#555]" />
        <h2 className="text-2xl font-bold">{error || "Playlist not found"}</h2>
        <p className="text-sm text-neutral-400 max-w-md">
          {error === "Playlist not found"
            ? "This playlist may have been moved, removed, or is still syncing from the cloud."
            : "The connection took longer than expected. Please retry to load your tracks."}
        </p>
        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={() => loadData(true)}
            className="px-6 py-2.5 rounded-full bg-[#1db954] text-black font-bold text-sm hover:scale-105 active:scale-95 transition cursor-pointer"
          >
            Try Again
          </button>
          <Link
            href="/"
            className="px-6 py-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white font-semibold text-sm transition"
          >
            Return Home
          </Link>
        </div>
      </div>
    )
  }

  const tracks = playlist.tracks || []
  const isPlaylistPlaying = tracks.some((t) => t.id === currentSong?.id) && isPlaying

  const handlePlayPlaylist = () => {
    if (tracks.length === 0) return
    if (isPlaylistPlaying) {
      togglePlay()
    } else {
      playSongWithQueue(tracks[0], tracks, 0)
    }
  }

  const handleShare = async () => {
    const shareUrl = typeof window !== "undefined" ? window.location.href : ""
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: `${playlist.name} on Tunely`,
          text: `Check out ${playlist.name} by ${playlist.owner} on Tunely!`,
          url: shareUrl,
        })
        return
      } catch {}
    }
    try {
      await navigator.clipboard.writeText(shareUrl)
      addToast("Playlist link copied to clipboard!")
    } catch {
      addToast("Failed to copy link", "error")
    }
  }

  const handleToggleSave = async () => {
    if (isSaved) {
      const ok = await unsavePlaylist(playlist.id)
      if (ok) {
        setIsSaved(false)
        addToast("Removed from Your Library", "info")
        loadPlaylists()
      }
    } else {
      const ok = await savePlaylist(playlist.id)
      if (ok) {
        setIsSaved(true)
        addToast("Saved to Your Library!", "success")
        loadPlaylists()
      }
    }
  }

  const handleClone = async () => {
    const cloned = await clonePlaylist(playlist.id)
    if (cloned) {
      addToast("Copied to your playlists!", "success")
      await loadPlaylists()
      router.push(`/playlist/${cloned.id}`)
    } else {
      addToast("Failed to copy playlist", "error")
    }
  }

  const handleDelete = async () => {
    setIsDeleting(true)
    const ok = await deletePlaylist(playlist.id)
    if (ok) {
      addToast(isOwner ? "Playlist deleted" : "Removed from your library", "info")
      await loadPlaylists()
      router.push("/library")
    } else {
      addToast("Failed to remove playlist", "error")
      setIsDeleting(false)
    }
  }

  const formatDuration = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60)
    const secs = Math.floor(totalSeconds % 60)
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`
  }

  const formatTotalTime = (totalSeconds: number) => {
    const hrs = Math.floor(totalSeconds / 3600)
    const mins = Math.floor((totalSeconds % 3600) / 60)
    if (hrs > 0) return `${hrs} hr ${mins} min`
    return `${mins} min`
  }

  const moodTone = getSongMoodColor(playlist.id + playlist.name)

  return (
    <div className="flex-1 overflow-y-auto bg-[#101014]/75 backdrop-blur-2xl h-full relative scroll-smooth rounded-lg text-white select-none scrollbar-hidden">
      {/* Dynamic Header Gradient Block */}
      <div className={`absolute top-0 left-0 w-full h-[400px] bg-gradient-to-b ${moodTone.bgFrom}/45 via-[#101014]/70 to-transparent z-0 transition-all duration-700 pointer-events-none`} />

      <Header />

      <main className="relative z-10 pb-36">
        {/* Playlist Hero Section */}
        <div className="flex flex-col sm:flex-row items-center sm:items-end px-4 sm:px-8 pt-6 sm:pt-8 pb-4 sm:pb-6 space-y-4 sm:space-y-0 sm:space-x-6 text-center sm:text-left">
          <div
            onClick={() => {
              if (isOwner) {
                openPlaylistModal({
                  id: playlist.id,
                  name: playlist.name,
                  description: playlist.description,
                  coverUrl: playlist.coverUrl,
                })
              }
            }}
            className={`w-44 h-44 sm:w-56 sm:h-56 flex-shrink-0 rounded-lg overflow-hidden shadow-2xl shadow-black/80 bg-[#181818] flex items-center justify-center relative group/hero ${
              isOwner ? "cursor-pointer" : "cursor-default"
            }`}
            title={isOwner ? "Click to edit playlist details" : playlist.name}
          >
            {playlist.coverUrl ? (
              <img src={playlist.coverUrl} className="w-full h-full object-cover group-hover/hero:opacity-80 transition" alt="Playlist Cover" />
            ) : (
              <Music size={60} className="text-[#666]" />
            )}
            {isOwner && (
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/hero:opacity-100 flex flex-col items-center justify-center transition-opacity text-white">
                <Edit2 size={32} />
                <span className="text-xs font-bold mt-2">Choose photo</span>
              </div>
            )}
          </div>

          <div className="flex flex-col text-white items-center sm:items-start">
            <span className="text-xs font-bold tracking-wider uppercase mb-1 sm:mb-1.5 text-[#b3b3b3]">
              {isOwner ? "Public Playlist" : "Shared Playlist"}
            </span>
            <h1
              onClick={() => {
                if (isOwner) {
                  openPlaylistModal({
                    id: playlist.id,
                    name: playlist.name,
                    description: playlist.description,
                    coverUrl: playlist.coverUrl,
                  })
                }
              }}
              className={`text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-black tracking-tight mb-2 sm:mb-4 ${
                isOwner ? "cursor-pointer hover:underline" : "cursor-default"
              }`}
              title={isOwner ? "Click to rename playlist" : playlist.name}
            >
              {playlist.name}
            </h1>
            {playlist.description && (
              <p className="text-[#b3b3b3] text-sm mb-3 max-w-xl line-clamp-2">
                {playlist.description}
              </p>
            )}
            <div className="flex items-center text-sm font-semibold space-x-2 text-[#b3b3b3]">
              <span className="text-white hover:underline cursor-pointer">
                {isOwner ? "You" : playlist.owner || "User"}
              </span>
              <span>•</span>
              <span>{tracks.length} songs</span>
              {playlist.totalDuration > 0 && (
                <>
                  <span>•</span>
                  <span>about {formatTotalTime(playlist.totalDuration)}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Action Row */}
        <div className="px-4 sm:px-8 py-3 sm:py-5 flex items-center space-x-4 sm:space-x-6 sticky top-0 z-20 bg-gradient-to-b from-black/60 to-[#121212]/95 backdrop-blur-md">
          <button
            onClick={handlePlayPlaylist}
            disabled={tracks.length === 0}
            className="w-12 h-12 sm:w-14 sm:h-14 bg-[#1db954] hover:bg-[#1ed760] text-black rounded-full flex items-center justify-center hover:scale-106 active:scale-95 transition-all shadow-2xl disabled:opacity-40"
            aria-label="Play Playlist"
          >
            {isPlaylistPlaying ? (
              <Pause fill="currentColor" size={24} />
            ) : (
              <Play fill="currentColor" size={24} className="ml-1" />
            )}
          </button>

          <button
            onClick={toggleShuffle}
            className={`transition ${shuffle ? "text-[#1db954]" : "text-[#b3b3b3] hover:text-white"}`}
            title="Shuffle"
          >
            <Shuffle size={24} />
          </button>

          {/* If NOT the owner: Save / Unsave button */}
          {!isOwner && (
            <button
              onClick={handleToggleSave}
              className={`flex items-center space-x-2 px-4 py-2 rounded-full font-bold text-xs tracking-wider transition-all duration-200 border ${
                isSaved
                  ? "border-[#1db954] text-[#1db954] bg-[#1db954]/15 hover:bg-[#1db954]/25"
                  : "border-white/40 text-white hover:border-white hover:scale-105 active:scale-95 bg-white/5 hover:bg-white/10"
              }`}
              title={isSaved ? "Remove from Your Library" : "Save to Your Library"}
            >
              {isSaved ? <Check size={16} /> : <Plus size={16} />}
              <span>{isSaved ? "In Library" : "Save to Library"}</span>
            </button>
          )}

          {/* Share Button directly in action row */}
          <button
            onClick={handleShare}
            className="p-2 text-[#b3b3b3] hover:text-white hover:bg-white/10 rounded-full transition flex items-center space-x-1.5"
            title="Share playlist"
          >
            <Share2 size={22} />
          </button>

          <div className="relative">
            <button
              onClick={() => setShowOptionsMenu(!showOptionsMenu)}
              className="text-[#b3b3b3] hover:text-white transition p-1"
              title="More options"
            >
              <MoreHorizontal size={28} />
            </button>

            {showOptionsMenu && (
              <div
                onMouseLeave={() => setShowOptionsMenu(false)}
                className="absolute left-0 top-10 w-52 liquid-glass-elevated rounded-xl shadow-2xl py-1 z-50 text-sm text-[#e0e0e0] animate-in fade-in duration-100 divide-y divide-white/10"
              >
                <div className="py-1">
                  {isOwner ? (
                    <button
                      onClick={() => {
                        setShowOptionsMenu(false)
                        openPlaylistModal({
                          id: playlist.id,
                          name: playlist.name,
                          description: playlist.description,
                          coverUrl: playlist.coverUrl,
                        })
                      }}
                      className="w-full text-left px-4 py-2 hover:bg-[#383838] hover:text-white flex items-center space-x-3 text-xs"
                    >
                      <Edit2 size={15} />
                      <span>Edit details</span>
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          setShowOptionsMenu(false)
                          handleToggleSave()
                        }}
                        className="w-full text-left px-4 py-2 hover:bg-[#383838] hover:text-white flex items-center space-x-3 text-xs"
                      >
                        {isSaved ? <Check size={15} className="text-[#1db954]" /> : <Plus size={15} />}
                        <span>{isSaved ? "Remove from Library" : "Save to Library"}</span>
                      </button>
                      <button
                        onClick={() => {
                          setShowOptionsMenu(false)
                          handleClone()
                        }}
                        className="w-full text-left px-4 py-2 hover:bg-[#383838] hover:text-white flex items-center space-x-3 text-xs"
                      >
                        <Copy size={15} />
                        <span>Copy to my playlists</span>
                      </button>
                    </>
                  )}

                  <button
                    onClick={() => {
                      setShowOptionsMenu(false)
                      handleShare()
                    }}
                    className="w-full text-left px-4 py-2 hover:bg-[#383838] hover:text-white flex items-center space-x-3 text-xs"
                  >
                    <Share2 size={15} />
                    <span>Share link</span>
                  </button>
                </div>

                {isOwner && (
                  <div className="py-1">
                    <button
                      onClick={() => {
                        setShowOptionsMenu(false)
                        setShowDeleteModal(true)
                      }}
                      className="w-full text-left px-4 py-2 hover:bg-red-500/20 text-red-400 hover:text-red-300 flex items-center space-x-3 text-xs transition-colors"
                    >
                      <Trash2 size={15} />
                      <span>Delete playlist</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Delete Confirmation Modal */}
        {showDeleteModal && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[130] flex items-center justify-center p-4 animate-in fade-in duration-150">
            <div className="bg-[#282828] w-full max-w-md rounded-xl shadow-2xl p-6 border border-[#3e3e3e] space-y-4">
              <h3 className="text-xl font-bold text-white">Delete from Your Library?</h3>
              <p className="text-sm text-[#b3b3b3]">
                This will delete <span className="font-semibold text-white">&quot;{playlist.name}&quot;</span> from Your Library. This action cannot be undone.
              </p>
              <div className="flex justify-end space-x-3 pt-2">
                <button
                  onClick={() => setShowDeleteModal(false)}
                  disabled={isDeleting}
                  className="px-5 py-2 rounded-full text-sm font-bold text-white hover:bg-white/10 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    setIsDeleting(true)
                    try {
                      const success = await deletePlaylist(playlist.id)
                      if (success) {
                        addToast(`Deleted "${playlist.name}"`)
                        await loadPlaylists()
                        router.push("/")
                      } else {
                        addToast("Failed to delete playlist", "error")
                      }
                    } catch {
                      addToast("Failed to delete playlist", "error")
                    } finally {
                      setIsDeleting(false)
                      setShowDeleteModal(false)
                    }
                  }}
                  disabled={isDeleting}
                  className="px-6 py-2 rounded-full text-sm font-bold bg-[#e91429] hover:bg-[#ff2439] text-white hover:scale-105 active:scale-95 transition disabled:opacity-50"
                >
                  {isDeleting ? "Deleting..." : "Delete"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tracklist Table */}
        <div className="px-2 sm:px-8 mt-2">
          {/* Table Header */}
          <div className="grid grid-cols-[16px_minmax(120px,4fr)_minmax(120px,2fr)_minmax(80px,1fr)] sm:grid-cols-[16px_minmax(120px,4fr)_minmax(120px,2fr)_minmax(100px,1fr)] gap-2 sm:gap-4 px-3 sm:px-4 py-2.5 border-b border-[#282828] text-[#b3b3b3] text-xs font-bold uppercase tracking-wider mb-2">
            <div className="text-center">#</div>
            <div>Title</div>
            <div className="hidden sm:block">Album</div>
            <div className="flex justify-end pr-2 sm:pr-3">
              <Clock3 size={16} />
            </div>
          </div>

          {/* Table Rows */}
          {tracks.length === 0 ? (
            <div className="py-16 text-center text-[#a7a7a7] space-y-2">
              <p className="font-semibold text-lg">Let&apos;s find something for your playlist</p>
              <p className="text-sm">Right-click any song from Home or Search to add it here.</p>
            </div>
          ) : (
            <div className="flex flex-col space-y-0.5">
              {tracks.map((song, i) => {
                const isCurrent = currentSong?.id === song.id
                const isLiked = likedSongIds.has(song.id)
                const cover = getSongCover(song, 100)

                return (
                  <div
                    key={song.id}
                    onClick={() => playSongWithQueue(song, tracks, i)}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      openContextMenu(e.clientX, e.clientY, song, playlist.id)
                    }}
                    className={`grid grid-cols-[16px_minmax(120px,4fr)_minmax(120px,2fr)_minmax(80px,1fr)] sm:grid-cols-[16px_minmax(120px,4fr)_minmax(120px,2fr)_minmax(100px,1fr)] gap-2 sm:gap-4 px-3 sm:px-4 py-2 rounded-md hover:bg-white/10 group items-center cursor-pointer transition-colors ${
                      isCurrent ? "text-[#1db954]" : "text-[#b3b3b3]"
                    }`}
                  >
                    {/* Index or Animated Equalizer */}
                    <div className="text-center flex justify-center w-full">
                      {isCurrent && isPlaying ? (
                        <div className="flex items-end justify-center space-x-[2px] h-3.5 w-3.5">
                          <span className="w-1 bg-[#1db954] h-full animate-bounce" />
                          <span className="w-1 bg-[#1db954] h-2/3 animate-bounce [animation-delay:0.15s]" />
                          <span className="w-1 bg-[#1db954] h-4/5 animate-bounce [animation-delay:0.3s]" />
                        </div>
                      ) : (
                        <span className="text-xs group-hover:hidden">{i + 1}</span>
                      )}
                      <Play
                        className="hidden group-hover:block text-white"
                        fill="white"
                        size={14}
                      />
                    </div>

                    {/* Title + Artist */}
                    <div className="flex items-center space-x-3 overflow-hidden">
                      <img src={cover} className="w-10 h-10 rounded object-cover shadow flex-shrink-0" alt="" />
                      <div className="flex flex-col overflow-hidden min-w-0">
                        <span className={`truncate font-semibold text-sm ${isCurrent ? "text-[#1db954]" : "text-white"}`}>
                          {song.title}
                        </span>
                        <span className="truncate text-xs text-[#b3b3b3] group-hover:text-white transition-colors">
                          {song.artist}
                        </span>
                      </div>
                    </div>

                    {/* Album */}
                    <div className="hidden sm:flex items-center truncate text-sm text-[#b3b3b3] group-hover:text-white transition-colors">
                      {song.album && song.album !== playlist?.name ? song.album : "Single"}
                    </div>

                    {/* Heart + Duration + Mobile 3-Dots */}
                    <div className="flex items-center justify-end space-x-2 sm:space-x-4 pr-1 sm:pr-3 text-xs text-[#b3b3b3] group-hover:text-white">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleLikeSong(song)
                        }}
                        className={`transition opacity-0 group-hover:opacity-100 ${isLiked ? "!opacity-100" : ""}`}
                      >
                        <Heart
                          size={16}
                          fill={isLiked ? "#1db954" : "none"}
                          color={isLiked ? "#1db954" : "currentColor"}
                        />
                      </button>
                      <span className="font-mono hidden sm:inline">{formatDuration(song.duration || 180)}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          const rect = e.currentTarget.getBoundingClientRect()
                          openContextMenu(rect.right - 180, rect.bottom, song, playlist.id)
                        }}
                        className="p-1 text-[#b3b3b3] hover:text-white sm:hidden"
                        title="Song options"
                      >
                        <MoreVertical size={16} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
