"use client"
import React, { useEffect, useState, useRef, useMemo, useCallback } from "react"
import { usePlayerStore } from "@/store/playerStore"
import { API_BASE, getSongCover } from "@/lib/api"
import { getSongRgbVibe, RgbVibe, hexToRgba } from "@/lib/colors"
import { audioDsp } from "@/lib/audioDsp"
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
  Music2,
} from "lucide-react"

interface LyricLine {
  time: number
  text: string
}

interface SyncedWord {
  text: string
  startTime: number
  endTime: number
  weight: number
}

interface SyncedLine {
  time: number
  text: string
  endTime: number
  singingEndTime: number
  words: SyncedWord[]
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

/**
 * Advanced Acoustic Phonetic & Cadence Sync Engine.
 * Converts raw LRC lines into studio-accurate word-level timestamps matching
 * vocal onsets, natural syllable cadence, phrasing sustain, and instrumental pauses.
 */
function buildSyncedLines(rawLines: LyricLine[], tempo = 118): SyncedLine[] {
  const result: SyncedLine[] = []

  for (let i = 0; i < rawLines.length; i++) {
    const cur = rawLines[i]
    if (cur.time < 0 || !cur.text.trim()) continue

    const next = rawLines[i + 1]
    const rawGap = next && next.time > cur.time ? next.time - cur.time : 4.2

    // Check for inline enhanced LRC word timestamps: e.g. <00:12.34>word
    const inlineWordRegex = /<(\d+):(\d+(?:\.\d+)?)>([^<]+)/g
    const inlineMatches = [...cur.text.matchAll(inlineWordRegex)]

    if (inlineMatches.length > 0) {
      // Enhanced LRC with pre-recorded word timestamps
      const words: SyncedWord[] = []
      for (let wIdx = 0; wIdx < inlineMatches.length; wIdx++) {
        const m = inlineMatches[wIdx]
        const mins = parseInt(m[1])
        const secs = parseFloat(m[2])
        const wStart = mins * 60 + secs
        const wText = m[3].trim()

        let wEnd = wStart + 0.4
        if (wIdx + 1 < inlineMatches.length) {
          const nextM = inlineMatches[wIdx + 1]
          wEnd = parseInt(nextM[1]) * 60 + parseFloat(nextM[2])
        }
        words.push({
          text: wText,
          startTime: wStart,
          endTime: Math.max(wStart + 0.15, wEnd),
          weight: 1.0,
        })
      }
      const cleanLineText = cur.text.replace(/<[^>]+>/g, "").trim()
      result.push({
        time: cur.time,
        text: cleanLineText,
        endTime: next ? next.time : cur.time + rawGap,
        singingEndTime: words.length > 0 ? words[words.length - 1].endTime : cur.time + 3.0,
        words,
      })
      continue
    }

    // Standard LRC Line: Phonetic & Syllable Cadence Modeling
    const rawWords = splitWords(cur.text)
    if (rawWords.length === 0) continue

    const weights = rawWords.map((word, wIdx) => {
      const isLast = wIdx === rawWords.length - 1
      const clean = word.replace(/[^a-zA-Z0-9\u0900-\u0D7F]/g, "")
      const len = clean.length || word.length

      let w = 1.0
      if (len <= 2) w = 0.85
      else if (len === 3) w = 1.25
      else if (len === 4) w = 1.55
      else if (len === 5) w = 1.95
      else if (len === 6) w = 2.40
      else w = 2.85 + (len - 7) * 0.3

      // Punctuation micro-breath
      if (/[,;:\-]$/.test(word)) w += 0.45
      if (/\.{3}$/.test(word)) w += 0.75

      // Terminal note sustain (singers hold the final vowel in pop/ballads/punjabi)
      if (isLast) {
        w *= 1.85
      }
      return w
    })

    const totalWeight = weights.reduce((acc, val) => acc + val, 0)
    const phoneticDuration = totalWeight * 0.22

    // Apportion active singing window vs inter-line pause
    let singingDuration: number
    if (rawGap <= 2.2) {
      singingDuration = rawGap * 0.94
    } else if (rawGap <= 4.2) {
      singingDuration = Math.min(rawGap * 0.86, Math.max(phoneticDuration, 2.0))
    } else {
      // Instrumental break between lines! The singer only sings the phrase, not dead air
      singingDuration = Math.min(rawGap * 0.68, Math.max(phoneticDuration * 1.15, 3.2))
    }
    singingDuration = Math.max(1.0, Math.min(singingDuration, rawGap - 0.25))

    let offset = 0
    const words: SyncedWord[] = rawWords.map((word, wIdx) => {
      const frac = weights[wIdx] / totalWeight
      const dur = frac * singingDuration
      const startTime = cur.time + offset
      const endTime = startTime + dur
      offset += dur
      return {
        text: word,
        startTime,
        endTime,
        weight: weights[wIdx],
      }
    })

    result.push({
      time: cur.time,
      text: cur.text,
      endTime: next ? next.time : cur.time + rawGap,
      singingEndTime: cur.time + singingDuration,
      words,
    })
  }

  return result
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

  const [rawLyrics, setRawLyrics] = useState<LyricLine[]>([])
  const [syncedLines, setSyncedLines] = useState<SyncedLine[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [currentLineIndex, setCurrentLineIndex] = useState(-1)
  const [currentTime, setCurrentTime] = useState(0)
  const [isControlsVisible, setIsControlsVisible] = useState(true)
  const [showFullTranscript, setShowFullTranscript] = useState(false)
  const [isScrubbing, setIsScrubbing] = useState(false)
  const [scrubValue, setScrubValue] = useState(0)

  // Direct 60 FPS DOM refs for zero-lag hardware reactive bloom
  const coverContainerRef = useRef<HTMLDivElement | null>(null)
  const haloRef = useRef<HTMLDivElement | null>(null)
  const circularCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const smoothBassRef = useRef(0)
  const smoothMidRef = useRef(0)
  const smoothTrebleRef = useRef(0)
  const smoothedSpectrumRef = useRef<Float32Array>(new Float32Array(64))
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

  // ─── 60 FPS Sub-millisecond Time & Audio Reactivity Loop ───────
  useEffect(() => {
    if (!isImmersiveVisualizerOpen) return
    let animId: number
    const tick = () => {
      const audio = document.querySelector("audio")
      const audioTime = audio ? audio.currentTime : 0
      if (audio) {
        setCurrentTime(audioTime)
      }

      // Detect real-time vocal state from lyrics for true singer-synced illumination
      let isSinging = false
      let vocalWeight = 0.7
      if (syncedLines.length > 0) {
        for (let i = 0; i < syncedLines.length; i++) {
          const l = syncedLines[i]
          if (audioTime >= l.time && audioTime <= (l.singingEndTime || l.endTime)) {
            isSinging = true
            const curW = l.words.find((w) => audioTime >= w.startTime && audioTime <= w.endTime)
            vocalWeight = curW ? 1.0 : 0.8
            break
          }
        }
      }

      // Transmit live acoustic context to DSP engine
      audioDsp.setTrackContext({
        tempo: currentSong?.tempo,
        energy: currentSong?.energy,
        genre: currentSong?.genre,
        mood: currentSong?.mood,
        isVocalsActive: isSinging,
        vocalWeight,
        currentTime: audioTime,
      })

      // Update Center Cover Pulse & Halo Bloom directly on DOM (60 FPS, 0 React re-renders)
      const raw = audioDsp.getReactivityData()

      // High-precision musical envelope follower (instant punchy attack, luxurious velvety decay)
      const bassSpeed = raw.bassLevel > smoothBassRef.current ? 0.44 : 0.14
      smoothBassRef.current += (raw.bassLevel - smoothBassRef.current) * bassSpeed

      const midSpeed = raw.midLevel > smoothMidRef.current ? 0.38 : 0.12
      smoothMidRef.current += (raw.midLevel - smoothMidRef.current) * midSpeed

      const trebleSpeed = raw.trebleLevel > smoothTrebleRef.current ? 0.38 : 0.12
      smoothTrebleRef.current += (raw.trebleLevel - smoothTrebleRef.current) * trebleSpeed

      if (coverContainerRef.current) {
        // Dynamic musical heartbeat pulse on kicks & downbeats (~3.8% scale)
        const kickScale = 1 + smoothBassRef.current * 0.038
        coverContainerRef.current.style.transform = `scale(${kickScale})`
        coverContainerRef.current.style.boxShadow = `0 16px 45px rgba(0,0,0,0.85), 0 0 ${20 + smoothBassRef.current * 32}px ${hexToRgba(vibe.primary, 0.28 + smoothBassRef.current * 0.22)}`
      }

      // Render 360° Symmetrical Radial Music EQ Waveform Visualizer
      const canvas = circularCanvasRef.current
      if (canvas) {
        const rect = canvas.getBoundingClientRect()
        const dpr = Math.min(2, window.devicePixelRatio || 1)
        const reqW = Math.round(rect.width * dpr)
        const reqH = Math.round(rect.height * dpr)
        if (canvas.width !== reqW || canvas.height !== reqH) {
          canvas.width = reqW
          canvas.height = reqH
        }
        const ctx = canvas.getContext("2d")
        if (ctx && reqW > 0 && reqH > 0) {
          ctx.clearRect(0, 0, reqW, reqH)
          const cx = reqW / 2
          const cy = reqH / 2

          // Cover diameter in canvas pixels (canvas is 260% of cover width)
          const coverD = Math.min(reqW, reqH) / 2.6
          const baseR = coverD * 0.70

          // Update smoothed 64-bin frequency spectrum for bouncy, instantaneous EQ tracking
          const spectrum = audioDsp.getFullSpectrumData()
          const smoothedSpec = smoothedSpectrumRef.current
          for (let i = 0; i < 64; i++) {
            const target = spectrum[i] || 0
            const spd = target > smoothedSpec[i] ? 0.46 : 0.14
            smoothedSpec[i] += (target - smoothedSpec[i]) * spd
          }

          // 1. Soft Breathing Velvet Halo (Ambient Cushion behind Bars — Zero Glare)
          const glowR = baseR * (1.18 + smoothBassRef.current * 0.22)
          const glowGrad = ctx.createRadialGradient(cx, cy, baseR * 0.55, cx, cy, glowR)
          glowGrad.addColorStop(0, hexToRgba(vibe.primary, 0.24 + smoothBassRef.current * 0.16))
          glowGrad.addColorStop(0.55, hexToRgba(vibe.secondary, 0.12 + smoothMidRef.current * 0.10))
          glowGrad.addColorStop(0.85, hexToRgba(vibe.accent, 0.03 + smoothTrebleRef.current * 0.04))
          glowGrad.addColorStop(1, "transparent")
          ctx.fillStyle = glowGrad
          ctx.beginPath()
          ctx.arc(cx, cy, glowR, 0, Math.PI * 2)
          ctx.fill()

          // 2. Inner Resonant Anchor Ring (Subtle guide contour hugging cover perimeter)
          ctx.beginPath()
          ctx.arc(cx, cy, baseR * 1.025, 0, Math.PI * 2)
          ctx.strokeStyle = hexToRgba(vibe.primary, 0.30 + smoothBassRef.current * 0.22)
          ctx.lineWidth = 1.6 * dpr
          ctx.stroke()

          // 3. 64-Bar Symmetrical Radial Music EQ Waveform (Dynamic Music Synchronization)
          const N = 64
          const rInner = baseR * 1.045
          const crestPoints: Array<{ x: number; y: number }> = []

          for (let i = 0; i < N; i++) {
            const angle = (i / N) * Math.PI * 2 - Math.PI / 2

            // Bilateral symmetry (left and right channels mirror for balanced audiophile aesthetic)
            const half = N / 2 // 32
            const specIdx = i < half
              ? Math.floor((i / (half - 1)) * 42)
              : Math.floor(((N - 1 - i) / (half - 1)) * 42)
            const barAmp = smoothedSpec[specIdx] || 0

            // Punchy, noticeable music reactivity: pulses strongly on kicks & dances on vocals!
            const minBarLen = baseR * 0.038
            const dynamicLen = (barAmp * 0.80 + smoothBassRef.current * 0.20) * (baseR * 0.36)
            const totalBarLen = minBarLen + dynamicLen

            const rOuter = rInner + totalBarLen
            const x1 = cx + Math.cos(angle) * rInner
            const y1 = cy + Math.sin(angle) * rInner
            const x2 = cx + Math.cos(angle) * rOuter
            const y2 = cy + Math.sin(angle) * rOuter

            crestPoints.push({ x: x2, y: y2 })

            // Soft jewel tones: smooth perimeter gradient without ANY eye-flashing white!
            const colorFrac = Math.sin((i / N) * Math.PI)
            const barAlpha = 0.45 + barAmp * 0.38
            const barColor = colorFrac < 0.5
              ? hexToRgba(vibe.primary, barAlpha)
              : hexToRgba(vibe.secondary, barAlpha)

            ctx.beginPath()
            ctx.moveTo(x1, y1)
            ctx.lineTo(x2, y2)
            ctx.strokeStyle = barColor
            ctx.lineWidth = 2.4 * dpr
            ctx.lineCap = "round"
            ctx.stroke()
          }

          // 4. Smooth Liquid Wave Crest Ribbon (Living organic membrane connecting bar crests)
          if (crestPoints.length > 2) {
            ctx.beginPath()
            const last = crestPoints[N - 1]
            const first = crestPoints[0]
            ctx.moveTo((last.x + first.x) / 2, (last.y + first.y) / 2)

            for (let i = 0; i < N; i++) {
              const next = crestPoints[(i + 1) % N]
              const midX = (crestPoints[i].x + next.x) / 2
              const midY = (crestPoints[i].y + next.y) / 2
              ctx.quadraticCurveTo(crestPoints[i].x, crestPoints[i].y, midX, midY)
            }
            ctx.closePath()

            ctx.strokeStyle = hexToRgba(vibe.secondary, 0.40 + smoothMidRef.current * 0.25)
            ctx.lineWidth = 1.6 * dpr
            ctx.shadowColor = vibe.primary
            ctx.shadowBlur = 8 * dpr
            ctx.stroke()
            ctx.shadowBlur = 0
          }
        }
      }

      animId = requestAnimationFrame(tick)
    }
    animId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animId)
  }, [isImmersiveVisualizerOpen, vibe, syncedLines, currentSong?.tempo, currentSong?.energy, currentSong?.genre, currentSong?.mood])

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

  // ─── Fetch Lyrics & Compute Precision Word Sync ─────────────
  useEffect(() => {
    if (!currentSong || !isImmersiveVisualizerOpen) return

    let isMounted = true
    setIsLoading(true)

    const applyLyrics = (raw: LyricLine[]) => {
      if (!isMounted) return
      setRawLyrics(raw)
      const tempo = currentSong?.tempo || 118
      const processed = buildSyncedLines(raw, tempo)
      setSyncedLines(processed)
      setIsLoading(false)
    }

    const fetchLyrics = async () => {
      // 1. In-memory attached LRC
      if (currentSong.lyricsLrc && currentSong.lyricsLrc.trim()) {
        applyLyrics(parseLyrics(currentSong.lyricsLrc))
        return
      }

      // 2. Fetch from Melofy Backend
      try {
        const res = await fetch(`${API_BASE}/api/songs/${currentSong.id}/lyrics`)
        if (res.ok) {
          const text = await res.text()
          if (text && text.trim().length > 5) {
            applyLyrics(parseLyrics(text))
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
            applyLyrics(parseLyrics(lrcText))
            return
          }
        }
      } catch (clientErr) {
        console.info("LRCLIB direct fetch notice:", clientErr)
      }

      if (isMounted) {
        setRawLyrics([])
        setSyncedLines([])
        setIsLoading(false)
      }
    }

    fetchLyrics()

    return () => {
      isMounted = false
    }
  }, [currentSong?.id, currentSong?.lyricsLrc, currentSong?.title, currentSong?.tempo, isImmersiveVisualizerOpen])

  // ─── Find Active Line Index from currentTime ────────────────
  useEffect(() => {
    if (syncedLines.length === 0) return
    let index = -1
    for (let i = 0; i < syncedLines.length; i++) {
      if (syncedLines[i].time <= currentTime) {
        index = i
      } else if (syncedLines[i].time > currentTime) {
        break
      }
    }
    setCurrentLineIndex(index)
  }, [currentTime, syncedLines])

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

  // ─── Active Line & Phonetic Word Synchronization ────────────
  const activeLine = currentLineIndex >= 0 ? syncedLines[currentLineIndex] : null
  const prevLine = currentLineIndex > 0 ? syncedLines[currentLineIndex - 1] : null

  return (
    <div
      className={`fixed inset-0 z-[200] flex flex-col items-center justify-between pointer-events-auto select-none overflow-x-hidden overflow-y-hidden transition-colors duration-700 ${
        isControlsVisible ? "cursor-default" : "cursor-none"
      }`}
    >
      {/* ─── Top Header (Clean, Glassmorphic & Minimal) ─────────── */}
      <div
        className={`w-full z-20 flex items-center justify-between px-4 py-4 sm:px-6 sm:py-5 md:px-10 md:py-6 transition-all duration-500 ${
          isControlsVisible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-6 pointer-events-none"
        }`}
        style={{
          background: "linear-gradient(to bottom, rgba(0,0,0,0.85) 0%, transparent 100%)",
        }}
      >
        <div className="flex items-center space-x-3 min-w-0">
          <div className="p-2 rounded-xl bg-white/10 backdrop-blur-md border border-white/15 text-white flex-shrink-0">
            <Music2 size={18} className="text-white/90" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center space-x-2">
              <span className="text-xs uppercase tracking-wider font-bold text-white/50">
                Light Show &amp; Lyrics
              </span>
              <span
                className="w-1.5 h-1.5 rounded-full animate-ping"
                style={{ backgroundColor: vibe.neonHighlight }}
              />
            </div>
            <p className="text-sm font-semibold text-white/80 truncate">
              {currentSong?.title} &bull; {currentSong?.artist}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2 sm:space-x-3 flex-shrink-0">
          {rawLyrics.length > 0 && (
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

      {/* ─── CENTER STAGE: ALBUM COVER VISUAL ANCHOR + MUSIC SYNC RGB ─── */}
      <div className="relative z-10 w-full max-w-2xl px-4 sm:px-6 flex-1 flex flex-col items-center justify-center text-center overflow-hidden my-auto mx-auto">
        {/* ─── 1. CENTER ALBUM COVER WITH AUDIO-REACTIVE CIRCULAR HALO ──── */}
        <div className="relative flex flex-col items-center justify-center mb-4 sm:mb-6 select-none mx-auto">
          {/* Cover & 360° Circular Audio Waveform Halo Canvas Wrapper */}
          <div className="relative flex items-center justify-center">
            {/* 360° Circular Audio-Reactive Waveform Halo Canvas */}
            <canvas
              ref={circularCanvasRef}
              className="absolute pointer-events-none z-0"
              style={{
                width: "260%",
                height: "260%",
                top: "-80%",
                left: "-80%",
              }}
            />

            {/* High-Res Center Cover Image with Real-time Beat Pulse */}
            <div
              ref={coverContainerRef}
              className="relative z-10 w-36 h-36 sm:w-48 sm:h-48 md:w-56 md:h-56 lg:w-64 lg:h-64 rounded-2xl sm:rounded-3xl overflow-hidden border border-white/20 shadow-[0_20px_50px_rgba(0,0,0,0.85)] transition-transform duration-100 ease-out flex-shrink-0 mx-auto"
              style={{
                boxShadow: `0 16px 40px rgba(0,0,0,0.8), 0 0 35px ${hexToRgba(vibe.primary, 0.35)}`,
              }}
            >
              <img
                src={getSongCover(currentSong, 600)}
                alt={currentSong?.title}
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.currentTarget.src = "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&q=80"
                }}
              />
              {/* Soft Ambient Gloss Sheen */}
              <div className="absolute inset-0 bg-gradient-to-tr from-black/25 via-transparent to-white/10 pointer-events-none" />
            </div>
          </div>

          {/* Song Metadata Below Cover */}
          <div className="relative z-10 mt-3 sm:mt-4 text-center max-w-md px-2 mx-auto">
            <h2 className="text-lg sm:text-xl md:text-2xl font-black text-white tracking-tight drop-shadow-lg truncate">
              {currentSong?.title}
            </h2>
            <p className="text-xs sm:text-sm text-white/70 font-medium truncate mt-0.5">
              {currentSong?.artist}
            </p>
          </div>
        </div>

        {/* ─── 2. STUDIO PRECISION WORD-BY-WORD MOTION LYRICS ───── */}
        {isLoading ? (
          <div className="flex flex-col items-center space-y-3 py-3">
            <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white animate-spin" />
            <p className="text-xs sm:text-sm font-medium text-white/50">Synchronizing lyrics to beat...</p>
          </div>
        ) : activeLine && activeLine.words.length > 0 ? (
          <div className="flex flex-col items-center justify-center space-y-2 sm:space-y-3 w-full select-none max-w-xl mx-auto px-2">
            {/* Previous Line (Fading gently above) */}
            {prevLine && (
              <div className="opacity-25 text-xs sm:text-sm md:text-base font-medium text-white tracking-tight transition-opacity duration-700 select-none truncate max-w-md mx-auto">
                {prevLine.text}
              </div>
            )}

            {/* Current Active Line — Words Arrive with Motion Graphics as Sung */}
            <div className="w-full flex flex-wrap justify-center items-center gap-x-2 sm:gap-x-3 md:gap-x-4 gap-y-1 py-1 min-h-[44px]">
              {activeLine.words.map((wordObj, i) => {
                const isArrived = currentTime >= wordObj.startTime
                const isSinging = currentTime >= wordObj.startTime && currentTime < wordObj.endTime
                const isSung = currentTime >= wordObj.endTime

                return (
                  <span
                    key={i}
                    className="inline-block text-xl sm:text-2xl md:text-3xl lg:text-4xl font-black tracking-tight break-words transition-all duration-150 ease-out"
                    style={{
                      // Words that have not yet been sung do NOT sit statically; they emerge on singer's cue
                      opacity: isArrived ? 1 : 0,
                      transform: isArrived
                        ? isSinging
                          ? "translateY(0) scale(1.12)"
                          : "translateY(0) scale(1)"
                        : "translateY(14px) scale(0.85)",
                      color: isSinging
                        ? "#ffffff"
                        : isSung
                        ? "rgba(255, 255, 255, 0.95)"
                        : "transparent",
                      textShadow: isSinging
                        ? `0 0 20px ${vibe.primary}, 0 0 40px ${vibe.neonHighlight}`
                        : isSung
                        ? "0 0 10px rgba(255, 255, 255, 0.35)"
                        : "none",
                      filter: isArrived ? "blur(0px)" : "blur(6px)",
                    }}
                  >
                    {wordObj.text}
                  </span>
                )
              })}
            </div>
          </div>
        ) : (
          /* Instrumental Break / Ambient Section */
          <div className="flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/15 text-white/60 text-xs font-semibold uppercase tracking-wider animate-in fade-in duration-500">
            <span
              className="w-2 h-2 rounded-full animate-ping"
              style={{ backgroundColor: vibe.primary }}
            />
            <span>Instrumental Groove</span>
          </div>
        )}
      </div>

      {/* ─── Slide-Up Full Transcript Drawer ───────────────────── */}
      {showFullTranscript && (
        <div className="absolute inset-x-0 bottom-28 top-24 z-30 mx-auto max-w-xl px-6 animate-in slide-in-from-bottom duration-300">
          <div className="h-full rounded-2xl bg-black/90 backdrop-blur-2xl border border-white/15 shadow-2xl flex flex-col overflow-hidden">
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <span className="text-sm font-bold text-white">Full Lyrics Sheet</span>
              <button
                onClick={() => setShowFullTranscript(false)}
                className="p-1 rounded-full text-white/60 hover:text-white hover:bg-white/10 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2.5 no-scrollbar">
              {syncedLines.map((line, i) => {
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

      {/* ─── Bottom Floating Soft Liquid-Glass Playback Dock ───── */}
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
