"use client"
import { useState, useEffect } from "react"
import { useUIStore } from "@/store/uiStore"
import { createPlaylist, updatePlaylist, deletePlaylist } from "@/lib/api"
import { X, Music, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"

const PRESET_COVERS = [
  "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=400&q=80",
  "https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=400&q=80",
  "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=400&q=80",
  "https://images.unsplash.com/photo-1465847899084-d164df4dedc6?w=400&q=80",
  "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=400&q=80",
  "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400&q=80",
]

export default function PlaylistModal() {
  const router = useRouter()
  const { isPlaylistModalOpen, playlistModalData, closePlaylistModal, loadPlaylists, addToast } = useUIStore()
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [coverUrl, setCoverUrl] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const isEditing = Boolean(playlistModalData?.id)

  useEffect(() => {
    if (playlistModalData) {
      setName(playlistModalData.name || "")
      setDescription(playlistModalData.description || "")
      setCoverUrl(playlistModalData.coverUrl || PRESET_COVERS[0])
    } else {
      setName("")
      setDescription("")
      setCoverUrl(PRESET_COVERS[Math.floor(Math.random() * PRESET_COVERS.length)])
    }
  }, [playlistModalData, isPlaylistModalOpen])

  if (!isPlaylistModalOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    setIsSubmitting(true)
    try {
      if (isEditing && playlistModalData?.id) {
        await updatePlaylist(playlistModalData.id, { name: name.trim(), description, cover_url: coverUrl })
        addToast("Playlist updated successfully")
      } else {
        await createPlaylist({ name: name.trim(), description, cover_url: coverUrl })
        addToast("New playlist created!")
      }
      await loadPlaylists()
      closePlaylistModal()
    } catch {
      addToast("Failed to save playlist", "error")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-[110] flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="liquid-glass-elevated w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden backdrop-blur-3xl border border-white/20">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h2 className="text-xl font-bold text-white">
            {isEditing ? "Edit details" : "Create playlist"}
          </h2>
          <button
            onClick={closePlaylistModal}
            className="text-[#b3b3b3] hover:text-white p-1 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="flex space-x-5">
            {/* Cover selector */}
            <div className="flex flex-col space-y-2">
              <div className="w-36 h-36 rounded-md overflow-hidden bg-[#181818] border border-[#383838] relative group flex items-center justify-center">
                {coverUrl ? (
                  <img src={coverUrl} alt="Playlist Cover" className="w-full h-full object-cover" />
                ) : (
                  <Music size={40} className="text-[#6a6a6a]" />
                )}
              </div>
              <div className="flex space-x-1 overflow-x-auto w-36 py-1 scrollbar-hidden">
                {PRESET_COVERS.map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setCoverUrl(preset)}
                    className={`w-6 h-6 flex-shrink-0 rounded border ${coverUrl === preset ? "border-[#1db954]" : "border-transparent"}`}
                  >
                    <img src={preset} alt="" className="w-full h-full object-cover rounded" />
                  </button>
                ))}
              </div>
            </div>

            {/* Inputs */}
            <div className="flex-1 space-y-3">
              <div>
                <label className="text-xs font-bold text-[#b3b3b3] uppercase tracking-wider block mb-1">
                  Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="My Playlist #1"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-[#3e3e3e] focus:bg-[#333] border border-transparent focus:border-white/50 text-white rounded px-3 py-2 text-sm outline-none transition-colors"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-[#b3b3b3] uppercase tracking-wider block mb-1">
                  Description
                </label>
                <textarea
                  placeholder="Add an optional description"
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-[#3e3e3e] focus:bg-[#333] border border-transparent focus:border-white/50 text-white rounded px-3 py-2 text-sm outline-none resize-none transition-colors"
                />
              </div>
            </div>
          </div>

          {/* Action Row */}
          <div className="flex items-center justify-between pt-2">
            {isEditing && playlistModalData?.id ? (
              <button
                type="button"
                onClick={async () => {
                  const confirmed = window.confirm(`Delete "${name || "this playlist"}" from Your Library? This cannot be undone.`)
                  if (!confirmed) return
                  setIsDeleting(true)
                  try {
                    const ok = await deletePlaylist(playlistModalData.id!)
                    if (ok) {
                      addToast(`Deleted "${name || "playlist"}"`)
                      await loadPlaylists()
                      closePlaylistModal()
                      if (window.location.pathname.includes(playlistModalData.id!)) {
                        router.push("/")
                      }
                    } else {
                      addToast("Failed to delete playlist", "error")
                    }
                  } catch {
                    addToast("Failed to delete playlist", "error")
                  } finally {
                    setIsDeleting(false)
                  }
                }}
                disabled={isDeleting}
                className="text-xs font-semibold text-red-400 hover:text-red-300 hover:underline flex items-center space-x-1.5 transition disabled:opacity-50"
              >
                <Trash2 size={15} />
                <span>{isDeleting ? "Deleting..." : "Delete playlist"}</span>
              </button>
            ) : <div />}

            <div className="flex space-x-3">
              <button
                type="button"
                onClick={closePlaylistModal}
                className="px-5 py-2 rounded-full text-sm font-bold text-white hover:bg-white/10 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !name.trim()}
                className="px-7 py-2.5 rounded-full text-sm font-bold bg-[#1db954] hover:bg-[#1ed760] text-black hover:scale-105 active:scale-95 transition disabled:opacity-50 disabled:scale-100"
              >
                {isSubmitting ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
