"use client"
import { usePlayerStore } from "@/store/playerStore"
import { X, Play, GripVertical, Trash2 } from "lucide-react"

export default function QueuePanel() {
  const { queue, currentSong, isQueueOpen, toggleQueue, setCurrentSong } = usePlayerStore()

  if (!isQueueOpen) return null

  return (
    <div className="fixed top-0 right-0 h-[calc(100%-80px)] w-80 bg-[#121212] border-l border-white/10 z-50 flex flex-col animate-in slide-in-from-right duration-300 shadow-2xl">
      <div className="p-4 flex items-center justify-between border-b border-white/5">
        <h2 className="text-lg font-bold text-white">Queue</h2>
        <button onClick={toggleQueue} className="text-[#b3b3b3] hover:text-white transition">
          <X size={20} />
        </button>
      </div>

      <div className="flex-grow overflow-y-auto p-2 custom-scrollbar">
        {/* Now Playing Section */}
        <div className="mb-6 px-2">
          <p className="text-xs font-bold text-[#b3b3b3] uppercase tracking-wider mb-3">Now playing</p>
          {currentSong && (
            <div className="flex items-center p-2 rounded-md bg-white/5 group border border-white/10">
              <img src={`http://127.0.0.1:8000/api/songs/${currentSong.id}/cover`} className="w-10 h-10 rounded shadow-lg mr-3" />
              <div className="flex-grow min-w-0">
                <p className="text-sm font-semibold text-[#1db954] truncate">{currentSong.title}</p>
                <p className="text-xs text-[#b3b3b3] truncate">{currentSong.artist}</p>
              </div>
            </div>
          )}
        </div>

        {/* Next Up Section */}
        <div className="px-2">
          <p className="text-xs font-bold text-[#b3b3b3] uppercase tracking-wider mb-3">Next up</p>
          {queue.length === 0 ? (
            <p className="text-sm text-white/40 italic py-4 text-center">Your queue is empty.</p>
          ) : (
            <div className="space-y-1">
              {queue.map((song, i) => {
                const isCurrent = song.id === currentSong?.id
                if (isCurrent) return null // Handled in Now Playing
                
                return (
                  <div 
                    key={`${song.id}-${i}`}
                    className="flex items-center p-2 rounded-md hover:bg-white/5 group transition-colors cursor-pointer"
                    onClick={() => setCurrentSong(song)}
                  >
                    <div className="relative w-10 h-10 mr-3 flex-shrink-0">
                      <img src={`http://127.0.0.1:8000/api/songs/${song.id}/cover`} className="w-full h-full rounded shadow" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity rounded">
                        <Play size={16} fill="white" stroke="none" />
                      </div>
                    </div>
                    <div className="flex-grow min-w-0 pr-2">
                      <p className="text-sm font-medium text-white truncate">{song.title}</p>
                      <p className="text-xs text-[#b3b3b3] truncate">{song.artist}</p>
                    </div>
                    <GripVertical size={14} className="text-[#b3b3b3] opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing" />
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <div className="p-4 bg-black/40 border-t border-white/5 text-center">
        <p className="text-xs text-white/40">Queue synced across devices</p>
      </div>
    </div>
  )
}
