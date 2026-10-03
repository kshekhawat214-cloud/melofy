"use client"
import { useState, useRef, useEffect } from "react"
import { ChevronLeft, ChevronRight, User as UserIcon, Settings, Download, ExternalLink, LogOut } from "lucide-react"
import { useRouter } from "next/navigation"
import { useUIStore } from "@/store/uiStore"
import { useAuthStore } from "@/store/authStore"

export default function Header({ children }: { children?: React.ReactNode }) {
  const router = useRouter()
  const { openImportModal, openProfile, openSettings, loadPlaylists, loadLikedSongIds } = useUIStore()
  const { user, isAuthenticated, openLoginModal, openSignupModal, logout, initAuth } = useAuthStore()
  const [showDropdown, setShowDropdown] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    initAuth()
  }, [initAuth])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    if (showDropdown) {
      window.addEventListener("mousedown", handleClickOutside)
    }
    return () => window.removeEventListener("mousedown", handleClickOutside)
  }, [showDropdown])

  const handleLogout = () => {
    setShowDropdown(false)
    logout()
    // Refresh library for guest
    loadPlaylists()
    loadLikedSongIds()
  }

  const displayName = user?.displayName || user?.username || "Guest"
  const avatarUrl = user?.avatarUrl

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between px-6 py-4 bg-gradient-to-b from-black/60 to-black/20 backdrop-blur-md">
      {/* Navigation Buttons + Optional Search/Children */}
      <div className="flex items-center space-x-3 flex-1">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => router.back()}
            className="w-8 h-8 rounded-full bg-black/70 hover:bg-black text-white flex items-center justify-center transition disabled:opacity-40"
            title="Go back"
          >
            <ChevronLeft size={20} />
          </button>
          <button
            onClick={() => router.forward()}
            className="w-8 h-8 rounded-full bg-black/70 hover:bg-black text-white flex items-center justify-center transition disabled:opacity-40"
            title="Go forward"
          >
            <ChevronRight size={20} />
          </button>
        </div>

        {children}
      </div>

      {/* Right Action Controls: Import & Auth / User Profile */}
      <div className="flex items-center space-x-3" ref={dropdownRef}>
        <button
          onClick={openImportModal}
          className="hidden sm:flex items-center space-x-2 bg-white/10 hover:bg-white/20 text-white text-xs font-bold px-3 py-1.5 rounded-full transition-colors border border-white/5 hover:border-white/20"
        >
          <Download size={14} className="text-[#1db954]" />
          <span>Transfer Library</span>
        </button>

        {isAuthenticated && user ? (
          /* Logged In User Pill Dropdown */
          <div className="relative">
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              className="flex items-center space-x-2 bg-black/60 hover:bg-[#282828] p-1 pr-3 rounded-full transition-colors group border border-transparent hover:border-white/10"
              title={`Logged in as ${displayName}`}
            >
              <div className="w-7 h-7 rounded-full bg-[#282828] group-hover:bg-[#333] flex items-center justify-center text-white overflow-hidden shadow">
                {avatarUrl ? (
                  <img src={avatarUrl} alt={displayName} className="w-full h-full object-cover" />
                ) : (
                  <UserIcon size={16} />
                )}
              </div>
              <span className="text-xs font-bold text-white max-w-[120px] truncate">{displayName}</span>
            </button>

            {/* Avatar Dropdown */}
            {showDropdown && (
              <div className="absolute right-0 top-11 w-52 bg-[#282828] border border-[#383838] rounded-lg shadow-2xl py-1.5 z-50 text-sm text-[#e0e0e0] animate-in fade-in duration-100 divide-y divide-[#383838]">
                <div className="px-4 py-2">
                  <p className="text-xs font-bold text-white truncate">{displayName}</p>
                  <p className="text-[11px] text-[#b3b3b3] truncate">@{user.username}</p>
                </div>

                <div className="py-1">
                  <button
                    onClick={() => {
                      setShowDropdown(false)
                      openProfile()
                    }}
                    className="w-full text-left px-4 py-2 hover:bg-[#383838] hover:text-white flex items-center justify-between transition-colors text-xs"
                  >
                    <span>Profile</span>
                    <ExternalLink size={13} className="text-[#a7a7a7]" />
                  </button>

                  <button
                    onClick={() => {
                      setShowDropdown(false)
                      openSettings()
                    }}
                    className="w-full text-left px-4 py-2 hover:bg-[#383838] hover:text-white flex items-center justify-between transition-colors text-xs"
                  >
                    <span>Settings</span>
                    <Settings size={13} className="text-[#a7a7a7]" />
                  </button>
                </div>

                <div className="py-1">
                  <button
                    onClick={handleLogout}
                    className="w-full text-left px-4 py-2 hover:bg-[#383838] hover:text-red-400 text-red-300 flex items-center justify-between transition-colors text-xs"
                  >
                    <span>Log out</span>
                    <LogOut size={13} />
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Unauthenticated Spotify Auth Buttons */
          <div className="flex items-center space-x-2">
            <button
              onClick={openSignupModal}
              className="text-[#b3b3b3] hover:text-white font-bold text-xs sm:text-sm px-3 py-2 hover:scale-105 active:scale-100 transition select-none"
            >
              Sign up
            </button>
            <button
              onClick={openLoginModal}
              className="bg-white hover:bg-white/90 text-black font-bold text-xs sm:text-sm px-5 sm:px-7 py-2 sm:py-2.5 rounded-full hover:scale-105 active:scale-100 transition shadow select-none"
            >
              Log in
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
