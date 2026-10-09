"use client"
import React, { useEffect, useState, useRef, useMemo, useCallback } from "react"
import { usePlayerStore } from "@/store/playerStore"
import { API_BASE, getSongCover } from "@/lib/api"
import { getSongRgbVibe, RgbVibe } from "@/lib/colors"
import {
  X,
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
  const [currentTime, setCurrentTime] = useState(0)
  const [isControlsVisible, setIsControlsVisible] = useState(true)
  const [showFullTranscript, setShowFullTranscript] = useState(false)
  const [isScrubbing, setIsScrubbing] = useState(false)
  const [scrubValue, setScrubValue] = useState(0)

  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Soft mood vibe for subtle text glow
  const vibe: RgbVibe = useMemo(() => {
    return getSongRgbVibe(
      currentSong?.title,
      currentSong?.artist,
      currentSong?.genre,
      currentSong?.energy
    )
  }, [currentSong?.id, currentSong?.title, currentSong?.artist, currentSong?.genre, currentSong?.energy])

  // ─── 60 FPS Sub-millisecond Time Tracking Loop ───────────────
  useEffect(() => {
    if (!isImmersiveVisualizerOpen) return
    let animId: number
    const tick = () => {
      const audio = document.querySelector("audio")
      if (audio) {
        setCurrentTime(audio.currentTime)
      }
      animId = requestAnimationFrame(tick)
    }
    animId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animId)
  }, [isImmersiveVisualizerOpen])

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

  // ─── Find Active Line Index from currentTime ────────────────
  useEffect(() => {
    if (lyrics.length === 0) return
    let index = -1
    for (let i = 0; i < lyrics.length; i++) {
      if (lyrics[i].time <= currentTime && lyrics[i].time !== -1) {
        index = i
      } else if (lyrics[i].time > currentTime) {
        break
      }
    }
    setCurrentLineIndex(index)
  }, [currentTime, lyrics])

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

  // ─── Active Line & Word Timings Calculation ─────────────────
  const activeLine = currentLineIndex >= 0 ? lyrics[currentLineIndex] : null
  const prevLine = currentLineIndex > 0 ? lyrics[currentLineIndex - 1] : null
  const nextLine = currentLineIndex + 1 < lyrics.length ? lyrics[currentLineIndex + 1] : null

  const activeWords = activeLine ? splitWords(activeLine.text) : []
  const numWords = activeWords.length

  // Calculate actual duration of this line in seconds
  let lineDuration = 3.5
  if (activeLine && activeLine.time >= 0) {
    if (nextLine && nextLine.time > activeLine.time) {
      lineDuration = Math.max(1.2, nextLine.time - activeLine.time)
    } else {
      lineDuration = 4.0
    }
  }

  const lineStartTime = activeLine?.time ?? 0

  return (
    <div
      className={`fixed inset-0 z-[200] flex flex-col items-center justify-between pointer-events-auto select-none transition-colors duration-700 ${
        isControlsVisible ? "cursor-default" : "cursor-none"
      }`}
    >
      {/* ─── Top Header (Clean & Minimal) ─── */}
      <div
        className={`w-full z-20 flex items-center justify-between p-6 md:p-8 transition-all duration-500 ${
          isControlsVisible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-6 pointer-events-none"
        }`}
        style={{
          background: "linear-gradient(to bottom, rgba(0,0,0,0.85) 0%, transparent 100%)",
        }}
      >
        <div className="flex items-center space-x-4 min-w-0">
          <div className="w-12 h-12 md:w-14 md:h-14 rounded-xl overflow-hidden shadow-2xl flex-shrink-0 border border-white/15 bg-[#181818]">
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
            <h2 className="text-lg md:text-xl font-bold text-white truncate tracking-tight drop-shadow-md">
              {currentSong?.title}
            </h2>
            <p className="text-sm text-white/60 truncate">
              {currentSong?.artist}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3 flex-shrink-0">
          {lyrics.length > 0 && (
            <button
              onClick={() => setShowFullTranscript(!showFullTranscript)}
              className={`p-2.5 rounded-full transition-all backdrop-blur-md border border-white/10 cursor-pointer ${
                showFullTranscript ? "bg-white/20 text-white" : "bg-white/5 text-white/60 hover:text-white"
              }`}
              title={showFullTranscript ? "Close Full Lyric Sheet" : "View Full Lyric Sheet"}
            >
              <FileText size={18} />
            </button>
          )}

          <button
            onClick={toggleImmersiveVisualizer}
            className="p-2.5 bg-white/10 hover:bg-white/20 rounded-full text-white transition-all backdrop-blur-md border border-white/10 cursor-pointer"
            title="Exit (Esc)"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* ─── CENTER STAGE: TRUE WORD-BY-WORD SYNCHRONIZATION ─── */}
      <div className="relative z-10 w-full max-w-4xl px-8 md:px-12 flex-1 flex flex-col items-center justify-center text-center overflow-hidden">
        {isLoading ? (
          <div className="flex flex-col items-center space-y-4">
            <div className="w-12 h-12 rounded-full border-2 border-white/20 border-t-white animate-spin" />
            <p className="text-base font-medium text-white/50">Loading lyrics...</p>
          </div>
        ) : activeLine && activeLine.time >= 0 ? (
          <div className="flex flex-col items-center justify-center space-y-4 md:space-y-6 w-full select-none">
            {/* Previous Line (Gently fading above) */}
            {prevLine && prevLine.time >= 0 && (
              <div className="opacity-25 text-base sm:text-xl md:text-2xl font-medium text-white tracking-tight transition-opacity duration-700 select-none">
                {prevLine.text}
              </div>
            )}

            {/* Current Singing Line — Words Arrive & Highlight One-by-One */}
            <div className="w-full flex flex-wrap justify-center items-center gap-x-2.5 sm:gap-x-4 md:gap-x-5 gap-y-2 py-3">
              {activeWords.map((word, i) => {
                // Word timing calculation
                const wordStart = lineStartTime + (i / numWords) * lineDuration
                const wordEnd = lineStartTime + ((i + 1) / numWords) * lineDuration

                const isArrived = currentTime >= wordStart
                const isCurrentlySinging = currentTime >= wordStart && currentTime < wordEnd
                const isSung = currentTime >= wordEnd

                return (
                  <span
                    key={i}
                    className="inline-block text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight transition-all duration-200"
                    style={{
                      // If word has not been sung yet, it is completely hidden
                      opacity: isArrived ? 1 : 0,
                      transform: isArrived
                        ? isCurrentlySinging
                          ? "translateY(0) scale(1.06)"
                          : "translateY(0) scale(1)"
                        : "translateY(14px) scale(0.85)",
                      color: isCurrentlySinging
                        ? "#ffffff"
                        : isSung
                        ? "rgba(255, 255, 255, 0.9)"
                        : "transparent",
                      textShadow: isCurrentlySinging
                        ? `0 0 25px ${vibe.primary}, 0 0 50px ${vibe.neonHighlight}`
                        : "none",
                      filter: isArrived ? "blur(0px)" : "blur(8px)",
                    }}
                  >
                    {word}
                  </span>
                )
              })}
            </div>
          </div>
        ) : (
          /* Instrumental / Resting Stage (Soft & Peaceful) */
          <div className="flex flex-col items-center space-y-3 text-center select-none animate-in fade-in duration-700">
            <h3 className="text-xl sm:text-3xl font-bold text-white/80 tracking-tight">
              {currentSong?.title}
            </h3>
            <p className="text-sm text-white/50">
              {currentSong?.artist}
            </p>
          </div>
        )}
      </div>

      {/* ─── Slide-Up Full Transcript Drawer ─── */}
      {showFullTranscript && (
        <div className="absolute inset-x-0 bottom-28 top-24 z-30 mx-auto max-w-xl px-6 animate-in slide-in-from-bottom duration-300">
          <div className="h-full rounded-2xl bg-black/90 backdrop-blur-2xl border border-white/15 shadow-2xl flex flex-col overflow-hidden">
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <span className="text-sm font-bold text-white">Full Lyrics</span>
              <button
                onClick={() => setShowFullTranscript(false)}
                className="p-1 rounded-full text-white/60 hover:text-white hover:bg-white/10"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2.5 no-scrollbar">
              {lyrics.map((line, i) => {
                const isCur = i === currentLineIndex
                return (
                  <div
                    key={i}
                    onClick={() => handleSeekToLine(line.time)}
                    className={`p-2.5 rounded-xl cursor-pointer text-sm font-medium transition-all ${
                      isCur
                        ? "bg-white/20 text-white font-bold"
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

      {/* ─── Bottom Floating Soft Liquid-Glass Playback Dock ─── */}
      <div
        className={`w-full max-w-2xl px-6 pb-6 md:pb-8 z-30 transition-all duration-500 ${
          isControlsVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8 pointer-events-none"
        }`}
      >
        <div className="rounded-2xl bg-black/60 backdrop-blur-2xl border border-white/10 p-4 shadow-2xl flex flex-col gap-3">
          {/* Progress Scrubber */}
          <div className="flex items-center gap-3 text-xs text-white/60 font-mono">
            <span>{formatTime(currentPos)}</span>
            <div className="relative flex-1 flex items-center group">
              <div className="w-full h-1 bg-white/20 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${progressPercent}%`,
                    backgroundColor: vibe.primary,
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
            <div className="flex items-center space-x-2">
              <button
                onClick={toggleShuffle}
                className={`p-2 rounded-full transition-all cursor-pointer ${
                  shuffle ? "text-emerald-400 bg-white/10" : "text-white/50 hover:text-white"
                }`}
                title="Shuffle"
              >
                <Shuffle size={16} />
              </button>
              <button
                onClick={toggleRepeat}
                className={`p-2 rounded-full transition-all cursor-pointer ${
                  repeatMode !== "off" ? "text-emerald-400 bg-white/10" : "text-white/50 hover:text-white"
                }`}
                title={`Repeat: ${repeatMode}`}
              >
                {repeatMode === "one" ? <Repeat1 size={16} /> : <Repeat size={16} />}
              </button>
            </div>

            <div className="flex items-center space-x-4">
              <button
                onClick={playPrevious}
                className="p-2 text-white/70 hover:text-white transition-all cursor-pointer"
                title="Previous"
              >
                <SkipBack size={20} />
              </button>
              <button
                onClick={togglePlay}
                className="p-3 rounded-full bg-white text-black hover:scale-105 active:scale-95 transition-all shadow-lg cursor-pointer"
                title={isPlaying ? "Pause" : "Play"}
              >
                {isPlaying ? <Pause size={20} fill="black" /> : <Play size={20} fill="black" className="ml-0.5" />}
              </button>
              <button
                onClick={playNext}
                className="p-2 text-white/70 hover:text-white transition-all cursor-pointer"
                title="Next"
              >
                <SkipForward size={20} />
              </button>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={toggleMute}
                className="p-2 text-white/60 hover:text-white transition-all cursor-pointer"
                title={isMuted ? "Unmute" : "Mute"}
              >
                {isMuted || volume === 0 ? <VolumeX size={17} /> : <Volume2 size={17} />}
              </button>
              <div className="w-16 sm:w-20 relative flex items-center">
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={isMuted ? 0 : volume}
                  onChange={(e) => setVolume(parseFloat(e.target.value))}
                  className="w-full h-1 bg-white/20 rounded-full appearance-none cursor-pointer accent-white"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
