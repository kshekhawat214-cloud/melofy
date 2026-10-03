"use client"
import { useEffect, useState } from "react"
import Header from "@/components/Header"
import { Play, Pause, Clock3, Heart, Shuffle } from "lucide-react"
import { usePlayerStore } from "@/store/playerStore"
import { useUIStore } from "@/store/uiStore"
import { getLikedSongs, Song, API_BASE, getSongCover } from "@/lib/api"
import Link from "next/link"

export default function LikedSongsPage() {
  const { currentSong, isPlaying, playSongWithQueue, togglePlay, toggleShuffle, shuffle } = usePlayerStore()
  const { openContextMenu, likedSongIds, toggleLikeSong } = useUIStore()

  const [likedData, setLikedData] = useState<{ songs: Song[]; songCount: number; totalDuration: number }>({
    songs: [],
    songCount: 0,
    totalDuration: 0,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadData() {
      const data = await getLikedSongs()
      setLikedData(data)
      setLoading(false)
    }
    loadData()
  }, [likedSongIds])

  const songs = likedData.songs || []
  const isPlayingLiked = songs.some((s) => s.id === currentSong?.id) && isPlaying

  const handlePlayLiked = () => {
    if (songs.length === 0) return
    if (isPlayingLiked) {
      togglePlay()
    } else {
      playSongWithQueue(songs[0], songs, 0)
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

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#121212] h-full text-white">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-[#1db954]" />
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto bg-[#121212] h-full relative scroll-smooth rounded-lg text-white select-none scrollbar-hidden">
      {/* Purple Gradient Hero Banner */}
      <div className="absolute top-0 left-0 w-full h-[380px] bg-gradient-to-b from-indigo-800 via-purple-900/60 to-[#121212] z-0" />

      <Header />

      <main className="relative z-10 pb-36">
        {/* Header Hero */}
        <div className="flex flex-col sm:flex-row items-end px-8 pt-8 pb-6 space-y-4 sm:space-y-0 sm:space-x-6">
          <div className="w-56 h-56 flex-shrink-0 rounded-lg overflow-hidden shadow-2xl shadow-black/80 bg-gradient-to-br from-indigo-600 via-purple-600 to-blue-400 flex items-center justify-center">
            <span className="text-white text-7xl">❤️</span>
          </div>

          <div className="flex flex-col text-white">
            <span className="text-xs font-bold tracking-wider uppercase mb-1.5">Playlist</span>
            <h1 className="text-5xl md:text-7xl lg:text-8xl font-black tracking-tight mb-4">
              Liked Songs
            </h1>
            <div className="flex items-center text-sm font-semibold space-x-2 text-[#b3b3b3]">
              <span className="text-white">Guest</span>
              <span>•</span>
              <span>{songs.length} songs</span>
              {likedData.totalDuration > 0 && (
                <>
                  <span>•</span>
                  <span>{formatTotalTime(likedData.totalDuration)}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Action Row */}
        <div className="px-8 py-5 flex items-center space-x-6 sticky top-0 z-20 bg-gradient-to-b from-black/40 to-[#121212] backdrop-blur-md">
          <button
            onClick={handlePlayLiked}
            disabled={songs.length === 0}
            className="w-14 h-14 bg-[#1db954] hover:bg-[#1ed760] text-black rounded-full flex items-center justify-center hover:scale-106 active:scale-95 transition-all shadow-2xl disabled:opacity-40"
            aria-label="Play Liked Songs"
          >
            {isPlayingLiked ? (
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
          {songs.length === 0 ? (
            <div className="py-20 text-center text-[#a7a7a7] space-y-3">
              <span className="text-5xl block">🎵</span>
              <p className="font-bold text-xl text-white">Songs you like will appear here</p>
              <p className="text-sm">Save songs by tapping the heart icon on any track.</p>
              <Link
                href="/search"
                className="inline-block mt-3 px-6 py-2.5 rounded-full bg-white text-black font-bold text-sm hover:scale-105 transition"
              >
                Find songs
              </Link>
            </div>
          ) : (
            <div className="flex flex-col space-y-0.5">
              {songs.map((song, i) => {
                const isCurrent = currentSong?.id === song.id
                const isLiked = likedSongIds.has(song.id)
                const cover = getSongCover(song, 100)

                return (
                  <div
                    key={song.id}
                    onClick={() => playSongWithQueue(song, songs, i)}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      openContextMenu(e.clientX, e.clientY, song)
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
                        className="transition text-[#1db954]"
                      >
                        <Heart size={16} fill="#1db954" color="#1db954" />
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
