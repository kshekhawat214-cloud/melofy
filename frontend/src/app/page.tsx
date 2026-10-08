"use client"
import { useEffect, useState, useCallback, useRef } from "react"
import Header from "@/components/Header"
import { Play, Pause } from "lucide-react"
import { getHomeFeed, getPlaylists, Shelf, Song, Playlist, API_BASE, getSongCover, getCachedHomeFeed, getCachedPlaylists } from "@/lib/api"
import { SEED_SHELVES, SEED_PLAYLISTS } from "@/lib/seedCatalog"
import { usePlayerStore } from "@/store/playerStore"
import { useUIStore } from "@/store/uiStore"
import { useAuthStore } from "@/store/authStore"
import { getSongMoodColor } from "@/lib/colors"
import Link from "next/link"

function SongCard({ song, shelfSongs }: { song: Song; shelfSongs: Song[] }) {
  const { currentSong, isPlaying, playSongWithQueue, togglePlay } = usePlayerStore()
  const { openContextMenu } = useUIStore()

  const isCurrent = currentSong?.id === song.id
  const coverSrc = getSongCover(song, 300)

  const handlePlayClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (isCurrent) {
      togglePlay()
    } else {
      playSongWithQueue(song, shelfSongs)
    }
  }

  return (
    <div
      onClick={() => playSongWithQueue(song, shelfSongs)}
      onContextMenu={(e) => {
        e.preventDefault()
        openContextMenu(e.clientX, e.clientY, song)
      }}
      className="bg-[#181818] hover:bg-[#282828] p-3.5 rounded-lg transition-all duration-300 group cursor-pointer relative flex flex-col select-none flex-shrink-0 w-44"
    >
      <div className="relative mb-3 pb-[100%] rounded-md overflow-hidden shadow-lg shadow-black/60 bg-[#222]">
        <img
          src={coverSrc}
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          alt={song.title}
          loading="lazy"
        />

        {/* Floating Play Button (Always visible on mobile, hover-reveal on desktop) */}
        <button
          onClick={handlePlayClick}
          className={`absolute bottom-2 right-2 w-11 h-11 bg-[#1db954] hover:bg-[#1ed760] text-black rounded-full shadow-2xl flex items-center justify-center transition-all duration-300 hover:scale-106 ${
            isCurrent && isPlaying
              ? "opacity-100 translate-y-0"
              : "opacity-100 md:opacity-0 translate-y-0 md:translate-y-3 md:group-hover:opacity-100 md:group-hover:translate-y-0"
          }`}
          aria-label={`Play ${song.title}`}
        >
          {isCurrent && isPlaying ? (
            <Pause fill="currentColor" size={20} />
          ) : (
            <Play fill="currentColor" size={20} className="ml-0.5" />
          )}
        </button>
      </div>

      <h3 className={`font-bold text-sm truncate mb-0.5 ${isCurrent ? "text-[#1db954]" : "text-white"}`}>
        {song.title}
      </h3>
      <p className="text-xs text-[#b3b3b3] line-clamp-1 hover:underline">
        {song.artist}
      </p>
    </div>
  )
}

