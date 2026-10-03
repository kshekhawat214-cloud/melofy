"use client"
import { useEffect, useState } from "react"
import Header from "@/components/Header"
import { useUIStore } from "@/store/uiStore"
import { usePlayerStore } from "@/store/playerStore"
import { Plus, Download, Search, Music, MoreVertical, Volume2 } from "lucide-react"
import Link from "next/link"

export default function LibraryPage() {
  const {
    playlists,
    loadPlaylists,
    likedSongIds,
    loadLikedSongIds,
    openPlaylistModal,
    openImportModal,
    openContextMenu,
  } = useUIStore()

  const { currentSong, isPlaying } = usePlayerStore()

  const [filter, setFilter] = useState<"all" | "playlists" | "artists">("all")
  const [searchQuery, setSearchQuery] = useState("")

  useEffect(() => {
    loadPlaylists()
    loadLikedSongIds()
  }, [loadPlaylists, loadLikedSongIds])

  const filteredPlaylists = playlists.filter((pl) =>
    pl.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="flex-1 overflow-y-auto bg-[#121212] h-full text-white select-none pb-40 md:pb-36 scrollbar-hidden">
      <Header />

      <main className="p-4 sm:p-6 space-y-4 max-w-5xl mx-auto">
        {/* Title & Action Buttons */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight">Your Library</h1>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => openImportModal()}
              className="p-2.5 rounded-full hover:bg-white/10 text-[#a855f7] transition"
              title="Import from Spotify / YouTube"
            >
              <Download size={20} />
            </button>
            <button
              onClick={() => openPlaylistModal()}
              className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition"
              title="Create new playlist"
            >
              <Plus size={20} />
            </button>
          </div>
        </div>

        {/* Filter Chips & Search Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setFilter("all")}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition ${
                filter === "all" ? "bg-white text-black" : "bg-white/10 text-white hover:bg-white/20"
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilter("playlists")}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition ${
                filter === "playlists" ? "bg-white text-black" : "bg-white/10 text-white hover:bg-white/20"
              }`}
            >
              Playlists
            </button>
          </div>

          <div className="relative flex-1 sm:max-w-xs">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#888]" />
            <input
              type="text"
              placeholder="Search in Your Library"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white/10 focus:bg-white/15 rounded-full pl-9 pr-4 py-1.5 text-xs text-white placeholder-[#888] outline-none transition"
            />
          </div>
        </div>

        {/* Library List */}
        <div className="space-y-1 pt-2">
          {/* Liked Songs Pinned Item */}
          {(filter === "all" || filter === "playlists") && (
            <Link
              href="/liked"
              className="flex items-center p-2 rounded-lg hover:bg-white/5 active:bg-white/10 transition group"
            >
              <div className="w-14 h-14 rounded-md flex-shrink-0 bg-gradient-to-br from-indigo-600 via-purple-600 to-blue-400 flex items-center justify-center shadow-lg mr-3">
                <span className="text-xl">❤️</span>
              </div>
              <div className="flex-1 overflow-hidden">
                <p className="font-bold text-sm text-white group-hover:text-[#1db954] transition truncate">
                  Liked Songs
                </p>
                <p className="text-xs text-[#b3b3b3] truncate">
                  📌 Playlist • {likedSongIds.size} songs
                </p>
              </div>
            </Link>
          )}

          {/* User Playlists */}
          {filteredPlaylists.map((pl) => (
            <div
              key={pl.id}
              className="flex items-center p-2 rounded-lg hover:bg-white/5 active:bg-white/10 transition group"
            >
              <Link href={`/playlist/${pl.id}`} className="flex items-center flex-1 overflow-hidden">
                <div className="w-14 h-14 rounded-md flex-shrink-0 overflow-hidden bg-[#242424] flex items-center justify-center shadow mr-3">
                  {pl.coverUrl ? (
                    <img src={pl.coverUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <Music size={24} className="text-[#6a6a6a]" />
                  )}
                </div>
                <div className="flex-1 overflow-hidden">
                  <div className="flex items-center space-x-1.5">
                    <p className="font-bold text-sm text-white group-hover:text-[#1db954] transition truncate">
                      {pl.name}
                    </p>
                    {isPlaying && currentSong && (
                      <Volume2 size={14} className="text-[#1db954] flex-shrink-0 animate-pulse" />
                    )}
                  </div>
                  <p className="text-xs text-[#b3b3b3] truncate">
                    {pl.isSaved ? `Shared by ${pl.owner || "User"}` : `Playlist • ${pl.songCount || 0} songs`}
                  </p>
                </div>
              </Link>

              {/* 3-dots actions menu button */}
              <button
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  const rect = e.currentTarget.getBoundingClientRect()
                  openContextMenu(rect.right - 180, rect.bottom, undefined, undefined, pl)
                }}
                className="p-2 text-[#b3b3b3] hover:text-white rounded-full hover:bg-white/10 transition"
                title="Playlist options"
              >
                <MoreVertical size={18} />
              </button>
            </div>
          ))}

          {filteredPlaylists.length === 0 && (
            <div className="py-16 text-center text-[#888] space-y-2">
              <p className="font-semibold text-base">No playlists found</p>
              <p className="text-xs">Click + to create your first playlist or transfer from Spotify</p>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
