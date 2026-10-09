"use client"
import { usePlayerStore } from "@/store/playerStore"
import { API_BASE, getSongCover } from "@/lib/api"
import { getSongMoodColor } from "@/lib/colors"
import { useEffect, useState, useRef, useMemo } from "react"
import { X, ChevronDown, Mic2, Sparkles } from "lucide-react"

interface LyricLine {
  time: number
  text: string
}

export default function LyricView() {
  const { currentSong, isLyricsOpen, toggleLyrics } = usePlayerStore()
  const [lyrics, setLyrics] = useState<LyricLine[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [currentLineIndex, setCurrentLineIndex] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)

  const mood = useMemo(() => {
    return getSongMoodColor(currentSong?.title || currentSong?.genre || "pop")
  }, [currentSong?.id, currentSong?.title, currentSong?.genre])

  const parseLyrics = (text: string): LyricLine[] => {
    const lines = text.split("\n")
    const parsed: LyricLine[] = []
    const timeRegex = /\[(\d+):(\d+(?:\.\d+)?)\]/

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
    return parsed
  }

  useEffect(() => {
    if (!currentSong || !isLyricsOpen) return

    let isMounted = true
    setIsLoading(true)

    const fetchLyrics = async () => {
      // 1. In-memory attached LRC
      if (currentSong.lyricsLrc && currentSong.lyricsLrc.trim()) {
        if (isMounted) {
          setLyrics(parseLyrics(currentSong.lyricsLrc))
          setIsLoading(false)
        }
        return
      }

      // 2. Fetch from Melofy Backend
      try {
        const res = await fetch(`${API_BASE}/api/songs/${currentSong.id}/lyrics`)
        if (res.ok) {
          const text = await res.text()
          if (text && text.trim().length > 5) {
            if (isMounted) {
              setLyrics(parseLyrics(text))
              setIsLoading(false)
            }
            return
          }
        }
      } catch (err) {
        console.info("Backend lyrics fetch notice:", err)
      }

      // 3. Client-side Fallback directly to LRCLIB API
      try {
        const cleanedTitle = currentSong.title.replace(/\(.*?\)|\[.*?\]/g, "").trim()
        const cleanedArtist = currentSong.artist.split(",")[0].split("&")[0].split("feat.")[0].trim()

        const params = new URLSearchParams({
          artist_name: cleanedArtist,
          track_name: cleanedTitle,
        })
        if (currentSong.duration && currentSong.duration > 15) {
          params.append("duration", Math.round(currentSong.duration).toString())
        }

        const lrcRes = await fetch(`https://lrclib.net/api/get?${params.toString()}`)
        if (lrcRes.ok) {
          const data = await lrcRes.json()
          const lrcText = data.syncedLyrics || data.plainLyrics
          if (lrcText && lrcText.trim().length > 5) {
            if (isMounted) {
              setLyrics(parseLyrics(lrcText))
              setIsLoading(false)
            }
            return
          }
        }
      } catch (clientErr) {
        console.info("LRCLIB direct fetch notice:", clientErr)
      }

      if (isMounted) {
        setLyrics([])
        setIsLoading(false)
      }
    }

    fetchLyrics()

    return () => {
      isMounted = false
    }
  }, [currentSong?.id, currentSong?.lyricsLrc, currentSong?.title, isLyricsOpen])

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

  // Auto-scroll to keep active line centered
  useEffect(() => {
    if (currentLineIndex !== -1 && containerRef.current) {
      const activeElement = containerRef.current.children[currentLineIndex] as HTMLElement
      if (activeElement) {
        activeElement.scrollIntoView({ behavior: "smooth", block: "center" })
      }
    }
  }, [currentLineIndex])

  // Handle keyboard ESC to dismiss
  useEffect(() => {
    if (!isLyricsOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        toggleLyrics()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isLyricsOpen, toggleLyrics])

  // Interactive Click-to-Seek handler
  const handleSeekToLine = (time: number) => {
    if (time < 0) return
    const audio = document.querySelector("audio")
    if (audio) {
      audio.currentTime = time
      if (audio.paused) {
        audio.play().catch(() => {})
      }
    }
  }

  if (!isLyricsOpen) return null

  return (
    <div className="fixed inset-0 z-[60] bg-black/92 backdrop-blur-3xl transition-all duration-500 flex flex-col animate-in fade-in slide-in-from-bottom-6 select-none">
      {/* Background Ambient Colored Aurora Bloom */}
      <div
        className="absolute inset-0 pointer-events-none transition-all duration-1000"
        style={{
          background: `radial-gradient(circle at 50% 30%, ${mood.primary}40 0%, ${mood.secondary}20 50%, transparent 80%)`,
        }}
      />

      {/* Floating Header */}
      <div className="flex items-center justify-between p-4 sm:p-8 z-10 border-b border-white/5 bg-black/20 backdrop-blur-md">
        <div className="flex items-center space-x-4 sm:space-x-6 min-w-0">
          <div className="w-14 h-14 sm:w-20 sm:h-20 rounded-2xl shadow-2xl overflow-hidden flex-shrink-0 border border-white/10 bg-[#181818]">
            <img
              src={getSongCover(currentSong, 300)}
              className="w-full h-full object-cover"
              alt=""
              onError={(e) => {
                if (currentSong?.title?.toLowerCase().includes("training season")) {
                  e.currentTarget.src = "https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/82/89/15/828915ea-d716-61c4-3de7-ef00c1f800fb/5054197853630.jpg/600x600bb.jpg"
                } else {
                  e.currentTarget.src = "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&q=80"
                }
              }}
            />
          </div>
          <div className="min-w-0">
            <h2 className="text-xl sm:text-3xl font-extrabold text-white truncate tracking-tight">
              {currentSong?.title}
            </h2>
            <p className="text-sm sm:text-lg text-white/70 truncate mt-0.5">
              {currentSong?.artist}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full liquid-pill text-xs text-white/80">
            <Mic2 size={14} className="text-emerald-400" />
            <span>Synced Lyrics</span>
          </div>
          <button
            onClick={toggleLyrics}
            className="p-2.5 sm:p-3 bg-white/10 hover:bg-white/20 rounded-full text-white transition-all group flex-shrink-0 cursor-pointer"
            title="Close lyrics"
          >
            <ChevronDown size={26} className="group-hover:translate-y-0.5 transition-transform" />
          </button>
        </div>
      </div>

      {/* Lyrics Flow Container */}
      <div
        ref={containerRef}
        className="flex-grow overflow-y-auto px-6 sm:px-12 md:px-[18%] pb-36 scroll-smooth no-scrollbar z-10"
      >
        <div className="h-[22vh]" />

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-4 text-center">
            <div className="w-12 h-12 rounded-full border-2 border-emerald-500/30 border-t-emerald-400 animate-spin" />
            <p className="text-lg font-medium text-white/60">Retrieving synchronized lyrics...</p>
          </div>
        ) : lyrics.length > 0 ? (
          lyrics.map((line, i) => {
            const isActive = i === currentLineIndex
            const isPast = currentLineIndex !== -1 && i < currentLineIndex

            return (
              <div
                key={i}
                onClick={() => handleSeekToLine(line.time)}
                className={`py-3.5 sm:py-5 text-2xl sm:text-4xl md:text-5xl font-black transition-all duration-300 select-none cursor-pointer group ${
                  isActive
                    ? "text-white scale-105 opacity-100 drop-shadow-[0_4px_24px_rgba(255,255,255,0.4)]"
                    : isPast
                    ? "text-white/40 hover:text-white/80 scale-100 opacity-90"
                    : "text-white/25 hover:text-white/60 scale-100 opacity-80"
                } ${line.time === -1 ? "text-lg sm:text-2xl md:text-3xl py-2 font-medium" : ""}`}
                title={line.time >= 0 ? "Click to seek to this line" : undefined}
              >
                <span className="transition-transform inline-block group-hover:translate-x-1 duration-200">
                  {line.text}
                </span>
              </div>
            )
          })
        ) : (
          <div className="flex flex-col items-center justify-center py-20 space-y-4 text-center max-w-md mx-auto">
            <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center text-white/40">
              <Mic2 size={32} />
            </div>
            <h3 className="text-2xl font-bold text-white">Lyrics not available</h3>
            <p className="text-sm text-white/60">
              We couldn&apos;t find synchronized lyrics for &quot;{currentSong?.title}&quot; yet. Enjoy the music!
            </p>
          </div>
        )}

        <div className="h-[45vh]" />
      </div>

      {/* Floating Close Button */}
      <button
        onClick={toggleLyrics}
        className="fixed top-6 right-6 text-white/50 hover:text-white p-2 rounded-full hover:bg-white/10 transition z-20 cursor-pointer"
        title="Close (Esc)"
      >
        <X size={24} />
      </button>
    </div>
  )
}
