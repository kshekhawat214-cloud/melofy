"use client"
import { useEffect, useRef, useState, useCallback, useMemo } from "react"
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Volume2,
  VolumeX,
  Volume1,
  Maximize2,
  Mic2,
  ListMusic,
  Heart,
  PlusCircle,
  PanelRight,
  Loader2,
  ChevronDown,
  MoreHorizontal,
  Minimize2,
  Sun,
  Sliders,
  Sparkles,
  Zap,
  Radio,
  Disc3,
  Activity,
  AudioWaveform,
} from "lucide-react"
import { usePlayerStore } from "@/store/playerStore"
import { useUIStore } from "@/store/uiStore"
import { useAuthStore } from "@/store/authStore"
import { API_BASE, getSongCover, recordInteraction } from "@/lib/api"
import { getSongMoodColor } from "@/lib/colors"
import { SOUNDSTAGE_PROFILES } from "@/lib/soundstage"
import { audioDsp } from "@/lib/audioDsp"
import PlayerVisualizer from "@/components/PlayerVisualizer"

export default function Player() {
  const {
    currentSong,
    isPlaying,
    setIsPlaying,
    togglePlay,
    playNext,
    playPrevious,
    shuffle,
    toggleShuffle,
    repeatMode,
    toggleRepeat,
    volume,
    setVolume,
    isMuted,
    toggleMute,
    progress,
    setProgress,
    duration,
    setDuration,
    isLyricsOpen,
    toggleLyrics,
    isQueueOpen,
    toggleQueue,
    isRightSidebarOpen,
    toggleRightSidebar,
    ambientLighting,
    toggleAmbientLighting,
    soundstageMode,
    setSoundstageMode,
    visualizerMode,
    setVisualizerMode,
    isImmersiveVisualizerOpen,
    toggleImmersiveVisualizer,
  } = usePlayerStore()

  const { likedSongIds, toggleLikeSong, openContextMenu, addToast } = useUIStore()

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioRetryRef = useRef<{ id: string; count: number }>({ id: "", count: 0 })
  const audioRetryTimerRef = useRef<NodeJS.Timeout | null>(null)
  const shouldPlayOnReadyRef = useRef(false)
  const { user } = useAuthStore()
  const currentUserId = user?.id || "1"
  const hasLoggedPlayRef = useRef(false)
  const previousSongRef = useRef<{ id: string; duration?: number; progress: number } | null>(null)
  const restoredSeekAppliedRef = useRef(false)

  const [isHoveringProgress, setIsHoveringProgress] = useState(false)
  const [isHoveringVolume, setIsHoveringVolume] = useState(false)
  const [isBuffering, setIsBuffering] = useState(false)
  const [isMobileNowPlayingOpen, setIsMobileNowPlayingOpen] = useState(false)
  const [sheetTranslateY, setSheetTranslateY] = useState(0)
  const sheetTouchStartY = useRef(0)
  const [isDesktopFullscreenOpen, setIsDesktopFullscreenOpen] = useState(false)
  const [showSoundstageMenu, setShowSoundstageMenu] = useState(false)

  const moodTone = useMemo(() => {
    return getSongMoodColor(currentSong?.title || currentSong?.genre || "pop")
  }, [currentSong?.id, currentSong?.title, currentSong?.genre])

  // Spotify-grade smooth scrubbing & dragging state
  const [isDraggingProgress, setIsDraggingProgress] = useState(false)
  const [dragProgress, setDragProgress] = useState(0)
  const isDraggingProgressRef = useRef(false)
  const dragProgressRef = useRef(0)
  isDraggingProgressRef.current = isDraggingProgress
  dragProgressRef.current = dragProgress

  const isLiked = currentSong ? likedSongIds.has(currentSong.id) : false

  // Mobile swipe down to close now-playing sheet
  const handleSheetTouchStart = (e: React.TouchEvent) => {
    sheetTouchStartY.current = e.touches[0].clientY
  }

  const handleSheetTouchMove = (e: React.TouchEvent) => {
    const deltaY = e.touches[0].clientY - sheetTouchStartY.current
    if (deltaY > 0) {
      setSheetTranslateY(deltaY)
    }
  }

  const handleSheetTouchEnd = () => {
    if (sheetTranslateY > 100) {
      closeMobileNowPlaying()
    }
    setSheetTranslateY(0)
  }

  // Hydrate user settings from localStorage on client mount
  useEffect(() => {
    usePlayerStore.getState().initFromStorage()
  }, [])

  // Persist exact audio playback position when closing or refreshing app
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (audioRef.current) {
        const cur = Math.floor(audioRef.current.currentTime)
        if (cur > 0) {
          try {
            localStorage.setItem("melofy_last_progress", JSON.stringify(cur))
          } catch {}
        }
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload)
    return () => window.removeEventListener("beforeunload", handleBeforeUnload)
  }, [])

  // Android back button / popstate handling for full-screen sheet
  useEffect(() => {
    const handlePopState = () => {
      if (window.location.hash !== "#now-playing") {
        setIsMobileNowPlayingOpen(false)
      }
    }
    window.addEventListener("popstate", handlePopState)
    return () => window.removeEventListener("popstate", handlePopState)
  }, [])

  const openMobileNowPlaying = () => {
    if (window.location.hash !== "#now-playing") {
      window.history.pushState(null, "", "#now-playing")
    }
    setIsMobileNowPlayingOpen(true)
  }

  const closeMobileNowPlaying = () => {
    setIsMobileNowPlayingOpen(false)
    if (window.location.hash === "#now-playing") {
      window.history.back()
    }
  }

  const getFullAudioUrl = useCallback((url?: string) => {
    if (!url) return ""
    if (url.startsWith("http://") || url.startsWith("https://")) return url
    const base = (API_BASE || "https://melofy-ubj8.onrender.com").replace(/\/$/, "")
    return `${base}${url.startsWith("/") ? "" : "/"}${url}`
  }, [])

  // Audio source change & Spotify recommendation skip signal tracking
  useEffect(() => {
    if (!currentSong) return

    // If previous song was skipped early (< 15s) and duration was normal (> 45s), record SKIP
    if (
      previousSongRef.current &&
      previousSongRef.current.id !== currentSong.id &&
      !hasLoggedPlayRef.current &&
      previousSongRef.current.progress > 0 &&
      previousSongRef.current.progress < 15 &&
      (previousSongRef.current.duration || 0) > 45
    ) {
      recordInteraction(currentUserId, previousSongRef.current.id, "SKIP")
    }

    // Reset interaction trackers for the newly loaded song
    if (previousSongRef.current && previousSongRef.current.id !== currentSong.id) {
      restoredSeekAppliedRef.current = true
    }
    if (audioRetryTimerRef.current) {
      clearTimeout(audioRetryTimerRef.current)
    }
    audioRetryRef.current = { id: currentSong.id, count: 0 }
    hasLoggedPlayRef.current = false
    setIsBuffering(true)
    shouldPlayOnReadyRef.current = isPlaying
    if (currentSong.duration) {
      setDuration(currentSong.duration)
    }
    previousSongRef.current = { id: currentSong.id, duration: currentSong.duration, progress: 0 }
  }, [currentSong?.id, currentUserId])

  // Web Audio DSP Soundstage Engine Hook
  useEffect(() => {
    if (audioRef.current) {
      audioDsp.init(audioRef.current)
      audioDsp.applyMode(soundstageMode)
    }
  }, [soundstageMode])

  // Global user gesture unlocker for AudioContext
  useEffect(() => {
    const unlockAudio = () => {
      audioDsp.resume()
    }
    window.addEventListener("pointerdown", unlockAudio, { once: true })
    window.addEventListener("keydown", unlockAudio, { once: true })
    return () => {
      window.removeEventListener("pointerdown", unlockAudio)
      window.removeEventListener("keydown", unlockAudio)
    }
  }, [])

  // Playback control and track change synchronizer
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !currentSong) return

    if (isPlaying) {
      applyCurrentVolume()
      const playPromise = audio.play()
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          if (err.name !== "AbortError") {
            shouldPlayOnReadyRef.current = true
          }
        })
      }
    } else {
      shouldPlayOnReadyRef.current = false
      audio.pause()
    }
  }, [isPlaying, currentSong?.id])

  // Volume sync: reapply whenever volume, mute state, or song changes
  const applyCurrentVolume = useCallback(() => {
    if (audioRef.current) {
      const targetVolume = isMuted ? 0 : volume
      audioRef.current.volume = targetVolume
      audioDsp.setVolume(targetVolume)
    }
  }, [volume, isMuted])

  useEffect(() => {
    applyCurrentVolume()
  }, [applyCurrentVolume, currentSong?.id])

  // Continuous listener to intercept and suppress browser-internal volume resets to 1.0 on track change
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const syncVol = () => {
      const target = isMuted ? 0 : volume
      if (Math.abs(audio.volume - target) > 0.005) {
        audio.volume = target
      }
    }

    syncVol()
    audio.addEventListener("loadedmetadata", syncVol)
    audio.addEventListener("canplay", syncVol)
    audio.addEventListener("play", syncVol)
    audio.addEventListener("playing", syncVol)
    audio.addEventListener("volumechange", syncVol)

    return () => {
      audio.removeEventListener("loadedmetadata", syncVol)
      audio.removeEventListener("canplay", syncVol)
      audio.removeEventListener("play", syncVol)
      audio.removeEventListener("playing", syncVol)
      audio.removeEventListener("volumechange", syncVol)
    }
  }, [volume, isMuted, currentSong?.id])

  // Media Session API & Document Title
  useEffect(() => {
    if (!currentSong) {
      document.title = "Tunely - Music Player"
      return
    }

    document.title = `${currentSong.title} • ${currentSong.artist}`

    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentSong.title,
        artist: currentSong.artist,
        album: currentSong.album || "Tunely",
        artwork: [
          {
            src: getSongCover(currentSong, 512),
            sizes: "512x512",
            type: "image/jpeg",
          },
        ],
      })

      navigator.mediaSession.setActionHandler("play", () => setIsPlaying(true))
      navigator.mediaSession.setActionHandler("pause", () => setIsPlaying(false))
      navigator.mediaSession.setActionHandler("previoustrack", () => playPrevious())
      navigator.mediaSession.setActionHandler("nexttrack", () => playNext())

      try {
        navigator.mediaSession.setActionHandler("seekto", (details) => {
          if (details.seekTime !== undefined && audioRef.current) {
            audioRef.current.currentTime = details.seekTime
            setProgress(details.seekTime)
          }
        })
      } catch {}

      try {
        navigator.mediaSession.setActionHandler("seekbackward", (details) => {
          const skip = details.seekOffset || 10
          if (audioRef.current) {
            const nextTime = Math.max(0, audioRef.current.currentTime - skip)
            audioRef.current.currentTime = nextTime
            setProgress(nextTime)
          }
        })
      } catch {}

      try {
        navigator.mediaSession.setActionHandler("seekforward", (details) => {
          const skip = details.seekOffset || 10
          if (audioRef.current) {
            const nextTime = Math.min(audioRef.current.duration || 0, audioRef.current.currentTime + skip)
            audioRef.current.currentTime = nextTime
            setProgress(nextTime)
          }
        })
      } catch {}
    }
  }, [currentSong, setIsPlaying, playPrevious, playNext, setProgress])

  // Global Keyboard Shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const activeEl = document.activeElement
      const isInput = activeEl?.tagName === "INPUT" || activeEl?.tagName === "TEXTAREA"
      if (isInput) return

      if (e.code === "Space") {
        e.preventDefault()
        togglePlay()
      } else if (e.shiftKey && e.code === "ArrowRight") {
        e.preventDefault()
        playNext()
      } else if (e.shiftKey && e.code === "ArrowLeft") {
        e.preventDefault()
        playPrevious()
      } else if (e.code === "ArrowRight") {
        e.preventDefault()
        if (audioRef.current) {
          const nextTime = Math.min(audioRef.current.duration || 0, audioRef.current.currentTime + 5)
          audioRef.current.currentTime = nextTime
          setProgress(nextTime)
        }
      } else if (e.code === "ArrowLeft") {
        e.preventDefault()
        if (audioRef.current) {
          const nextTime = Math.max(0, audioRef.current.currentTime - 5)
          audioRef.current.currentTime = nextTime
          setProgress(nextTime)
        }
      } else if (e.code === "ArrowUp") {
        e.preventDefault()
        setVolume(Math.min(1, volume + 0.05))
      } else if (e.code === "ArrowDown") {
        e.preventDefault()
        setVolume(Math.max(0, volume - 0.05))
      } else if (e.code === "KeyM") {
        toggleMute()
      } else if (e.code === "KeyS") {
        toggleShuffle()
      } else if (e.code === "KeyR") {
        toggleRepeat()
      } else if (e.code === "Escape") {
        setIsDesktopFullscreenOpen(false)
      } else if (((e.ctrlKey || e.metaKey) && e.key === "k") || e.key === "/") {
        e.preventDefault()
        const searchInput = document.querySelector('input[type="text"]') as HTMLInputElement
        if (searchInput) {
          searchInput.focus()
          searchInput.select()
        } else {
          window.location.href = "/search"
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [togglePlay, playNext, playPrevious, toggleMute, toggleShuffle, toggleRepeat, volume, setVolume, setProgress])

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      const cur = audioRef.current.currentTime
      if (!isDraggingProgressRef.current) {
        setProgress(cur)
      }
      if (previousSongRef.current) {
        previousSongRef.current.progress = cur
      }
      if (audioRef.current.duration && !isNaN(audioRef.current.duration)) {
        setDuration(audioRef.current.duration)
      }

      if ("mediaSession" in navigator && "setPositionState" in navigator.mediaSession && duration > 0) {
        try {
          navigator.mediaSession.setPositionState({
            duration: Math.max(duration, 1),
            playbackRate: 1,
            position: Math.min(cur, duration),
          })
        } catch {}
      }

      // Spotify recommendation signal: listening for >= 30s counts as an engaged PLAY
      if (!hasLoggedPlayRef.current && currentSong) {
        const threshold = Math.min(30, (currentSong.duration || 60) * 0.5)
        if (cur >= threshold) {
          hasLoggedPlayRef.current = true
          recordInteraction(currentUserId, currentSong.id, "PLAY")
        }
      }
    }
  }

  const handleEnded = () => {
    if (repeatMode === "one" && currentSong) {
      recordInteraction(currentUserId, currentSong.id, "REPLAY")
    }
    playNext()
  }

  const formatTime = (time: number) => {
    if (!time || isNaN(time)) return "0:00"
    const min = Math.floor(time / 60)
    const sec = Math.floor(time % 60)
    return `${min}:${sec < 10 ? "0" : ""}${sec}`
  }

  // Spotify-grade smooth scrubbing & dragging for mouse and touch
  const startProgressDrag = (clientX: number, targetBar: HTMLDivElement) => {
    const bounds = targetBar.getBoundingClientRect()
    const calcTime = (x: number) => {
      const percentage = Math.max(0, Math.min(1, (x - bounds.left) / bounds.width))
      return percentage * (duration || 1)
    }

    const initialTime = calcTime(clientX)
    setIsDraggingProgress(true)
    setDragProgress(initialTime)
    dragProgressRef.current = initialTime

    const onPointerMove = (e: MouseEvent | TouchEvent) => {
      const currentX = "touches" in e ? e.touches[0].clientX : e.clientX
      const newTime = calcTime(currentX)
      setDragProgress(newTime)
      dragProgressRef.current = newTime
    }

    const onPointerUp = () => {
      window.removeEventListener("mousemove", onPointerMove)
      window.removeEventListener("mouseup", onPointerUp)
      window.removeEventListener("touchmove", onPointerMove)
      window.removeEventListener("touchend", onPointerUp)
      window.removeEventListener("touchcancel", onPointerUp)

      const finalTime = dragProgressRef.current
      if (audioRef.current) {
        try {
          audioRef.current.currentTime = finalTime
        } catch (err) {
          console.warn("Audio seek error:", err)
        }
      }
      setProgress(finalTime)
      setIsDraggingProgress(false)
    }

    window.addEventListener("mousemove", onPointerMove)
    window.addEventListener("mouseup", onPointerUp)
    window.addEventListener("touchmove", onPointerMove, { passive: false })
    window.addEventListener("touchend", onPointerUp)
    window.addEventListener("touchcancel", onPointerUp)
  }

  // Smooth volume scrubbing for mouse and touch
  const startVolumeDrag = (clientX: number, targetBar: HTMLDivElement) => {
    const bounds = targetBar.getBoundingClientRect()
    const calcVol = (x: number) => {
      return Math.max(0, Math.min(1, (x - bounds.left) / bounds.width))
    }

    const initialVol = calcVol(clientX)
    setVolume(initialVol)
    if (audioRef.current) audioRef.current.volume = isMuted ? 0 : initialVol

    const onPointerMove = (e: MouseEvent | TouchEvent) => {
      const currentX = "touches" in e ? e.touches[0].clientX : e.clientX
      const newVol = calcVol(currentX)
      setVolume(newVol)
      if (audioRef.current) audioRef.current.volume = isMuted ? 0 : newVol
    }

    const onPointerUp = () => {
      window.removeEventListener("mousemove", onPointerMove)
      window.removeEventListener("mouseup", onPointerUp)
      window.removeEventListener("touchmove", onPointerMove)
      window.removeEventListener("touchend", onPointerUp)
    }

    window.addEventListener("mousemove", onPointerMove)
    window.addEventListener("mouseup", onPointerUp)
    window.addEventListener("touchmove", onPointerMove, { passive: false })
    window.addEventListener("touchend", onPointerUp)
  }

  const displayProgress = isDraggingProgress ? dragProgress : progress
  const progressPercent = Math.max(0, Math.min(100, (displayProgress / (duration || 1)) * 100))

  const coverUrl = getSongCover(currentSong, 300)

  return (
    <>
      {/* Persistent HTML5 Audio Element - Never unmounted on viewport changes */}
      {currentSong && (
        <audio
          ref={audioRef}
          src={getFullAudioUrl(currentSong.streamUrl)}
          preload="auto"
          onPlay={() => {
            applyCurrentVolume()
          }}
          onLoadStart={applyCurrentVolume}
          onLoadedData={applyCurrentVolume}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={() => {
            applyCurrentVolume()
            if (!restoredSeekAppliedRef.current) {
              restoredSeekAppliedRef.current = true
              const savedProgress = usePlayerStore.getState().progress
              if (savedProgress > 0 && audioRef.current) {
                try {
                  audioRef.current.currentTime = savedProgress
                } catch (e) {
                  console.warn("Restore seek error:", e)
                }
              }
            }
            handleTimeUpdate()
          }}
          onWaiting={() => setIsBuffering(true)}
          onPlaying={() => {
            applyCurrentVolume()
            setIsBuffering(false)
            if (currentSong) {
              audioRetryRef.current = { id: currentSong.id, count: 0 }
            }
          }}
          onCanPlay={() => {
            applyCurrentVolume()
            setIsBuffering(false)
            if (currentSong) {
              audioRetryRef.current = { id: currentSong.id, count: 0 }
            }
            if (!restoredSeekAppliedRef.current) {
              restoredSeekAppliedRef.current = true
              const savedProgress = usePlayerStore.getState().progress
              if (savedProgress > 0 && audioRef.current) {
                try {
                  audioRef.current.currentTime = savedProgress
                } catch (e) {
                  console.warn("Restore seek error:", e)
                }
              }
            }
            if (isPlaying || shouldPlayOnReadyRef.current) {
              if (audioRef.current && audioRef.current.paused) {
                audioRef.current.play().catch((err) => {
                  if (err.name !== "AbortError") {
                    console.log("Audio autoplay prevented:", err)
                  }
                })
              }
            }
          }}
          onError={(e) => {
            const audio = audioRef.current
            // Ignore normal AbortError when switching songs quickly
            if (audio && audio.error && audio.error.code === MediaError.MEDIA_ERR_ABORTED) {
              return
            }
            console.error("Audio stream error:", e)
            if (!currentSong) return

            if (audioRetryRef.current.id !== currentSong.id) {
              audioRetryRef.current = { id: currentSong.id, count: 0 }
            }

            if (audioRetryRef.current.count < 3) {
              audioRetryRef.current.count += 1
              const count = audioRetryRef.current.count
              setIsBuffering(true)
              const delay = Math.min(3000, 800 + (count - 1) * 800)
              console.log(`Auto-retrying audio playback for "${currentSong.title}" (attempt ${count}/3 in ${delay}ms)...`)

              if (audioRetryTimerRef.current) clearTimeout(audioRetryTimerRef.current)
              audioRetryTimerRef.current = setTimeout(() => {
                if (audioRef.current && currentSong) {
                  const baseAudioUrl = getFullAudioUrl(currentSong.streamUrl)
                  const sep = baseAudioUrl.includes("?") ? "&" : "?"
                  audioRef.current.src = `${baseAudioUrl}${sep}_retry=${count}&_t=${Date.now()}`
                  applyCurrentVolume()
                  shouldPlayOnReadyRef.current = true
                  audioRef.current.play().catch(() => {})
                }
              }, delay)
            } else {
              setIsBuffering(false)
              addToast(`Audio stream connection interrupted. Please try again.`, "error")
            }
          }}
          onEnded={handleEnded}
        />
      )}

      {/* MOBILE MINI-PLAYER (Floating Liquid Glass Capsule above bottom nav) */}
      {currentSong && (
        <div
          onClick={openMobileNowPlaying}
          className="md:hidden fixed bottom-16 left-3 right-3 z-30 h-15 liquid-glass-elevated rounded-2xl flex items-center justify-between px-3.5 cursor-pointer active:scale-[0.99] transition-all overflow-hidden select-none"
          style={{
            boxShadow:
              ambientLighting && isPlaying
                ? `0 14px 36px 0 rgba(0, 0, 0, 0.75), 0 0 25px -3px ${moodTone.glowRgba}`
                : "0 10px 30px rgba(0, 0, 0, 0.55)",
          }}
        >
          {/* Glowing liquid progress line along the bottom edge */}
          <div className="absolute bottom-0 left-0 right-0 h-[2.5px] bg-white/10">
            <div
              className="h-full transition-all"
              style={{
                width: `${(progress / (duration || 1)) * 100}%`,
                background: `linear-gradient(90deg, ${moodTone.primary}, ${moodTone.accent})`,
                boxShadow: isPlaying ? `0 0 8px ${moodTone.glowRgba}` : undefined,
              }}
            />
          </div>

          {/* Left: Thumbnail + Title/Artist */}
          <div className="flex items-center space-x-3 overflow-hidden flex-1 mr-2 min-w-0">
            <img
              src={coverUrl}
              alt="Album Art"
              className="w-10 h-10 rounded object-cover flex-shrink-0 bg-[#181818] shadow"
              onError={(e) => {
                e.currentTarget.src = "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=100&q=80"
              }}
            />
            <div className="flex flex-col overflow-hidden min-w-0">
              <span className="text-xs font-bold text-white truncate">{currentSong.title}</span>
              <span className="text-[11px] text-[#b3b3b3] truncate">{currentSong.artist}</span>
            </div>
          </div>

          {/* Right: Heart + Play/Pause Button */}
          <div className="flex items-center space-x-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => toggleLikeSong(currentSong)}
              className="p-2 text-[#b3b3b3] hover:text-white transition active:scale-90"
              aria-label={isLiked ? "Unlike" : "Like"}
            >
              <Heart
                size={20}
                fill={isLiked ? "#1db954" : "none"}
                color={isLiked ? "#1db954" : "currentColor"}
              />
            </button>

            <button
              onClick={togglePlay}
              className="w-9 h-9 rounded-full bg-white text-black flex items-center justify-center active:scale-90 transition shadow-md"
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isBuffering && isPlaying ? (
                <Loader2 size={16} className="animate-spin text-black" />
              ) : isPlaying ? (
                <Pause size={18} fill="currentColor" />
              ) : (
                <Play size={18} fill="currentColor" className="ml-0.5" />
              )}
            </button>
          </div>
        </div>
      )}

      {/* MOBILE FULL-SCREEN NOW PLAYING SHEET */}
      {isMobileNowPlayingOpen && currentSong && (
        <div
          onTouchStart={handleSheetTouchStart}
          onTouchMove={handleSheetTouchMove}
          onTouchEnd={handleSheetTouchEnd}
          style={{ transform: `translateY(${sheetTranslateY}px)` }}
          className={`md:hidden fixed inset-0 z-50 bg-gradient-to-b ${moodTone.bgFrom} via-[#121212]/95 to-black flex flex-col justify-between p-6 pb-8 text-white select-none animate-in slide-in-from-bottom duration-300 transition-transform`}
        >
          {/* Top Grab Indicator for swipe down gesture */}
          <div className="w-10 h-1 bg-white/30 rounded-full mx-auto -mt-2 mb-2" />

          {/* Sheet Header */}
          <div className="flex items-center justify-between pt-1">
            <button
              onClick={closeMobileNowPlaying}
              className="p-2 -ml-2 text-white/80 hover:text-white rounded-full active:scale-90 transition"
              aria-label="Collapse"
            >
              <ChevronDown size={28} />
            </button>

            <div className="flex flex-col items-center max-w-[200px]">
              <span className="text-[10px] uppercase font-bold tracking-widest text-white/60">
                Playing from {currentSong.album ? "Album" : "Library"}
              </span>
              <span className="text-xs font-bold text-white truncate max-w-full">
                {currentSong.album || "Tunely Music"}
              </span>
            </div>

            <button
              onClick={(e) => {
                e.stopPropagation()
                openContextMenu(window.innerWidth - 200, 80, currentSong)
              }}
              className="p-2 -mr-2 text-white/80 hover:text-white rounded-full active:scale-90 transition"
              aria-label="More options"
            >
              <MoreHorizontal size={24} />
            </button>
          </div>

          {/* Large Album Artwork */}
          <div className="my-auto px-4 py-2 flex items-center justify-center">
            <div className="w-full max-w-[320px] aspect-square rounded-2xl overflow-hidden shadow-2xl shadow-black/90 bg-[#181818] border border-white/10">
              <img
                src={getSongCover(currentSong, 640)}
                alt={currentSong.title}
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.currentTarget.src = "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&q=80"
                }}
              />
            </div>
          </div>

          {/* Track Info & Scrubber */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex flex-col overflow-hidden max-w-[80%]">
                <h2 className="text-2xl font-black text-white truncate">{currentSong.title}</h2>
                <p className="text-sm font-semibold text-[#b3b3b3] truncate mt-0.5">{currentSong.artist}</p>
              </div>
              <button
                onClick={() => toggleLikeSong(currentSong)}
                className="p-2 text-white/80 hover:text-white active:scale-90 transition"
                aria-label={isLiked ? "Unlike" : "Like"}
              >
                <Heart
                  size={26}
                  fill={isLiked ? "#1db954" : "none"}
                  color={isLiked ? "#1db954" : "currentColor"}
                />
              </button>
            </div>

            {/* Scrubber Progress Bar */}
            <div className="space-y-1">
              <div
                onMouseDown={(e) => {
                  e.preventDefault()
                  startProgressDrag(e.clientX, e.currentTarget)
                }}
                onTouchStart={(e) => {
                  if (e.touches.length > 0) {
                    startProgressDrag(e.touches[0].clientX, e.currentTarget)
                  }
                }}
                className="py-3 -my-2.5 bg-transparent cursor-pointer relative flex items-center touch-none select-none group"
              >
                <div className="w-full h-1.5 bg-white/20 rounded-full relative overflow-visible">
                  <div
                    className="h-full bg-[#1db954] rounded-full relative"
                    style={{ width: `${progressPercent}%` }}
                  >
                    <div className="w-3.5 h-3.5 bg-white rounded-full absolute -right-1.5 top-1/2 -translate-y-1/2 shadow-md active:scale-125 transition-transform" />
                  </div>
                </div>
              </div>
              <div className="flex justify-between text-xs font-mono text-[#b3b3b3]">
                <span>{formatTime(displayProgress)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            {/* Playback Controls Row */}
            <div className="flex items-center justify-between px-2 pt-2">
              <button
                onClick={toggleShuffle}
                className={`p-2 transition ${shuffle ? "text-[#1db954]" : "text-white/60 hover:text-white"}`}
                aria-label="Shuffle"
              >
                <Shuffle size={22} />
              </button>

              <button
                onClick={playPrevious}
                className="p-2 text-white active:scale-90 transition"
                aria-label="Previous"
              >
                <SkipBack size={28} fill="currentColor" />
              </button>

              <button
                onClick={togglePlay}
                className="w-16 h-16 rounded-full bg-white text-black flex items-center justify-center active:scale-95 shadow-xl transition"
                aria-label={isPlaying ? "Pause" : "Play"}
              >
                {isBuffering && isPlaying ? (
                  <Loader2 size={28} className="animate-spin text-black" />
                ) : isPlaying ? (
                  <Pause size={30} fill="currentColor" />
                ) : (
                  <Play size={30} fill="currentColor" className="ml-1" />
                )}
              </button>

              <button
                onClick={playNext}
                className="p-2 text-white active:scale-90 transition"
                aria-label="Next"
              >
                <SkipForward size={28} fill="currentColor" />
              </button>

              <button
                onClick={toggleRepeat}
                className={`p-2 transition ${repeatMode !== "off" ? "text-[#1db954]" : "text-white/60 hover:text-white"}`}
                aria-label="Repeat"
              >
                {repeatMode === "one" ? <Repeat1 size={22} /> : <Repeat size={22} />}
              </button>
            </div>

            {/* Sheet Bottom Row: Add to playlist, Lyrics, Queue */}
            <div className="flex items-center justify-between pt-4 px-3 border-t border-white/10 text-white/70">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  openContextMenu(window.innerWidth / 2, window.innerHeight / 2, currentSong)
                }}
                className="flex items-center space-x-1.5 hover:text-white transition text-xs font-semibold"
              >
                <PlusCircle size={18} />
                <span>Add to playlist</span>
              </button>

              <div className="flex items-center space-x-4">
                <button
                  onClick={() => {
                    closeMobileNowPlaying()
                    toggleImmersiveVisualizer()
                  }}
                  className={`p-2 hover:text-white transition ${isImmersiveVisualizerOpen ? "text-fuchsia-400" : ""}`}
                  title="Immersive Mode"
                >
                  <AudioWaveform size={20} />
                </button>

                <button
                  onClick={() => {
                    closeMobileNowPlaying()
                    toggleLyrics()
                  }}
                  className={`p-2 hover:text-white transition ${isLyricsOpen ? "text-[#1db954]" : ""}`}
                  title="Lyrics"
                >
                  <Mic2 size={20} />
                </button>

                <button
                  onClick={() => {
                    closeMobileNowPlaying()
                    toggleQueue()
                  }}
                  className={`p-2 hover:text-white transition ${isQueueOpen ? "text-[#1db954]" : ""}`}
                  title="Queue"
                >
                  <ListMusic size={20} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DESKTOP & TABLET FLOATING LIQUID GLASS DOCK */}
      <footer
        className="hidden md:flex h-[90px] fixed bottom-3 left-4 right-4 md:left-6 md:right-6 rounded-2xl liquid-glass-elevated z-50 items-center justify-between px-5 select-none transition-all duration-300"
        style={{
          boxShadow:
            ambientLighting && isPlaying
              ? `0 20px 50px 0 rgba(0, 0, 0, 0.75), 0 0 35px -5px ${moodTone.glowRgba}`
              : "0 14px 40px 0 rgba(0, 0, 0, 0.65)",
        }}
      >
        {/* Left Column: Track Info & Likes */}
        <div className="flex items-center w-[30%] min-w-[220px] space-x-3.5">
          {currentSong ? (
            <>
              <div className="w-14 h-14 bg-[#282828] rounded-xl overflow-hidden relative group cursor-pointer shadow-lg flex-shrink-0 border border-white/10">
                <img
                  src={coverUrl}
                  alt="Album Art"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    if (currentSong?.title?.toLowerCase().includes("training season")) {
                      e.currentTarget.src = "https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/82/89/15/828915ea-d716-61c4-3de7-ef00c1f800fb/5054197853630.jpg/600x600bb.jpg"
                    } else {
                      e.currentTarget.src = "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&q=80"
                    }
                  }}
                />
              </div>
              <div className="flex flex-col justify-center overflow-hidden max-w-[150px] lg:max-w-xs">
                <span className="text-sm font-semibold text-white hover:underline truncate cursor-pointer">
                  {currentSong.title}
                </span>
                <span className="text-xs text-[#b3b3b3] hover:underline hover:text-white truncate cursor-pointer mt-0.5">
                  {currentSong.artist}
                </span>
              </div>

              {/* Exclusive Melofy AI Energy Badge */}
              {currentSong.energy && (
                <div
                  className="hidden xl:flex items-center space-x-1 px-2 py-0.5 rounded-full liquid-pill text-[10px] text-white/80 flex-shrink-0"
                  title="AI Sound Energy Profile"
                >
                  <Sparkles size={10} className="text-emerald-400" />
                  <span>{Math.round(currentSong.energy * 100)}%</span>
                </div>
              )}

              {/* Integrated Mini Visualizer */}
              <div
                onClick={() => {
                  const next = visualizerMode === "spectrum" ? "pulse" : visualizerMode === "pulse" ? "off" : "spectrum"
                  setVisualizerMode(next)
                }}
                className="hidden lg:block w-14 flex-shrink-0 cursor-pointer opacity-80 hover:opacity-100 transition"
                title={`Live Visualizer: ${visualizerMode.toUpperCase()} (Click to toggle)`}
              >
                <PlayerVisualizer mode={visualizerMode} moodTone={moodTone} height={18} barCount={10} />
              </div>

              <button
                onClick={() => toggleLikeSong(currentSong)}
                className="text-[#b3b3b3] hover:scale-110 active:scale-95 transition-transform ml-1 flex-shrink-0"
                aria-label={isLiked ? "Remove from Liked Songs" : "Save to Liked Songs"}
              >
                <Heart
                  size={18}
                  fill={isLiked ? "#1db954" : "none"}
                  color={isLiked ? "#1db954" : "currentColor"}
                />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  openContextMenu(e.clientX, e.clientY - 200, currentSong)
                }}
                className="text-[#b3b3b3] hover:text-white transition flex-shrink-0"
                title="Add to playlist"
              >
                <PlusCircle size={18} />
              </button>
            </>
          ) : (
            <div className="text-xs text-[#666] flex items-center space-x-2">
              <span>Select a track to start playback</span>
            </div>
          )}
        </div>

        {/* Center Column: Playback Controls & Glowing Liquid Progress Bar */}
        <div className="flex flex-col items-center max-w-[42%] w-full">
          {/* Buttons */}
          <div className="flex items-center space-x-5 mb-1.5">
            <button
              onClick={toggleShuffle}
              className={`transition relative ${
                shuffle ? "text-[#1db954]" : "text-[#b3b3b3] hover:text-white"
              }`}
              title={shuffle ? "Disable shuffle" : "Enable shuffle"}
            >
              <Shuffle size={17} />
              {shuffle && (
                <span className="w-1 h-1 bg-[#1db954] rounded-full absolute -bottom-1.5 left-1/2 -translate-x-1/2" />
              )}
            </button>

            <button
              onClick={playPrevious}
              className="text-[#b3b3b3] hover:text-white transition"
              title="Previous track"
            >
              <SkipBack size={20} fill="currentColor" />
            </button>

            <button
              onClick={togglePlay}
              disabled={!currentSong}
              className="w-9 h-9 rounded-full bg-white text-black flex items-center justify-center hover:scale-106 active:scale-95 transition shadow-lg disabled:opacity-40"
              style={{
                boxShadow: isPlaying ? `0 0 16px ${moodTone.glowRgba}` : undefined,
              }}
              title={isPlaying ? "Pause" : "Play"}
            >
              {isBuffering && isPlaying ? (
                <Loader2 size={16} className="animate-spin text-black" />
              ) : isPlaying ? (
                <Pause size={18} fill="currentColor" />
              ) : (
                <Play size={18} fill="currentColor" className="ml-0.5" />
              )}
            </button>

            <button
              onClick={playNext}
              className="text-[#b3b3b3] hover:text-white transition"
              title="Next track"
            >
              <SkipForward size={20} fill="currentColor" />
            </button>

            <button
              onClick={toggleRepeat}
              className={`transition relative ${
                repeatMode !== "off" ? "text-[#1db954]" : "text-[#b3b3b3] hover:text-white"
              }`}
              title={`Repeat: ${repeatMode}`}
            >
              {repeatMode === "one" ? <Repeat1 size={18} /> : <Repeat size={18} />}
              {repeatMode !== "off" && (
                <span className="w-1 h-1 bg-[#1db954] rounded-full absolute -bottom-1.5 left-1/2 -translate-x-1/2" />
              )}
            </button>
          </div>

          {/* Glowing Liquid Progress Bar & Durations */}
          <div className="flex items-center w-full space-x-2 text-xs font-mono text-[#a7a7a7]">
            <span className="min-w-[34px] text-right">{formatTime(displayProgress)}</span>
            <div
              onMouseDown={(e) => {
                e.preventDefault()
                startProgressDrag(e.clientX, e.currentTarget)
              }}
              onTouchStart={(e) => {
                if (e.touches.length > 0) {
                  startProgressDrag(e.touches[0].clientX, e.currentTarget)
                }
              }}
              onMouseEnter={() => setIsHoveringProgress(true)}
              onMouseLeave={() => setIsHoveringProgress(false)}
              suppressHydrationWarning
              className="py-2.5 -my-2.5 flex items-center flex-grow max-w-[500px] cursor-pointer group/progress touch-none select-none"
            >
              <div className="h-1 group-hover/progress:h-1.5 bg-white/15 rounded-full w-full relative transition-all">
                <div
                  suppressHydrationWarning
                  className="h-full absolute top-0 left-0 rounded-full transition-all"
                  style={{
                    width: `${progressPercent}%`,
                    background:
                      isHoveringProgress || isDraggingProgress
                        ? "#1db954"
                        : `linear-gradient(90deg, ${moodTone.primary}, ${moodTone.accent})`,
                    boxShadow: isPlaying ? `0 0 10px ${moodTone.glowRgba}` : undefined,
                  }}
                />
                {(isHoveringProgress || isDraggingProgress) && (
                  <div
                    suppressHydrationWarning
                    className="absolute w-3 h-3 bg-white rounded-full -top-1 shadow-md transform -translate-x-1/2"
                    style={{ left: `${progressPercent}%` }}
                  />
                )}
              </div>
            </div>
            <span className="min-w-[34px]">{formatTime(duration)}</span>
          </div>
        </div>

        {/* Right Column: Auxiliary Controls, Soundstage & Ambient Light */}
        <div className="flex items-center w-[30%] justify-end space-x-2.5 text-[#b3b3b3]">
          {/* Ambient Lighting Toggle Button */}
          <button
            onClick={toggleAmbientLighting}
            className={`p-1.5 rounded-lg transition ${
              ambientLighting
                ? "text-amber-400 bg-amber-400/10 shadow-[0_0_12px_rgba(251,191,36,0.35)]"
                : "text-white/40 hover:text-white/70"
            }`}
            title={ambientLighting ? "Ambient Aura: Active (Click to toggle)" : "Ambient Aura: Off"}
          >
            <Sun size={17} />
          </button>

          {/* Soundstage DSP Audio Enhancer Button with Popover */}
          <div className="relative">
            <button
              onClick={() => setShowSoundstageMenu(!showSoundstageMenu)}
              className={`p-1.5 rounded-lg transition flex items-center space-x-1 text-xs font-semibold ${
                soundstageMode !== "pure"
                  ? "text-cyan-400 bg-cyan-400/10 shadow-[0_0_12px_rgba(6,182,212,0.35)]"
                  : "text-[#b3b3b3] hover:text-white"
              }`}
              title="Acoustic Soundstage Profiles"
            >
              <Sliders size={17} />
            </button>

            {/* Liquid Glass Soundstage Popover Menu */}
            {showSoundstageMenu && (
              <div className="absolute bottom-12 right-0 w-64 p-2.5 rounded-2xl liquid-glass-elevated shadow-2xl z-50 text-white space-y-1 animate-in fade-in slide-in-from-bottom-2 duration-150">
                <div className="flex items-center justify-between px-2 py-1 border-b border-white/10 mb-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
                    <Sparkles size={12} className="text-emerald-400" /> Soundstage DSP
                  </span>
                  <span className="text-[10px] text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded font-mono">
                    EXCLUSIVE
                  </span>
                </div>
                {SOUNDSTAGE_PROFILES.map((profile) => (
                  <button
                    key={profile.id}
                    onClick={() => {
                      setSoundstageMode(profile.id)
                      audioDsp.resume()
                      audioDsp.applyMode(profile.id)
                      setShowSoundstageMenu(false)
                      addToast(`Soundstage: ${profile.name} Active 🎧`, "info")
                    }}
                    className={`w-full text-left px-2.5 py-2 rounded-xl text-xs transition flex items-center justify-between cursor-pointer ${
                      soundstageMode === profile.id
                        ? "bg-white/15 text-white font-bold border border-white/20"
                        : "hover:bg-white/5 text-neutral-300"
                    }`}
                  >
                    <div>
                      <div className="font-semibold">{profile.name}</div>
                      <div className="text-[10px] text-neutral-400 font-normal">{profile.description}</div>
                    </div>
                    {soundstageMode === profile.id && (
                      <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#10b981]" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={toggleLyrics}
            className={`hover:text-white transition p-1.5 rounded-lg ${isLyricsOpen ? "text-[#1db954]" : ""}`}
            title="Lyrics"
          >
            <Mic2 size={17} />
          </button>

          <button
            onClick={toggleQueue}
            className={`hover:text-white transition p-1.5 rounded-lg ${isQueueOpen ? "text-[#1db954]" : ""}`}
            title="Queue"
          >
            <ListMusic size={17} />
          </button>

          <button
            onClick={toggleRightSidebar}
            className={`hover:text-white transition p-1.5 rounded-lg ${isRightSidebarOpen ? "text-[#1db954]" : ""}`}
            title="Now playing view"
          >
            <PanelRight size={17} />
          </button>

          {/* Immersive Visualizer Toggle */}
          <button
            onClick={toggleImmersiveVisualizer}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
              isImmersiveVisualizerOpen
                ? "bg-gradient-to-r from-fuchsia-600 to-indigo-600 text-white shadow-[0_0_16px_rgba(192,38,211,0.6)]"
                : "bg-fuchsia-500/15 hover:bg-fuchsia-500/25 text-fuchsia-300 hover:text-white border border-fuchsia-500/40 shadow-[0_0_12px_rgba(192,38,211,0.25)] hover:shadow-[0_0_18px_rgba(192,38,211,0.5)]"
            }`}
            title="Ambient Light Show & Motion Lyrics"
          >
            <Sparkles size={13} className="text-fuchsia-400 animate-pulse" />
            <span className="hidden xl:inline text-[11px] font-bold">Light Show</span>
            <AudioWaveform size={15} />
          </button>

          {/* Volume Slider */}
          <div className="flex items-center group w-24 lg:w-28 ml-0.5">
            <button onClick={toggleMute} className="hover:text-white transition mr-1.5">
              {isMuted || volume === 0 ? (
                <VolumeX size={17} />
              ) : volume < 0.5 ? (
                <Volume1 size={17} />
              ) : (
                <Volume2 size={17} />
              )}
            </button>
            <div
              onMouseDown={(e) => {
                e.preventDefault()
                startVolumeDrag(e.clientX, e.currentTarget)
              }}
              onTouchStart={(e) => {
                if (e.touches.length > 0) {
                  startVolumeDrag(e.touches[0].clientX, e.currentTarget)
                }
              }}
              onMouseEnter={() => setIsHoveringVolume(true)}
              onMouseLeave={() => setIsHoveringVolume(false)}
              suppressHydrationWarning
              className="py-2.5 -my-2.5 flex items-center flex-grow cursor-pointer group/volume touch-none select-none"
            >
              <div className="h-1 group-hover/volume:h-1.5 bg-white/20 rounded-full w-full relative transition-all">
                <div
                  suppressHydrationWarning
                  className={`h-full absolute top-0 left-0 rounded-full transition-colors ${
                    isHoveringVolume ? "bg-[#1db954]" : "bg-white"
                  }`}
                  style={{ width: `${(isMuted ? 0 : volume) * 100}%` }}
                />
                {isHoveringVolume && (
                  <div
                    suppressHydrationWarning
                    className="absolute w-3 h-3 bg-white rounded-full -top-1 shadow-md transform -translate-x-1/2"
                    style={{ left: `${(isMuted ? 0 : volume) * 100}%` }}
                  />
                )}
              </div>
            </div>
          </div>

          <button
            onClick={() => {
              setIsDesktopFullscreenOpen(!isDesktopFullscreenOpen)
            }}
            className={`hover:text-white transition p-1.5 rounded-lg ml-0.5 ${isDesktopFullscreenOpen ? "text-[#1db954]" : ""}`}
            title="Now playing full screen"
          >
            {isDesktopFullscreenOpen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
          </button>
        </div>
      </footer>

      {/* DESKTOP IMMERSIVE FULL-SCREEN VIEW (Living Ambient Liquid Canvas) */}
      {isDesktopFullscreenOpen && currentSong && (
        <div
          className="hidden md:flex fixed inset-0 z-[140] flex-col justify-between p-12 text-white select-none animate-in fade-in duration-300 overflow-hidden"
          style={{
            background: `linear-gradient(180deg, #121212 0%, #080808 100%)`,
          }}
        >
          {/* Living Ambient Mesh Background */}
          {ambientLighting && (
            <div
              className="absolute inset-0 pointer-events-none opacity-40 transition-opacity duration-1000"
              style={{
                backgroundImage: moodTone.bgMesh,
              }}
            />
          )}

          {/* Top Bar */}
          <div className="relative z-10 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <span className="text-xs uppercase tracking-widest text-[#b3b3b3] font-bold">
                Playing from {currentSong.album || "Library"}
              </span>
              {currentSong.energy && (
                <div className="px-2.5 py-1 rounded-full liquid-pill text-xs flex items-center gap-1.5 text-white/90">
                  <Sparkles size={12} className="text-emerald-400" />
                  <span>{Math.round(currentSong.energy * 100)}% Energy</span>
                </div>
              )}
            </div>

            <div className="flex items-center space-x-3">
              {/* Immersive Visualizer Toggle */}
              <button
                onClick={() => {
                  setIsDesktopFullscreenOpen(false)
                  toggleImmersiveVisualizer()
                }}
                className={`p-2.5 rounded-full transition cursor-pointer ${
                  isImmersiveVisualizerOpen
                    ? "text-fuchsia-400 bg-fuchsia-400/10 shadow-[0_0_12px_rgba(192,38,211,0.35)]"
                    : "text-[#b3b3b3] hover:text-white bg-white/5 hover:bg-white/10"
                }`}
                title="Immersive Mode: Full-Screen Visualizer + Motion Lyrics"
              >
                <AudioWaveform size={20} />
              </button>

              {/* Lyrics Toggle Button */}
              <button
                onClick={toggleLyrics}
                className="p-2.5 text-[#b3b3b3] hover:text-white rounded-full bg-white/5 hover:bg-white/10 transition cursor-pointer"
                title="Lyrics"
              >
                <Mic2 size={20} />
              </button>

              {/* Ambient Aura Toggle */}
              <button
                onClick={toggleAmbientLighting}
                className={`p-2.5 rounded-full transition ${
                  ambientLighting
                    ? "text-amber-400 bg-amber-400/10 shadow-[0_0_12px_rgba(251,191,36,0.35)]"
                    : "text-white/40 hover:text-white/70 bg-white/5"
                }`}
                title="Toggle Ambient Lighting"
              >
                <Sun size={20} />
              </button>

              <button
                onClick={() => setIsDesktopFullscreenOpen(false)}
                className="p-2.5 text-[#b3b3b3] hover:text-white rounded-full bg-white/5 hover:bg-white/10 transition cursor-pointer"
                title="Exit full screen (Esc)"
              >
                <Minimize2 size={22} />
              </button>
            </div>
          </div>

          {/* Center Stage: Artwork & Track Details */}
          <div className="relative z-10 flex items-center justify-center space-x-12 my-auto max-w-5xl mx-auto w-full">
            <div
              className="w-80 h-80 lg:w-96 lg:h-96 rounded-3xl overflow-hidden shadow-2xl bg-[#181818] flex-shrink-0 border border-white/15 transition-all duration-700"
              style={{
                boxShadow:
                  ambientLighting && isPlaying
                    ? `0 30px 80px -15px ${moodTone.glowRgba}, 0 10px 40px rgba(0,0,0,0.8)`
                    : "0 25px 60px rgba(0,0,0,0.8)",
              }}
            >
              <img
                src={getSongCover(currentSong, 640)}
                alt={currentSong.title}
                className="w-full h-full object-cover"
                onError={(e) => {
                  if (currentSong?.title?.toLowerCase().includes("training season")) {
                    e.currentTarget.src = "https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/82/89/15/828915ea-d716-61c4-3de7-ef00c1f800fb/5054197853630.jpg/600x600bb.jpg"
                  } else {
                    e.currentTarget.src = "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=640&q=80"
                  }
                }}
              />
            </div>

            <div className="flex flex-col space-y-4 max-w-md">
              <span className="text-4xl lg:text-5xl font-black text-white leading-tight">
                {currentSong.title}
              </span>
              <span className="text-xl text-[#b3b3b3] font-semibold">
                {currentSong.artist}
              </span>
              {currentSong.album && (
                <span className="text-sm text-[#777]">
                  {currentSong.album}
                </span>
              )}

              {/* Large 60FPS Audio Visualizer on Center Stage */}
              <div className="pt-2 w-72 opacity-90">
                <PlayerVisualizer mode={visualizerMode} moodTone={moodTone} height={28} barCount={20} />
              </div>
            </div>
          </div>

          {/* Bottom Stage: Scrubber, Controls, Soundstage Presets */}
          <div className="relative z-10 max-w-2xl mx-auto w-full space-y-4">
            {/* Scrubber Progress Bar */}
            <div className="space-y-1">
              <div
                onMouseDown={(e) => {
                  e.preventDefault()
                  startProgressDrag(e.clientX, e.currentTarget)
                }}
                className="py-3 -my-2.5 bg-transparent cursor-pointer relative flex items-center touch-none select-none group"
              >
                <div className="w-full h-1.5 bg-white/15 rounded-full relative overflow-visible">
                  <div
                    className="h-full rounded-full relative transition-all"
                    style={{
                      width: `${progressPercent}%`,
                      background: `linear-gradient(90deg, ${moodTone.primary}, ${moodTone.accent})`,
                      boxShadow: isPlaying ? `0 0 12px ${moodTone.glowRgba}` : undefined,
                    }}
                  >
                    <div className="w-3.5 h-3.5 bg-white rounded-full absolute -right-1.5 top-1/2 -translate-y-1/2 shadow-md" />
                  </div>
                </div>
              </div>
              <div className="flex justify-between text-xs font-mono text-[#b3b3b3]">
                <span>{formatTime(displayProgress)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            {/* Playback Controls Row */}
            <div className="flex items-center justify-center space-x-8">
              <button
                onClick={toggleShuffle}
                className={`p-2 transition ${shuffle ? "text-[#1db954]" : "text-white/60 hover:text-white"}`}
                title="Shuffle"
              >
                <Shuffle size={24} />
              </button>

              <button
                onClick={playPrevious}
                className="p-2 text-white/80 hover:text-white active:scale-90 transition"
                title="Previous"
              >
                <SkipBack size={32} fill="currentColor" />
              </button>

              <button
                onClick={togglePlay}
                className="w-16 h-16 rounded-full bg-white text-black flex items-center justify-center hover:scale-106 active:scale-95 shadow-xl transition"
                style={{
                  boxShadow: isPlaying ? `0 0 24px ${moodTone.glowRgba}` : undefined,
                }}
                title={isPlaying ? "Pause" : "Play"}
              >
                {isBuffering && isPlaying ? (
                  <Loader2 size={28} className="animate-spin text-black" />
                ) : isPlaying ? (
                  <Pause size={28} fill="currentColor" />
                ) : (
                  <Play size={28} fill="currentColor" className="ml-1" />
                )}
              </button>

              <button
                onClick={playNext}
                className="p-2 text-white/80 hover:text-white active:scale-90 transition"
                title="Next"
              >
                <SkipForward size={32} fill="currentColor" />
              </button>

              <button
                onClick={toggleRepeat}
                className={`p-2 transition ${repeatMode !== "off" ? "text-[#1db954]" : "text-white/60 hover:text-white"}`}
                title={`Repeat: ${repeatMode}`}
              >
                {repeatMode === "one" ? <Repeat1 size={24} /> : <Repeat size={24} />}
              </button>
            </div>

            {/* Soundstage Mode Pills Selector */}
            <div className="flex items-center justify-center gap-2 pt-1">
              {SOUNDSTAGE_PROFILES.map((profile) => (
                <button
                  key={profile.id}
                  onClick={() => {
                    setSoundstageMode(profile.id)
                    audioDsp.resume()
                    audioDsp.applyMode(profile.id)
                    addToast(`Soundstage: ${profile.name} Active 🎧`, "info")
                  }}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition cursor-pointer ${
                    soundstageMode === profile.id
                      ? "liquid-glass-elevated text-white border-white/30 shadow-md font-bold"
                      : "text-white/50 hover:text-white/80 bg-white/5"
                  }`}
                >
                  {profile.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

