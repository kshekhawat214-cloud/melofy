"use client"
import { useEffect, useState, useRef } from "react"
import { Home, Search, Library, Plus, ArrowRight, Download, Volume2, Search as SearchIcon, X, Music, MoreHorizontal } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useUIStore } from "@/store/uiStore"
import { usePlayerStore } from "@/store/playerStore"
import { useBreakpoint } from "@/hooks/useBreakpoint"

export default function Sidebar() {
  const pathname = usePathname()
  const { isTablet } = useBreakpoint()
  const {
    sidebarWidth,
    setSidebarWidth,
    isSidebarCollapsed,
    toggleSidebarCollapsed,
    openImportModal,
    openPlaylistModal,
    openContextMenu,
    playlists,
    loadPlaylists,
    likedSongIds,
    loadLikedSongIds,
  } = useUIStore()

  const { currentSong, isPlaying } = usePlayerStore()

  const isEffectiveCollapsed = isSidebarCollapsed || isTablet
  const effectiveWidth = isEffectiveCollapsed ? 72 : sidebarWidth

  const [activeFilter, setActiveFilter] = useState<"all" | "playlists" | "artists">("all")
  const [librarySearch, setLibrarySearch] = useState("")
  const [showSearchInput, setShowSearchInput] = useState(false)
  const [showPlusMenu, setShowPlusMenu] = useState(false)

  const isResizing = useRef(false)

  useEffect(() => {
    useUIStore.getState().initFromStorage()
    loadPlaylists()
    loadLikedSongIds()
  }, [loadPlaylists, loadLikedSongIds])

  // Drag resizing
  useEffect(() => {
    function handleMouseMove(e: MouseEvent) {
      if (!isResizing.current || isTablet) return
      setSidebarWidth(e.clientX)
    }
    function handleMouseUp() {
      if (isResizing.current) {
        isResizing.current = false
        document.body.style.cursor = "default"
        document.body.style.userSelect = "auto"
      }
    }
    window.addEventListener("mousemove", handleMouseMove)
    window.addEventListener("mouseup", handleMouseUp)
    return () => {
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", handleMouseUp)
    }
  }, [setSidebarWidth, isTablet])

  const filteredPlaylists = playlists.filter((pl) =>
    pl.name.toLowerCase().includes(librarySearch.toLowerCase())
  )

  return (
    <div
      style={{ width: `${effectiveWidth}px` }}
      suppressHydrationWarning
      className="relative flex-shrink-0 flex flex-col h-[calc(100vh-90px)] select-none space-y-2"
    >
      {/* Top Nav Block */}
      <div className="bg-[#121212] rounded-lg p-4 space-y-4">
        <Link
          href="/"
          onClick={(e) => {
            if (pathname === "/") {
              e.preventDefault()
              const mainEl = document.getElementById("main-scroll-container") || document.querySelector("main")?.parentElement
              if (mainEl) {
                mainEl.scrollTo({ top: 0, behavior: "smooth" })
              }
            }
          }}
          className={`flex items-center space-x-5 transition-colors ${
            pathname === "/" ? "text-white font-bold" : "text-[#b3b3b3] hover:text-white"
          } ${isEffectiveCollapsed ? "justify-center" : ""}`}
        >
          <Home size={24} strokeWidth={pathname === "/" ? 2.8 : 2} />
          {!isEffectiveCollapsed && <span className="text-sm font-bold">Home</span>}
        </Link>
        <Link
          href="/search"
          className={`flex items-center space-x-5 transition-colors ${
            pathname.startsWith("/search") ? "text-white font-bold" : "text-[#b3b3b3] hover:text-white"
          } ${isEffectiveCollapsed ? "justify-center" : ""}`}
        >
          <Search size={24} strokeWidth={pathname.startsWith("/search") ? 2.8 : 2} />
          {!isEffectiveCollapsed && <span className="text-sm font-bold">Search</span>}
        </Link>
      </div>

      {/* Library Block */}
      <div className="bg-[#121212] rounded-lg flex-1 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 flex items-center justify-between text-[#b3b3b3] pb-2">
          <button
            onClick={toggleSidebarCollapsed}
            className="flex items-center space-x-3 hover:text-white transition-colors duration-200"
            title="Collapse or expand Your Library"
          >
            <Library size={24} strokeWidth={2} />
            {!isEffectiveCollapsed && <span className="font-bold text-sm">Your Library</span>}
          </button>

          {!isEffectiveCollapsed && (
            <div className="flex items-center space-x-1 relative">
              {/* Plus Menu Button */}
              <button
                onClick={() => setShowPlusMenu(!showPlusMenu)}
                className="w-8 h-8 flex items-center justify-center hover:bg-[#282828] hover:text-white rounded-full transition"
                title="Create playlist or import audio"
              >
                <Plus size={20} />
              </button>

              {/* Plus Dropdown Menu */}
              {showPlusMenu && (
                <div
                  onMouseLeave={() => setShowPlusMenu(false)}
                  className="absolute right-0 top-9 w-52 bg-[#282828] border border-[#383838] rounded-md shadow-2xl py-1 z-50 text-sm animate-in fade-in duration-100"
                >
                  <button
                    onClick={() => {
                      setShowPlusMenu(false)
                      openPlaylistModal()
                    }}
                    className="w-full text-left px-4 py-2 hover:bg-[#383838] hover:text-white flex items-center space-x-3 text-white"
                  >
                    <Plus size={16} className="text-[#1db954]" />
                    <span>Create a new playlist</span>
                  </button>
                  <button
                    onClick={() => {
                      setShowPlusMenu(false)
                      openImportModal()
                    }}
                    className="w-full text-left px-4 py-2 hover:bg-[#383838] hover:text-white flex items-center space-x-3 text-[#d0d0d0]"
                  >
                    <Download size={16} className="text-[#a855f7]" />
                    <span>Transfer library / import</span>
                  </button>
                </div>
              )}

              <button
                onClick={toggleSidebarCollapsed}
                className="w-8 h-8 flex items-center justify-center hover:bg-[#282828] hover:text-white rounded-full transition"
                title="Collapse"
              >
                <ArrowRight size={18} />
              </button>
            </div>
          )}
        </div>

        {/* Filter Chips & Library Search */}
        {!isEffectiveCollapsed && (
          <div className="px-4 py-2 space-y-2">
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setActiveFilter(activeFilter === "playlists" ? "all" : "playlists")}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full transition ${
                  activeFilter === "playlists"
                    ? "bg-white text-black font-bold"
                    : "bg-[#242424] hover:bg-[#2a2a2a] text-white"
                }`}
              >
                Playlists
              </button>
              <button
                onClick={() => setActiveFilter(activeFilter === "artists" ? "all" : "artists")}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full transition ${
                  activeFilter === "artists"
                    ? "bg-white text-black font-bold"
                    : "bg-[#242424] hover:bg-[#2a2a2a] text-white"
                }`}
              >
                Artists
              </button>
            </div>

            {/* Quick Search inside library */}
            <div className="flex items-center justify-between pt-1 text-[#b3b3b3]">
              {showSearchInput ? (
                <div className="flex items-center bg-[#242424] rounded-full px-2.5 py-1 w-full text-xs">
                  <SearchIcon size={14} className="mr-1.5 text-[#888]" />
                  <input
                    type="text"
                    placeholder="Search in Your Library"
                    value={librarySearch}
                    onChange={(e) => setLibrarySearch(e.target.value)}
                    autoFocus
                    className="bg-transparent border-none outline-none text-white w-full"
                  />
                  <button
                    onClick={() => {
                      setLibrarySearch("")
                      setShowSearchInput(false)
                    }}
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowSearchInput(true)}
                  className="p-1 hover:text-white rounded-full transition"
                  title="Search library"
                >
                  <SearchIcon size={16} />
                </button>
              )}
              <span className="text-xs text-[#888]">Recents</span>
            </div>
          </div>
        )}

        {/* Scrollable Library Items */}
        <div className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5 scrollbar-hidden">
          {/* Pinned Liked Songs */}
          <Link
            href="/liked"
            className={`w-full flex items-center p-2 rounded-md hover:bg-[#1a1a1a] transition-colors group ${
              pathname === "/liked" ? "bg-[#282828]" : ""
            } ${isEffectiveCollapsed ? "justify-center" : "space-x-3"}`}
            title="Liked Songs"
          >
            <div className="w-12 h-12 flex-shrink-0 bg-gradient-to-br from-indigo-600 via-purple-600 to-blue-400 rounded-md flex items-center justify-center shadow-lg">
              <span className="text-white text-lg">❤️</span>
            </div>
            {!isEffectiveCollapsed && (
              <div className="flex flex-col items-start overflow-hidden">
                <span className={`font-semibold text-sm truncate ${pathname === "/liked" ? "text-[#1db954]" : "text-white"}`}>
                  Liked Songs
                </span>
                <span className="text-[#b3b3b3] text-xs flex items-center">
                  <span className="text-[#1db954] mr-1">📌</span> Playlist • {likedSongIds.size} songs
                </span>
              </div>
            )}
          </Link>

          {/* User Playlists */}
          {filteredPlaylists.map((pl) => (
            <div
              key={pl.id}
              onContextMenu={(e) => {
                e.preventDefault()
                openContextMenu(e.clientX, e.clientY, undefined, undefined, pl)
              }}
              className="relative group/pl w-full"
            >
              <Link
                href={`/playlist/${pl.id}`}
                className={`w-full flex items-center p-2 rounded-md hover:bg-[#1a1a1a] transition-colors group ${
                  pathname === `/playlist/${pl.id}` ? "bg-[#282828]" : ""
                } ${isEffectiveCollapsed ? "justify-center" : "space-x-3"}`}
                title={pl.name}
              >
                <div className="w-12 h-12 flex-shrink-0 rounded-md overflow-hidden bg-[#242424] flex items-center justify-center shadow">
                  {pl.coverUrl ? (
                    <img src={pl.coverUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <Music size={20} className="text-[#6a6a6a]" />
                  )}
                </div>
                {!isEffectiveCollapsed && (
                  <div className="flex flex-col items-start overflow-hidden flex-1 pr-6">
                    <div className="flex items-center space-x-1.5 w-full">
                      <span
                        className={`font-semibold text-sm truncate text-left ${
                          pathname === `/playlist/${pl.id}` ? "text-[#1db954]" : "text-white group-hover:text-white"
                        }`}
                      >
                        {pl.name}
                      </span>
                      {isPlaying && currentSong && (
                        <Volume2 size={14} className="text-[#1db954] flex-shrink-0 animate-pulse" />
                      )}
                    </div>
                    <span className="text-[#b3b3b3] text-xs truncate">
                      {pl.isSaved ? `Shared by ${pl.owner || "User"}` : `Playlist • ${pl.songCount || 0} songs`}
                    </span>
                  </div>
                )}
              </Link>

              {/* 3-dots options button on hover */}
              {!isEffectiveCollapsed && (
                <button
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    const rect = e.currentTarget.getBoundingClientRect()
                    openContextMenu(rect.right, rect.bottom, undefined, undefined, pl)
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover/pl:opacity-100 p-1.5 hover:bg-[#333] text-[#b3b3b3] hover:text-white rounded-full transition-opacity z-10"
                  title="More playlist options"
                >
                  <MoreHorizontal size={16} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Resize Handle (Hidden on Tablet) */}
      {!isTablet && (
        <div
          onMouseDown={() => {
            isResizing.current = true
            document.body.style.cursor = "col-resize"
            document.body.style.userSelect = "none"
          }}
          className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-[#1db954]/50 active:bg-[#1db954] transition-colors z-20"
        />
      )}
    </div>
  )
}

