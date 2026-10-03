"use client"
import { useEffect, useRef, useState, useCallback } from "react"
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
} from "lucide-react"
import { usePlayerStore } from "@/store/playerStore"
import { useUIStore } from "@/store/uiStore"
import { API_BASE, getSongCover } from "@/lib/api"

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
  } = usePlayerStore()

  const { likedSongIds, toggleLikeSong, openContextMenu } = useUIStore()

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [isHoveringProgress, setIsHoveringProgress] = useState(false)
  const [isHoveringVolume, setIsHoveringVolume] = useState(false)
  const [isBuffering, setIsBuffering] = useState(false)

  const isLiked = currentSong ? likedSongIds.has(currentSong.id) : false

  // Hydrate user settings from localStorage on client mount
  useEffect(() => {
    usePlayerStore.getState().initFromStorage()
  }, [])

  const getFullAudioUrl = useCallback((url?: string) => {
    if (!url) return ""
    if (url.startsWith("http://") || url.startsWith("https://")) return url
    const base = (API_BASE || "https://melofy-ubj8.onrender.com").replace(/\/$/, "")
    return `${base}${url.startsWith("/") ? "" : "/"}${url}`
  }, [])

  // Audio source change
  useEffect(() => {
    if (audioRef.current && currentSong) {
      setIsBuffering(true)
      if (currentSong.duration) {
        setDuration(currentSong.duration)
      }
      audioRef.current.load()
      if (isPlaying) {
        audioRef.current.play().catch((err) => console.log("Audio play prevented:", err))
      }
    }
  }, [currentSong?.id])

  // Playback control
  useEffect(() => {
    if (audioRef.current && currentSong) {
      if (isPlaying) {
        audioRef.current.play().catch((err) => console.log("Audio play prevented:", err))
      } else {
        audioRef.current.pause()
      }
    }
  }, [isPlaying])

  // Volume sync
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume
    }
  }, [volume, isMuted])

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
    }
  }, [currentSong, setIsPlaying, playPrevious, playNext])

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
      } else if (e.code === "KeyM") {
        toggleMute()
      } else if (e.code === "KeyS") {
        toggleShuffle()
      } else if (e.code === "KeyR") {
        toggleRepeat()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [togglePlay, playNext, playPrevious, toggleMute, toggleShuffle, toggleRepeat])

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setProgress(audioRef.current.currentTime)
      if (audioRef.current.duration && !isNaN(audioRef.current.duration)) {
        setDuration(audioRef.current.duration)
      }
    }
  }

  const formatTime = (time: number) => {
    if (!time || isNaN(time)) return "0:00"
    const min = Math.floor(time / 60)
    const sec = Math.floor(time % 60)
    return `${min}:${sec < 10 ? "0" : ""}${sec}`
  }

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current) return
    const bounds = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - bounds.left
    const percentage = Math.max(0, Math.min(1, x / bounds.width))
    const target = percentage * (duration || 1)
    audioRef.current.currentTime = target
    setProgress(target)
  }

  const handleVolumeSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const bounds = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - bounds.left
    const percentage = Math.max(0, Math.min(1, x / bounds.width))
    setVolume(percentage)
  }

  const startDragging = (e: React.MouseEvent, type: "volume" | "progress") => {
    const target = e.currentTarget as HTMLDivElement
    const bounds = target.getBoundingClientRect()

    const handleMove = (moveEvent: MouseEvent) => {
      const x = moveEvent.clientX - bounds.left
      const percentage = Math.max(0, Math.min(1, x / bounds.width))

      if (type === "volume") {
        setVolume(percentage)
      } else if (type === "progress" && audioRef.current) {
        const time = percentage * (duration || 1)
        audioRef.current.currentTime = time
        setProgress(time)
      }
    }

    const stopDragging = () => {
      window.removeEventListener("mousemove", handleMove)
      window.removeEventListener("mouseup", stopDragging)
    }

    window.addEventListener("mousemove", handleMove)
    window.addEventListener("mouseup", stopDragging)
  }

  const coverUrl = getSongCover(currentSong, 300)

  return (
    <footer className="h-[88px] bg-black border-t border-[#1a1a1a] fixed bottom-0 left-0 w-full z-50 flex items-center justify-between px-4 select-none">
      {/* Audio Element */}
      {currentSong && (
        <audio
          key={currentSong.id}
          ref={audioRef}
          src={getFullAudioUrl(currentSong.streamUrl)}
          preload="auto"
          onLoadStart={() => setIsBuffering(true)}
          onLoadedData={() => setIsBuffering(false)}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleTimeUpdate}
          onWaiting={() => setIsBuffering(true)}
          onPlaying={() => setIsBuffering(false)}
          onCanPlay={() => {
            setIsBuffering(false)
            if (isPlaying && audioRef.current && audioRef.current.paused) {
              audioRef.current.play().catch((err) => console.log("Audio autoplay prevented:", err))
            }
          }}
          onError={(e) => {
            console.error("Audio stream error:", e)
            setIsBuffering(false)
          }}
          onEnded={playNext}
        />
      )}

      {/* Left Column: Track Info & Likes */}
      <div className="flex items-center w-[30%] min-w-[200px] space-x-3.5">
        {currentSong ? (
          <>
            <div className="w-14 h-14 bg-[#282828] rounded-md overflow-hidden relative group cursor-pointer shadow-md flex-shrink-0">
              <img src={coverUrl} alt="Album Art" className="w-full h-full object-cover" />
            </div>
            <div className="flex flex-col justify-center overflow-hidden max-w-[160px] md:max-w-xs">
              <span className="text-sm font-semibold text-white hover:underline truncate cursor-pointer">
                {currentSong.title}
              </span>
              <span className="text-xs text-[#b3b3b3] hover:underline hover:text-white truncate cursor-pointer mt-0.5">
                {currentSong.artist}
              </span>
            </div>
            <button
              onClick={() => toggleLikeSong(currentSong)}
              className="text-[#b3b3b3] hover:scale-110 active:scale-95 transition-transform ml-1"
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
              className="text-[#b3b3b3] hover:text-white transition"
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

      {/* Center Column: Playback Controls & Progress Bar */}
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
            className="w-8 h-8 rounded-full bg-white text-black flex items-center justify-center hover:scale-106 active:scale-95 transition shadow-lg disabled:opacity-40"
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

        {/* Progress Bar & Durations */}
        <div className="flex items-center w-full space-x-2 text-xs font-mono text-[#a7a7a7]">
          <span className="min-w-[34px] text-right">{formatTime(progress)}</span>
          <div
            onMouseDown={(e) => startDragging(e, "progress")}
            onClick={handleSeek}
            onMouseEnter={() => setIsHoveringProgress(true)}
            onMouseLeave={() => setIsHoveringProgress(false)}
            suppressHydrationWarning
            className="h-1 hover:h-1.5 bg-[#4d4d4d] rounded-full flex-grow relative cursor-pointer max-w-[500px] transition-all"
          >
            <div
              suppressHydrationWarning
              className={`h-full absolute top-0 left-0 rounded-full transition-colors ${
                isHoveringProgress ? "bg-[#1db954]" : "bg-white"
              }`}
              style={{ width: `${(progress / (duration || 1)) * 100}%` }}
            />
            {isHoveringProgress && (
              <div
                suppressHydrationWarning
                className="absolute w-3 h-3 bg-white rounded-full -top-0.5 shadow-md transform -translate-x-1/2"
                style={{ left: `${(progress / (duration || 1)) * 100}%` }}
              />
            )}
          </div>
          <span className="min-w-[34px]">{formatTime(duration)}</span>
        </div>
      </div>

      {/* Right Column: Auxiliary Controls */}
      <div className="flex items-center w-[30%] justify-end space-x-3 text-[#b3b3b3]">
        <button
          onClick={toggleLyrics}
          className={`hover:text-white transition p-1 ${isLyricsOpen ? "text-[#1db954]" : ""}`}
          title="Lyrics"
        >
          <Mic2 size={18} />
        </button>

        <button
          onClick={toggleQueue}
          className={`hover:text-white transition p-1 ${isQueueOpen ? "text-[#1db954]" : ""}`}
          title="Queue"
        >
          <ListMusic size={18} />
        </button>

        <button
          onClick={toggleRightSidebar}
          className={`hover:text-white transition p-1 ${isRightSidebarOpen ? "text-[#1db954]" : ""}`}
          title="Now playing view"
        >
          <PanelRight size={18} />
        </button>

        {/* Volume Slider */}
        <div className="flex items-center group w-28 ml-1">
          <button onClick={toggleMute} className="hover:text-white transition mr-2">
            {isMuted || volume === 0 ? (
              <VolumeX size={18} />
            ) : volume < 0.5 ? (
              <Volume1 size={18} />
            ) : (
              <Volume2 size={18} />
            )}
          </button>
          <div
            onMouseDown={(e) => startDragging(e, "volume")}
            onClick={handleVolumeSeek}
            onMouseEnter={() => setIsHoveringVolume(true)}
            onMouseLeave={() => setIsHoveringVolume(false)}
            suppressHydrationWarning
            className="h-1 hover:h-1.5 bg-[#4d4d4d] rounded-full flex-grow cursor-pointer relative transition-all"
          >
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
                className="absolute w-3 h-3 bg-white rounded-full -top-0.5 shadow-md transform -translate-x-1/2"
                style={{ left: `${(isMuted ? 0 : volume) * 100}%` }}
              />
            )}
          </div>
        </div>

        <button
          onClick={() => {
            if (!document.fullscreenElement) {
              document.documentElement.requestFullscreen()
            } else {
              document.exitFullscreen()
            }
          }}
          className="hover:text-white transition p-1 ml-1"
          title="Full screen"
        >
          <Maximize2 size={17} />
        </button>
      </div>
    </footer>
  )
}
