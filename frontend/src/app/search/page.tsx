"use client"
import { useState, useEffect } from "react"
import Header from "@/components/Header"
import { Search as SearchIcon, X, Play, Clock3, Heart, Music, User, Disc } from "lucide-react"
import { searchCatalog, getGenres, SearchResult, Genre, Song, API_BASE, getSongCover, getCachedGenres } from "@/lib/api"
import { SEED_GENRES } from "@/lib/seedCatalog"
import { usePlayerStore } from "@/store/playerStore"
import { useUIStore } from "@/store/uiStore"
import Link from "next/link"

export default function SearchPage() {
  const { currentSong, isPlaying, playSongWithQueue, togglePlay } = usePlayerStore()
  const { openContextMenu, likedSongIds, toggleLikeSong } = useUIStore()

  const [query, setQuery] = useState("")
  const [filterType, setFilterType] = useState<"all" | "songs" | "artists" | "albums" | "playlists">("all")
  const [genres, setGenres] = useState<Genre[]>(SEED_GENRES)
  const [results, setResults] = useState<SearchResult | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    if (typeof window === "undefined") return []
    try {
      const saved = localStorage.getItem("tunely_recent_searches")
      return saved ? JSON.parse(saved) : ["Rasputin", "Lo-Fi", "Electronic"]
    } catch {
      return ["Rasputin", "Lo-Fi", "Electronic"]
    }
  })

  // Hydrate genres from cache and revalidate from server
  useEffect(() => {
    const cached = getCachedGenres()
    if (cached.length > 0) setGenres(cached)

    getGenres().then((data) => {
      if (data && data.length > 0) setGenres(data)
    })
  }, [])

  // Debounced search
  useEffect(() => {
    if (!query.trim()) {
      setResults(null)
      setIsSearching(false)
      return
    }

    setIsSearching(true)
    const timeout = setTimeout(async () => {
      const data = await searchCatalog(query.trim())
      setResults(data)
      setIsSearching(false)

      // Save to recent searches
      if (query.trim().length > 2) {
        setRecentSearches((prev) => {
          const updated = [query.trim(), ...prev.filter((q) => q.toLowerCase() !== query.trim().toLowerCase())].slice(0, 6)
          try {
            localStorage.setItem("tunely_recent_searches", JSON.stringify(updated))
          } catch {}
          return updated
        })
      }
    }, 280)

    return () => clearTimeout(timeout)
  }, [query])

  const clearSearch = () => {
    setQuery("")
    setResults(null)
  }

  const formatDuration = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60)
    const secs = Math.floor(totalSeconds % 60)
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`
  }

  return (
    <div className="flex-1 overflow-y-auto bg-[#101014]/75 backdrop-blur-2xl h-full relative scroll-smooth rounded-lg text-white select-none scrollbar-hidden">
      {/* Header with Search Input */}
      <Header>
        <div className="flex items-center bg-white/10 hover:bg-white/15 focus-within:bg-white/15 focus-within:border-white/30 text-white rounded-full px-4 py-2.5 w-full max-w-md border border-white/10 backdrop-blur-md transition-all group ml-2 shadow-inner">
          <SearchIcon size={18} className="text-[#b3b3b3] group-focus-within:text-white mr-3 flex-shrink-0" />
          <input
            type="text"
            placeholder="What do you want to play?"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="bg-transparent border-none outline-none w-full text-sm font-semibold placeholder:text-[#b3b3b3] placeholder:font-normal"
          />
          {query && (
            <button onClick={clearSearch} className="text-[#b3b3b3] hover:text-white p-1">
              <X size={16} />
            </button>
          )}
        </div>
      </Header>

      <main className="p-6 pb-36 space-y-8">
        {/* Filter Chips when search is active */}
        {query.trim() && (
          <div className="flex space-x-2 overflow-x-auto pb-1">
            {(["all", "songs", "artists", "albums", "playlists"] as const).map((type) => (
              <button
                key={type}
                onClick={() => setFilterType(type)}
                className={`text-xs font-bold px-4 py-1.5 rounded-full capitalize transition ${
                  filterType === type
                    ? "bg-white text-black font-extrabold"
                    : "bg-[#242424] hover:bg-[#2a2a2a] text-white"
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        )}

        {/* State 1: Search Results */}
        {results ? (
          <div className="space-y-8">
            {/* Top Result + Songs (when type is "all" or "songs") */}
            {(filterType === "all" || filterType === "songs") && (
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                {/* Top Result Card */}
                {results.topResult && filterType === "all" && (
                  <div className="lg:col-span-2 space-y-3">
                    <h2 className="text-xl font-bold">Top result</h2>
                    <div
                      onClick={() => {
                        if (results.topResult?.raw) {
                          playSongWithQueue(results.topResult.raw, results.songs)
                        }
                      }}
                      className="liquid-glass-card p-5 rounded-2xl transition-all duration-300 group cursor-pointer relative"
                    >
                      <img
                        src={results.topResult.coverUrl}
                        alt=""
                        className="w-24 h-24 rounded-md object-cover shadow-xl mb-4"
                      />
                      <h3 className="text-2xl font-black text-white truncate mb-1">
                        {results.topResult.title}
                      </h3>
                      <div className="flex items-center space-x-2 text-xs text-[#b3b3b3] font-semibold">
                        <span className="uppercase px-2 py-0.5 rounded-full bg-black/60 text-white">
                          {results.topResult.type}
                        </span>
                        <span>{results.topResult.subtitle}</span>
                      </div>

                      {/* Play Button */}
                      <button className="absolute bottom-5 right-5 w-12 h-12 bg-[#1db954] hover:bg-[#1ed760] text-black rounded-full shadow-2xl flex items-center justify-center opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 hover:scale-106">
                        <Play fill="currentColor" size={22} className="ml-0.5" />
                      </button>
                    </div>
                  </div>
                )}

                {/* Songs List */}
                <div className={`${filterType === "all" ? "lg:col-span-3" : "col-span-full"} space-y-3`}>
                  <h2 className="text-xl font-bold">Songs</h2>
                  {results.songs.length === 0 ? (
                    <p className="text-sm text-[#a7a7a7]">No songs match &quot;{query}&quot;</p>
                  ) : (
                    <div className="flex flex-col space-y-1">
                      {results.songs.slice(0, filterType === "all" ? 5 : 20).map((song, i) => {
                        const isCurrent = currentSong?.id === song.id
                        const isLiked = likedSongIds.has(song.id)
                        const cover = getSongCover(song, 100)

                        return (
                          <div
                            key={song.id}
                            onClick={() => playSongWithQueue(song, results.songs, i)}
                            onContextMenu={(e) => {
                              e.preventDefault()
                              openContextMenu(e.clientX, e.clientY, song)
                            }}
                            className={`flex items-center justify-between p-2 rounded-md hover:bg-white/10 group cursor-pointer transition-colors ${
                              isCurrent ? "text-[#1db954]" : "text-white"
                            }`}
                          >
                            <div className="flex items-center space-x-3 overflow-hidden">
                              <img src={cover} alt="" className="w-10 h-10 rounded object-cover shadow" />
                              <div className="overflow-hidden">
                                <span className={`text-sm font-semibold truncate block ${isCurrent ? "text-[#1db954]" : "text-white"}`}>
                                  {song.title}
                                </span>
                                <span className="text-xs text-[#b3b3b3] truncate block group-hover:text-white">
                                  {song.artist}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center space-x-3 pr-2 text-xs text-[#b3b3b3]">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  toggleLikeSong(song)
                                }}
                                className={`transition ${isLiked ? "text-[#1db954]" : "opacity-0 group-hover:opacity-100 hover:text-white"}`}
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
              </div>
            )}

            {/* Artists Grid */}
            {(filterType === "all" || filterType === "artists") && results.artists.length > 0 && (
              <section className="space-y-4">
                <h2 className="text-xl font-bold">Artists</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {results.artists.map((artist) => (
                    <Link
                      key={artist.id}
                      href={`/artist/${artist.id}`}
                      className="bg-[#181818] hover:bg-[#282828] p-4 rounded-lg transition-all duration-300 group cursor-pointer flex flex-col items-center text-center"
                    >
                      <img
                        src={artist.imageUrl || "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=200&q=80"}
                        alt={artist.name}
                        className="w-32 h-32 rounded-full object-cover shadow-2xl mb-3 group-hover:scale-105 transition-transform"
                      />
                      <h3 className="font-bold text-sm text-white truncate w-full">{artist.name}</h3>
                      <span className="text-xs text-[#b3b3b3]">Artist</span>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* Albums Grid */}
            {(filterType === "all" || filterType === "albums") && results.albums.length > 0 && (
              <section className="space-y-4">
                <h2 className="text-xl font-bold">Albums</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {results.albums.map((album) => (
                    <Link
                      key={album.id}
                      href={`/album/${album.id}`}
                      className="bg-[#181818] hover:bg-[#282828] p-4 rounded-lg transition-all duration-300 group cursor-pointer"
                    >
                      <img
                        src={album.coverUrl}
                        alt={album.title}
                        className="w-full aspect-square rounded-md object-cover shadow-xl mb-3 group-hover:scale-105 transition-transform"
                      />
                      <h3 className="font-bold text-sm text-white truncate">{album.title}</h3>
                      <span className="text-xs text-[#b3b3b3] truncate block">{album.artist}</span>
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </div>
        ) : (
          /* State 2: Default "Browse all" saturated genre cards */
          <div className="space-y-8">
            {/* Recent Searches */}
            {recentSearches.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-base text-white">Recent searches</h3>
                  <button
                    onClick={() => {
                      setRecentSearches([])
                      localStorage.removeItem("tunely_recent_searches")
                    }}
                    className="text-xs font-semibold text-[#b3b3b3] hover:text-white"
                  >
                    Clear all
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {recentSearches.map((term, i) => (
                    <button
                      key={i}
                      onClick={() => setQuery(term)}
                      className="px-4 py-1.5 rounded-full bg-[#242424] hover:bg-[#2a2a2a] text-xs font-semibold text-white flex items-center space-x-2 transition"
                    >
                      <span>{term}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Saturated Colored Genre Tiles */}
            <div className="space-y-4">
              <h2 className="text-2xl font-bold">Browse all</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
                {genres.map((cat) => (
                  <div
                    key={cat.id}
                    onClick={() => setQuery(cat.name)}
                    style={{ backgroundColor: cat.color }}
                    className="rounded-lg p-4 h-48 relative overflow-hidden cursor-pointer hover:scale-[1.02] active:scale-95 transition-all shadow-xl select-none"
                  >
                    <h3 className="text-2xl font-black text-white leading-tight z-10 relative">
                      {cat.name}
                    </h3>
                    <img
                      src={cat.image || `https://picsum.photos/seed/${cat.id}/120/120`}
                      className="absolute -right-3 -bottom-3 w-28 h-28 rotate-[25deg] shadow-2xl rounded object-cover"
                      alt={cat.name}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
