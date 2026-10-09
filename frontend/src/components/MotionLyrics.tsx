"use client"
import React, { useEffect, useState, useRef, useMemo, useCallback } from "react"
import { usePlayerStore } from "@/store/playerStore"
import { API_BASE, getSongCover } from "@/lib/api"
import { getSongRgbVibe, RgbVibe } from "@/lib/colors"
import { audioDsp } from "@/lib/audioDsp"
import {
  X,
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
  FileText,
  Activity,
  Sliders,
} from "lucide-react"

interface LyricLine {
  time: number
  text: string
}

function splitWords(text: string): string[] {
  return text.split(/\s+/).filter((w) => w.length > 0)
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
  const [showFullTranscript, setShowFullTranscript] = useState(false)
  const [isScrubbing, setIsScrubbing] = useState(false)
  const [scrubValue, setScrubValue] = useState(0)

  // Motion Graphics Key state: track phrase change to trigger fresh kinetic entry
  const [activePhraseKey, setActivePhraseKey] = useState(0)
  const prevLineIndexRef = useRef(-1)

  const animFrameRef = useRef<number | null>(null)
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Dynamic RGB Vibe for motion typography glow and chromatic styling
  const vibe = useMemo(() => {
    return getSongRgbVibe(
      currentSong?.title,
      currentSong?.artist,
      currentSong?.genre,
      currentSong?.energy
    )
  }, [currentSong?.id, currentSong?.title, currentSong?.artist, currentSong?.genre, currentSong?.energy])

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

  // ─── Real-Time Audio Dynamics Loop ──────────────────────────
  useEffect(() => {
    if (!isImmersiveVisualizerOpen) return

    const update = () => {
      const data = audioDsp.getReactivityData()
      setAudioEnergy((prev) => ({
        bass: prev.bass + (data.bassLevel - prev.bass) * 0.18,
        mid: prev.mid + (data.midLevel - prev.mid) * 0.14,
        treble: prev.treble + (data.trebleLevel - prev.treble) * 0.16,
        overall: prev.overall + (data.overallLevel - prev.overall) * 0.14,
      }))
      animFrameRef.current = requestAnimationFrame(update)
    }

    animFrameRef.current = requestAnimationFrame(update)
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    }
  }, [isImmersiveVisualizerOpen])

  // ─── Sync with Audio Time & Detect Phrase Shifts ────────────
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

      if (index !== prevLineIndexRef.current) {
        prevLineIndexRef.current = index
        setCurrentLineIndex(index)
        setActivePhraseKey((k) => k + 1)
      }
    }

    audio.addEventListener("timeupdate", handleTimeUpdate)
    return () => audio.removeEventListener("timeupdate", handleTimeUpdate)
  }, [lyrics])

  // ─── Keyboard Controls ──────────────────────────────────────
  useEffect(() => {
    if (!isImmersiveVisualizerOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      resetControlsTimeout()
      if (e.key === "Escape") {
        if (showFullTranscript) {
          setShowFullTranscript(false)
        } else {
          toggleImmersiveVisualizer()
        }
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
  }, [isImmersiveVisualizerOpen, showFullTranscript, toggleImmersiveVisualizer, togglePlay, setProgress, resetControlsTimeout])

  // ─── Seek Handling ──────────────────────────────────────────
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
    setShowFullTranscript(false)
  }

  const currentPos = isScrubbing ? scrubValue : progress
  const safeDuration = duration > 0 ? duration : currentSong?.duration || 1
  const progressPercent = Math.min(100, Math.max(0, (currentPos / safeDuration) * 100))

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setScrubValue(parseFloat(e.target.value))
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

  // ─── Active Phrases for Kinetic Typography ──────────────────
  const activeLine = currentLineIndex >= 0 ? lyrics[currentLineIndex] : null
  const prevLine = currentLineIndex > 0 ? lyrics[currentLineIndex - 1] : null
  const nextLine = currentLineIndex + 1 < lyrics.length ? lyrics[currentLineIndex + 1] : null

  const activeWords = activeLine ? splitWords(activeLine.text) : []
  const activeDuration =
    currentLineIndex >= 0 && currentLineIndex + 1 < lyrics.length && lyrics[currentLineIndex + 1].time > 0 && activeLine?.time && activeLine.time > 0
      ? Math.max(0.6, lyrics[currentLineIndex + 1].time - activeLine.time)
      : 3.2

  // Spring-bounce dynamics for typography driven by bass kicks
  const bassBounceScale = 1.0 + audioEnergy.bass * 0.08
  const bassBounceY = -audioEnergy.bass * 12

  return (
    <div
      className={`fixed inset-0 z-[200] flex flex-col items-center justify-between pointer-events-auto select-none transition-colors duration-700 ${
        isControlsVisible ? "cursor-default" : "cursor-none"
      }`}
    >
      {/* ─── Top Header Overlay ─── */}
      <div
        className={`w-full z-20 flex items-center justify-between p-6 md:p-8 transition-all duration-500 ${
          isControlsVisible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-6 pointer-events-none"
        }`}
        style={{
          background: "linear-gradient(to bottom, rgba(0,0,0,0.85) 0%, transparent 100%)",
        }}
      >
        <div className="flex items-center space-x-4 min-w-0">
          <div className="w-12 h-12 md:w-16 md:h-16 rounded-xl overflow-hidden shadow-2xl flex-shrink-0 border border-white/20 bg-[#181818]">
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
          {/* Vibe Badge */}
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-xs text-white/90">
            <Sparkles size={14} className="text-fuchsia-400 animate-pulse" />
            <span className="font-semibold">{vibe.name}</span>
          </div>

          {/* Full Transcript Sheet Toggle */}
          {lyrics.length > 0 && (
            <button
              onClick={() => setShowFullTranscript(!showFullTranscript)}
              className={`p-2.5 rounded-full transition-all backdrop-blur-md border border-white/15 cursor-pointer ${
                showFullTranscript ? "bg-white/25 text-white" : "bg-white/10 text-white/70 hover:text-white"
              }`}
              title={showFullTranscript ? "Back to Motion Graphics" : "View Full Lyric Sheet"}
            >
              <FileText size={19} />
            </button>
          )}

          {/* Close Visualizer */}
          <button
            onClick={toggleImmersiveVisualizer}
            className="p-2.5 bg-white/10 hover:bg-white/20 rounded-full text-white transition-all backdrop-blur-md border border-white/15 cursor-pointer"
            title="Exit (Esc)"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* ─── CENTER STAGE: TRUE KINETIC MOTION GRAPHICS TYPOGRAPHY ─── */}
      <div className="relative z-10 w-full max-w-5xl px-6 md:px-12 flex-1 flex flex-col items-center justify-center text-center overflow-hidden">
        {isLoading ? (
          <div className="flex flex-col items-center space-y-4">
            <div className="w-14 h-14 rounded-full border-2 border-fuchsia-500/30 border-t-fuchsia-400 animate-spin" />
            <p className="text-lg font-medium text-white/60">Aligning kinetic typography...</p>
          </div>
        ) : activeLine ? (
          <div
            className="flex flex-col items-center justify-center space-y-6 md:space-y-8 w-full select-none"
            style={{ perspective: "1000px" }}
          >
            {/* 1. Gracefully Exiting Previous Phrase (3D Depth Fade) */}
            {prevLine && (
              <div
                key={`prev-${currentLineIndex}`}
                className="opacity-30 text-lg sm:text-2xl md:text-3xl font-semibold text-white/40 tracking-tight transition-all duration-700 select-none"
                style={{
                  transform: "perspective(1000px) translateZ(-60px) translateY(-10px) scale(0.9)",
                  filter: "blur(2px)",
                }}
              >
                {prevLine.text}
              </div>
            )}

            {/* 2. HERO ACTIVE PHRASE — Explosive Motion Graphics Arrival */}
            <div
              key={`active-hero-${activePhraseKey}`}
              className="w-full flex flex-wrap justify-center items-center gap-x-3 md:gap-x-5 gap-y-2 py-4"
              style={{
                animationName: "kineticPhraseEnter",
                animationDuration: "0.55s",
                animationTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
                animationFillMode: "both",
                transform: `scale(${bassBounceScale}) translateY(${bassBounceY}px)`,
                transition: "transform 0.12s ease-out",
              }}
            >
              {activeWords.map((word, wi) => {
                const wordStagger = (wi / Math.max(1, activeWords.length)) * Math.min(activeDuration * 0.6, 1.4)
                return (
                  <span
                    key={wi}
                    className="inline-block text-3xl sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl font-black text-white tracking-tight"
                    style={{
                      animationName: "lyricWordReveal",
                      animationDuration: "0.5s",
                      animationDelay: `${wordStagger}s`,
                      animationFillMode: "both",
                      animationTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
                      textShadow: `0 0 ${20 + audioEnergy.bass * 45}px ${vibe.primary},
                                   0 0 ${50 + audioEnergy.overall * 80}px ${vibe.neonHighlight},
                                   0 4px 20px rgba(0,0,0,0.8)`,
                    }}
                  >
                    {word}
                  </span>
                )
              })}
            </div>

            {/* 3. Audio-Reactive Kinetic Soundwave Bars beneath the active lyric */}
            <div className="flex items-center gap-1.5 h-6">
              {[...Array(16)].map((_, barIdx) => {
                const barHeight = Math.max(
                  4,
                  (barIdx % 2 === 0 ? audioEnergy.bass : audioEnergy.treble) * 24 +
                    Math.sin(barIdx * 0.5 + progress * 5) * 6
                )
                return (
                  <div
                    key={barIdx}
                    className="w-1 md:w-1.5 rounded-full transition-all duration-75"
                    style={{
                      height: `${barHeight}px`,
                      backgroundColor: barIdx % 3 === 0 ? vibe.neonHighlight : vibe.primary,
                      boxShadow: `0 0 8px ${vibe.primary}`,
                    }}
                  />
                )
              })}
            </div>

            {/* 4. Upcoming Phrase Anticipation Preview (Floats gently below) */}
            {nextLine && (
              <div
                key={`next-${currentLineIndex}`}
                className="opacity-35 text-base sm:text-xl md:text-2xl font-medium text-white/50 tracking-tight transition-all duration-700 select-none mt-2"
                style={{
                  transform: "perspective(1000px) translateY(12px) scale(0.92)",
                  filter: "blur(1.5px)",
                }}
              >
                {nextLine.text}
              </div>
            )}
          </div>
        ) : (
          /* ─── Instrumental Section / Intro / Drop Kinetic Stage ─── */
          <div className="flex flex-col items-center space-y-6 text-center select-none animate-in fade-in zoom-in duration-500">
            <div
              className="w-24 h-24 md:w-32 md:h-32 rounded-3xl bg-white/10 backdrop-blur-xl border border-white/20 flex items-center justify-center shadow-2xl relative"
              style={{
                transform: `scale(${1 + audioEnergy.bass * 0.15})`,
                boxShadow: `0 0 ${30 + audioEnergy.bass * 60}px ${vibe.primary}`,
              }}
            >
              <Activity size={48} className="text-white animate-pulse" />
              <div
                className="absolute inset-0 rounded-3xl border border-white/40 animate-ping opacity-30"
                style={{ borderColor: vibe.neonHighlight }}
              />
            </div>

            <div className="space-y-2 max-w-lg">
              <span className="text-xs uppercase tracking-widest font-black text-fuchsia-400 bg-fuchsia-500/20 px-3 py-1 rounded-full border border-fuchsia-500/30">
                Live Dynamic Audio
              </span>
              <h3 className="text-2xl sm:text-4xl font-black text-white tracking-tight drop-shadow-xl">
                Instrumental Section
              </h3>
              <p className="text-sm sm:text-base text-white/60">
                Immerse in the audio-reactive light show. Kinetic lyrics will arrive as the vocals enter.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ─── Slide-Up Full Transcript Drawer (Optional on-demand view) ─── */}
      {showFullTranscript && (
        <div className="absolute inset-x-0 bottom-28 top-24 z-30 mx-auto max-w-2xl px-6 animate-in slide-in-from-bottom duration-300">
          <div className="h-full rounded-2xl bg-black/85 backdrop-blur-2xl border border-white/20 shadow-2xl flex flex-col overflow-hidden">
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText size={17} className="text-fuchsia-400" />
                <span className="text-sm font-bold text-white">Full Lyrics Transcript</span>
              </div>
              <button
                onClick={() => setShowFullTranscript(false)}
                className="p-1 rounded-full text-white/70 hover:text-white hover:bg-white/10"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 no-scrollbar">
              {lyrics.map((line, i) => {
                const isCur = i === currentLineIndex
                return (
                  <div
                    key={i}
                    onClick={() => handleSeekToLine(line.time)}
                    className={`p-2.5 rounded-xl cursor-pointer text-sm font-medium transition-all ${
                      isCur
                        ? "bg-fuchsia-600/30 text-white font-bold border border-fuchsia-500/40 shadow-lg"
                        : "text-white/60 hover:text-white hover:bg-white/10"
                    }`}
                  >
                    {line.text}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ─── Bottom Floating Liquid-Glass Playback Dock ─── */}
      <div
        className={`w-full max-w-3xl px-6 pb-6 md:pb-8 z-30 transition-all duration-500 ${
          isControlsVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8 pointer-events-none"
        }`}
      >
        <div className="rounded-2xl bg-black/60 backdrop-blur-2xl border border-white/15 p-4 md:p-5 shadow-2xl flex flex-col gap-3">
          {/* Progress Bar Scrubber */}
          <div className="flex items-center gap-3 text-xs text-white/70 font-mono">
            <span>{formatTime(currentPos)}</span>
            <div className="relative flex-1 flex items-center group">
              <div className="w-full h-1.5 bg-white/20 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${progressPercent}%`,
                    backgroundColor: vibe.primary,
                    boxShadow: `0 0 12px ${vibe.neonHighlight}`,
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
                  boxShadow: `0 0 ${16 + audioEnergy.bass * 35}px ${vibe.primary}`,
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
                  className="w-full h-1 bg-white/20 rounded-full appearance-none cursor-pointer accent-fuchsia-400"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
