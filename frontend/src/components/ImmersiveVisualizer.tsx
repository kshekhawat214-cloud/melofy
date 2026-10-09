"use client"
import React, { useEffect, useRef, useCallback, useMemo, useState } from "react"
import { usePlayerStore } from "@/store/playerStore"
import { getSongRgbVibe, RGB_VIBE_PRESETS, RgbVibe } from "@/lib/colors"
import { audioDsp } from "@/lib/audioDsp"

// ─── Particle Structure ─────────────────────────────────────────
interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  life: number
  maxLife: number
  color: string
  alpha: number
  type: "spark" | "glow" | "ember" | "starlight"
}

// ─── Volumetric Concert Spotlight Beam ──────────────────────────
interface SpotlightBeam {
  originXRatio: number
  angleOffset: number
  sweepSpeed: number
  beamWidth: number
  colorIndex: number
  lengthRatio: number
}

// ─── Shockwave Ring ─────────────────────────────────────────────
interface Shockwave {
  x: number
  y: number
  radius: number
  maxRadius: number
  color: string
  alpha: number
  lineWidth: number
}

export default function ImmersiveVisualizer() {
  const currentSong = usePlayerStore((s) => s.currentSong)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const isImmersiveOpen = usePlayerStore((s) => s.isImmersiveVisualizerOpen)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const animRef = useRef<number | null>(null)
  const particlesRef = useRef<Particle[]>([])
  const shockwavesRef = useRef<Shockwave[]>([])
  const timeRef = useRef(0)
  const prevFrameTimeRef = useRef(0)

  // Track & Vibe
  const autoVibe = useMemo(() => {
    return getSongRgbVibe(
      currentSong?.title,
      currentSong?.artist,
      currentSong?.genre,
      currentSong?.energy
    )
  }, [currentSong?.id, currentSong?.title, currentSong?.artist, currentSong?.genre, currentSong?.energy])

  // Optional manual vibe override
  const [selectedVibeKey, setSelectedVibeKey] = useState<string>("auto")
  const activeVibe: RgbVibe = useMemo(() => {
    if (selectedVibeKey !== "auto" && RGB_VIBE_PRESETS[selectedVibeKey]) {
      return RGB_VIBE_PRESETS[selectedVibeKey]
    }
    return autoVibe
  }, [selectedVibeKey, autoVibe])

  // Smoothed audio buffers
  const audioRef = useRef({
    bass: 0,
    mid: 0,
    treble: 0,
    overall: 0,
    bassPeak: 0,
    bassCooldown: 0,
  })

  // ─── Spotlights Configuration ─────────────────────────────────
  const spotlights = useMemo<SpotlightBeam[]>(() => [
    { originXRatio: 0.15, angleOffset: 0.35, sweepSpeed: 0.8, beamWidth: 140, colorIndex: 0, lengthRatio: 1.1 },
    { originXRatio: 0.35, angleOffset: -0.25, sweepSpeed: -0.6, beamWidth: 110, colorIndex: 1, lengthRatio: 1.0 },
    { originXRatio: 0.65, angleOffset: 0.20, sweepSpeed: 0.7, beamWidth: 120, colorIndex: 2, lengthRatio: 1.0 },
    { originXRatio: 0.85, angleOffset: -0.40, sweepSpeed: -0.85, beamWidth: 150, colorIndex: 3, lengthRatio: 1.1 },
  ], [])

  // ─── Particle Spawner ─────────────────────────────────────────
  const spawnParticles = useCallback((
    w: number,
    h: number,
    bass: number,
    mid: number,
    treble: number,
    vibe: RgbVibe
  ) => {
    const particles = particlesRef.current
    const maxParticles = 240
    const palette = vibe.rgbPalette

    // 1. Bass kick burst
    if (bass > 0.2 && particles.length < maxParticles) {
      const count = Math.min(6, Math.floor(bass * 8))
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2
        const speed = (2 + Math.random() * 6) * bass
        particles.push({
          x: w * 0.5 + Math.cos(angle) * 30,
          y: h * 0.45 + Math.sin(angle) * 30,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          radius: 2 + Math.random() * 5 * bass,
          life: 0,
          maxLife: 60 + Math.random() * 80,
          color: palette[Math.floor(Math.random() * palette.length)],
          alpha: 0.7 + bass * 0.3,
          type: vibe.particleType === "embers" ? "ember" : "spark",
        })
      }
    }

    // 2. Treble perimeter sparks
    if (treble > 0.15 && particles.length < maxParticles) {
      const count = Math.floor(treble * 5)
      for (let i = 0; i < count; i++) {
        const fromLeft = Math.random() > 0.5
        particles.push({
          x: fromLeft ? 0 : w,
          y: Math.random() * h * 0.8,
          vx: (fromLeft ? 1 : -1) * (1.5 + Math.random() * 4 * treble),
          vy: (Math.random() - 0.5) * 2,
          radius: 1 + Math.random() * 2.5,
          life: 0,
          maxLife: 50 + Math.random() * 60,
          color: vibe.trebleSparkColor,
          alpha: 0.6 + treble * 0.4,
          type: "spark",
        })
      }
    }

    // 3. Ambient floating embers / starlight
    if (Math.random() < 0.25 && particles.length < maxParticles) {
      particles.push({
        x: Math.random() * w,
        y: h + 10,
        vx: (Math.random() - 0.5) * 0.8,
        vy: -(0.5 + Math.random() * 1.5 * (1 + mid)),
        radius: 1.5 + Math.random() * 3,
        life: 0,
        maxLife: 150 + Math.random() * 150,
        color: palette[Math.floor(Math.random() * palette.length)],
        alpha: 0.4 + mid * 0.4,
        type: "glow",
      })
    }
  }, [])

  // ─── Render Loop ──────────────────────────────────────────────
  const render = useCallback((timestamp: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d", { alpha: false })
    if (!ctx) return

    const dt = prevFrameTimeRef.current ? (timestamp - prevFrameTimeRef.current) / 16.67 : 1
    prevFrameTimeRef.current = timestamp
    timeRef.current += 0.016 * dt

    const W = canvas.width
    const H = canvas.height
    const t = timeRef.current
    const vibe = activeVibe

    // ─── Audio Dynamics ─────────────────────────────────────────
    const raw = audioDsp.getReactivityData()
    const a = audioRef.current
    const lerp = 0.16
    a.bass += (raw.bassLevel - a.bass) * lerp
    a.mid += (raw.midLevel - a.mid) * (lerp * 0.85)
    a.treble += (raw.trebleLevel - a.treble) * lerp
    a.overall += (raw.overallLevel - a.overall) * lerp

    // BPM Beat Fallback if quiet/paused
    const energy = currentSong?.energy ?? 0.75
    const tempo = currentSong?.tempo && currentSong.tempo > 60 ? currentSong.tempo : 120
    const beatPhase = (timestamp % ((60 / tempo) * 1000)) / ((60 / tempo) * 1000)
    const beatPulse = Math.pow(Math.sin(beatPhase * Math.PI), 2.4) * 0.35 * energy

    const effectiveBass = isPlaying ? (a.bass > 0.02 ? a.bass : beatPulse) : beatPulse * 0.3
    const effectiveMid = isPlaying ? (a.mid > 0.02 ? a.mid : beatPulse * 0.6) : beatPulse * 0.2
    const effectiveTreble = isPlaying ? (a.treble > 0.02 ? a.treble : beatPulse * 0.4) : beatPulse * 0.15
    const effectiveOverall = isPlaying ? (a.overall > 0.02 ? a.overall : beatPulse * 0.7) : beatPulse * 0.25

    // Bass Kick Transient & Shockwave Trigger
    if (a.bassCooldown > 0) a.bassCooldown -= dt
    const isBassHit = effectiveBass > a.bassPeak * 0.85 && effectiveBass > 0.24 && a.bassCooldown <= 0
    if (isBassHit) {
      a.bassCooldown = 10
      // Spawn Shockwave
      if (shockwavesRef.current.length < 5) {
        shockwavesRef.current.push({
          x: W * 0.5,
          y: H * 0.45,
          radius: 20,
          maxRadius: Math.max(W, H) * 0.75,
          color: vibe.bassShockwaveColor,
          alpha: 0.6 + effectiveBass * 0.4,
          lineWidth: 4 + effectiveBass * 6,
        })
      }
    }
    a.bassPeak = Math.max(a.bassPeak * 0.995, effectiveBass)

    // ─── 1. Deep Void Canvas Background ─────────────────────────
    ctx.fillStyle = "#050508"
    ctx.fillRect(0, 0, W, H)

    // ─── 2. Multi-Zone Perimeter RGB Ambilight Beams (Canvas) ───
    // Bottom Woofer Beam
    const bottomGrad = ctx.createLinearGradient(0, H, 0, H - 240)
    bottomGrad.addColorStop(0, vibe.bassShockwaveColor)
    bottomGrad.addColorStop(0.4, `${vibe.primary}88`)
    bottomGrad.addColorStop(1, "transparent")
    ctx.fillStyle = bottomGrad
    ctx.globalAlpha = 0.4 + effectiveBass * 0.55
    ctx.fillRect(0, H - 240, W, 240)

    // Top Vocal Horizon
    const topGrad = ctx.createLinearGradient(0, 0, 0, 180)
    topGrad.addColorStop(0, vibe.secondary)
    topGrad.addColorStop(0.5, `${vibe.vocalAuraColor}66`)
    topGrad.addColorStop(1, "transparent")
    ctx.fillStyle = topGrad
    ctx.globalAlpha = 0.35 + effectiveMid * 0.45
    ctx.fillRect(0, 0, W, 180)

    // Left & Right Stereo Edge Flares
    const leftGrad = ctx.createLinearGradient(0, 0, 150, 0)
    leftGrad.addColorStop(0, vibe.primary)
    leftGrad.addColorStop(1, "transparent")
    ctx.fillStyle = leftGrad
    ctx.globalAlpha = 0.3 + effectiveTreble * 0.4
    ctx.fillRect(0, 0, 150, H)

    const rightGrad = ctx.createLinearGradient(W, 0, W - 150, 0)
    rightGrad.addColorStop(0, vibe.neonHighlight)
    rightGrad.addColorStop(1, "transparent")
    ctx.fillStyle = rightGrad
    ctx.globalAlpha = 0.3 + effectiveTreble * 0.4
    ctx.fillRect(W - 150, 0, 150, H)
    ctx.globalAlpha = 1.0

    // ─── 3. Volumetric Concert Spotlights (Crisscrossing Beams) ──
    for (const beam of spotlights) {
      const originX = W * beam.originXRatio
      const originY = 0
      const currentAngle = Math.PI * 0.5 + Math.sin(t * beam.sweepSpeed + beam.angleOffset) * 0.45
      const beamLength = H * beam.lengthRatio * (1 + effectiveOverall * 0.2)
      const targetX = originX + Math.cos(currentAngle) * beamLength
      const targetY = originY + Math.sin(currentAngle) * beamLength

      const beamW = beam.beamWidth * (1 + effectiveMid * 0.6)
      const perpAngle = currentAngle + Math.PI * 0.5
      const p1x = targetX - Math.cos(perpAngle) * beamW * 0.5
      const p1y = targetY - Math.sin(perpAngle) * beamW * 0.5
      const p2x = targetX + Math.cos(perpAngle) * beamW * 0.5
      const p2y = targetY + Math.sin(perpAngle) * beamW * 0.5

      const beamColor = vibe.rgbPalette[beam.colorIndex % vibe.rgbPalette.length]
      const beamGrad = ctx.createLinearGradient(originX, originY, targetX, targetY)
      beamGrad.addColorStop(0, `${beamColor}55`)
      beamGrad.addColorStop(0.3, `${beamColor}33`)
      beamGrad.addColorStop(0.7, `${beamColor}11`)
      beamGrad.addColorStop(1, "transparent")

      ctx.beginPath()
      ctx.moveTo(originX - 10, originY)
      ctx.lineTo(originX + 10, originY)
      ctx.lineTo(p2x, p2y)
      ctx.lineTo(p1x, p1y)
      ctx.closePath()
      ctx.fillStyle = beamGrad
      ctx.globalAlpha = 0.4 + effectiveMid * 0.5
      ctx.fill()
    }
    ctx.globalAlpha = 1.0

    // ─── 4. Dynamic Shockwave Rings (Bass Kick Dispersion) ──────
    for (let i = shockwavesRef.current.length - 1; i >= 0; i--) {
      const sw = shockwavesRef.current[i]
      sw.radius += 12 * dt * (1 + effectiveBass)
      sw.alpha *= 0.95

      if (sw.radius >= sw.maxRadius || sw.alpha < 0.02) {
        shockwavesRef.current.splice(i, 1)
        continue
      }

      ctx.save()
      ctx.beginPath()
      ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2)
      ctx.strokeStyle = sw.color
      ctx.lineWidth = sw.lineWidth * (sw.alpha)
      ctx.globalAlpha = sw.alpha
      ctx.shadowColor = sw.color
      ctx.shadowBlur = 25
      ctx.stroke()

      // RGB Chromatic Aberration Fringe Ring
      ctx.beginPath()
      ctx.arc(sw.x, sw.y, sw.radius * 1.02, 0, Math.PI * 2)
      ctx.strokeStyle = vibe.neonHighlight
      ctx.lineWidth = sw.lineWidth * 0.5 * sw.alpha
      ctx.globalAlpha = sw.alpha * 0.6
      ctx.stroke()
      ctx.restore()
    }

    // ─── 5. Central Reactive RGB Frequency Core ─────────────────
    const coreX = W * 0.5 + Math.sin(t * 0.4) * 20
    const coreY = H * 0.45 + Math.cos(t * 0.3) * 15
    const coreRadius = 70 + effectiveBass * 120 + effectiveOverall * 50

    const coreGrad = ctx.createRadialGradient(coreX, coreY, 0, coreX, coreY, coreRadius)
    coreGrad.addColorStop(0, `${vibe.primary}aa`)
    coreGrad.addColorStop(0.4, `${vibe.secondary}66`)
    coreGrad.addColorStop(0.7, `${vibe.neonHighlight}33`)
    coreGrad.addColorStop(1, "transparent")

    ctx.beginPath()
    ctx.arc(coreX, coreY, coreRadius, 0, Math.PI * 2)
    ctx.fillStyle = coreGrad
    ctx.fill()

    // ─── 6. Circular 64-Segment Audio Equalizer Ring ────────────
    const ringRadius = 85 + effectiveBass * 40
    const ringSegments = 64
    ctx.lineWidth = 2.5
    for (let i = 0; i < ringSegments; i++) {
      const angle = (i / ringSegments) * Math.PI * 2 - Math.PI * 0.5
      const segFactor =
        i < ringSegments * 0.33 ? effectiveBass : i < ringSegments * 0.66 ? effectiveMid : effectiveTreble
      const barLength = segFactor * 90 + Math.sin(angle * 4 + t * 3) * 8
      const innerX = coreX + Math.cos(angle) * ringRadius
      const innerY = coreY + Math.sin(angle) * ringRadius
      const outerX = coreX + Math.cos(angle) * (ringRadius + barLength)
      const outerY = coreY + Math.sin(angle) * (ringRadius + barLength)

      const colorIdx = Math.floor((i / ringSegments) * vibe.rgbPalette.length)
      const barColor = vibe.rgbPalette[colorIdx % vibe.rgbPalette.length]

      ctx.beginPath()
      ctx.moveTo(innerX, innerY)
      ctx.lineTo(outerX, outerY)
      ctx.strokeStyle = barColor
      ctx.globalAlpha = 0.4 + segFactor * 0.6
      ctx.stroke()
    }
    ctx.globalAlpha = 1.0

    // ─── 7. Particle Dynamics ───────────────────────────────────
    if (isPlaying) {
      spawnParticles(W, H, effectiveBass, effectiveMid, effectiveTreble, vibe)
    }

    const particles = particlesRef.current
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]
      p.life += dt
      if (p.life >= p.maxLife) {
        particles.splice(i, 1)
        continue
      }

      p.x += p.vx * dt
      p.y += p.vy * dt
      p.vy += p.type === "ember" ? -0.02 * dt : 0.01 * dt

      const lifeProgress = p.life / p.maxLife
      const fade = lifeProgress < 0.2 ? lifeProgress / 0.2 : 1 - (lifeProgress - 0.2) / 0.8
      const curAlpha = p.alpha * fade

      ctx.beginPath()
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2)
      ctx.fillStyle = p.color
      ctx.globalAlpha = curAlpha
      ctx.shadowColor = p.color
      ctx.shadowBlur = 10
      ctx.fill()
    }
    ctx.globalAlpha = 1.0

    animRef.current = requestAnimationFrame(render)
  }, [activeVibe, isPlaying, spawnParticles, spotlights, currentSong?.energy, currentSong?.tempo])

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

  // ─── Animation Loop Mount ─────────────────────────────────────
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
