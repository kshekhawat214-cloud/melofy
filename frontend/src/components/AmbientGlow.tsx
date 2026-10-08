"use client"
import React, { useMemo } from "react"
import { usePlayerStore } from "@/store/playerStore"
import { getSongMoodColor } from "@/lib/colors"

export default function AmbientGlow() {
  const currentSong = usePlayerStore((s) => s.currentSong)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const ambientLighting = usePlayerStore((s) => s.ambientLighting)

  const mood = useMemo(() => {
    return getSongMoodColor(currentSong?.title || currentSong?.genre || "pop")
  }, [currentSong?.id, currentSong?.title, currentSong?.genre])

  if (!ambientLighting) {
    return null
  }

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none overflow-hidden z-0 select-none transition-opacity duration-1000 ease-out"
      style={{ opacity: isPlaying ? 0.85 : 0.4 }}
    >
      {/* Dynamic Background Mesh Gradient */}
      <div
        className="absolute inset-0 transition-all duration-1000 ease-out"
        style={{
          backgroundImage: mood.bgMesh,
          opacity: isPlaying ? 0.9 : 0.4,
        }}
      />

      {/* Primary Ambient Floating Aura Orb (Top-Right) */}
      <div
        className="absolute -top-[15%] -right-[10%] w-[550px] h-[550px] md:w-[700px] md:h-[700px] rounded-full blur-[110px] md:blur-[140px] opacity-45 mix-blend-screen transition-all duration-1000 animate-aura-1"
        style={{
          backgroundColor: mood.primary,
        }}
      />

      {/* Secondary Ambient Floating Aura Orb (Bottom-Left) */}
      <div
        className="absolute -bottom-[20%] -left-[10%] w-[500px] h-[500px] md:w-[650px] md:h-[650px] rounded-full blur-[120px] md:blur-[150px] opacity-40 mix-blend-screen transition-all duration-1000 animate-aura-2"
        style={{
          backgroundColor: mood.secondary,
        }}
      />

      {/* Bottom Player Dock Aura (Directly beneath the bottom player) */}
      <div
        className="hidden md:block absolute bottom-0 left-1/2 -translate-x-1/2 w-[85%] h-32 rounded-full blur-[70px] opacity-50 transition-all duration-700"
        style={{
          backgroundColor: mood.primary,
          transform: `translateX(-50%) scale(${isPlaying ? 1.05 : 0.95})`,
        }}
      />
    </div>
  )
}
