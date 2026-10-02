"use client"
import { useEffect, useRef, useState } from "react"
import { useUIStore } from "@/store/uiStore"
import { usePlayerStore } from "@/store/playerStore"
import { addTrackToPlaylist, removeTrackFromPlaylist } from "@/lib/api"
import { Plus, ListPlus, Heart, Share2, User, Disc, Trash2, ChevronRight, Play } from "lucide-react"
import { useRouter } from "next/navigation"

export default function ContextMenu() {
  const router = useRouter()
  const { contextMenu, closeContextMenu, playlists, addToast, likedSongIds, toggleLikeSong, openPlaylistModal, loadPlaylists } = useUIStore()
  const { addToQueue, playNextInQueue, playSongWithQueue } = usePlayerStore()
  const [showPlaylistsSubmenu, setShowPlaylistsSubmenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
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
  }, [contextMenu.isOpen, closeContextMenu])

  if (!contextMenu.isOpen || !contextMenu.song) return null

  const song = contextMenu.song
  const isLiked = likedSongIds.has(song.id)

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
      window.location.reload()
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

  return (
    <div
      ref={menuRef}
      style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
      className="fixed z-[120] w-56 bg-[#282828] border border-[#383838] rounded-md shadow-2xl py-1 text-sm text-[#e0e0e0] font-normal animate-in fade-in duration-100 select-none"
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
          <div className="absolute left-full top-0 ml-0.5 w-52 bg-[#282828] border border-[#383838] rounded-md shadow-2xl py-1 z-30 max-h-64 overflow-y-auto">
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
