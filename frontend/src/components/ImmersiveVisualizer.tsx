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
    const t = timeRef.current
    const minDim = Math.min(W, H)

    // ─── 1. Asymmetrical Audio Dynamics ──────────────────────────────
    const raw = audioDsp.getReactivityData()
    const a = audioRef.current

    // Snappy attack on kicks/vocals, luxurious velvet decay
    const attack = 0.28
    const decay = 0.10
    a.bass += (raw.bassLevel - a.bass) * (raw.bassLevel > a.bass ? attack : decay)
    a.mid += (raw.midLevel - a.mid) * (raw.midLevel > a.mid ? attack : decay)
    a.treble += (raw.trebleLevel - a.treble) * (raw.trebleLevel > a.treble ? attack : decay)
    a.overall += (raw.overallLevel - a.overall) * (raw.overallLevel > a.overall ? attack : decay)

    // Musical breathing if paused or in quiet passage
    const tempo = currentSong?.tempo && currentSong.tempo > 60 && currentSong.tempo < 200 ? currentSong.tempo : 118
    const beatPeriodMs = (60 / tempo) * 1000
    const beatPhase = (timestamp % beatPeriodMs) / beatPeriodMs
    const idlePulse = Math.pow(Math.sin(beatPhase * Math.PI), 2) * 0.18

    const curBass = isPlaying ? Math.max(a.bass, idlePulse * 0.35) : idlePulse * 0.25
    const curMid = isPlaying ? Math.max(a.mid, idlePulse * 0.30) : idlePulse * 0.20
    const curTreble = isPlaying ? Math.max(a.treble, idlePulse * 0.25) : idlePulse * 0.15
    const curOverall = isPlaying ? Math.max(a.overall, idlePulse * 0.32) : idlePulse * 0.22

    // ─── 2. Deep Velvet Foundation (Zero Dark Void) ───────────────────
    ctx.globalCompositeOperation = "source-over"
    
    // Rich midnight indigo/violet base
    const baseGrad = ctx.createLinearGradient(0, 0, 0, H)
    baseGrad.addColorStop(0, "#070614")
    baseGrad.addColorStop(0.4, "#0c0924")
    baseGrad.addColorStop(0.7, "#12092c")
    baseGrad.addColorStop(1, "#070514")
    ctx.fillStyle = baseGrad
    ctx.fillRect(0, 0, W, H)

    // Warm atmospheric wash across the whole viewport that breathes with music
    const roomWash = ctx.createRadialGradient(W * 0.5, H * 0.45, 0, W * 0.5, H * 0.5, Math.max(W, H) * 0.8)
    roomWash.addColorStop(0, hexToRgba(vibe.primary, 0.24 + curOverall * 0.26))
    roomWash.addColorStop(0.5, hexToRgba(vibe.secondary, 0.16 + curMid * 0.20))
    roomWash.addColorStop(0.85, hexToRgba(vibe.accent, 0.08 + curBass * 0.14))
    roomWash.addColorStop(1, "transparent")
    ctx.fillStyle = roomWash
    ctx.fillRect(0, 0, W, H)

    // ─── 3. Apple Music-Style Morphing Liquid Aurora Nodes ────────────
    // 4 organic, ultra-smooth fluid nodes overlapping seamlessly with additive blending
    ctx.globalCompositeOperation = "screen"

    // NODE 1: Sub-Bass & Kick Core (Lower-Left to Center Groove)
    // Radius swells dramatically on kicks and 808s!
    const n1X = W * (0.34 + Math.sin(t * 0.42) * 0.16)
    const n1Y = H * (0.64 + Math.cos(t * 0.36) * 0.14)
    const n1R = minDim * (0.58 + curBass * 0.52)
    const n1Alpha = 0.42 + curBass * 0.38
    const grad1 = ctx.createRadialGradient(n1X, n1Y, 0, n1X, n1Y, n1R)
    grad1.addColorStop(0, hexToRgba(vibe.primary, n1Alpha))
    grad1.addColorStop(0.35, hexToRgba(vibe.primary, n1Alpha * 0.65))
    grad1.addColorStop(0.70, hexToRgba(vibe.primary, n1Alpha * 0.18))
    grad1.addColorStop(1, "transparent")
    ctx.fillStyle = grad1
    ctx.fillRect(0, 0, W, H)

    // NODE 2: Vocal Presence & Melodic Energy (Upper-Right to Center)
    // Flares with radiant illumination whenever the singer vocalizes!
    const n2X = W * (0.66 + Math.cos(t * 0.48) * 0.15)
    const n2Y = H * (0.36 + Math.sin(t * 0.38) * 0.13)
    const n2R = minDim * (0.54 + curMid * 0.46)
    const n2Alpha = 0.38 + curMid * 0.42
    const grad2 = ctx.createRadialGradient(n2X, n2Y, 0, n2X, n2Y, n2R)
    grad2.addColorStop(0, hexToRgba(vibe.secondary, n2Alpha))
    grad2.addColorStop(0.40, hexToRgba(vibe.secondary, n2Alpha * 0.60))
    grad2.addColorStop(0.75, hexToRgba(vibe.secondary, n2Alpha * 0.16))
    grad2.addColorStop(1, "transparent")
    ctx.fillStyle = grad2
    ctx.fillRect(0, 0, W, H)

    // NODE 3: Harmonic Drift & Ambient Horizon (Top-Left / Center Drift)
    // Connects upper atmosphere with overall musical energy
    const n3X = W * (0.44 + Math.sin(t * 0.32 + 1.8) * 0.18)
    const n3Y = H * (0.28 + Math.cos(t * 0.28 + 1.2) * 0.14)
    const n3R = minDim * (0.56 + curOverall * 0.36)
    const n3Alpha = 0.32 + curOverall * 0.30
    const grad3 = ctx.createRadialGradient(n3X, n3Y, 0, n3X, n3Y, n3R)
    grad3.addColorStop(0, hexToRgba(vibe.accent, n3Alpha))
    grad3.addColorStop(0.45, hexToRgba(vibe.accent, n3Alpha * 0.55))
    grad3.addColorStop(0.80, hexToRgba(vibe.accent, n3Alpha * 0.14))
    grad3.addColorStop(1, "transparent")
    ctx.fillStyle = grad3
    ctx.fillRect(0, 0, W, H)

    // NODE 4: High Frequencies & Sparkling Instrument Atmosphere (Bottom-Right)
    // Shimmers softly with hi-hats, acoustic guitar strings, and synths
    const n4X = W * (0.74 + Math.sin(t * 0.54 + 3.1) * 0.14)
    const n4Y = H * (0.76 + Math.cos(t * 0.44 + 2.5) * 0.12)
    const n4R = minDim * (0.48 + curTreble * 0.38)
    const n4Alpha = 0.28 + curTreble * 0.34
    const grad4 = ctx.createRadialGradient(n4X, n4Y, 0, n4X, n4Y, n4R)
    grad4.addColorStop(0, hexToRgba(vibe.neonHighlight, n4Alpha))
    grad4.addColorStop(0.40, hexToRgba(vibe.neonHighlight, n4Alpha * 0.50))
    grad4.addColorStop(0.75, hexToRgba(vibe.neonHighlight, n4Alpha * 0.12))
    grad4.addColorStop(1, "transparent")
    ctx.fillStyle = grad4
    ctx.fillRect(0, 0, W, H)

    // ─── 4. Fluid Liquid Wave Contours (Soft Ambient Depth) ───────────
    // Undulating organic liquid waves that sweep gently behind the scene
    const wavePoints = 24
    const waveStepX = W / (wavePoints - 1)

    // Wave 1: Bass / Rhythm Floor Contour
    const wave1BaseY = H * 0.72
    ctx.beginPath()
    ctx.moveTo(0, wave1BaseY)
    for (let i = 0; i < wavePoints; i++) {
      const frac = i / (wavePoints - 1)
      const wy = wave1BaseY + Math.sin(t * 1.8 + frac * Math.PI * 3) * (30 + curBass * 40)
      ctx.lineTo(i * waveStepX, wy)
    }
    ctx.lineTo(W, H)
    ctx.lineTo(0, H)
    ctx.closePath()

    const wave1Grad = ctx.createLinearGradient(0, wave1BaseY - 40, 0, H)
    wave1Grad.addColorStop(0, hexToRgba(vibe.primary, 0.18 + curBass * 0.24))
    wave1Grad.addColorStop(0.6, hexToRgba(vibe.secondary, 0.08 + curBass * 0.12))
    wave1Grad.addColorStop(1, "transparent")
    ctx.fillStyle = wave1Grad
    ctx.fill()

    // Wave 2: Melodic Mid Contour (Flowing through mid-stage)
    const wave2BaseY = H * 0.52
    ctx.beginPath()
    ctx.moveTo(0, wave2BaseY)
    for (let i = 0; i < wavePoints; i++) {
      const frac = i / (wavePoints - 1)
      const wy = wave2BaseY + Math.sin(t * 2.4 + frac * Math.PI * 4 + 1.2) * (20 + curMid * 32)
      ctx.lineTo(i * waveStepX, wy)
    }
    ctx.lineTo(W, H)
    ctx.lineTo(0, H)
    ctx.closePath()

    const wave2Grad = ctx.createLinearGradient(0, wave2BaseY - 30, 0, H)
    wave2Grad.addColorStop(0, hexToRgba(vibe.secondary, 0.14 + curMid * 0.20))
    wave2Grad.addColorStop(0.7, hexToRgba(vibe.accent, 0.06 + curMid * 0.10))
    wave2Grad.addColorStop(1, "transparent")
    ctx.fillStyle = wave2Grad
    ctx.fill()

    // ─── 5. Soft Out-Of-Focus Stardust Bokeh (Highs & Air) ────────────
    const pts = stardustRef.current
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]
      p.y -= p.speedY * dt
      if (p.y < -0.05) p.y = 1.05

      const px = p.x * W + Math.sin(t * 0.35 + p.seed) * 25
      const py = p.y * H
      const pr = p.r * (1 + curTreble * 0.35)
      const pAlpha = (0.05 + curTreble * 0.20) * Math.sin((p.y % 1) * Math.PI)

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

    // ─── 6. Room-Wash Edge Ambilight ──────────────────────────────────
    ctx.globalCompositeOperation = "source-over"

    // Floor Subwoofer Glow
    const edgeBottomH = H * 0.22
    const edgeBottom = ctx.createLinearGradient(0, H, 0, H - edgeBottomH)
    edgeBottom.addColorStop(0, hexToRgba(vibe.primary, 0.32 + curBass * 0.40))
    edgeBottom.addColorStop(0.6, hexToRgba(vibe.primary, 0.08 + curBass * 0.12))
    edgeBottom.addColorStop(1, "transparent")
    ctx.fillStyle = edgeBottom
    ctx.fillRect(0, H - edgeBottomH, W, edgeBottomH)

    // Ceiling Vocal Wash
    const edgeTopH = H * 0.16
    const edgeTop = ctx.createLinearGradient(0, 0, 0, edgeTopH)
    edgeTop.addColorStop(0, hexToRgba(vibe.secondary, 0.22 + curMid * 0.30))
    edgeTop.addColorStop(1, "transparent")
    ctx.fillStyle = edgeTop
    ctx.fillRect(0, 0, W, edgeTopH)

    // Lateral Wall Reflections
    const edgeSideW = W * 0.10
    const edgeLeft = ctx.createLinearGradient(0, 0, edgeSideW, 0)
    edgeLeft.addColorStop(0, hexToRgba(vibe.accent, 0.14 + curOverall * 0.18))
    edgeLeft.addColorStop(1, "transparent")
    ctx.fillStyle = edgeLeft
    ctx.fillRect(0, 0, edgeSideW, H)

    const edgeRight = ctx.createLinearGradient(W, 0, W - edgeSideW, 0)
    edgeRight.addColorStop(0, hexToRgba(vibe.primary, 0.14 + curOverall * 0.18))
    edgeRight.addColorStop(1, "transparent")
    ctx.fillStyle = edgeRight
    ctx.fillRect(W - edgeSideW, 0, edgeSideW, H)

    animRef.current = requestAnimationFrame(render)
  }, [vibe, isPlaying, currentSong?.tempo])

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
