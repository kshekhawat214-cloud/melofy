"use client"
import { usePlayerStore } from "@/store/playerStore"
import { API_BASE } from "@/lib/api"
import { useEffect, useState, useRef } from "react"
import { X, ChevronDown } from "lucide-react"

interface LyricLine {
  time: number
  text: string
}

export default function LyricView() {
  const { currentSong, isLyricsOpen, toggleLyrics } = usePlayerStore()
  const [lyrics, setLyrics] = useState<LyricLine[]>([])
  const [currentLineIndex, setCurrentLineIndex] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!currentSong || !isLyricsOpen) return

    const fetchLyrics = async () => {
      if (currentSong.lyricsLrc) {
        parseLyrics(currentSong.lyricsLrc)
        return
      }
      try {
        const res = await fetch(`${API_BASE}/api/songs/${currentSong.id}/lyrics`)
        if (!res.ok) throw new Error("Lyrics not found")
        const text = await res.text()
        parseLyrics(text)
      } catch (err) {
        setLyrics([{ time: 0, text: "Lyrics not available for this track" }])
      }
    }

    fetchLyrics()
  }, [currentSong?.id, currentSong?.lyricsLrc, isLyricsOpen])

  const parseLyrics = (text: string) => {
    const lines = text.split("\n")
    const parsed: LyricLine[] = []
    const timeRegex = /\[(\d+):(\d+\.\d+)\]/

    lines.forEach((line) => {
      const match = line.match(timeRegex)
      if (match) {
        const minutes = parseInt(match[1])
        const seconds = parseFloat(match[2])
        const time = minutes * 60 + seconds
        const content = line.replace(timeRegex, "").trim()
        if (content) parsed.push({ time, text: content })
      } else if (line.trim()) {
        parsed.push({ time: -1, text: line.trim() })
      }
    })
    setLyrics(parsed)
  }

  // Sync with audio time
  useEffect(() => {
    const audio = document.querySelector("audio")
    if (!audio || lyrics.length === 0) return

    const handleTimeUpdate = () => {
      const currentTime = audio.currentTime
      let index = -1
      for (let i = 0; i < lyrics.length; i++) {
        if (lyrics[i].time <= currentTime && lyrics[i].time !== -1) {
          index = i
        } else if (lyrics[i].time > currentTime) {
          break
        }
      }
      setCurrentLineIndex(index)
    }

    audio.addEventListener("timeupdate", handleTimeUpdate)
    return () => audio.removeEventListener("timeupdate", handleTimeUpdate)
  }, [lyrics])

  // Auto-scroll logic
  useEffect(() => {
    if (currentLineIndex !== -1 && containerRef.current) {
      const activeElement = containerRef.current.children[currentLineIndex] as HTMLElement
      if (activeElement) {
        activeElement.scrollIntoView({ behavior: "smooth", block: "center" })
      }
    }
  }, [currentLineIndex])

  if (!isLyricsOpen) return null

  return (
    <div className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-3xl transition-all duration-500 flex flex-col animate-in fade-in slide-in-from-bottom-10">
      {/* Background Ambient Blur */}
      <div 
        className="absolute inset-0 opacity-30 pointer-events-none blur-[120px]"
        style={{ 
          background: `radial-gradient(circle at 50% 50%, ${currentLineIndex % 2 === 0 ? '#1db954' : '#535353'}, transparent)` 
        }}
      />

      {/* Header */}
      <div className="flex items-center justify-between p-8 z-10">
        <div className="flex items-center space-x-6">
          <img 
            src={currentSong?.thumbnailUrl || (currentSong?.coverUrl ? `${API_BASE}${currentSong.coverUrl}` : (currentSong?.id ? `${API_BASE}/api/songs/${currentSong.id}/cover` : "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&q=80"))} 
            className="w-20 h-20 rounded-lg shadow-2xl object-cover" 
            alt="" 
          />
          <div>
            <h2 className="text-3xl font-bold text-white">{currentSong?.title}</h2>
            <p className="text-xl text-white/60">{currentSong?.artist}</p>
          </div>
        </div>
        <button 
          onClick={toggleLyrics}
          className="p-3 bg-white/10 hover:bg-white/20 rounded-full text-white transition-all group"
        >
          <ChevronDown size={32} className="group-hover:translate-y-1 transition-transform" />
        </button>
      </div>

      {/* Lyrics Flow */}
      <div 
        ref={containerRef}
        className="flex-grow overflow-y-auto px-8 md:px-[15%] pb-32 scroll-smooth no-scrollbar z-10"
      >
        <div className="h-[20vh]" /> {/* Top padding for center scroll */}
        {lyrics.map((line, i) => (
          <div
            key={i}
            className={`py-4 text-4xl md:text-6xl font-black transition-all duration-500 cursor-default
              ${i === currentLineIndex 
                ? "text-white scale-105 opacity-100" 
                : "text-white/20 hover:text-white/40 scale-100 opacity-100"}
              ${line.time === -1 && "text-2xl md:text-3xl py-2 font-medium"}
            `}
          >
            {line.text}
          </div>
        ))}
        <div className="h-[40vh]" /> {/* Bottom padding */}
      </div>

      {/* Close shortcut */}
      <button 
        onClick={toggleLyrics}
        className="fixed top-8 right-8 text-white/40 hover:text-white"
      >
        <X size={24} />
      </button>
    </div>
  )
}
