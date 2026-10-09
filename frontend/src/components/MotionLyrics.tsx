"use client"
import React, { useEffect, useState, useRef, useMemo, useCallback } from "react"
import { usePlayerStore } from "@/store/playerStore"
import { API_BASE, getSongCover } from "@/lib/api"
import { getSongMoodColor } from "@/lib/colors"
import { audioDsp } from "@/lib/audioDsp"
import {
  X,
  Mic2,
  Sparkles,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Shuffle,
  Repeat,
  Repeat1,
  Eye,
  EyeOff,
} from "lucide-react"

interface LyricLine {
  time: number
  text: string
}

function splitWords(text: string): string[] {
  return text.split(/\s+/).filter((w) => w.length > 0)
}

function hexToHSL(hex: string): { h: number; s: number; l: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!result) return { h: 200, s: 70, l: 50 }
  const r = parseInt(result[1], 16) / 255
  const g = parseInt(result[2], 16) / 255
  const b = parseInt(result[3], 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  const l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
      case g: h = ((b - r) / d + 2) / 6; break
      case b: h = ((r - g) / d + 4) / 6; break
    }
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) }
}

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return "0:00"
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs < 10 ? "0" : ""}${secs}`
}

export default function MotionLyrics() {
  const {
    currentSong,
    isPlaying,
    togglePlay,
    playNext,
    playPrevious,
    progress,
    duration,
    setProgress,
    volume,
    setVolume,
    isMuted,
    toggleMute,
    shuffle,
    toggleShuffle,
    repeatMode,
    toggleRepeat,
    isImmersiveVisualizerOpen,
    toggleImmersiveVisualizer,
  } = usePlayerStore()

  const [lyrics, setLyrics] = useState<LyricLine[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [currentLineIndex, setCurrentLineIndex] = useState(-1)
  const [audioEnergy, setAudioEnergy] = useState({ bass: 0, mid: 0, treble: 0, overall: 0 })
  const [isControlsVisible, setIsControlsVisible] = useState(true)
  const [isLyricsVisible, setIsLyricsVisible] = useState(true)
  const [isScrubbing, setIsScrubbing] = useState(false)
  const [scrubValue, setScrubValue] = useState(0)

  const containerRef = useRef<HTMLDivElement>(null)
  const animFrameRef = useRef<number | null>(null)
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const mood = useMemo(() => {
    return getSongMoodColor(currentSong?.title || currentSong?.genre || "pop")
  }, [currentSong?.id, currentSong?.title, currentSong?.genre])

  const hsl = useMemo(() => hexToHSL(mood.primary), [mood.primary])

  // ─── Auto-hide controls after inactivity ─────────────────────
  const resetControlsTimeout = useCallback(() => {
    setIsControlsVisible(true)
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current)
    }
    controlsTimeoutRef.current = setTimeout(() => {
      setIsControlsVisible(false)
    }, 4000)
  }, [])

  useEffect(() => {
    if (!isImmersiveVisualizerOpen) return
    resetControlsTimeout()
    const handleActivity = () => resetControlsTimeout()
    window.addEventListener("mousemove", handleActivity)
    window.addEventListener("touchstart", handleActivity)
    return () => {
      window.removeEventListener("mousemove", handleActivity)
      window.removeEventListener("touchstart", handleActivity)
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current)
    }
  }, [isImmersiveVisualizerOpen, resetControlsTimeout])

  // ─── Parse LRC Lyrics ───────────────────────────────────────
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

  // ─── Fetch Lyrics ───────────────────────────────────────────
  useEffect(() => {
    if (!currentSong || !isImmersiveVisualizerOpen) return

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
  }, [currentSong?.id, currentSong?.lyricsLrc, currentSong?.title, isImmersiveVisualizerOpen])

  // ─── Audio Reactivity Loop ──────────────────────────────────
  useEffect(() => {
    if (!isImmersiveVisualizerOpen) return

    const update = () => {
      const data = audioDsp.getReactivityData()
      setAudioEnergy((prev) => ({
        bass: prev.bass + (data.bassLevel - prev.bass) * 0.15,
        mid: prev.mid + (data.midLevel - prev.mid) * 0.12,
        treble: prev.treble + (data.trebleLevel - prev.treble) * 0.15,
        overall: prev.overall + (data.overallLevel - prev.overall) * 0.12,
      }))
      animFrameRef.current = requestAnimationFrame(update)
    }

    animFrameRef.current = requestAnimationFrame(update)
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    }
  }, [isImmersiveVisualizerOpen])

  // ─── Sync with audio time ───────────────────────────────────
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

  // ─── Auto-scroll active line ────────────────────────────────
  useEffect(() => {
    if (currentLineIndex !== -1 && containerRef.current && isLyricsVisible) {
      const activeElement = containerRef.current.querySelector(`[data-lyric-index="${currentLineIndex}"]`) as HTMLElement
      if (activeElement) {
        activeElement.scrollIntoView({ behavior: "smooth", block: "center" })
      }
    }
  }, [currentLineIndex, isLyricsVisible])

  // ─── Keyboard Controls ──────────────────────────────────────
  useEffect(() => {
    if (!isImmersiveVisualizerOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      resetControlsTimeout()
      if (e.key === "Escape") {
        toggleImmersiveVisualizer()
      } else if (e.code === "Space") {
        e.preventDefault()
        togglePlay()
      } else if (e.code === "ArrowRight") {
        e.preventDefault()
        const audio = document.querySelector("audio")
        if (audio) {
          const nextTime = Math.min(audio.duration || 0, audio.currentTime + 5)
          audio.currentTime = nextTime
          setProgress(nextTime)
        }
      } else if (e.code === "ArrowLeft") {
        e.preventDefault()
        const audio = document.querySelector("audio")
        if (audio) {
          const prevTime = Math.max(0, audio.currentTime - 5)
          audio.currentTime = prevTime
          setProgress(prevTime)
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isImmersiveVisualizerOpen, toggleImmersiveVisualizer, togglePlay, setProgress, resetControlsTimeout])

  // ─── Click-to-Seek from Lyrics ──────────────────────────────
  const handleSeekToLine = (time: number) => {
    if (time < 0) return
    const audio = document.querySelector("audio")
    if (audio) {
      audio.currentTime = time
      setProgress(time)
      if (audio.paused) {
        audio.play().catch(() => {})
      }
    }
  }

  // ─── Progress Bar Scrubbing ─────────────────────────────────
  const currentPos = isScrubbing ? scrubValue : progress
  const safeDuration = duration > 0 ? duration : currentSong?.duration || 1
  const progressPercent = Math.min(100, Math.max(0, (currentPos / safeDuration) * 100))

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value)
    setScrubValue(val)
  }

  const handleSeekCommit = () => {
    setIsScrubbing(false)
    const audio = document.querySelector("audio")
    if (audio) {
      audio.currentTime = scrubValue
      setProgress(scrubValue)
    }
  }

  if (!isImmersiveVisualizerOpen) return null

  return (
    <div
      className={`fixed inset-0 z-[200] flex flex-col items-center justify-between pointer-events-auto select-none transition-colors duration-700 ${
        isControlsVisible ? "cursor-default" : "cursor-none"
      }`}
    >
      {/* ─── Top Header: Track info + controls ─── */}
      <div
        className={`w-full z-20 flex items-center justify-between p-6 md:p-8 transition-all duration-500 ${
          isControlsVisible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-6 pointer-events-none"
        }`}
        style={{
          background: "linear-gradient(to bottom, rgba(0,0,0,0.7) 0%, transparent 100%)",
        }}
      >
        <div className="flex items-center space-x-4 min-w-0">
          <div className="w-12 h-12 md:w-16 md:h-16 rounded-xl overflow-hidden shadow-2xl flex-shrink-0 border border-white/15 bg-[#181818]">
            <img
              src={getSongCover(currentSong, 300)}
              className="w-full h-full object-cover"
              alt=""
              onError={(e) => {
                e.currentTarget.src = "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&q=80"
              }}
            />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg md:text-2xl font-black text-white truncate tracking-tight drop-shadow-lg">
              {currentSong?.title}
            </h2>
            <p className="text-sm md:text-base text-white/70 truncate">
              {currentSong?.artist}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3 flex-shrink-0">
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-xs text-white/90">
            <Sparkles size={14} className="text-emerald-400 animate-pulse" />
            <span>Ambient Light Show</span>
          </div>
          <button
            onClick={() => setIsLyricsVisible(!isLyricsVisible)}
            className={`p-2.5 rounded-full transition-all backdrop-blur-md border border-white/10 cursor-pointer ${
              isLyricsVisible ? "bg-white/20 text-white" : "bg-white/5 text-white/50 hover:text-white"
            }`}
            title={isLyricsVisible ? "Hide Lyrics (Pure Visualizer)" : "Show Lyrics"}
          >
            {isLyricsVisible ? <Eye size={20} /> : <EyeOff size={20} />}
          </button>
          <button
            onClick={toggleImmersiveVisualizer}
            className="p-2.5 bg-white/10 hover:bg-white/20 rounded-full text-white transition-all backdrop-blur-md border border-white/10 cursor-pointer"
            title="Close (Esc)"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* ─── Central Stage: Kinetic Motion Lyrics ─── */}
      <div
        ref={containerRef}
        className={`relative z-10 w-full max-w-4xl px-8 md:px-16 overflow-hidden flex flex-col items-center justify-center transition-all duration-700 ${
          isLyricsVisible ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        style={{ height: "65vh" }}
      >
        {isLoading ? (
          <div className="flex flex-col items-center space-y-4">
            <div className="w-14 h-14 rounded-full border-2 border-emerald-500/30 border-t-emerald-400 animate-spin" />
            <p className="text-lg font-medium text-white/60">Loading synced lyrics...</p>
          </div>
        ) : lyrics.length > 0 ? (
          <div
            className="flex flex-col items-center space-y-1 md:space-y-3 overflow-y-auto no-scrollbar py-8 w-full"
            style={{ maxHeight: "65vh" }}
          >
            <div style={{ height: "28vh" }} />
            {lyrics.map((line, i) => {
              const isActive = i === currentLineIndex
              const isPast = currentLineIndex !== -1 && i < currentLineIndex
              const distFromActive = Math.abs(i - currentLineIndex)

              const words = splitWords(line.text)
              const lineDuration =
                i + 1 < lyrics.length && lyrics[i + 1].time > 0 && line.time > 0
                  ? Math.max(0.5, lyrics[i + 1].time - line.time)
                  : 3

              const glowIntensity = isActive ? 0.35 + audioEnergy.overall * 0.65 : 0
              const scaleBoost = isActive ? 1.0 + audioEnergy.bass * 0.08 : 1.0
              const distOpacity = isActive ? 1 : Math.max(0.08, 0.6 - distFromActive * 0.12)

              return (
                <div
                  key={i}
                  data-lyric-index={i}
                  onClick={() => handleSeekToLine(line.time)}
                  className="text-center cursor-pointer transition-all duration-500 ease-out group px-4 py-1.5 md:py-2.5"
                  style={{
                    transform: `scale(${isActive ? scaleBoost : isPast ? 0.92 : 0.95})`,
                    opacity: distOpacity,
                    filter: isActive
                      ? `drop-shadow(0 0 ${20 + audioEnergy.overall * 40}px hsla(${hsl.h}, 85%, 60%, ${glowIntensity}))`
                      : "none",
                    transition: "all 0.5s cubic-bezier(0.16, 1, 0.3, 1)",
                  }}
                >
                  {isActive && line.time >= 0 ? (
                    <div className="flex flex-wrap justify-center gap-x-2 md:gap-x-3.5">
                      {words.map((word, wi) => {
                        const wordDelay = (wi / Math.max(1, words.length)) * Math.min(lineDuration * 0.6, 1.5)
                        return (
                          <span
                            key={wi}
                            className="inline-block text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black text-white tracking-tight"
                            style={{
                              animationName: "lyricWordReveal",
                              animationDuration: "0.6s",
                              animationDelay: `${wordDelay}s`,
                              animationFillMode: "both",
                              animationTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
                              textShadow: `0 0 ${15 + audioEnergy.bass * 35}px hsla(${hsl.h}, 85%, 60%, ${
                                0.35 + audioEnergy.overall * 0.55
                              }), 0 0 ${45 + audioEnergy.overall * 65}px hsla(${hsl.h}, 70%, 50%, ${
                                0.2 + audioEnergy.bass * 0.3
                              })`,
                            }}
                          >
                            {word}
                          </span>
                        )
                      })}
                    </div>
                  ) : (
                    <span
                      className={`text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold transition-all duration-500 ${
                        isPast
                          ? "text-white/30 group-hover:text-white/60"
                          : "text-white/20 group-hover:text-white/50"
                      } ${line.time === -1 ? "text-base sm:text-lg md:text-xl font-medium" : ""}`}
                    >
                      {line.text}
                    </span>
                  )}
                </div>
              )
            })}
            <div style={{ height: "32vh" }} />
          </div>
        ) : (
          <div className="flex flex-col items-center space-y-4 text-center">
            <div className="w-20 h-20 rounded-full bg-white/10 flex items-center justify-center text-white/30">
              <Mic2 size={40} />
            </div>
            <h3 className="text-2xl font-bold text-white/80">Visualizer Active</h3>
            <p className="text-sm text-white/50 max-w-sm">
              Lyrics are unavailable for &ldquo;{currentSong?.title}&rdquo;. Relax and immerse in the audio-reactive light show!
            </p>
          </div>
        )}
      </div>

      {/* ─── Bottom Floating Liquid-Glass Playback Dock ─── */}
      <div
        className={`w-full max-w-3xl px-6 pb-6 md:pb-8 z-30 transition-all duration-500 ${
          isControlsVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8 pointer-events-none"
        }`}
      >
        <div className="rounded-2xl bg-black/40 backdrop-blur-2xl border border-white/15 p-4 md:p-5 shadow-2xl flex flex-col gap-3">
          {/* Progress Scrubber */}
          <div className="flex items-center gap-3 text-xs text-white/70 font-mono">
            <span>{formatTime(currentPos)}</span>
            <div className="relative flex-1 flex items-center group">
              <div className="w-full h-1.5 bg-white/20 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${progressPercent}%`,
                    backgroundColor: mood.primary,
                    boxShadow: `0 0 10px ${mood.primary}`,
                  }}
                />
              </div>
              <input
                type="range"
                min={0}
                max={safeDuration}
                step={0.1}
                value={currentPos}
                onChange={handleSeekChange}
                onMouseDown={() => {
                  setIsScrubbing(true)
                  setScrubValue(progress)
                }}
                onTouchStart={() => {
                  setIsScrubbing(true)
                  setScrubValue(progress)
                }}
                onMouseUp={handleSeekCommit}
                onTouchEnd={handleSeekCommit}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
            </div>
            <span>{formatTime(safeDuration)}</span>
          </div>

          {/* Controls Bar */}
          <div className="flex items-center justify-between">
            {/* Left: Shuffle & Repeat */}
            <div className="flex items-center space-x-2">
              <button
                onClick={toggleShuffle}
                className={`p-2 rounded-full transition-all cursor-pointer ${
                  shuffle ? "text-emerald-400 bg-white/10" : "text-white/60 hover:text-white"
                }`}
                title="Shuffle"
              >
                <Shuffle size={17} />
              </button>
              <button
                onClick={toggleRepeat}
                className={`p-2 rounded-full transition-all cursor-pointer ${
                  repeatMode !== "off" ? "text-emerald-400 bg-white/10" : "text-white/60 hover:text-white"
                }`}
                title={`Repeat: ${repeatMode}`}
              >
                {repeatMode === "one" ? <Repeat1 size={17} /> : <Repeat size={17} />}
              </button>
            </div>

            {/* Center: Prev, Play/Pause, Next */}
            <div className="flex items-center space-x-4">
              <button
                onClick={playPrevious}
                className="p-2 text-white/70 hover:text-white hover:scale-110 active:scale-95 transition-all cursor-pointer"
                title="Previous"
              >
                <SkipBack size={22} />
              </button>
              <button
                onClick={togglePlay}
                className="p-3.5 rounded-full bg-white text-black hover:scale-108 active:scale-95 transition-all shadow-xl cursor-pointer"
                style={{
                  boxShadow: `0 0 ${16 + audioEnergy.bass * 30}px ${mood.primary}`,
                }}
                title={isPlaying ? "Pause" : "Play"}
              >
                {isPlaying ? <Pause size={22} fill="black" /> : <Play size={22} fill="black" className="ml-0.5" />}
              </button>
              <button
                onClick={playNext}
                className="p-2 text-white/70 hover:text-white hover:scale-110 active:scale-95 transition-all cursor-pointer"
                title="Next"
              >
                <SkipForward size={22} />
              </button>
            </div>

            {/* Right: Volume & Mute */}
            <div className="flex items-center space-x-2">
              <button
                onClick={toggleMute}
                className="p-2 text-white/70 hover:text-white transition-all cursor-pointer"
                title={isMuted ? "Unmute" : "Mute"}
              >
                {isMuted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </button>
              <div className="w-16 sm:w-24 relative flex items-center">
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={isMuted ? 0 : volume}
                  onChange={(e) => setVolume(parseFloat(e.target.value))}
                  className="w-full h-1 bg-white/20 rounded-full appearance-none cursor-pointer accent-emerald-400"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
