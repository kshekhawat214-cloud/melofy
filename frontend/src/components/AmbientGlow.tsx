"use client"
import React, { useMemo, useEffect, useRef, useState } from "react"
import { usePlayerStore } from "@/store/playerStore"
import { getSongRgbVibe } from "@/lib/colors"
import { audioDsp } from "@/lib/audioDsp"

export default function AmbientGlow() {
  const currentSong = usePlayerStore((s) => s.currentSong)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const ambientLighting = usePlayerStore((s) => s.ambientLighting)

  // Intelligent RGB Vibe matching the current song's genre, tempo, energy, and feel
  const vibe = useMemo(() => {
    return getSongRgbVibe(
      currentSong?.title,
      currentSong?.artist,
      currentSong?.genre,
      currentSong?.energy
    )
  }, [currentSong?.id, currentSong?.title, currentSong?.artist, currentSong?.genre, currentSong?.energy])

  // Real-time audio dynamics state
  const [energyScale, setEnergyScale] = useState(1.0)
  const [bassKick, setBassKick] = useState(0)
  const [vibeHueShift, setVibeHueShift] = useState(0)
  const [glowOpacity, setGlowOpacity] = useState(0.65)
  const animationFrameRef = useRef<number | null>(null)

  // Organic smoothing refs
  const smoothBassRef = useRef(0.2)
  const smoothMidRef = useRef(0.15)
  const smoothTrebleRef = useRef(0.1)
  const smoothLoudnessRef = useRef(0.3)
  const lastTimeRef = useRef(0)

  useEffect(() => {
    if (!ambientLighting) return

    let hueTimer = 0

    const updateAura = (now: number) => {
      const dt = lastTimeRef.current ? Math.min(0.1, (now - lastTimeRef.current) / 1000) : 0.016
      lastTimeRef.current = now

      if (isPlaying) {
        // Live hardware frequency analysis
        const { bassLevel, midLevel, trebleLevel, overallLevel } = audioDsp.getReactivityData()

        // Track metadata BPM pulse
        const energy = currentSong?.energy ?? 0.75
        const tempo = currentSong?.tempo && currentSong.tempo > 60 && currentSong.tempo < 220
          ? currentSong.tempo
          : 120
        const beatDurationMs = (60 / tempo) * 1000
        const beatPhase = (now % beatDurationMs) / beatDurationMs
        const beatPulse = Math.pow(Math.sin(beatPhase * Math.PI), 2.2) * (0.35 + energy * 0.45)

        // Effective multi-band levels
        const effectiveBass = bassLevel > 0.03 ? Math.max(bassLevel * 1.6, beatPulse * 0.7) : beatPulse
        const effectiveMid = midLevel > 0.03 ? Math.max(midLevel * 1.4, beatPulse * 0.5) : beatPulse * 0.5
        const effectiveTreble = trebleLevel > 0.03 ? Math.max(trebleLevel * 1.5, beatPulse * 0.4) : beatPulse * 0.3
        const effectiveLoudness = overallLevel > 0.03 ? Math.max(overallLevel * 1.3, beatPulse * 0.8) : beatPulse * 0.8

        // Gentle, soothing breathing (no harsh strobes or rapid hue shifts)
        smoothBassRef.current += (effectiveBass - smoothBassRef.current) * 0.08
        smoothMidRef.current += (effectiveMid - smoothMidRef.current) * 0.08
        smoothTrebleRef.current += (effectiveTreble - smoothTrebleRef.current) * 0.08
        smoothLoudnessRef.current += (effectiveLoudness - smoothLoudnessRef.current) * 0.08

        const kickMagnitude = Math.max(0, smoothBassRef.current - 0.2) * 0.6
        setBassKick(Math.min(0.5, kickMagnitude))

        // Very slow, soothing drift
        setVibeHueShift(Math.sin(now * 0.0003) * 10)

        const targetScale = 1.0 + Math.min(0.12, smoothBassRef.current * 0.15)
        const targetOpacity = 0.45 + Math.min(0.2, smoothLoudnessRef.current * 0.2)

        setEnergyScale(targetScale)
        setGlowOpacity(targetOpacity)
      } else {
        smoothBassRef.current += (0 - smoothBassRef.current) * 0.04
        smoothMidRef.current += (0 - smoothMidRef.current) * 0.04
        setEnergyScale(1.0)
        setBassKick(0)
        setGlowOpacity(0.35)
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

  if (!ambientLighting) return null

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none overflow-hidden z-0 select-none transition-opacity duration-1000 ease-out"
      style={{
        opacity: glowOpacity,
        filter: `hue-rotate(${vibeHueShift}deg)`,
      }}
    >
      {/* ─── 1. Multi-Zone Perimeter RGB Ambilight Strips (Philips Hue / Ambilight TV) ─── */}
      {/* Bottom Sub-Bass Woofer Ambilight Beam */}
      <div
        className="absolute bottom-0 left-0 right-0 h-40 blur-[90px] md:blur-[120px] transition-all duration-150 ease-out"
        style={{
          background: `linear-gradient(to top, ${vibe.bassShockwaveColor} 0%, ${vibe.primary} 50%, transparent 100%)`,
          opacity: 0.6 + bassKick * 0.4,
          transform: `scaleY(${1 + bassKick * 0.4})`,
        }}
      />

      {/* Top Vocal & Melody Ambilight Glow */}
      <div
        className="absolute top-0 left-0 right-0 h-36 blur-[80px] md:blur-[110px] transition-all duration-300 ease-out"
        style={{
          background: `linear-gradient(to bottom, ${vibe.secondary} 0%, ${vibe.vocalAuraColor} 45%, transparent 100%)`,
          opacity: 0.55 + smoothMidRef.current * 0.35,
        }}
      />

      {/* Left Edge Stereo Ambilight Pillar */}
      <div
        className="absolute top-0 bottom-0 left-0 w-32 blur-[70px] md:blur-[100px] transition-all duration-200 ease-out"
        style={{
          background: `linear-gradient(to right, ${vibe.primary} 0%, transparent 100%)`,
          opacity: 0.5 + smoothTrebleRef.current * 0.3,
        }}
      />

      {/* Right Edge Stereo Ambilight Pillar */}
      <div
        className="absolute top-0 bottom-0 right-0 w-32 blur-[70px] md:blur-[100px] transition-all duration-200 ease-out"
        style={{
          background: `linear-gradient(to left, ${vibe.neonHighlight} 0%, transparent 100%)`,
          opacity: 0.5 + smoothTrebleRef.current * 0.3,
        }}
      />

      {/* ─── 2. Grand Reactive Radial Mesh Wash ─── */}
      <div
        className="absolute inset-0 transition-transform duration-500 ease-out"
        style={{
          background: `radial-gradient(ellipse at 50% 30%, ${vibe.primary}33 0%, ${vibe.secondary}22 45%, transparent 75%)`,
          transform: `scale(${energyScale})`,
        }}
      />

      {/* ─── 3. Dynamic Corner RGB Spotlights ─── */}
      {/* Top-Right Neon Blast */}
      <div
        className="absolute -top-[15%] -right-[10%] w-[650px] h-[650px] md:w-[900px] md:h-[900px] rounded-full blur-[140px] md:blur-[180px] opacity-75 mix-blend-screen transition-transform duration-300 ease-out"
        style={{
          backgroundColor: vibe.primary,
          transform: `scale(${energyScale * 1.05})`,
        }}
      />

      {/* Bottom-Left Harmonic Aura */}
      <div
        className="absolute -bottom-[15%] -left-[10%] w-[600px] h-[600px] md:w-[850px] md:h-[850px] rounded-full blur-[130px] md:blur-[170px] opacity-70 mix-blend-screen transition-transform duration-300 ease-out"
        style={{
          backgroundColor: vibe.secondary,
          transform: `scale(${1 + smoothMidRef.current * 0.25})`,
        }}
      />

      {/* Center Pulse Core */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[450px] h-[450px] md:w-[650px] md:h-[650px] rounded-full blur-[120px] md:blur-[160px] opacity-45 mix-blend-screen transition-transform duration-300 ease-out"
        style={{
          backgroundColor: vibe.neonHighlight,
          transform: `translate(-50%, -50%) scale(${energyScale * 0.95})`,
        }}
      />
    </div>
  )
}