export default function Home() {
  const { currentSong, isPlaying, playSongWithQueue, togglePlay } = usePlayerStore()
  const { user } = useAuthStore()

  // Initialize with seed catalog so the app loads 100% full immediately on frame 1 (zero blank screens)
  const [shelves, setShelves] = useState<Shelf[]>(SEED_SHELVES)
  const [playlists, setPlaylists] = useState<Playlist[]>(SEED_PLAYLISTS)
  const retryTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Hydrate from localStorage cache on client mount
  useEffect(() => {
    const cachedFeed = getCachedHomeFeed()
    const cachedPls = getCachedPlaylists()
    if (cachedFeed.length > 0) setShelves(cachedFeed)
    if (cachedPls.length > 0) setPlaylists(cachedPls)
  }, [])

  const loadData = useCallback(async () => {
    try {
      const uid = user?.id || "1"
      const [feed, pls] = await Promise.all([getHomeFeed(uid), getPlaylists(uid)])

      if (feed && feed.length > 0) {
        setShelves(feed)
      }
      if (pls && pls.length > 0) {
        setPlaylists(pls)
      }

      // If backend was sleeping or cold starting and returned empty, auto-retry in background
      if ((!feed || feed.length === 0) && (!pls || pls.length === 0)) {
        if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
        retryTimerRef.current = setTimeout(() => {
          loadData()
        }, 3000)
      }
    } catch {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
      retryTimerRef.current = setTimeout(() => {
        loadData()
      }, 3500)
    }
  }, [user?.id])

  useEffect(() => {
    loadData()
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
    }
  }, [loadData])

  useEffect(() => {
    const handleAuthChange = () => loadData()
    window.addEventListener("melofy_auth_change", handleAuthChange)
    return () => window.removeEventListener("melofy_auth_change", handleAuthChange)
  }, [loadData])

  const hour = new Date().getHours()
  const baseGreeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"
  const greeting = user?.displayName ? `${baseGreeting}, ${user.displayName}` : baseGreeting

  const allSongs = shelves.flatMap((s) => s.songs)
  // Deduplicate for quick-access tiles
  const quickAccessSongs = Array.from(new Map(allSongs.map((s) => [s.id, s])).values()).slice(0, 8)
  const ambientTone = getSongMoodColor(currentSong?.id || quickAccessSongs[0]?.id || "tunely")

  return (
    <div id="main-scroll-container" className={`flex-1 overflow-y-auto bg-gradient-to-b ${ambientTone.bgFrom} via-[#121212] to-[#121212] h-full relative scroll-smooth text-white scrollbar-hidden transition-colors duration-700`}>
      <Header />

      <main className="p-6 pb-36 space-y-8">
        {/* Top Greeting */}
        <h1 suppressHydrationWarning className="text-3xl font-extrabold tracking-tight text-white mb-5">
          {greeting}
        </h1>

        {/* 2x4 Quick Access Grid */}
        {quickAccessSongs.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {quickAccessSongs.map((song) => {
              const isCurrent = currentSong?.id === song.id
              const cover = getSongCover(song, 100)
              return (
                <div
                  key={song.id}
                  onClick={() => playSongWithQueue(song, quickAccessSongs)}
                  className="bg-white/5 hover:bg-white/15 transition-all duration-300 rounded-md flex items-center group cursor-pointer overflow-hidden h-16 shadow-md relative pr-3"
                >
                  <img src={cover} className="h-full w-16 object-cover flex-shrink-0" alt="" />
                  <span className={`font-bold text-sm px-3.5 truncate flex-1 ${isCurrent ? "text-[#1db954]" : "text-white"}`}>
                    {song.title}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      if (isCurrent) togglePlay()
                      else playSongWithQueue(song, quickAccessSongs)
                    }}
                    className={`w-10 h-10 rounded-full bg-[#1db954] hover:bg-[#1ed760] text-black flex items-center justify-center shadow-xl hover:scale-106 transition-all ${
                      isCurrent && isPlaying
                        ? "opacity-100"
                        : "opacity-0 group-hover:opacity-100"
                    }`}
                  >
                    {isCurrent && isPlaying ? (
                      <Pause fill="currentColor" size={18} />
                    ) : (
                      <Play fill="currentColor" size={18} className="ml-0.5" />
                    )}
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {/* Featured Curated Playlists Shelf */}
        {playlists.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-white hover:underline cursor-pointer">
                Featured Playlists
              </h2>
              <span className="text-xs font-bold text-[#b3b3b3] hover:underline cursor-pointer uppercase tracking-wider">
                Show all
              </span>
            </div>

            <div className="flex space-x-4 sm:space-x-5 overflow-x-auto pb-2 scrollbar-hidden snap-x snap-mandatory">
              {playlists.map((pl) => (
                <Link
                  key={pl.id}
                  href={`/playlist/${pl.id}`}
                  className="bg-[#181818] hover:bg-[#282828] p-3.5 rounded-lg transition-all duration-300 group cursor-pointer flex flex-col flex-shrink-0 w-44 snap-start"
                >
                  <div className="relative mb-3 pb-[100%] rounded-md overflow-hidden shadow-lg bg-[#222]">
                    <img
                      src={pl.coverUrl || "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&q=80"}
                      className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      alt={pl.name}
                    />
                    <div className="absolute bottom-2 right-2 w-11 h-11 bg-[#1db954] text-black rounded-full shadow-2xl flex items-center justify-center opacity-100 md:opacity-0 translate-y-0 md:translate-y-3 md:group-hover:opacity-100 md:group-hover:translate-y-0 transition-all duration-300 hover:scale-106">
                      <Play fill="currentColor" size={20} className="ml-0.5" />
                    </div>
                  </div>
                  <h3 className="font-bold text-sm text-white truncate mb-0.5">{pl.name}</h3>
                  <p className="text-xs text-[#b3b3b3] line-clamp-2">
                    {pl.description || `Playlist • ${pl.owner || "Guest"}`}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Dynamic Recommendation Shelves */}
        {shelves.map((shelf) => {
          if (!shelf.songs || shelf.songs.length === 0) return null
          return (
            <section key={shelf.id} className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-white hover:underline cursor-pointer">
                  {shelf.title}
                </h2>
                <span className="text-xs font-bold text-[#b3b3b3] hover:underline cursor-pointer uppercase tracking-wider">
                  Show all
                </span>
              </div>

              <div className="flex space-x-4 sm:space-x-5 overflow-x-auto pb-2 scrollbar-hidden snap-x snap-mandatory">
                {shelf.songs.map((song) => (
                  <div key={song.id} className="snap-start flex-shrink-0">
                    <SongCard song={song} shelfSongs={shelf.songs} />
                  </div>
                ))}
              </div>
            </section>
          )
        })}
      </main>
    </div>
  )
}
