"use client"
import { use, useEffect, useState } from "react"
import Header from "@/components/Header"
import { Play, Pause, BadgeCheck, Clock3, Heart, MoreHorizontal, UserPlus, UserCheck } from "lucide-react"
import { usePlayerStore } from "@/store/playerStore"
import { useUIStore } from "@/store/uiStore"
import { getArtist, Artist, Song, API_BASE, getSongCover } from "@/lib/api"
import Link from "next/link"

export default function ArtistPage({ params }: { params: Promise<{ id: string }> }) {
  const unwrappedParams = use(params)
  const artistId = unwrappedParams.id

  const { currentSong, isPlaying, playSongWithQueue, togglePlay } = usePlayerStore()
  const { openContextMenu, likedSongIds, toggleLikeSong } = useUIStore()

  const [artist, setArtist] = useState<Artist | null>(null)
  const [loading, setLoading] = useState(true)
  const [isFollowing, setIsFollowing] = useState(false)
  const [showAllTopTracks, setShowAllTopTracks] = useState(false)

  useEffect(() => {
    getArtist(artistId).then((data) => {
      setArtist(data)
      setLoading(false)
    })
  }, [artistId])

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#121212] h-full text-white">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-[#1db954]" />
      </div>
    )
  }

  if (!artist) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#121212] h-full text-white space-y-4">
        <h2 className="text-2xl font-bold">Artist not found</h2>
        <Link href="/" className="px-6 py-2 rounded-full bg-white text-black font-bold text-sm">
          Return Home
        </Link>
      </div>
    )
  }

  const tracks = artist.topTracks || []
  const visibleTracks = showAllTopTracks ? tracks : tracks.slice(0, 5)
  const isArtistPlaying = tracks.some((t) => t.id === currentSong?.id) && isPlaying

  const handlePlayArtist = () => {
    if (tracks.length === 0) return
    if (isArtistPlaying) {
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
    <div className="flex-1 overflow-y-auto bg-[#101014]/75 backdrop-blur-2xl h-full relative scroll-smooth rounded-lg text-white select-none scrollbar-hidden">
      {/* Darkened Banner Hero with Artist Image */}
      <div className="relative h-80 w-full overflow-hidden">
        <img
          src={artist.imageUrl || "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=1200&q=80"}
          alt={artist.name}
          className="w-full h-full object-cover filter brightness-50"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#101014]/90 via-transparent to-black/30" />

        <div className="absolute top-0 left-0 w-full">
          <Header />
        </div>

        <div className="absolute bottom-6 left-8 flex flex-col space-y-2">
          {artist.verified && (
            <div className="flex items-center space-x-1.5 text-xs font-bold text-sky-400">
              <BadgeCheck size={18} fill="currentColor" className="text-sky-400 stroke-black" />
              <span className="text-white">Verified Artist</span>
            </div>
          )}
          <h1 className="text-5xl md:text-7xl font-black text-white tracking-tight">
            {artist.name}
          </h1>
          <p className="text-sm font-semibold text-[#d0d0d0]">
            {(artist.monthlyListeners || 1250000).toLocaleString()} monthly listeners
          </p>
        </div>
      </div>

      <main className="p-8 pb-36 space-y-10">
        {/* Action Row */}
        <div className="flex items-center space-x-6">
          <button
            onClick={handlePlayArtist}
            disabled={tracks.length === 0}
            className="w-14 h-14 bg-[#1db954] hover:bg-[#1ed760] text-black rounded-full flex items-center justify-center hover:scale-106 active:scale-95 transition-all shadow-2xl disabled:opacity-40"
            aria-label={`Play ${artist.name}`}
          >
            {isArtistPlaying ? (
              <Pause fill="currentColor" size={26} />
            ) : (
              <Play fill="currentColor" size={26} className="ml-1" />
            )}
          </button>

          <button
            onClick={() => setIsFollowing(!isFollowing)}
            className={`px-5 py-2 rounded-full text-xs font-bold border transition ${
              isFollowing
                ? "border-[#b3b3b3] text-white hover:border-white"
                : "border-transparent bg-white text-black hover:scale-105"
            }`}
          >
            {isFollowing ? "Following" : "Follow"}
          </button>

          <button className="text-[#b3b3b3] hover:text-white transition">
            <MoreHorizontal size={28} />
          </button>
        </div>

        {/* Popular Top Tracks Section */}
        <section className="space-y-4">
          <h2 className="text-2xl font-bold">Popular</h2>

          {tracks.length === 0 ? (
            <p className="text-sm text-[#a7a7a7]">No tracks available for this artist.</p>
          ) : (
            <div className="flex flex-col space-y-1">
              {visibleTracks.map((song, i) => {
                const isCurrent = currentSong?.id === song.id
                const isLiked = likedSongIds.has(song.id)
                const cover = getSongCover(song, 100)

                return (
                  <div
                    key={song.id}
                    onClick={() => playSongWithQueue(song, tracks, i)}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      openContextMenu(e.clientX, e.clientY, song)
                    }}
                    className={`grid grid-cols-[16px_minmax(120px,4fr)_minmax(100px,2fr)_minmax(80px,1fr)] gap-4 px-4 py-2 rounded-md hover:bg-white/10 group items-center cursor-pointer transition-colors ${
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

                    <div className="flex items-center space-x-3 overflow-hidden">
                      <img src={cover} className="w-10 h-10 rounded object-cover shadow" alt="" />
                      <span className={`truncate font-semibold text-sm ${isCurrent ? "text-[#1db954]" : "text-white"}`}>
                        {song.title}
                      </span>
                    </div>

                    <div className="text-xs text-[#a7a7a7] text-right font-mono pr-2">
                      {(1240500 - i * 182300).toLocaleString()} plays
                    </div>

                    <div className="flex items-center justify-end space-x-3 pr-2 text-xs text-[#b3b3b3] group-hover:text-white">
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

              {tracks.length > 5 && (
                <button
                  onClick={() => setShowAllTopTracks(!showAllTopTracks)}
                  className="text-xs font-bold text-[#b3b3b3] hover:text-white pt-2 text-left px-4 uppercase tracking-wider"
                >
                  {showAllTopTracks ? "Show less" : "See more"}
                </button>
              )}
            </div>
          )}
        </section>

        {/* Discography / Albums */}
        {artist.albums && artist.albums.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-2xl font-bold">Discography</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
              {artist.albums.map((album) => (
                <Link
                  key={album.id}
                  href={`/album/${album.id}`}
                  className="bg-[#181818] hover:bg-[#282828] p-3.5 rounded-lg transition-all duration-300 group cursor-pointer"
                >
                  <img
                    src={album.coverUrl}
                    alt={album.title}
                    className="w-full aspect-square rounded-md object-cover shadow-xl mb-3 group-hover:scale-105 transition-transform"
                  />
                  <h3 className="font-bold text-sm text-white truncate">{album.title}</h3>
                  <span className="text-xs text-[#b3b3b3] capitalize">
                    {album.releaseDate} • {album.type || "Album"}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* About Section Card */}
        {artist.bio && (
          <section className="space-y-4">
            <h2 className="text-2xl font-bold">About</h2>
            <div className="bg-[#181818] rounded-xl p-6 border border-[#282828] max-w-2xl space-y-4">
              <div className="flex items-center space-x-3">
                <span className="text-2xl font-black text-white">
                  {(artist.monthlyListeners || 1250000).toLocaleString()}
                </span>
                <span className="text-xs text-[#a7a7a7] uppercase tracking-wider">MONTHLY LISTENERS</span>
              </div>
              <p className="text-sm text-[#c0c0c0] leading-relaxed">{artist.bio}</p>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
