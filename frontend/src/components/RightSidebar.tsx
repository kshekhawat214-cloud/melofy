"use client"
import { usePlayerStore } from "@/store/playerStore"
import { useUIStore } from "@/store/uiStore"
import { X, Play, Music, UserCheck, UserPlus, Trash2, ListMusic, Info } from "lucide-react"
import { useState } from "react"
import Link from "next/link"
import { getSongCover } from "@/lib/api"

export default function RightSidebar() {
  const {
    currentSong,
    queue,
    queueIndex,
    isPlaying,
    togglePlay,
    playSongWithQueue,
    removeFromQueue,
    clearQueue,
    isRightSidebarOpen,
    toggleRightSidebar,
    rightSidebarView,
    setRightSidebarView,
  } = usePlayerStore()

  const { openContextMenu } = useUIStore()
  const [isFollowing, setIsFollowing] = useState(false)

  if (!isRightSidebarOpen || !currentSong) return null

  const upcomingTracks = queue.slice(queueIndex + 1)
  const coverSrc = getSongCover(currentSong, 500)

  return (
    <div className="w-[340px] bg-[#121212] rounded-lg flex-shrink-0 flex flex-col h-[calc(100vh-90px)] overflow-hidden border-l border-black/40 text-white animate-in slide-in-from-right duration-200">
      {/* Top Header */}
      <div className="p-4 flex items-center justify-between border-b border-[#242424]">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setRightSidebarView("now_playing")}
            className={`text-sm font-bold pb-0.5 border-b-2 transition-colors ${
              rightSidebarView === "now_playing"
                ? "border-[#1db954] text-white"
                : "border-transparent text-[#b3b3b3] hover:text-white"
            }`}
          >
            Now Playing
          </button>
          <span className="text-[#444]">•</span>
          <button
            onClick={() => setRightSidebarView("queue")}
            className={`text-sm font-bold pb-0.5 border-b-2 transition-colors ${
              rightSidebarView === "queue"
                ? "border-[#1db954] text-white"
                : "border-transparent text-[#b3b3b3] hover:text-white"
            }`}
          >
            Queue ({upcomingTracks.length})
          </button>
        </div>
        <button
          onClick={toggleRightSidebar}
          className="text-[#b3b3b3] hover:text-white p-1 rounded-full hover:bg-white/10 transition"
          aria-label="Close right sidebar"
        >
          <X size={18} />
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-hidden">
        {rightSidebarView === "now_playing" ? (
          <>
            {/* Large Cover Art */}
            <div className="relative rounded-lg overflow-hidden shadow-2xl shadow-black/80 aspect-square group">
              <img src={coverSrc} alt={currentSong.title} className="w-full h-full object-cover" />
            </div>

            {/* Song Meta */}
            <div>
              <h2 className="text-xl font-extrabold text-white hover:underline cursor-pointer truncate">
                {currentSong.title}
              </h2>
              <p className="text-[#b3b3b3] text-sm hover:underline hover:text-white cursor-pointer mt-0.5">
                {currentSong.artist}
              </p>
            </div>

            {/* About the Artist Card */}
            <div className="bg-[#1e1e1e] rounded-xl overflow-hidden border border-[#2c2c2c] group">
              <div className="h-32 relative bg-gray-800">
                <img
                  src={coverSrc}
                  alt={currentSong.artist}
                  className="w-full h-full object-cover filter brightness-75 group-hover:scale-105 transition-transform duration-500"
                />
                <span className="absolute top-3 left-3 text-xs font-bold uppercase tracking-wider bg-black/60 backdrop-blur-sm px-2.5 py-1 rounded-full">
                  About the artist
                </span>
              </div>
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-base text-white hover:underline cursor-pointer">
                      {currentSong.artist}
                    </h3>
                    <span className="text-xs text-[#b3b3b3]">2,410,950 monthly listeners</span>
                  </div>
                  <button
                    onClick={() => setIsFollowing(!isFollowing)}
                    className={`px-4 py-1.5 rounded-full text-xs font-bold border transition ${
                      isFollowing
                        ? "border-[#b3b3b3] text-white hover:border-white"
                        : "border-transparent bg-white text-black hover:scale-105"
                    }`}
                  >
                    {isFollowing ? "Following" : "Follow"}
                  </button>
                </div>
                <p className="text-xs text-[#a7a7a7] line-clamp-3">
                  {currentSong.artist} crafts distinct soundscapes combining energetic melodies and emotive storytelling.
                </p>
              </div>
            </div>

            {/* Next in Queue Preview */}
            {upcomingTracks.length > 0 && (
              <div className="bg-[#181818] rounded-xl p-4 border border-[#282828] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#b3b3b3]">Next in queue</span>
                  <button
                    onClick={() => setRightSidebarView("queue")}
                    className="text-xs font-bold text-white hover:underline"
                  >
                    Open queue
                  </button>
                </div>
                <div
                  onClick={() => playSongWithQueue(upcomingTracks[0], queue, queueIndex + 1)}
                  className="flex items-center space-x-3 group cursor-pointer"
                >
                  <img
                    src={getSongCover(upcomingTracks[0], 300)}
                    alt=""
                    className="w-12 h-12 rounded object-cover"
                  />
                  <div className="overflow-hidden flex-1">
                    <span className="font-semibold text-sm truncate block group-hover:text-[#1db954] transition-colors">
                      {upcomingTracks[0].title}
                    </span>
                    <span className="text-xs text-[#b3b3b3] truncate block">{upcomingTracks[0].artist}</span>
                  </div>
                  <button className="opacity-0 group-hover:opacity-100 p-2 rounded-full bg-[#1db954] text-black transition">
                    <Play fill="currentColor" size={14} className="ml-0.5" />
                  </button>
                </div>
              </div>
            )}

            {/* Credits Section */}
            <div className="bg-[#181818] rounded-xl p-4 border border-[#282828] space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#b3b3b3] block mb-2">Credits</span>
              <div className="flex justify-between text-xs">
                <span className="text-white font-medium">{currentSong.artist}</span>
                <span className="text-[#a7a7a7]">Main Artist</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-white font-medium">{currentSong.album || "Single"}</span>
                <span className="text-[#a7a7a7]">Album</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-white font-medium">{currentSong.genre || "Music"}</span>
                <span className="text-[#a7a7a7]">Genre</span>
              </div>
            </div>
          </>
        ) : (
          /* Queue View */
          <div className="space-y-5">
            {/* Now Playing section */}
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-[#b3b3b3] block mb-2">
                Now Playing
              </span>
              <div className="flex items-center space-x-3 p-2 bg-[#242424] rounded-lg">
                <img src={coverSrc} alt="" className="w-10 h-10 rounded object-cover" />
                <div className="overflow-hidden flex-1">
                  <span className="text-sm font-semibold text-[#1db954] truncate block">
                    {currentSong.title}
                  </span>
                  <span className="text-xs text-[#b3b3b3] truncate block">{currentSong.artist}</span>
                </div>
              </div>
            </div>

            {/* Next Up section */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[#b3b3b3]">
                  Next Up ({upcomingTracks.length})
                </span>
                {upcomingTracks.length > 0 && (
                  <button
                    onClick={clearQueue}
                    className="text-xs text-[#b3b3b3] hover:text-white hover:underline"
                  >
                    Clear
                  </button>
                )}
              </div>

              {upcomingTracks.length === 0 ? (
                <div className="text-center py-10 text-[#a7a7a7] text-xs space-y-2">
                  <ListMusic size={32} className="mx-auto opacity-40" />
                  <p>Queue is empty.</p>
                  <p>Right-click any song to add it to the queue.</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {upcomingTracks.map((song, idx) => (
                    <div
                      key={`${song.id}_${idx}`}
                      onContextMenu={(e) => {
                        e.preventDefault()
                        openContextMenu(e.clientX, e.clientY, song)
                      }}
                      className="flex items-center justify-between p-2 hover:bg-[#222] rounded-md group transition-colors"
                    >
                      <div
                        onClick={() => playSongWithQueue(song, queue, queueIndex + 1 + idx)}
                        className="flex items-center space-x-3 overflow-hidden flex-1 cursor-pointer"
                      >
                        <span className="text-xs text-[#666] w-4 text-center group-hover:hidden">
                          {idx + 1}
                        </span>
                        <Play size={12} fill="white" className="hidden group-hover:block w-4 text-white" />
                        <img
                          src={getSongCover(song, 100)}
                          alt=""
                          className="w-8 h-8 rounded object-cover"
                        />
                        <div className="overflow-hidden">
                          <span className="text-xs font-semibold text-white truncate block group-hover:text-[#1db954]">
                            {song.title}
                          </span>
                          <span className="text-[11px] text-[#a7a7a7] truncate block">{song.artist}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => removeFromQueue(queueIndex + 1 + idx)}
                        className="text-[#666] hover:text-[#e91429] opacity-0 group-hover:opacity-100 p-1 transition"
                        title="Remove from queue"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
