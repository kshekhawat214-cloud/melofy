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

  // Real-time audio reactivity state for soothing, fluid rhythmic breathing
  const [energyScale, setEnergyScale] = useState(1.0)
  const [harmonicScale, setHarmonicScale] = useState(1.0)
  const [glowOpacity, setGlowOpacity] = useState(0.55)
  const animationFrameRef = useRef<number | null>(null)

  // Smoothed levels buffers for organic, liquid damping (no harsh flashes)
  const smoothBassRef = useRef(0.2)
  const smoothMidRef = useRef(0.15)
  const smoothLoudnessRef = useRef(0.3)

  useEffect(() => {
    if (!ambientLighting) return

    let lastTime = performance.now()

    const updateAura = (now: number) => {
      const dt = Math.min(0.1, (now - lastTime) / 1000)
      lastTime = now

      if (isPlaying) {
        // Read real-time audio dynamics from Web Audio DSP analyser
        const { bassLevel, midLevel, overallLevel } = audioDsp.getReactivityData()

        // Track energy & tempo metadata (BPM)
        const energy = currentSong?.energy ?? 0.72
        const tempo = currentSong?.tempo && currentSong.tempo > 60 && currentSong.tempo < 220 
          ? currentSong.tempo 
          : 120
        const beatDurationMs = (60 / tempo) * 1000

        // Continuous rhythmic beat synthesis for guaranteed soothing musical sync
        const beatPhase = (now % beatDurationMs) / beatDurationMs
        // Organic analog heartbeat pulse: sharp punch, gentle exponential decay
        const beatPulse = Math.pow(Math.sin(beatPhase * Math.PI), 2.2) * (0.35 + energy * 0.45)
        // Harmonic counter-beat for secondary orb
        const counterPhase = ((now + beatDurationMs * 0.5) % (beatDurationMs * 1.5)) / (beatDurationMs * 1.5)
        const counterPulse = Math.sin(counterPhase * Math.PI) * 0.4

        // Effective bass & loudness: blend hardware signal if active, or rhythmic pulse
        const effectiveBass = bassLevel > 0.03 ? Math.max(bassLevel * 1.5, beatPulse * 0.6) : beatPulse
        const effectiveMid = midLevel > 0.03 ? Math.max(midLevel * 1.3, counterPulse * 0.5) : counterPulse
        const effectiveLoudness = overallLevel > 0.03 ? Math.max(overallLevel * 1.2, beatPulse * 0.7) : (beatPulse * 0.8)

        // Smooth liquid lerping (damping factor ~0.12 ensures soothing, silk-like transitions)
        smoothBassRef.current += (effectiveBass - smoothBassRef.current) * 0.12
        smoothMidRef.current += (effectiveMid - smoothMidRef.current) * 0.10
        smoothLoudnessRef.current += (effectiveLoudness - smoothLoudnessRef.current) * 0.11

        // Soothing scale: expands visibly up to 1.18 on bass kicks (organic blooming)
        const targetScale = 1.0 + Math.min(0.20, smoothBassRef.current * 0.28)
        const targetHarmonic = 1.0 + Math.min(0.18, smoothMidRef.current * 0.25)
        // Visible, rich opacity: breathes smoothly between 0.72 and 0.92
        const targetOpacity = 0.72 + Math.min(0.22, smoothLoudnessRef.current * 0.26)

        setEnergyScale(targetScale)
        setHarmonicScale(targetHarmonic)
        setGlowOpacity(targetOpacity)
      } else {
        // Soothing calm resting state when paused (smoothly drifts to peace)
        smoothBassRef.current += (0 - smoothBassRef.current) * 0.06
        smoothMidRef.current += (0 - smoothMidRef.current) * 0.06
        setEnergyScale(1.0)
        setHarmonicScale(1.0)
        setGlowOpacity(0.48)
      }

      animationFrameRef.current = requestAnimationFrame(updateAura)
    }

    animationFrameRef.current = requestAnimationFrame(updateAura)

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [isPlaying, ambientLighting, currentSong?.energy, currentSong?.tempo])

  if (!ambientLighting) {
    return null
  }

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none overflow-hidden z-0 select-none transition-opacity duration-1000 ease-out"
      style={{ opacity: glowOpacity }}
    >
      {/* 1. Grand Luminous Radial Mesh Wash (Bathing top & header in rich ambient color) */}
      <div
        className="absolute inset-0 transition-all duration-1000 ease-out"
        style={{
          backgroundImage: mood.bgMesh,
          opacity: isPlaying ? 0.90 : 0.45,
          transform: `scale(${energyScale})`,
        }}
      />

      {/* 2. Top-Center Soft Aurora Curtain (Illuminates upper viewport & greeting) */}
      <div
        className="absolute -top-[25%] left-1/2 -translate-x-1/2 w-[90vw] max-w-[1200px] h-[550px] rounded-[100%] blur-[120px] md:blur-[160px] opacity-70 mix-blend-screen transition-all duration-500 ease-out"
        style={{
          backgroundColor: mood.primary,
          transform: `translateX(-50%) scale(${energyScale * 1.04})`,
        }}
      />

      {/* 3. Primary Luminous Floating Aura Orb (Top-Right: Deep resonant bass blooms) */}
      <div
        className="absolute -top-[12%] -right-[8%] w-[650px] h-[650px] md:w-[900px] md:h-[900px] rounded-full blur-[130px] md:blur-[170px] opacity-75 mix-blend-screen transition-transform duration-300 ease-out animate-aura-1"
        style={{
          backgroundColor: mood.primary,
          transform: `scale(${energyScale})`,
        }}
      />

      {/* 4. Secondary Harmonic Aura Orb (Bottom-Left: Counter-tempo mid/vocal glow) */}
      <div
        className="absolute -bottom-[15%] -left-[10%] w-[600px] h-[600px] md:w-[850px] md:h-[850px] rounded-full blur-[140px] md:blur-[180px] opacity-65 mix-blend-screen transition-transform duration-300 ease-out animate-aura-2"
        style={{
          backgroundColor: mood.secondary,
          transform: `scale(${harmonicScale})`,
        }}
      />

      {/* 5. Center-Stage Accent Core (Subtle warmth radiating behind main card grid) */}
      <div
        className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] md:w-[700px] md:h-[700px] rounded-full blur-[150px] md:blur-[200px] opacity-50 mix-blend-screen transition-transform duration-500 ease-out"
        style={{
          backgroundColor: mood.accent,
          transform: `translate(-50%, -50%) scale(${energyScale * 0.95})`,
        }}
      />

      {/* 6. Bottom Player Halo Horizon (Radiates soft upward backlight behind floating dock) */}
      <div
        className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[92%] h-44 rounded-full blur-[100px] md:blur-[130px] opacity-65 transition-all duration-300 ease-out"
        style={{
          backgroundColor: mood.primary,
          transform: `translateX(-50%) scale(${energyScale})`,
        }}
      />
    </div>
  )
}
