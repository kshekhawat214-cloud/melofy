"use client"
import React, { useEffect, useRef, useCallback, useMemo } from "react"
import { usePlayerStore } from "@/store/playerStore"
import { getSongRgbVibe, RgbVibe, hexToRgba } from "@/lib/colors"
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

  // Asymmetrical audio envelope tracking (fast attack, silky smooth decay)
  const audioRef = useRef({
    bass: 0,
    mid: 0,
    treble: 0,
    overall: 0,
  })

  // Soft floating stardust motes (out-of-focus bokeh shimmer for treble air)
  const stardustRef = useRef<
    Array<{ x: number; y: number; r: number; speedY: number; seed: number }>
  >([])

  useEffect(() => {
    const pts = []
    for (let i = 0; i < 14; i++) {
      pts.push({
        x: Math.random(),
        y: Math.random(),
        r: 18 + Math.random() * 32,
        speedY: 0.0002 + Math.random() * 0.0004,
        seed: Math.random() * 100,
      })
    }
    stardustRef.current = pts
  }, [])

  // ─── Render Loop: Apple Music Liquid Aurora Mesh Engine ───────────
  const render = useCallback((timestamp: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d", { alpha: false })
    if (!ctx) return

    const dt = prevFrameTimeRef.current ? Math.min(2.5, (timestamp - prevFrameTimeRef.current) / 16.67) : 1
    prevFrameTimeRef.current = timestamp
    timeRef.current += 0.012 * dt

    const W = canvas.width
    const H = canvas.height
    const minDim = Math.min(W, H)

    const audioEl = typeof document !== "undefined" ? document.querySelector("audio") : null
    const isAudioActive = Boolean(audioEl && !audioEl.paused)
    const audioTime = audioEl ? audioEl.currentTime : 0
    // Lock visualizer evolution clock directly to real-time audio playback
    const t = isAudioActive ? audioTime : timeRef.current

    // ─── 1. Asymmetrical Audio Dynamics ──────────────────────────────
    const raw = audioDsp.getReactivityData()
    const a = audioRef.current

    // Snappy attack on kicks/vocals, luxurious velvet decay
    const attack = 0.32
    const decay = 0.12
    a.bass += (raw.bassLevel - a.bass) * (raw.bassLevel > a.bass ? attack : decay)
    a.mid += (raw.midLevel - a.mid) * (raw.midLevel > a.mid ? attack : decay)
    a.treble += (raw.trebleLevel - a.treble) * (raw.trebleLevel > a.treble ? attack : decay)
    a.overall += (raw.overallLevel - a.overall) * (raw.overallLevel > a.overall ? attack : decay)

    const curBass = isPlaying ? Math.max(a.bass, 0.14) : 0.10
    const curMid = isPlaying ? Math.max(a.mid, 0.12) : 0.08
    const curTreble = isPlaying ? Math.max(a.treble, 0.10) : 0.06
    const curOverall = isPlaying ? Math.max(a.overall, 0.14) : 0.08

    // ─── 2. Deep Velvet Foundation (Zero Dark Void) ───────────────────
    ctx.globalCompositeOperation = "source-over"
    
    // Rich midnight indigo/violet base (dark, velvety, and restful on the eyes)
    const baseGrad = ctx.createLinearGradient(0, 0, 0, H)
    baseGrad.addColorStop(0, "#06050e")
    baseGrad.addColorStop(0.35, "#0a071a")
    baseGrad.addColorStop(0.7, "#0f0924")
    baseGrad.addColorStop(1, "#06050e")
    ctx.fillStyle = baseGrad
    ctx.fillRect(0, 0, W, H)

    // Soft atmospheric room wash (restrained, gentle velvety tones, zero glare)
    const roomWash = ctx.createRadialGradient(W * 0.5, H * 0.45, 0, W * 0.5, H * 0.5, Math.max(W, H) * 0.8)
    roomWash.addColorStop(0, hexToRgba(vibe.primary, 0.12 + curOverall * 0.10))
    roomWash.addColorStop(0.5, hexToRgba(vibe.secondary, 0.08 + curMid * 0.08))
    roomWash.addColorStop(0.85, hexToRgba(vibe.accent, 0.04 + curBass * 0.05))
    roomWash.addColorStop(1, "transparent")
    ctx.fillStyle = roomWash
    ctx.fillRect(0, 0, W, H)

    // ─── 3. Soft Liquid Aurora Ambient Nodes (Zero Screen Bleach) ─────
    // Keep source-over composite operation to prevent additive white flashes!
    ctx.globalCompositeOperation = "source-over"

    // NODE 1: Sub-Bass & Kick Core (Lower-Left to Center Soft Swell)
    const n1X = W * (0.34 + Math.sin(t * 0.38) * 0.15)
    const n1Y = H * (0.64 + Math.cos(t * 0.32) * 0.13)
    const n1R = minDim * (0.50 + curBass * 0.45)
    const n1Alpha = 0.15 + curBass * 0.12
    const grad1 = ctx.createRadialGradient(n1X, n1Y, 0, n1X, n1Y, n1R)
    grad1.addColorStop(0, hexToRgba(vibe.primary, n1Alpha))
    grad1.addColorStop(0.40, hexToRgba(vibe.primary, n1Alpha * 0.55))
    grad1.addColorStop(0.75, hexToRgba(vibe.primary, n1Alpha * 0.12))
    grad1.addColorStop(1, "transparent")
    ctx.fillStyle = grad1
    ctx.fillRect(0, 0, W, H)

    // NODE 2: Vocal Presence & Melodic Energy (Upper-Right to Center)
    const n2X = W * (0.66 + Math.cos(t * 0.44) * 0.15)
    const n2Y = H * (0.36 + Math.sin(t * 0.36) * 0.13)
    const n2R = minDim * (0.46 + curMid * 0.42)
    const n2Alpha = 0.13 + curMid * 0.11
    const grad2 = ctx.createRadialGradient(n2X, n2Y, 0, n2X, n2Y, n2R)
    grad2.addColorStop(0, hexToRgba(vibe.secondary, n2Alpha))
    grad2.addColorStop(0.45, hexToRgba(vibe.secondary, n2Alpha * 0.50))
    grad2.addColorStop(0.80, hexToRgba(vibe.secondary, n2Alpha * 0.10))
    grad2.addColorStop(1, "transparent")
    ctx.fillStyle = grad2
    ctx.fillRect(0, 0, W, H)

    // NODE 3: Harmonic Drift & Ambient Horizon (Top-Left / Center Drift)
    const n3X = W * (0.44 + Math.sin(t * 0.30 + 1.8) * 0.16)
    const n3Y = H * (0.28 + Math.cos(t * 0.26 + 1.2) * 0.14)
    const n3R = minDim * (0.48 + curOverall * 0.36)
    const n3Alpha = 0.10 + curOverall * 0.08
    const grad3 = ctx.createRadialGradient(n3X, n3Y, 0, n3X, n3Y, n3R)
    grad3.addColorStop(0, hexToRgba(vibe.accent, n3Alpha))
    grad3.addColorStop(0.50, hexToRgba(vibe.accent, n3Alpha * 0.45))
    grad3.addColorStop(0.85, hexToRgba(vibe.accent, n3Alpha * 0.08))
    grad3.addColorStop(1, "transparent")
    ctx.fillStyle = grad3
    ctx.fillRect(0, 0, W, H)

    // NODE 4: High Frequencies & Sparkling Instrument Atmosphere (Bottom-Right)
    const n4X = W * (0.74 + Math.sin(t * 0.50 + 3.1) * 0.14)
    const n4Y = H * (0.76 + Math.cos(t * 0.40 + 2.5) * 0.12)
    const n4R = minDim * (0.42 + curTreble * 0.38)
    const n4Alpha = 0.08 + curTreble * 0.07
    const grad4 = ctx.createRadialGradient(n4X, n4Y, 0, n4X, n4Y, n4R)
    grad4.addColorStop(0, hexToRgba(vibe.secondary, n4Alpha))
    grad4.addColorStop(0.45, hexToRgba(vibe.secondary, n4Alpha * 0.40))
    grad4.addColorStop(0.80, hexToRgba(vibe.secondary, n4Alpha * 0.08))
    grad4.addColorStop(1, "transparent")
    ctx.fillStyle = grad4
    ctx.fillRect(0, 0, W, H)

    // ─── 4. Soft Out-Of-Focus Stardust Bokeh (Highs & Air) ────────────
    const pts = stardustRef.current
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]
      p.y -= p.speedY * dt
      if (p.y < -0.05) p.y = 1.05

      const px = p.x * W + Math.sin(t * 0.35 + p.seed) * 25
      const py = p.y * H
      const pr = p.r * (1 + curTreble * 0.30)
      const pAlpha = (0.02 + curTreble * 0.06) * Math.sin((p.y % 1) * Math.PI)

      if (pAlpha > 0.01) {
        const pGrad = ctx.createRadialGradient(px, py, 0, px, py, pr)
        pGrad.addColorStop(0, hexToRgba(vibe.accent, pAlpha))
        pGrad.addColorStop(1, "transparent")
        ctx.fillStyle = pGrad
        ctx.beginPath()
        ctx.arc(px, py, pr, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    // ─── 5. Room-Wash Edge Soft Vignette Ambilight ─────────────────────
    ctx.globalCompositeOperation = "source-over"

    // Floor Subwoofer Soft Glow
    const edgeBottomH = H * 0.20
    const edgeBottom = ctx.createLinearGradient(0, H, 0, H - edgeBottomH)
    edgeBottom.addColorStop(0, hexToRgba(vibe.primary, 0.12 + curBass * 0.12))
    edgeBottom.addColorStop(0.6, hexToRgba(vibe.primary, 0.03 + curBass * 0.04))
    edgeBottom.addColorStop(1, "transparent")
    ctx.fillStyle = edgeBottom
    ctx.fillRect(0, H - edgeBottomH, W, edgeBottomH)

    // Ceiling Soft Ambient Wash
    const edgeTopH = H * 0.14
    const edgeTop = ctx.createLinearGradient(0, 0, 0, edgeTopH)
    edgeTop.addColorStop(0, hexToRgba(vibe.secondary, 0.07 + curMid * 0.07))
    edgeTop.addColorStop(1, "transparent")
    ctx.fillStyle = edgeTop
    ctx.fillRect(0, 0, W, edgeTopH)

    // Lateral Wall Reflections
    const edgeSideW = W * 0.08
    const edgeLeft = ctx.createLinearGradient(0, 0, edgeSideW, 0)
    edgeLeft.addColorStop(0, hexToRgba(vibe.accent, 0.04 + curOverall * 0.05))
    edgeLeft.addColorStop(1, "transparent")
    ctx.fillStyle = edgeLeft
    ctx.fillRect(0, 0, edgeSideW, H)

    const edgeRight = ctx.createLinearGradient(W, 0, W - edgeSideW, 0)
    edgeRight.addColorStop(0, hexToRgba(vibe.primary, 0.04 + curOverall * 0.05))
    edgeRight.addColorStop(1, "transparent")
    ctx.fillStyle = edgeRight
    ctx.fillRect(W - edgeSideW, 0, edgeSideW, H)

    animRef.current = requestAnimationFrame(render)
  }, [vibe, isPlaying, currentSong?.tempo, currentSong?.energy])

  // ─── Canvas Resize Handler (Retina Sharpened) ───────────────────
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

  // ─── Mount Loop ─────────────────────────────────────────────────
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
