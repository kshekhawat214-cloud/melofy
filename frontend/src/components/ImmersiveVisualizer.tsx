"use client"
import React, { useEffect, useRef, useCallback, useMemo } from "react"
import { usePlayerStore } from "@/store/playerStore"
import { getSongRgbVibe, RgbVibe } from "@/lib/colors"
import { audioDsp } from "@/lib/audioDsp"

export default function ImmersiveVisualizer() {
  const currentSong = usePlayerStore((s) => s.currentSong)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const isImmersiveOpen = usePlayerStore((s) => s.isImmersiveVisualizerOpen)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const animRef = useRef<number | null>(null)
  const timeRef = useRef(0)
  const prevFrameTimeRef = useRef(0)

  // Track & RGB Vibe
  const vibe: RgbVibe = useMemo(() => {
    return getSongRgbVibe(
      currentSong?.title,
      currentSong?.artist,
      currentSong?.genre,
      currentSong?.energy
    )
  }, [currentSong?.id, currentSong?.title, currentSong?.artist, currentSong?.genre, currentSong?.energy])

  // Smoothed gentle audio dynamics (high damping for soft, eye-friendly transitions)
  const audioRef = useRef({
    bass: 0,
    mid: 0,
    treble: 0,
    overall: 0,
  })

  // ─── Render Loop: Pure Soft Liquid Ambient Light ───────────────
  const render = useCallback((timestamp: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d", { alpha: false })
    if (!ctx) return

    const dt = prevFrameTimeRef.current ? (timestamp - prevFrameTimeRef.current) / 16.67 : 1
    prevFrameTimeRef.current = timestamp
    timeRef.current += 0.012 * dt

    const W = canvas.width
    const H = canvas.height
    const t = timeRef.current

    // ─── Soft Audio Dynamics ─────────────────────────────────────
    const raw = audioDsp.getReactivityData()
    const a = audioRef.current
    // High smoothing damping (0.08) ensures gentle, silky, non-jarring transitions
    const damping = 0.08
    a.bass += (raw.bassLevel - a.bass) * damping
    a.mid += (raw.midLevel - a.mid) * damping
    a.treble += (raw.trebleLevel - a.treble) * damping
    a.overall += (raw.overallLevel - a.overall) * damping

    // Gentle rhythmic breathing
    const tempo = currentSong?.tempo && currentSong.tempo > 60 && currentSong.tempo < 200 ? currentSong.tempo : 110
    const beatPhase = (timestamp % ((60 / tempo) * 1000)) / ((60 / tempo) * 1000)
    const gentleBpmPulse = Math.pow(Math.sin(beatPhase * Math.PI), 2) * 0.15

    const effectiveBass = isPlaying ? (a.bass > 0.02 ? a.bass * 0.7 : gentleBpmPulse) : gentleBpmPulse * 0.5
    const effectiveMid = isPlaying ? (a.mid > 0.02 ? a.mid * 0.6 : gentleBpmPulse * 0.5) : gentleBpmPulse * 0.3
    const effectiveOverall = isPlaying ? (a.overall > 0.02 ? a.overall * 0.6 : gentleBpmPulse) : gentleBpmPulse * 0.4

    // ─── 1. Deep Midnight Velvet Base ────────────────────────────
    ctx.fillStyle = "#07070a"
    ctx.fillRect(0, 0, W, H)

    // ─── 2. Soft Diffuse Liquid Auras (3 Large Gentle Ambient Orbs) ─
    // Orb 1: Primary Mood Aura (Center-Left, slowly floating)
    const o1X = W * (0.35 + Math.sin(t * 0.3) * 0.12)
    const o1Y = H * (0.42 + Math.cos(t * 0.25) * 0.1)
    const o1R = Math.min(W, H) * (0.55 + effectiveBass * 0.25)
    const grad1 = ctx.createRadialGradient(o1X, o1Y, 0, o1X, o1Y, o1R)
    grad1.addColorStop(0, `${vibe.primary}66`)
    grad1.addColorStop(0.45, `${vibe.primary}26`)
    grad1.addColorStop(1, "transparent")
    ctx.fillStyle = grad1
    ctx.fillRect(0, 0, W, H)

    // Orb 2: Secondary Harmonic Aura (Center-Right, counter-phase drift)
    const o2X = W * (0.65 + Math.sin(t * 0.25 + 2) * 0.12)
    const o2Y = H * (0.48 + Math.cos(t * 0.35 + 1) * 0.12)
    const o2R = Math.min(W, H) * (0.5 + effectiveMid * 0.2)
    const grad2 = ctx.createRadialGradient(o2X, o2Y, 0, o2X, o2Y, o2R)
    grad2.addColorStop(0, `${vibe.secondary}55`)
    grad2.addColorStop(0.45, `${vibe.secondary}20`)
    grad2.addColorStop(1, "transparent")
    ctx.fillStyle = grad2
    ctx.fillRect(0, 0, W, H)

    // Orb 3: Warm Accent Bloom (Bottom-Center, gentle bass glow)
    const o3X = W * (0.5 + Math.sin(t * 0.2) * 0.08)
    const o3Y = H * (0.65 + Math.cos(t * 0.3) * 0.08)
    const o3R = Math.min(W, H) * (0.6 + effectiveOverall * 0.25)
    const grad3 = ctx.createRadialGradient(o3X, o3Y, 0, o3X, o3Y, o3R)
    grad3.addColorStop(0, `${vibe.neonHighlight}40`)
    grad3.addColorStop(0.5, `${vibe.accent}18`)
    grad3.addColorStop(1, "transparent")
    ctx.fillStyle = grad3
    ctx.fillRect(0, 0, W, H)

    // ─── 3. Soft Perimeter Screen Edge Ambilight (Eye-Soothing) ───
    // Soft bottom glow (simulates desk/wall bounce)
    const edgeBottom = ctx.createLinearGradient(0, H, 0, H - 220)
    edgeBottom.addColorStop(0, `${vibe.primary}44`)
    edgeBottom.addColorStop(1, "transparent")
    ctx.fillStyle = edgeBottom
    ctx.fillRect(0, H - 220, W, 220)

    // Soft top glow (gentle ceiling bounce)
    const edgeTop = ctx.createLinearGradient(0, 0, 0, 160)
    edgeTop.addColorStop(0, `${vibe.secondary}33`)
    edgeTop.addColorStop(1, "transparent")
    ctx.fillStyle = edgeTop
    ctx.fillRect(0, 0, W, 160)

    animRef.current = requestAnimationFrame(render)
  }, [vibe, isPlaying, currentSong?.tempo])

  // ─── Canvas Resize Handler ────────────────────────────────────
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current
      if (!canvas) return
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      canvas.width = window.innerWidth * dpr
      canvas.height = window.innerHeight * dpr
      const ctx = canvas.getContext("2d")
      if (ctx) ctx.scale(dpr, dpr)
    }

    handleResize()
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  // ─── Mount Loop ───────────────────────────────────────────────
  useEffect(() => {
    if (!isImmersiveOpen) {
      if (animRef.current) cancelAnimationFrame(animRef.current)
      return
    }

    prevFrameTimeRef.current = 0
    animRef.current = requestAnimationFrame(render)

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current)
    }
  }, [isImmersiveOpen, render])

  if (!isImmersiveOpen) return null

  return (
    <div className="fixed inset-0 z-[190] overflow-hidden pointer-events-none select-none">
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
        style={{ width: "100vw", height: "100vh" }}
      />
    </div>
  )
}
