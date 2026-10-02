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
} from "lucide-react"
import { usePlayerStore } from "@/store/playerStore"
import { useUIStore } from "@/store/uiStore"
import { getPlaylist, Playlist, Song, API_BASE } from "@/lib/api"
import Link from "next/link"

export default function PlaylistPage({ params }: { params: Promise<{ id: string }> }) {
  const unwrappedParams = use(params)
  const playlistId = unwrappedParams.id

  const { currentSong, isPlaying, playSongWithQueue, togglePlay, toggleShuffle, shuffle } = usePlayerStore()
  const { openContextMenu, openPlaylistModal, likedSongIds, toggleLikeSong, addToast } = useUIStore()

  const [playlist, setPlaylist] = useState<Playlist | null>(null)
  const [loading, setLoading] = useState(true)
  const [showOptionsMenu, setShowOptionsMenu] = useState(false)

  useEffect(() => {
    async function loadData() {
      const data = await getPlaylist(playlistId)
      setPlaylist(data)
      setLoading(false)
    }
    loadData()
  }, [playlistId])

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#121212] h-full text-white">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-[#1db954]" />
      </div>
    )
  }

  if (!playlist) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#121212] h-full text-white space-y-4">
        <Music size={64} className="text-[#444]" />
        <h2 className="text-2xl font-bold">Playlist not found</h2>
        <Link href="/" className="px-6 py-2 rounded-full bg-white text-black font-bold text-sm">
          Return Home
        </Link>
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

  return (
    <div className="flex-1 overflow-y-auto bg-[#121212] h-full relative scroll-smooth rounded-lg text-white select-none scrollbar-hidden">
      {/* Dynamic Header Gradient Block */}
      <div className="absolute top-0 left-0 w-full h-[380px] bg-gradient-to-b from-indigo-700/60 via-[#121212]/80 to-[#121212] z-0" />

      <Header />

      <main className="relative z-10 pb-36">
        {/* Playlist Hero Section */}
        <div className="flex flex-col sm:flex-row items-end px-8 pt-8 pb-6 space-y-4 sm:space-y-0 sm:space-x-6">
          <div className="w-56 h-56 flex-shrink-0 rounded-lg overflow-hidden shadow-2xl shadow-black/80 bg-[#181818] flex items-center justify-center">
            {playlist.coverUrl ? (
              <img src={playlist.coverUrl} className="w-full h-full object-cover" alt="Playlist Cover" />
            ) : (
              <Music size={60} className="text-[#666]" />
            )}
          </div>

          <div className="flex flex-col text-white">
            <span className="text-xs font-bold tracking-wider uppercase mb-1.5">Playlist</span>
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-black tracking-tight mb-4">
              {playlist.name}
            </h1>
            {playlist.description && (
              <p className="text-[#b3b3b3] text-sm mb-3 max-w-xl line-clamp-2">
                {playlist.description}
              </p>
            )}
            <div className="flex items-center text-sm font-semibold space-x-2 text-[#b3b3b3]">
              <span className="text-white hover:underline cursor-pointer">{playlist.owner || "Guest"}</span>
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
        <div className="px-8 py-5 flex items-center space-x-6 sticky top-0 z-20 bg-gradient-to-b from-black/40 to-[#121212] backdrop-blur-md">
          <button
            onClick={handlePlayPlaylist}
            disabled={tracks.length === 0}
            className="w-14 h-14 bg-[#1db954] hover:bg-[#1ed760] text-black rounded-full flex items-center justify-center hover:scale-106 active:scale-95 transition-all shadow-2xl disabled:opacity-40"
            aria-label="Play Playlist"
          >
            {isPlaylistPlaying ? (
              <Pause fill="currentColor" size={26} />
            ) : (
              <Play fill="currentColor" size={26} className="ml-1" />
            )}
          </button>

          <button
            onClick={toggleShuffle}
            className={`transition ${shuffle ? "text-[#1db954]" : "text-[#b3b3b3] hover:text-white"}`}
            title="Shuffle"
          >
            <Shuffle size={26} />
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
                className="absolute left-0 top-10 w-48 bg-[#282828] border border-[#383838] rounded-md shadow-2xl py-1 z-50 text-sm text-[#e0e0e0] animate-in fade-in duration-100"
              >
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
                  className="w-full text-left px-4 py-2 hover:bg-[#383838] hover:text-white flex items-center space-x-3"
                >
                  <Edit2 size={16} />
                  <span>Edit details</span>
                </button>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(window.location.href)
                    addToast("Playlist link copied")
                    setShowOptionsMenu(false)
                  }}
                  className="w-full text-left px-4 py-2 hover:bg-[#383838] hover:text-white flex items-center space-x-3"
                >
                  <Share2 size={16} />
                  <span>Share</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Tracklist Table */}
        <div className="px-8 mt-2">
          {/* Table Header */}
          <div className="grid grid-cols-[16px_minmax(120px,4fr)_minmax(120px,2fr)_minmax(100px,1fr)] gap-4 px-4 py-2.5 border-b border-[#282828] text-[#b3b3b3] text-xs font-bold uppercase tracking-wider mb-2">
            <div className="text-center">#</div>
            <div>Title</div>
            <div className="hidden sm:block">Album</div>
            <div className="flex justify-end pr-3">
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
                const cover = song.thumbnailUrl || (song.coverUrl ? `${API_BASE}${song.coverUrl}` : "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=100&q=80")

                return (
                  <div
                    key={song.id}
                    onClick={() => playSongWithQueue(song, tracks, i)}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      openContextMenu(e.clientX, e.clientY, song, playlist.id)
                    }}
                    className={`grid grid-cols-[16px_minmax(120px,4fr)_minmax(120px,2fr)_minmax(100px,1fr)] gap-4 px-4 py-2 rounded-md hover:bg-white/10 group items-center cursor-pointer transition-colors ${
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
                      <img src={cover} className="w-10 h-10 rounded object-cover shadow" alt="" />
                      <div className="flex flex-col overflow-hidden">
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
                      {song.album || "Single"}
                    </div>

                    {/* Heart + Duration */}
                    <div className="flex items-center justify-end space-x-4 pr-3 text-xs text-[#b3b3b3] group-hover:text-white">
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
                      <span className="font-mono">{formatDuration(song.duration || 180)}</span>
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
