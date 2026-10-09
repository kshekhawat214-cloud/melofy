"use client"
import React, { useEffect, useRef, useCallback, useMemo } from "react"
import { usePlayerStore } from "@/store/playerStore"
import { getSongRgbVibe, RgbVibe, hexToRgba } from "@/lib/colors"
import { audioDsp } from "@/lib/audioDsp"

interface Shockwave {
  x: number
  y: number
  radius: number
  maxRadius: number
  opacity: number
  color: string
}

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

  // Asymmetrical audio envelope tracking (fast attack, smooth musical decay)
  const audioRef = useRef({
    bass: 0,
    mid: 0,
    treble: 0,
    overall: 0,
  })

  // Beat transient tracking for kick shockwaves
  const prevBassRef = useRef(0)
  const lastKickTimeRef = useRef(0)
  const shockwavesRef = useRef<Shockwave[]>([])

  // ─── Render Loop: Concert Stage Light Show Engine ─────────────────
  const render = useCallback((timestamp: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d", { alpha: false })
    if (!ctx) return

    const dt = prevFrameTimeRef.current ? Math.min(2.5, (timestamp - prevFrameTimeRef.current) / 16.67) : 1
    prevFrameTimeRef.current = timestamp
    timeRef.current += 0.016 * dt

    const W = canvas.width
    const H = canvas.height
    const t = timeRef.current

    // ─── 1. Asymmetrical Audio Dynamics (Kicks, Vocals, Instruments) ───
    const raw = audioDsp.getReactivityData()
    const a = audioRef.current

    // Snappy attack on transients, smooth velvet decay
    const attack = 0.32
    const decay = 0.12
    a.bass += (raw.bassLevel - a.bass) * (raw.bassLevel > a.bass ? attack : decay)
    a.mid += (raw.midLevel - a.mid) * (raw.midLevel > a.mid ? attack : decay)
    a.treble += (raw.trebleLevel - a.treble) * (raw.trebleLevel > a.treble ? attack : decay)
    a.overall += (raw.overallLevel - a.overall) * (raw.overallLevel > a.overall ? attack : decay)

    // Musical idle breathing if paused or in low-energy section
    const tempo = currentSong?.tempo && currentSong.tempo > 60 && currentSong.tempo < 200 ? currentSong.tempo : 118
    const beatPeriodMs = (60 / tempo) * 1000
    const beatPhase = (timestamp % beatPeriodMs) / beatPeriodMs
    const idlePulse = Math.pow(Math.sin(beatPhase * Math.PI), 2) * 0.18

    const curBass = isPlaying ? Math.max(a.bass, idlePulse * 0.35) : idlePulse * 0.25
    const curMid = isPlaying ? Math.max(a.mid, idlePulse * 0.30) : idlePulse * 0.20
    const curTreble = isPlaying ? Math.max(a.treble, idlePulse * 0.25) : idlePulse * 0.15
    const curOverall = isPlaying ? Math.max(a.overall, idlePulse * 0.32) : idlePulse * 0.22

    // ─── 2. Kick Drum Shockwave Spawning ──────────────────────────────
    const bassDelta = raw.bassLevel - prevBassRef.current
    prevBassRef.current = raw.bassLevel
    const timeSinceLastKick = timestamp - lastKickTimeRef.current

    if (isPlaying && bassDelta > 0.16 && timeSinceLastKick > 220) {
      lastKickTimeRef.current = timestamp
      if (shockwavesRef.current.length < 5) {
        shockwavesRef.current.push({
          x: W * 0.5,
          y: H * 0.40,
          radius: 24,
          maxRadius: Math.max(W, H) * 0.85,
          opacity: 0.85,
          color: vibe.bassShockwaveColor,
        })
      }
    }

    // ─── 3. Full-Bleed Concert Stage Atmosphere (Zero "Dark Space") ────
    ctx.globalCompositeOperation = "source-over"
    
    // Rich deep-stage foundation with velvet color wash
    const baseGrad = ctx.createLinearGradient(0, 0, 0, H)
    baseGrad.addColorStop(0, "#080718")
    baseGrad.addColorStop(0.35, "#0e0926")
    baseGrad.addColorStop(0.70, "#13092b")
    baseGrad.addColorStop(1, "#070614")
    ctx.fillStyle = baseGrad
    ctx.fillRect(0, 0, W, H)

    // Full-screen atmospheric color glow that breathes with track energy
    const atmosGrad = ctx.createRadialGradient(W * 0.5, H * 0.42, 0, W * 0.5, H * 0.5, Math.max(W, H) * 0.75)
    atmosGrad.addColorStop(0, hexToRgba(vibe.primary, 0.22 + curOverall * 0.26))
    atmosGrad.addColorStop(0.45, hexToRgba(vibe.secondary, 0.14 + curMid * 0.18))
    atmosGrad.addColorStop(0.85, hexToRgba(vibe.accent, 0.06 + curBass * 0.12))
    atmosGrad.addColorStop(1, "transparent")
    ctx.fillStyle = atmosGrad
    ctx.fillRect(0, 0, W, H)

    // ─── 4. Volumetric Concert Stage Moving Beams (Concert Moving Heads) ─
    // 6 aerial moving spotlights sweeping across the stage
    ctx.globalCompositeOperation = "screen"

    const beamCount = 6
    const beamOrigins = [0.10, 0.26, 0.42, 0.58, 0.74, 0.90]
    
    for (let i = 0; i < beamCount; i++) {
      const origX = W * beamOrigins[i]
      const origY = -15

      // Harmonic pendulum sweep choreographed across the stage
      const sweepSpeed = 0.55 + (i % 2) * 0.2
      const phaseOffset = i * 1.15
      let sweepAngle = (Math.PI / 2) + Math.sin(t * sweepSpeed + phaseOffset) * 0.36

      // Vocals: Center beams (i=2, i=3) tilt inwards and focus on center stage
      if (i === 2) sweepAngle += 0.18 * curMid
      if (i === 3) sweepAngle -= 0.18 * curMid

      // Length and beam width
      const beamLen = H * 1.35
      const endX = origX + Math.cos(sweepAngle) * beamLen
      const endY = origY + Math.sin(sweepAngle) * beamLen

      // Width expands on kicks and bass drops
      const startWidth = 10 + curTreble * 8
      const endWidth = 100 + curBass * 110 + curMid * 40

      // Normal perpendicular to beam direction
      const perpAngle = sweepAngle + Math.PI / 2
      const cosPerp = Math.cos(perpAngle)
      const sinPerp = Math.sin(perpAngle)

      const p1x = origX - cosPerp * (startWidth * 0.5)
      const p1y = origY - sinPerp * (startWidth * 0.5)
      const p2x = origX + cosPerp * (startWidth * 0.5)
      const p2y = origY + sinPerp * (startWidth * 0.5)
      const p3x = endX + cosPerp * (endWidth * 0.5)
      const p3y = endY + sinPerp * (endWidth * 0.5)
      const p4x = endX - cosPerp * (endWidth * 0.5)
      const p4y = endY - sinPerp * (endWidth * 0.5)

      // Volumetric light beam gradient (radiant core fading to stage floor)
      const beamGrad = ctx.createLinearGradient(origX, origY, endX, endY)
      const beamColor = i % 2 === 0 ? vibe.primary : vibe.secondary
      const coreAlpha = 0.28 + curBass * 0.38 + (i === 2 || i === 3 ? curMid * 0.25 : 0)

      beamGrad.addColorStop(0, hexToRgba(beamColor, coreAlpha))
      beamGrad.addColorStop(0.25, hexToRgba(beamColor, coreAlpha * 0.65))
      beamGrad.addColorStop(0.70, hexToRgba(beamColor, coreAlpha * 0.22))
      beamGrad.addColorStop(1, "transparent")

      ctx.fillStyle = beamGrad
      ctx.beginPath()
      ctx.moveTo(p1x, p1y)
      ctx.lineTo(p2x, p2y)
      ctx.lineTo(p3x, p3y)
      ctx.lineTo(p4x, p4y)
      ctx.closePath()
      ctx.fill()
    }

    // ─── 5. Stage Cross-Fire Lasers (Side Floor Diagonal Sweeps) ──────
    // Left diagonal laser sweep
    const leftLaserAngle = -0.22 + Math.sin(t * 0.8) * 0.18
    const leftLaserLen = W * 1.1
    const lEndX = Math.cos(leftLaserAngle) * leftLaserLen
    const lEndY = H * 0.85 + Math.sin(leftLaserAngle) * leftLaserLen
    const lGrad = ctx.createLinearGradient(0, H * 0.85, lEndX, lEndY)
    lGrad.addColorStop(0, hexToRgba(vibe.neonHighlight, 0.45 + curTreble * 0.45))
    lGrad.addColorStop(0.6, hexToRgba(vibe.primary, 0.15 + curBass * 0.25))
    lGrad.addColorStop(1, "transparent")

    ctx.strokeStyle = lGrad
    ctx.lineWidth = 3 + curBass * 5
    ctx.beginPath()
    ctx.moveTo(0, H * 0.85)
    ctx.lineTo(lEndX, lEndY)
    ctx.stroke()

    // Right diagonal laser sweep
    const rightLaserAngle = Math.PI + 0.22 - Math.sin(t * 0.75 + 1.2) * 0.18
    const rEndX = W + Math.cos(rightLaserAngle) * leftLaserLen
    const rEndY = H * 0.85 + Math.sin(rightLaserAngle) * leftLaserLen
    const rGrad = ctx.createLinearGradient(W, H * 0.85, rEndX, rEndY)
    rGrad.addColorStop(0, hexToRgba(vibe.secondary, 0.45 + curMid * 0.45))
    rGrad.addColorStop(0.6, hexToRgba(vibe.accent, 0.15 + curBass * 0.25))
    rGrad.addColorStop(1, "transparent")

    ctx.strokeStyle = rGrad
    ctx.lineWidth = 3 + curBass * 5
    ctx.beginPath()
    ctx.moveTo(W, H * 0.85)
    ctx.lineTo(rEndX, rEndY)
    ctx.stroke()

    // ─── 6. Multi-Band Fluid Audio Spectrum Ribbons ───────────────────
    // Real-time dynamic ribbons dancing with bass, vocals, and instruments
    const spectrum = audioDsp.getFullSpectrumData()
    const pointsCount = 48
    const stepX = W / (pointsCount - 1)

    // Ribbon 1: Sub-Bass / Kick Energy (Bins 0 to 18, near floor)
    const baseY1 = H * 0.80
    ctx.beginPath()
    ctx.moveTo(0, baseY1)
    for (let i = 0; i < pointsCount; i++) {
      const frac = i / (pointsCount - 1)
      const binIdx = Math.min(18, Math.floor(frac * 18))
      const binAmp = spectrum[binIdx] || 0
      const wave = Math.sin(t * 2.8 + frac * Math.PI * 4) * (20 + curBass * 35)
      const y = baseY1 - (binAmp * 110 * curBass) - wave
      ctx.lineTo(i * stepX, y)
    }
    ctx.lineTo(W, H)
    ctx.lineTo(0, H)
    ctx.closePath()

    const ribbon1Grad = ctx.createLinearGradient(0, baseY1 - 80, 0, H)
    ribbon1Grad.addColorStop(0, hexToRgba(vibe.primary, 0.28 + curBass * 0.35))
    ribbon1Grad.addColorStop(0.5, hexToRgba(vibe.secondary, 0.10 + curBass * 0.15))
    ribbon1Grad.addColorStop(1, "transparent")
    ctx.fillStyle = ribbon1Grad
    ctx.fill()

    // Ribbon 1 Glowing Top Contour Stroke
    ctx.beginPath()
    ctx.moveTo(0, baseY1)
    for (let i = 0; i < pointsCount; i++) {
      const frac = i / (pointsCount - 1)
      const binIdx = Math.min(18, Math.floor(frac * 18))
      const binAmp = spectrum[binIdx] || 0
      const wave = Math.sin(t * 2.8 + frac * Math.PI * 4) * (20 + curBass * 35)
      const y = baseY1 - (binAmp * 110 * curBass) - wave
      ctx.lineTo(i * stepX, y)
    }
    ctx.strokeStyle = hexToRgba(vibe.primary, 0.65 + curBass * 0.35)
    ctx.lineWidth = 2.5 + curBass * 2.5
    ctx.stroke()

    // Ribbon 2: Vocal & Lead Melody Wave (Bins 18 to 44, across middle stage)
    const baseY2 = H * 0.60
    ctx.beginPath()
    ctx.moveTo(0, baseY2)
    for (let i = 0; i < pointsCount; i++) {
      const frac = i / (pointsCount - 1)
      const binIdx = 18 + Math.min(26, Math.floor(frac * 26))
      const binAmp = spectrum[binIdx] || 0
      const wave = Math.sin(t * 3.6 + frac * Math.PI * 5) * (15 + curMid * 28)
      const y = baseY2 - (binAmp * 85 * curMid) - wave
      ctx.lineTo(i * stepX, y)
    }
    ctx.strokeStyle = hexToRgba(vibe.secondary, 0.55 + curMid * 0.40)
    ctx.lineWidth = 2 + curMid * 2
    ctx.stroke()

    // Ribbon 3: Crystalline Treble & Instrument Shimmer (Bins 44 to 63)
    const baseY3 = H * 0.44
    ctx.beginPath()
    ctx.moveTo(0, baseY3)
    for (let i = 0; i < pointsCount; i++) {
      const frac = i / (pointsCount - 1)
      const binIdx = 44 + Math.min(19, Math.floor(frac * 19))
      const binAmp = spectrum[binIdx] || 0
      const wave = Math.sin(t * 5.2 + frac * Math.PI * 7) * (10 + curTreble * 22)
      const y = baseY3 - (binAmp * 65 * curTreble) - wave
      ctx.lineTo(i * stepX, y)
    }
    ctx.strokeStyle = hexToRgba(vibe.neonHighlight, 0.45 + curTreble * 0.45)
    ctx.lineWidth = 1.8 + curTreble * 2
    ctx.stroke()

    // ─── 7. Expanding Beat Shockwave Rings (Bass Drops) ───────────────
    const sws = shockwavesRef.current
    for (let i = sws.length - 1; i >= 0; i--) {
      const sw = sws[i]
      sw.radius += (sw.maxRadius - sw.radius) * 0.08 * dt
      sw.opacity *= Math.pow(0.92, dt)

      if (sw.opacity < 0.02 || sw.radius >= sw.maxRadius * 0.96) {
        sws.splice(i, 1)
        continue
      }

      ctx.beginPath()
      ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2)
      ctx.strokeStyle = hexToRgba(sw.color, sw.opacity)
      ctx.lineWidth = 3 + (1 - sw.radius / sw.maxRadius) * 6
      ctx.stroke()
    }

    // ─── 8. Instrument Laser Needles (Sharp Strobe Streaks on Highs) ───
    if (curTreble > 0.38) {
      const needleCount = Math.floor(curTreble * 3)
      for (let n = 0; n < needleCount; n++) {
        const ny = H * (0.30 + Math.sin(t * 4 + n) * 0.25)
        const nGrad = ctx.createLinearGradient(0, ny, W, ny)
        nGrad.addColorStop(0, "transparent")
        nGrad.addColorStop(0.5, hexToRgba(vibe.trebleSparkColor, curTreble * 0.6))
        nGrad.addColorStop(1, "transparent")

        ctx.strokeStyle = nGrad
        ctx.lineWidth = 1.5 + curTreble * 2
        ctx.beginPath()
        ctx.moveTo(0, ny)
        ctx.lineTo(W, ny)
        ctx.stroke()
      }
    }

    // ─── 9. Stage Perimeter Ambilight (Room Wash) ────────────────────
    ctx.globalCompositeOperation = "source-over"

    // Bottom Subwoofer Floor Wash
    const edgeBottomH = H * 0.25
    const edgeBottom = ctx.createLinearGradient(0, H, 0, H - edgeBottomH)
    edgeBottom.addColorStop(0, hexToRgba(vibe.primary, 0.38 + curBass * 0.45))
    edgeBottom.addColorStop(0.5, hexToRgba(vibe.primary, 0.10 + curBass * 0.15))
    edgeBottom.addColorStop(1, "transparent")
    ctx.fillStyle = edgeBottom
    ctx.fillRect(0, H - edgeBottomH, W, edgeBottomH)

    // Top Ceiling Wash (Vocals & Melody)
    const edgeTopH = H * 0.18
    const edgeTop = ctx.createLinearGradient(0, 0, 0, edgeTopH)
    edgeTop.addColorStop(0, hexToRgba(vibe.secondary, 0.26 + curMid * 0.35))
    edgeTop.addColorStop(1, "transparent")
    ctx.fillStyle = edgeTop
    ctx.fillRect(0, 0, W, edgeTopH)

    // Side Stage Washes
    const edgeSideW = W * 0.12
    const edgeLeft = ctx.createLinearGradient(0, 0, edgeSideW, 0)
    edgeLeft.addColorStop(0, hexToRgba(vibe.accent, 0.16 + curOverall * 0.22))
    edgeLeft.addColorStop(1, "transparent")
    ctx.fillStyle = edgeLeft
    ctx.fillRect(0, 0, edgeSideW, H)

    const edgeRight = ctx.createLinearGradient(W, 0, W - edgeSideW, 0)
    edgeRight.addColorStop(0, hexToRgba(vibe.primary, 0.16 + curOverall * 0.22))
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
