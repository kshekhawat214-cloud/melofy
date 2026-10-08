"use client"
import { useEffect, useRef, useState } from "react"
import { useUIStore } from "@/store/uiStore"
import { usePlayerStore } from "@/store/playerStore"
import {
  addTrackToPlaylist,
  removeTrackFromPlaylist,
  deletePlaylist,
  unsavePlaylist,
  clonePlaylist,
  getSongCover,
} from "@/lib/api"
import {
  Plus,
  ListPlus,
  Heart,
  Share2,
  User,
  Disc,
  Trash2,
  ChevronRight,
  ChevronDown,
  Play,
  Edit2,
  Copy,
  Music,
  Check,
  X,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useBreakpoint } from "@/hooks/useBreakpoint"

export default function ContextMenu() {
  const router = useRouter()
  const { isMobile } = useBreakpoint()
  const {
    contextMenu,
    closeContextMenu,
    playlists,
    addToast,
    likedSongIds,
    toggleLikeSong,
    openPlaylistModal,
    loadPlaylists,
  } = useUIStore()
  const { addToQueue, playNextInQueue, playSongWithQueue } = usePlayerStore()
  const [showPlaylistsSubmenu, setShowPlaylistsSubmenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Android back button / popstate handling for mobile bottom sheet
  useEffect(() => {
    if (contextMenu.isOpen && isMobile) {
      if (window.location.hash !== "#options") {
        window.history.pushState(null, "", "#options")
      }
      const handlePopState = () => {
        if (window.location.hash !== "#options") {
          closeContextMenu()
        }
      }
      window.addEventListener("popstate", handlePopState)
      return () => {
        window.removeEventListener("popstate", handlePopState)
      }
    }
  }, [contextMenu.isOpen, isMobile, closeContextMenu])

  const handleDismiss = () => {
    if (isMobile && window.location.hash === "#options") {
      window.history.back()
    }
    closeContextMenu()
  }

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (!isMobile && menuRef.current && !menuRef.current.contains(e.target as Node)) {
        closeContextMenu()
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") closeContextMenu()
    }
    if (contextMenu.isOpen) {
      window.addEventListener("mousedown", handleClickOutside)
      window.addEventListener("keydown", handleKeyDown)
    }
    return () => {
      window.removeEventListener("mousedown", handleClickOutside)
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [contextMenu.isOpen, closeContextMenu, isMobile])

  if (!contextMenu.isOpen) return null

  // Clamped coordinates for desktop to prevent off-screen overflow
  const winW = typeof window !== "undefined" ? window.innerWidth : 1200
  const winH = typeof window !== "undefined" ? window.innerHeight : 800
  const clampedX = Math.max(12, Math.min(contextMenu.x, winW - 240))
  const clampedY = Math.max(12, Math.min(contextMenu.y, winH - 360))

  // ----------------------------------------------------
  // PLAYLIST CONTEXT MENU / BOTTOM SHEET
  // ----------------------------------------------------
  if (contextMenu.playlist && !contextMenu.song) {
    const pl = contextMenu.playlist
    const isOwner = pl.isOwner !== false && !pl.isSaved

    const handleDeletePlaylist = async () => {
      closeContextMenu()
      const actionText = isOwner ? "Delete" : "Remove"
      const confirmed = window.confirm(`${actionText} "${pl.name}" from Your Library?`)
      if (!confirmed) return
      try {
        const ok = isOwner ? await deletePlaylist(pl.id) : await unsavePlaylist(pl.id)
        if (ok) {
          addToast(isOwner ? `Deleted "${pl.name}"` : `Removed from your library`)
          await loadPlaylists()
          if (window.location.pathname.includes(pl.id)) {
            router.push("/")
          }
        } else {
          addToast("Failed to remove playlist", "error")
        }
      } catch {
        addToast("Failed to remove playlist", "error")
      }
    }

    const handleEditPlaylist = () => {
      closeContextMenu()
      openPlaylistModal({
        id: pl.id,
        name: pl.name,
        description: pl.description,
        coverUrl: pl.coverUrl,
      })
    }

    const handleClonePlaylist = async () => {
      closeContextMenu()
      const cloned = await clonePlaylist(pl.id)
      if (cloned) {
        addToast(`Copied to your playlists!`, "success")
        await loadPlaylists()
        router.push(`/playlist/${cloned.id}`)
      } else {
        addToast("Failed to copy playlist", "error")
      }
    }

    const handleCopyPlaylistLink = () => {
      const link = `${window.location.origin}/playlist/${pl.id}`
      navigator.clipboard.writeText(link)
      addToast("Playlist link copied to clipboard")
      closeContextMenu()
    }

    // MOBILE BOTTOM SHEET
    if (isMobile) {
      return (
        <div className="fixed inset-0 z-[150] flex flex-col justify-end bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="absolute inset-0" onClick={handleDismiss} />
          <div
            ref={menuRef}
            className="relative z-10 liquid-glass-elevated rounded-t-3xl max-h-[85vh] overflow-y-auto p-4 pb-8 border-t border-white/20 shadow-2xl animate-in slide-in-from-bottom duration-250 select-none text-[#e0e0e0] backdrop-blur-3xl"
          >
            {/* Grab pill */}
            <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-3" />

            {/* Header with artwork & title */}
            <div className="flex items-center space-x-3 pb-3 border-b border-white/10 mb-2">
              <div className="w-12 h-12 rounded-md overflow-hidden bg-[#181818] flex-shrink-0 flex items-center justify-center shadow">
                {pl.coverUrl ? (
                  <img src={pl.coverUrl} className="w-full h-full object-cover" alt="" />
                ) : (
                  <Music size={22} className="text-[#888]" />
                )}
              </div>
              <div className="flex flex-col min-w-0 flex-1">
                <span className="font-bold text-white text-base truncate">{pl.name}</span>
                <span className="text-xs text-[#b3b3b3] truncate">
                  Playlist • {pl.owner || "Guest"}
                </span>
              </div>
            </div>

            {/* Action Items */}
            <div className="flex flex-col space-y-1">
              <button
                onClick={() => {
                  router.push(`/playlist/${pl.id}`)
                  handleDismiss()
                }}
                className="w-full text-left px-3 py-3.5 hover:bg-white/10 active:bg-white/15 rounded-lg flex items-center space-x-3.5 font-medium text-sm transition-colors"
              >
                <Play size={20} className="text-[#1db954]" fill="currentColor" />
                <span>Open playlist</span>
              </button>

              {isOwner ? (
                <button
                  onClick={handleEditPlaylist}
                  className="w-full text-left px-3 py-3.5 hover:bg-white/10 active:bg-white/15 rounded-lg flex items-center space-x-3.5 font-medium text-sm transition-colors"
                >
                  <Edit2 size={20} />
                  <span>Edit details / Rename</span>
                </button>
              ) : (
                <button
                  onClick={handleClonePlaylist}
                  className="w-full text-left px-3 py-3.5 hover:bg-white/10 active:bg-white/15 rounded-lg flex items-center space-x-3.5 font-medium text-sm transition-colors"
                >
                  <Copy size={20} />
                  <span>Copy to my playlists</span>
                </button>
              )}

              <button
                onClick={handleCopyPlaylistLink}
                className="w-full text-left px-3 py-3.5 hover:bg-white/10 active:bg-white/15 rounded-lg flex items-center space-x-3.5 font-medium text-sm transition-colors"
              >
                <Share2 size={20} />
                <span>Share link</span>
              </button>

              <button
                onClick={handleDeletePlaylist}
                className="w-full text-left px-3 py-3.5 hover:bg-red-500/10 active:bg-red-500/20 text-red-400 rounded-lg flex items-center space-x-3.5 font-medium text-sm transition-colors"
              >
                <Trash2 size={20} />
                <span>{isOwner ? "Delete playlist" : "Remove from library"}</span>
              </button>
            </div>

            {/* Close Button */}
            <button
              onClick={handleDismiss}
              className="w-full mt-4 py-3 bg-white/10 active:bg-white/20 rounded-full font-bold text-sm text-white text-center transition"
            >
              Close
            </button>
          </div>
        </div>
      )
    }

    // DESKTOP CONTEXT MENU
    return (
      <div
        ref={menuRef}
        style={{ top: `${clampedY}px`, left: `${clampedX}px` }}
        className="fixed z-[120] w-56 liquid-glass-elevated rounded-xl shadow-2xl py-1 text-sm text-[#e0e0e0] font-normal animate-in fade-in duration-100 select-none backdrop-blur-2xl"
      >
        <button
          onClick={() => {
            router.push(`/playlist/${pl.id}`)
            closeContextMenu()
          }}
          className="w-full text-left px-3 py-2 hover:bg-[#3e3e3e] hover:text-white flex items-center space-x-3 transition-colors"
        >
          <Play size={16} />
          <span>Open playlist</span>
        </button>

        {isOwner ? (
          <button
            onClick={handleEditPlaylist}
            className="w-full text-left px-3 py-2 hover:bg-[#3e3e3e] hover:text-white flex items-center space-x-3 transition-colors"
          >
            <Edit2 size={16} />
            <span>Edit details / Rename</span>
          </button>
        ) : (
          <button
            onClick={handleClonePlaylist}
            className="w-full text-left px-3 py-2 hover:bg-[#3e3e3e] hover:text-white flex items-center space-x-3 transition-colors"
          >
            <Copy size={16} />
            <span>Copy to my playlists</span>
          </button>
        )}

        <button
          onClick={handleCopyPlaylistLink}
          className="w-full text-left px-3 py-2 hover:bg-[#3e3e3e] hover:text-white flex items-center space-x-3 transition-colors"
        >
          <Share2 size={16} />
          <span>Copy link to share</span>
        </button>

        <div className="h-[1px] bg-[#3e3e3e] my-1" />

        <button
          onClick={handleDeletePlaylist}
          className="w-full text-left px-3 py-2 hover:bg-red-500/20 text-red-400 hover:text-red-300 flex items-center space-x-3 transition-colors"
        >
          <Trash2 size={16} />
          <span>{isOwner ? "Delete playlist" : "Remove from library"}</span>
        </button>
      </div>
    )
  }

  // ----------------------------------------------------
  // SONG CONTEXT MENU / BOTTOM SHEET
  // ----------------------------------------------------
  if (!contextMenu.song) return null

  const song = contextMenu.song
  const isLiked = likedSongIds.has(song.id)
  const coverSrc = getSongCover(song, 120)

  const handleAddToQueue = () => {
    addToQueue(song)
    addToast(`Added '${song.title}' to queue`)
    closeContextMenu()
  }

  const handlePlayNext = () => {
    playNextInQueue(song)
    addToast(`'${song.title}' will play next`)
    closeContextMenu()
  }

  const handleToggleLike = async () => {
    await toggleLikeSong(song)
    closeContextMenu()
  }

  const handleAddToPlaylist = async (playlistId: string, playlistName: string) => {
    const success = await addTrackToPlaylist(playlistId, song.id)
    if (success) {
      addToast(`Added to '${playlistName}'`)
      loadPlaylists()
    } else {
      addToast("Failed to add track", "error")
    }
    closeContextMenu()
  }

  const handleRemoveFromCurrentPlaylist = async () => {
    if (!contextMenu.playlistId) return
    const success = await removeTrackFromPlaylist(contextMenu.playlistId, song.id)
    if (success) {
      addToast("Removed track from playlist")
      loadPlaylists()
      window.dispatchEvent(new CustomEvent("melofy_playlist_updated", { detail: contextMenu.playlistId }))
    }
    closeContextMenu()
  }

  const handleCopyLink = () => {
    const link = `${window.location.origin}/?song=${song.id}`
    navigator.clipboard.writeText(link)
    addToast("Link copied to clipboard")
    closeContextMenu()
  }

  const handleGoToArtist = () => {
    if (song.artistId) {
      router.push(`/artist/${song.artistId}`)
    } else {
      router.push(`/search?q=${encodeURIComponent(song.artist)}`)
    }
    closeContextMenu()
  }

  // MOBILE BOTTOM SHEET FOR SONGS
  if (isMobile) {
    return (
      <div className="fixed inset-0 z-[150] flex flex-col justify-end bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="absolute inset-0" onClick={handleDismiss} />
        <div
          ref={menuRef}
          className="relative z-10 liquid-glass-elevated rounded-t-3xl max-h-[85vh] overflow-y-auto p-4 pb-8 border-t border-white/20 shadow-2xl animate-in slide-in-from-bottom duration-250 select-none text-[#e0e0e0] backdrop-blur-3xl"
        >
          {/* Grab pill */}
          <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-3" />

          {/* Header with artwork, song title, and artist */}
          <div className="flex items-center space-x-3 pb-3 border-b border-white/10 mb-2">
            <img src={coverSrc} className="w-12 h-12 rounded-md object-cover flex-shrink-0 shadow" alt="" />
            <div className="flex flex-col min-w-0 flex-1">
              <span className="font-bold text-white text-base truncate">{song.title}</span>
              <span className="text-xs text-[#b3b3b3] truncate">{song.artist}</span>
            </div>
          </div>

          {/* Action Items */}
          <div className="flex flex-col space-y-1">
            <button
              onClick={() => {
                playSongWithQueue(song, [song])
                closeContextMenu()
              }}
              className="w-full text-left px-3 py-3.5 hover:bg-white/10 active:bg-white/15 rounded-lg flex items-center space-x-3.5 font-medium text-sm transition-colors"
            >
              <Play size={20} className="text-[#1db954]" fill="currentColor" />
              <span>Play now</span>
            </button>

            <button
              onClick={handleAddToQueue}
              className="w-full text-left px-3 py-3.5 hover:bg-white/10 active:bg-white/15 rounded-lg flex items-center space-x-3.5 font-medium text-sm transition-colors"
            >
              <ListPlus size={20} />
              <span>Add to queue</span>
            </button>

            <button
              onClick={handlePlayNext}
              className="w-full text-left px-3 py-3.5 hover:bg-white/10 active:bg-white/15 rounded-lg flex items-center space-x-3.5 font-medium text-sm transition-colors"
            >
              <ListPlus size={20} />
              <span>Play next</span>
            </button>

            {/* Add to Playlist Accordion on Mobile */}
            <div className="rounded-lg overflow-hidden">
              <button
                onClick={() => setShowPlaylistsSubmenu(!showPlaylistsSubmenu)}
                className="w-full text-left px-3 py-3.5 hover:bg-white/10 active:bg-white/15 rounded-lg flex items-center justify-between font-medium text-sm transition-colors"
              >
                <div className="flex items-center space-x-3.5">
                  <Plus size={20} />
                  <span>Add to playlist</span>
                </div>
                {showPlaylistsSubmenu ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
              </button>

              {showPlaylistsSubmenu && (
                <div className="bg-[#1c1c1c] rounded-lg p-2 mt-1 space-y-1 max-h-48 overflow-y-auto">
                  <button
                    onClick={() => {
                      closeContextMenu()
                      openPlaylistModal()
                    }}
                    className="w-full text-left px-3 py-2.5 hover:bg-white/10 rounded flex items-center space-x-2 text-white font-medium text-xs"
                  >
                    <Plus size={16} className="text-[#1db954]" />
                    <span>Create new playlist</span>
                  </button>
                  {playlists.map((pl) => (
                    <button
                      key={pl.id}
                      onClick={() => handleAddToPlaylist(pl.id, pl.name)}
                      className="w-full text-left px-3 py-2 hover:bg-white/10 rounded text-xs text-[#d0d0d0] truncate block"
                    >
                      {pl.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={handleToggleLike}
              className="w-full text-left px-3 py-3.5 hover:bg-white/10 active:bg-white/15 rounded-lg flex items-center space-x-3.5 font-medium text-sm transition-colors"
            >
              <Heart
                size={20}
                fill={isLiked ? "#1db954" : "none"}
                color={isLiked ? "#1db954" : "currentColor"}
              />
              <span>{isLiked ? "Remove from your Liked Songs" : "Save to your Liked Songs"}</span>
            </button>

            {contextMenu.playlistId && (
              <button
                onClick={handleRemoveFromCurrentPlaylist}
                className="w-full text-left px-3 py-3.5 hover:bg-red-500/10 active:bg-red-500/20 text-red-400 rounded-lg flex items-center space-x-3.5 font-medium text-sm transition-colors"
              >
                <Trash2 size={20} />
                <span>Remove from this playlist</span>
              </button>
            )}

            <button
              onClick={handleGoToArtist}
              className="w-full text-left px-3 py-3.5 hover:bg-white/10 active:bg-white/15 rounded-lg flex items-center space-x-3.5 font-medium text-sm transition-colors"
            >
              <User size={20} />
              <span>Go to artist</span>
            </button>

            <button
              onClick={handleCopyLink}
              className="w-full text-left px-3 py-3.5 hover:bg-white/10 active:bg-white/15 rounded-lg flex items-center space-x-3.5 font-medium text-sm transition-colors"
            >
              <Share2 size={20} />
              <span>Copy song link</span>
            </button>
          </div>

          {/* Close Button */}
          <button
            onClick={handleDismiss}
            className="w-full mt-4 py-3 bg-white/10 active:bg-white/20 rounded-full font-bold text-sm text-white text-center transition"
          >
            Close
          </button>
        </div>
      </div>
    )
  }

  // DESKTOP CONTEXT MENU FOR SONGS
  return (
    <div
      ref={menuRef}
      style={{ top: `${clampedY}px`, left: `${clampedX}px` }}
      className="fixed z-[120] w-56 liquid-glass-elevated rounded-xl shadow-2xl py-1 text-sm text-[#e0e0e0] font-normal animate-in fade-in duration-100 select-none backdrop-blur-2xl"
    >
      <button
        onClick={() => {
          playSongWithQueue(song, [song])
          closeContextMenu()
        }}
        className="w-full text-left px-3 py-2 hover:bg-[#3e3e3e] hover:text-white flex items-center space-x-3 transition-colors"
      >
        <Play size={16} />
        <span>Play</span>
      </button>

      <button
        onClick={handleAddToQueue}
        className="w-full text-left px-3 py-2 hover:bg-[#3e3e3e] hover:text-white flex items-center space-x-3 transition-colors"
      >
        <ListPlus size={16} />
        <span>Add to queue</span>
      </button>

      <button
        onClick={handlePlayNext}
        className="w-full text-left px-3 py-2 hover:bg-[#3e3e3e] hover:text-white flex items-center space-x-3 transition-colors"
      >
        <ListPlus size={16} />
        <span>Play next</span>
      </button>

      <div className="h-[1px] bg-[#3e3e3e] my-1" />

      {/* Add to Playlist Flyout Trigger */}
      <div
        className="relative group"
        onMouseEnter={() => setShowPlaylistsSubmenu(true)}
        onMouseLeave={() => setShowPlaylistsSubmenu(false)}
      >
        <button className="w-full text-left px-3 py-2 hover:bg-[#3e3e3e] hover:text-white flex items-center justify-between transition-colors">
          <div className="flex items-center space-x-3">
            <Plus size={16} />
            <span>Add to playlist</span>
          </div>
          <ChevronRight size={14} className="text-[#a7a7a7]" />
        </button>

        {/* Submenu */}
        {showPlaylistsSubmenu && (
          <div className="absolute left-full top-0 ml-1 w-52 liquid-glass-elevated rounded-xl shadow-2xl py-1 z-30 max-h-64 overflow-y-auto backdrop-blur-2xl">
            <button
              onClick={() => {
                closeContextMenu()
                openPlaylistModal()
              }}
              className="w-full text-left px-3 py-2 hover:bg-[#3e3e3e] hover:text-white flex items-center space-x-2 text-white font-medium"
            >
              <Plus size={14} className="text-[#1db954]" />
              <span>New playlist</span>
            </button>
            <div className="h-[1px] bg-[#3e3e3e] my-1" />
            {playlists.map((pl) => (
              <button
                key={pl.id}
                onClick={() => handleAddToPlaylist(pl.id, pl.name)}
                className="w-full text-left px-3 py-1.5 hover:bg-[#3e3e3e] hover:text-white truncate block text-[#d0d0d0]"
              >
                {pl.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <button
        onClick={handleToggleLike}
        className="w-full text-left px-3 py-2 hover:bg-[#3e3e3e] hover:text-white flex items-center space-x-3 transition-colors"
      >
        <Heart size={16} fill={isLiked ? "#1db954" : "none"} color={isLiked ? "#1db954" : "currentColor"} />
        <span>{isLiked ? "Remove from your Liked Songs" : "Save to your Liked Songs"}</span>
      </button>

      {contextMenu.playlistId && (
        <button
          onClick={handleRemoveFromCurrentPlaylist}
          className="w-full text-left px-3 py-2 hover:bg-[#3e3e3e] hover:text-[#e91429] flex items-center space-x-3 transition-colors text-[#e91429]"
        >
          <Trash2 size={16} />
          <span>Remove from this playlist</span>
        </button>
      )}

      <div className="h-[1px] bg-[#3e3e3e] my-1" />

      <button
        onClick={handleGoToArtist}
        className="w-full text-left px-3 py-2 hover:bg-[#3e3e3e] hover:text-white flex items-center space-x-3 transition-colors"
      >
        <User size={16} />
        <span>Go to artist</span>
      </button>

      <button
        onClick={handleCopyLink}
        className="w-full text-left px-3 py-2 hover:bg-[#3e3e3e] hover:text-white flex items-center space-x-3 transition-colors"
      >
        <Share2 size={16} />
        <span>Copy song link</span>
      </button>
    </div>
  )
}
