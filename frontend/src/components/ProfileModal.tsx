"use client"
import { useEffect, useState } from "react"
import { useUIStore } from "@/store/uiStore"
import { getUserProfile, UserProfile } from "@/lib/api"
import { X, User, Music, Heart, Users } from "lucide-react"
import Link from "next/link"

export default function ProfileModal() {
  const { isProfileOpen, closeProfile, playlists } = useUIStore()
  const [profile, setProfile] = useState<UserProfile | null>(null)

  useEffect(() => {
    if (isProfileOpen) {
      getUserProfile().then(setProfile)
    }
  }, [isProfileOpen])

  if (!isProfileOpen) return null

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[110] flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="bg-[#181818] w-full max-w-xl rounded-xl shadow-2xl overflow-hidden border border-[#2a2a2a] text-white">
        {/* Banner with Profile */}
        <div className="bg-gradient-to-b from-indigo-900/60 to-[#181818] p-6 relative">
          <button
            onClick={closeProfile}
            className="absolute top-4 right-4 text-[#b3b3b3] hover:text-white p-1 rounded-full bg-black/40 hover:bg-black/60 transition"
          >
            <X size={20} />
          </button>

          <div className="flex items-center space-x-5">
            <div className="w-24 h-24 rounded-full overflow-hidden shadow-2xl border-2 border-white/20 bg-[#282828] flex items-center justify-center">
              {profile?.avatarUrl ? (
                <img src={profile.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <User size={40} className="text-[#a7a7a7]" />
              )}
            </div>
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-[#b3b3b3]">Profile</span>
              <h1 className="text-3xl font-extrabold text-white mt-1">
                {profile?.displayName || "Guest"}
              </h1>
              <div className="flex items-center space-x-3 text-xs text-[#b3b3b3] font-semibold mt-2">
                <span>{playlists.length} Public Playlists</span>
                <span>•</span>
                <span>{profile?.likedSongsCount || 0} Liked Songs</span>
                <span>•</span>
                <span>42 Followers</span>
              </div>
            </div>
          </div>
        </div>

        {/* Playlists Preview */}
        <div className="p-6 space-y-4">
          <h3 className="text-base font-bold text-white flex items-center space-x-2">
            <Music size={18} className="text-[#1db954]" />
            <span>Public Playlists</span>
          </h3>

          {playlists.length === 0 ? (
            <p className="text-sm text-[#a7a7a7]">No public playlists created yet.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 max-h-56 overflow-y-auto pr-1">
              {playlists.map((pl) => (
                <Link
                  key={pl.id}
                  href={`/playlist/${pl.id}`}
                  onClick={closeProfile}
                  className="flex items-center space-x-3 p-2 bg-[#222] hover:bg-[#282828] rounded-lg transition-colors group"
                >
                  <img
                    src={pl.coverUrl || "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=100&q=80"}
                    alt={pl.name}
                    className="w-10 h-10 rounded object-cover"
                  />
                  <div className="overflow-hidden">
                    <span className="text-sm font-semibold truncate block text-white group-hover:text-[#1db954] transition-colors">
                      {pl.name}
                    </span>
                    <span className="text-xs text-[#a7a7a7]">{pl.songCount} songs</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-[#141414] border-t border-[#2a2a2a] flex justify-end">
          <button
            onClick={closeProfile}
            className="px-6 py-2 rounded-full text-sm font-bold bg-white text-black hover:bg-white/90 hover:scale-105 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
