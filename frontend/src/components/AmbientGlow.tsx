"use client"
import React, { useMemo, useEffect, useRef, useState } from "react"
import { usePlayerStore } from "@/store/playerStore"
import { getSongMoodColor } from "@/lib/colors"
import { audioDsp } from "@/lib/audioDsp"

export default function AmbientGlow() {
  const currentSong = usePlayerStore((s) => s.currentSong)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const ambientLighting = usePlayerStore((s) => s.ambientLighting)

  const mood = useMemo(() => {
    return getSongMoodColor(currentSong?.title || currentSong?.genre || "pop")
  }, [currentSong?.id, currentSong?.title, currentSong?.genre])

  // Real-time audio reactivity state for soft, fluid breathing
  const [energyScale, setEnergyScale] = useState(1.0)
  const [glowOpacity, setGlowOpacity] = useState(0.35)
  const animationFrameRef = useRef<number | null>(null)

  // Smoothed levels buffer
  const smoothBassRef = useRef(0.1)
  const smoothLoudnessRef = useRef(0.2)

  useEffect(() => {
    if (!ambientLighting) return

    let lastTime = performance.now()

    const updateAura = (now: number) => {
      const dt = Math.min(0.1, (now - lastTime) / 1000)
      lastTime = now

      if (isPlaying) {
        // Read real-time audio dynamics from Web Audio DSP analyser
        const { bassLevel, overallLevel } = audioDsp.getReactivityData()

        if (bassLevel > 0.02 || overallLevel > 0.02) {
          // Hardware audio analyser has active signal: smooth lerp
          smoothBassRef.current += (bassLevel - smoothBassRef.current) * 0.14
          smoothLoudnessRef.current += (overallLevel - smoothLoudnessRef.current) * 0.12
        } else {
          // Procedural rhythmic fallback synchronized with track energy
          const energy = currentSong?.energy ?? 0.65
          const bpmSpeed = 2.4 * (0.8 + energy * 0.4)
          const rhythmicWave = (Math.sin(now * 0.003 * bpmSpeed) + 1) * 0.5
          smoothBassRef.current += (rhythmicWave * 0.35 - smoothBassRef.current) * 0.08
          smoothLoudnessRef.current += (rhythmicWave * 0.25 - smoothLoudnessRef.current) * 0.08
        }

        // Soft scale: gentle expansion between 1.0 and 1.15 on bass hits
        const targetScale = 1.0 + Math.min(0.16, smoothBassRef.current * 0.22)
        // Soft opacity: gentle breathing between 0.30 and 0.46 (never harsh or blinding)
        const targetOpacity = 0.32 + Math.min(0.14, smoothLoudnessRef.current * 0.22)

        setEnergyScale(targetScale)
        setGlowOpacity(targetOpacity)
      } else {
        // Soft resting state when paused
        smoothBassRef.current += (0 - smoothBassRef.current) * 0.05
        setEnergyScale(0.98)
        setGlowOpacity(0.18)
      }

      animationFrameRef.current = requestAnimationFrame(updateAura)
    }

    animationFrameRef.current = requestAnimationFrame(updateAura)

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [isPlaying, ambientLighting, currentSong?.energy])

  if (!ambientLighting) {
    return null
  }

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none overflow-hidden z-0 select-none transition-opacity duration-1000 ease-out"
      style={{ opacity: glowOpacity }}
    >
      {/* Soft Ethereal Radial Background Mesh */}
      <div
        className="absolute inset-0 transition-all duration-1000 ease-out"
        style={{
          backgroundImage: mood.bgMesh,
          opacity: isPlaying ? 0.65 : 0.3,
          transform: `scale(${energyScale})`,
        }}
      />

      {/* Primary Soft Ambient Floating Aura Orb (Top-Right) */}
      <div
        className="absolute -top-[18%] -right-[12%] w-[600px] h-[600px] md:w-[800px] md:h-[800px] rounded-full blur-[160px] md:blur-[220px] opacity-40 mix-blend-screen transition-transform duration-300 ease-out animate-aura-1"
        style={{
          backgroundColor: mood.primary,
          transform: `scale(${energyScale})`,
        }}
      />

      {/* Secondary Soft Ambient Floating Aura Orb (Bottom-Left) */}
      <div
        className="absolute -bottom-[22%] -left-[12%] w-[550px] h-[550px] md:w-[750px] md:h-[750px] rounded-full blur-[170px] md:blur-[240px] opacity-35 mix-blend-screen transition-transform duration-300 ease-out animate-aura-2"
        style={{
          backgroundColor: mood.secondary,
          transform: `scale(${energyScale * 0.96})`,
        }}
      />

      {/* Bottom Player Soft Diffuse Halo */}
      <div
        className="hidden md:block absolute bottom-0 left-1/2 -translate-x-1/2 w-[80%] h-36 rounded-full blur-[110px] opacity-35 transition-all duration-300 ease-out"
        style={{
          backgroundColor: mood.primary,
          transform: `translateX(-50%) scale(${energyScale})`,
        }}
      />

      {/* Dark Vignette Mask to keep focus on UI with zero edge cutoffs */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(circle at 50% 50%, transparent 60%, rgba(5, 5, 8, 0.45) 100%)",
        }}
      />
    </div>
  )
}
