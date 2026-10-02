"use client"
import { use, useEffect, useState } from "react"
import Header from "@/components/Header"
import { Play, Pause, Clock3, Heart, Shuffle, Disc } from "lucide-react"
import { usePlayerStore } from "@/store/playerStore"
import { useUIStore } from "@/store/uiStore"
import { getAlbum, Album, Song, API_BASE } from "@/lib/api"
import Link from "next/link"

export default function AlbumPage({ params }: { params: Promise<{ id: string }> }) {
  const unwrappedParams = use(params)
  const albumId = unwrappedParams.id

  const { currentSong, isPlaying, playSongWithQueue, togglePlay, toggleShuffle, shuffle } = usePlayerStore()
  const { openContextMenu, likedSongIds, toggleLikeSong } = useUIStore()

  const [album, setAlbum] = useState<Album | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getAlbum(albumId).then((data) => {
      setAlbum(data)
      setLoading(false)
    })
  }, [albumId])

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#121212] h-full text-white">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-[#1db954]" />
      </div>
    )
  }

  if (!album) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#121212] h-full text-white space-y-4">
        <Disc size={64} className="text-[#444]" />
        <h2 className="text-2xl font-bold">Album not found</h2>
        <Link href="/" className="px-6 py-2 rounded-full bg-white text-black font-bold text-sm">
          Return Home
        </Link>
      </div>
    )
  }

  const tracks = album.tracks || []
  const isAlbumPlaying = tracks.some((t) => t.id === currentSong?.id) && isPlaying

  const handlePlayAlbum = () => {
    if (tracks.length === 0) return
    if (isAlbumPlaying) {
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

  return (
    <div className="flex-1 overflow-y-auto bg-[#121212] h-full relative scroll-smooth rounded-lg text-white select-none scrollbar-hidden">
      {/* Background Gradient */}
      <div className="absolute top-0 left-0 w-full h-[380px] bg-gradient-to-b from-stone-800/80 via-[#121212]/80 to-[#121212] z-0" />

      <Header />

      <main className="relative z-10 pb-36">
        {/* Album Hero Section */}
        <div className="flex flex-col sm:flex-row items-end px-8 pt-8 pb-6 space-y-4 sm:space-y-0 sm:space-x-6">
          <div className="w-56 h-56 flex-shrink-0 rounded-lg overflow-hidden shadow-2xl shadow-black/80 bg-[#181818]">
            <img src={album.coverUrl} className="w-full h-full object-cover" alt={album.title} />
          </div>

          <div className="flex flex-col text-white">
            <span className="text-xs font-bold tracking-wider uppercase mb-1.5">Album</span>
            <h1 className="text-4xl md:text-6xl font-black tracking-tight mb-4">
              {album.title}
            </h1>
            <div className="flex items-center text-sm font-semibold space-x-2 text-[#b3b3b3]">
              <span className="text-white hover:underline cursor-pointer">{album.artist}</span>
              <span>•</span>
              <span>{album.releaseDate || "2024"}</span>
              <span>•</span>
              <span>{tracks.length} songs</span>
            </div>
          </div>
        </div>

        {/* Action Row */}
        <div className="px-8 py-5 flex items-center space-x-6 sticky top-0 z-20 bg-gradient-to-b from-black/40 to-[#121212] backdrop-blur-md">
          <button
            onClick={handlePlayAlbum}
            disabled={tracks.length === 0}
            className="w-14 h-14 bg-[#1db954] hover:bg-[#1ed760] text-black rounded-full flex items-center justify-center hover:scale-106 active:scale-95 transition-all shadow-2xl disabled:opacity-40"
            aria-label={`Play ${album.title}`}
          >
            {isAlbumPlaying ? (
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
        </div>

        {/* Tracklist Table */}
        <div className="px-8 mt-2">
          {/* Header */}
          <div className="grid grid-cols-[16px_minmax(120px,4fr)_minmax(100px,1fr)] gap-4 px-4 py-2.5 border-b border-[#282828] text-[#b3b3b3] text-xs font-bold uppercase tracking-wider mb-2">
            <div className="text-center">#</div>
            <div>Title</div>
            <div className="flex justify-end pr-3">
              <Clock3 size={16} />
            </div>
          </div>

          {/* Rows */}
          <div className="flex flex-col space-y-0.5">
            {tracks.map((song, i) => {
              const isCurrent = currentSong?.id === song.id
              const isLiked = likedSongIds.has(song.id)

              return (
                <div
                  key={song.id}
                  onClick={() => playSongWithQueue(song, tracks, i)}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    openContextMenu(e.clientX, e.clientY, song)
                  }}
                  className={`grid grid-cols-[16px_minmax(120px,4fr)_minmax(100px,1fr)] gap-4 px-4 py-2.5 rounded-md hover:bg-white/10 group items-center cursor-pointer transition-colors ${
                    isCurrent ? "text-[#1db954]" : "text-[#b3b3b3]"
                  }`}
                >
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
                    <Play className="hidden group-hover:block text-white" fill="white" size={14} />
                  </div>

                  <div className="flex flex-col overflow-hidden">
                    <span className={`truncate font-semibold text-sm ${isCurrent ? "text-[#1db954]" : "text-white"}`}>
                      {song.title}
                    </span>
                    <span className="truncate text-xs text-[#b3b3b3] group-hover:text-white transition-colors">
                      {song.artist}
                    </span>
                  </div>

                  <div className="flex items-center justify-end space-x-3 pr-3 text-xs text-[#b3b3b3] group-hover:text-white">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleLikeSong(song)
                      }}
                      className={`transition ${isLiked ? "text-[#1db954]" : "opacity-0 group-hover:opacity-100"}`}
                    >
                      <Heart size={16} fill={isLiked ? "#1db954" : "none"} color={isLiked ? "#1db954" : "currentColor"} />
                    </button>
                    <span className="font-mono">{formatDuration(song.duration || 180)}</span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Copyright Footer */}
          <div className="pt-8 text-xs text-[#666] space-y-1">
            <p>© {album.releaseDate || "2024"} Tunely Records</p>
            <p>℗ {album.releaseDate || "2024"} Tunely Music Catalog</p>
          </div>
        </div>
      </main>
    </div>
  )
}
