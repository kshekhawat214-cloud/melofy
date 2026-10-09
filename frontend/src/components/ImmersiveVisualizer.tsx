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

  // Asymmetrical audio dynamics: fast snappy attack on kicks, silky smooth decay
  const audioRef = useRef({
    bass: 0,
    mid: 0,
    treble: 0,
    overall: 0,
  })

  // Stardust bokeh particles (shimmering with treble/vocal air)
  const particlesRef = useRef<
    Array<{ x: number; y: number; r: number; speedY: number; seed: number }>
  >([])

  useEffect(() => {
    // Generate 16 gentle floating particles
    const pts = []
    for (let i = 0; i < 16; i++) {
      pts.push({
        x: Math.random(),
        y: Math.random(),
        r: 12 + Math.random() * 24,
        speedY: 0.0003 + Math.random() * 0.0006,
        seed: Math.random() * 100,
      })
    }
    particlesRef.current = pts
  }, [])

  // ─── Render Loop: High-Fidelity Responsive Ambient Light Show ────
  const render = useCallback((timestamp: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d", { alpha: false })
    if (!ctx) return

    const dt = prevFrameTimeRef.current ? Math.min(2.5, (timestamp - prevFrameTimeRef.current) / 16.67) : 1
    prevFrameTimeRef.current = timestamp
    timeRef.current += 0.015 * dt

    const W = canvas.width
    const H = canvas.height
    const t = timeRef.current

    // ─── Asymmetrical Audio Tracking (Instant Kick Attack, Velvet Decay) ─
    const raw = audioDsp.getReactivityData()
    const a = audioRef.current

    const attack = 0.26
    const decay = 0.11
    a.bass += (raw.bassLevel - a.bass) * (raw.bassLevel > a.bass ? attack : decay)
    a.mid += (raw.midLevel - a.mid) * (raw.midLevel > a.mid ? attack : decay)
    a.treble += (raw.trebleLevel - a.treble) * (raw.trebleLevel > a.treble ? attack : decay)
    a.overall += (raw.overallLevel - a.overall) * (raw.overallLevel > a.overall ? attack : decay)

    // Gentle rhythmic breathing if audio paused or idling
    const tempo = currentSong?.tempo && currentSong.tempo > 60 && currentSong.tempo < 200 ? currentSong.tempo : 116
    const beatPeriodMs = (60 / tempo) * 1000
    const beatPhase = (timestamp % beatPeriodMs) / beatPeriodMs
    const idlePulse = Math.pow(Math.sin(beatPhase * Math.PI), 2) * 0.18

    const curBass = isPlaying ? Math.max(a.bass, idlePulse * 0.4) : idlePulse * 0.3
    const curMid = isPlaying ? Math.max(a.mid, idlePulse * 0.3) : idlePulse * 0.2
    const curTreble = isPlaying ? Math.max(a.treble, idlePulse * 0.25) : idlePulse * 0.15
    const curOverall = isPlaying ? Math.max(a.overall, idlePulse * 0.35) : idlePulse * 0.25

    // ─── 1. Deep Midnight Velvet Base Backdrop ───────────────────
    ctx.fillStyle = "#050508"
    ctx.fillRect(0, 0, W, H)

    // ─── 2. Center Ambient Reactor (Directly behind the Album Cover) ─
    // Centered at W * 0.5, H * 0.38 to align directly with the center cover art
    const cX = W * 0.5
    const cY = H * 0.38
    const centerRadius = Math.min(W, H) * (0.36 + curBass * 0.52)

    const gradCenter = ctx.createRadialGradient(cX, cY, 0, cX, cY, centerRadius)
    // Dynamic alpha: flares brightly on drops and kicks!
    const coreAlpha = Math.min(0.92, 0.42 + curBass * 0.50)
    const midAlpha = Math.min(0.65, 0.28 + curBass * 0.38)
    const outerAlpha = Math.min(0.35, 0.10 + curMid * 0.22)

    gradCenter.addColorStop(0, hexToRgba(vibe.neonHighlight, coreAlpha))
    gradCenter.addColorStop(0.25, hexToRgba(vibe.primary, midAlpha))
    gradCenter.addColorStop(0.60, hexToRgba(vibe.secondary, outerAlpha))
    gradCenter.addColorStop(1, "transparent")

    ctx.fillStyle = gradCenter
    ctx.fillRect(0, 0, W, H)

    // ─── 3. Stereo Harmonic Auroras (Left & Right Organic Floating Orbs) ─
    // Left Orb: Low-Mid Harmonic Drift
    const o1X = W * (0.24 + Math.sin(t * 0.32) * 0.09)
    const o1Y = H * (0.46 + Math.cos(t * 0.26) * 0.08)
    const o1R = Math.min(W, H) * (0.42 + curBass * 0.32)
    const grad1 = ctx.createRadialGradient(o1X, o1Y, 0, o1X, o1Y, o1R)
    grad1.addColorStop(0, hexToRgba(vibe.primary, 0.32 + curBass * 0.42))
    grad1.addColorStop(0.50, hexToRgba(vibe.primary, 0.10 + curBass * 0.18))
    grad1.addColorStop(1, "transparent")
    ctx.fillStyle = grad1
    ctx.fillRect(0, 0, W, H)

    // Right Orb: Vocal Presence & Melody Flow
    const o2X = W * (0.76 + Math.sin(t * 0.28 + 2.2) * 0.09)
    const o2Y = H * (0.48 + Math.cos(t * 0.34 + 1.2) * 0.08)
    const o2R = Math.min(W, H) * (0.40 + curMid * 0.36)
    const grad2 = ctx.createRadialGradient(o2X, o2Y, 0, o2X, o2Y, o2R)
    grad2.addColorStop(0, hexToRgba(vibe.secondary, 0.30 + curMid * 0.44))
    grad2.addColorStop(0.50, hexToRgba(vibe.secondary, 0.10 + curMid * 0.18))
    grad2.addColorStop(1, "transparent")
    ctx.fillStyle = grad2
    ctx.fillRect(0, 0, W, H)

    // Bottom Ambient Bloom (Warm floor reflection)
    const o3X = W * (0.50 + Math.sin(t * 0.22) * 0.06)
    const o3Y = H * 0.72
    const o3R = Math.min(W, H) * (0.50 + curOverall * 0.32)
    const grad3 = ctx.createRadialGradient(o3X, o3Y, 0, o3X, o3Y, o3R)
    grad3.addColorStop(0, hexToRgba(vibe.accent, 0.24 + curOverall * 0.32))
    grad3.addColorStop(0.55, hexToRgba(vibe.neonHighlight, 0.08 + curOverall * 0.15))
    grad3.addColorStop(1, "transparent")
    ctx.fillStyle = grad3
    ctx.fillRect(0, 0, W, H)

    // ─── 4. High-End Screen Perimeter Ambilight (Room Wash) ──────
    // Bottom Edge Glow (Desk / Subwoofer bounce - strongly reactive to kicks)
    const edgeBottomH = H * 0.30
    const edgeBottom = ctx.createLinearGradient(0, H, 0, H - edgeBottomH)
    edgeBottom.addColorStop(0, hexToRgba(vibe.primary, 0.35 + curBass * 0.52))
    edgeBottom.addColorStop(0.5, hexToRgba(vibe.primary, 0.12 + curBass * 0.20))
    edgeBottom.addColorStop(1, "transparent")
    ctx.fillStyle = edgeBottom
    ctx.fillRect(0, H - edgeBottomH, W, edgeBottomH)

    // Top Edge Glow (Ceiling bounce - reactive to vocals / highs)
    const edgeTopH = H * 0.22
    const edgeTop = ctx.createLinearGradient(0, 0, 0, edgeTopH)
    edgeTop.addColorStop(0, hexToRgba(vibe.secondary, 0.24 + curMid * 0.38))
    edgeTop.addColorStop(1, "transparent")
    ctx.fillStyle = edgeTop
    ctx.fillRect(0, 0, W, edgeTopH)

    // Left & Right Lateral Edge Washes
    const edgeSideW = W * 0.14
    // Left
    const edgeLeft = ctx.createLinearGradient(0, 0, edgeSideW, 0)
    edgeLeft.addColorStop(0, hexToRgba(vibe.accent, 0.18 + curOverall * 0.26))
    edgeLeft.addColorStop(1, "transparent")
    ctx.fillStyle = edgeLeft
    ctx.fillRect(0, 0, edgeSideW, H)

    // Right
    const edgeRight = ctx.createLinearGradient(W, 0, W - edgeSideW, 0)
    edgeRight.addColorStop(0, hexToRgba(vibe.neonHighlight, 0.18 + curOverall * 0.26))
    edgeRight.addColorStop(1, "transparent")
    ctx.fillStyle = edgeRight
    ctx.fillRect(W - edgeSideW, 0, edgeSideW, H)

    // ─── 5. Soft Stardust Bokeh Shimmer (Crystalline Highs) ─────────
    const pts = particlesRef.current
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]
      p.y -= p.speedY * dt
      if (p.y < -0.05) p.y = 1.05

      const px = p.x * W + Math.sin(t * 0.4 + p.seed) * 20
      const py = p.y * H
      const pr = p.r * (1 + curTreble * 0.35)
      const pAlpha = (0.06 + curTreble * 0.22) * Math.sin((p.y % 1) * Math.PI)

      if (pAlpha > 0.01) {
        const pGrad = ctx.createRadialGradient(px, py, 0, px, py, pr)
        pGrad.addColorStop(0, hexToRgba(vibe.trebleSparkColor, pAlpha))
        pGrad.addColorStop(1, "transparent")
        ctx.fillStyle = pGrad
        ctx.beginPath()
        ctx.arc(px, py, pr, 0, Math.PI * 2)
        ctx.fill()
      }
    }

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
