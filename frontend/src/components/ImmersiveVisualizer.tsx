"use client"
import React, { useEffect, useRef, useCallback, useMemo } from "react"
import { usePlayerStore } from "@/store/playerStore"
import { getSongMoodColor } from "@/lib/colors"
import { audioDsp } from "@/lib/audioDsp"

// ─── Particle System ──────────────────────────────────────────
interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  life: number
  maxLife: number
  hue: number
  sat: number
  light: number
  alpha: number
  type: "glow" | "spark" | "nebula"
}

// ─── Aurora Wave ──────────────────────────────────────────────
interface AuroraWave {
  offset: number
  amplitude: number
  frequency: number
  speed: number
  hue: number
  alpha: number
  thickness: number
}

// ─── Helper: Parse hex color to HSL ───────────────────────────
function hexToHSL(hex: string): { h: number; s: number; l: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!result) return { h: 200, s: 70, l: 50 }
  const r = parseInt(result[1], 16) / 255
  const g = parseInt(result[2], 16) / 255
  const b = parseInt(result[3], 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  const l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
      case g: h = ((b - r) / d + 2) / 6; break
      case b: h = ((r - g) / d + 4) / 6; break
    }
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) }
}

// ─── Smoothed Audio State ─────────────────────────────────────
interface SmoothedAudio {
  bass: number
  mid: number
  treble: number
  overall: number
  bassSmooth: number
  midSmooth: number
  trebleSmooth: number
  overallSmooth: number
  peakBass: number
  bassHitCooldown: number
}

export default function ImmersiveVisualizer() {
  const currentSong = usePlayerStore((s) => s.currentSong)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const isImmersiveOpen = usePlayerStore((s) => s.isImmersiveVisualizerOpen)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const animRef = useRef<number | null>(null)
  const particlesRef = useRef<Particle[]>([])
  const audioRef = useRef<SmoothedAudio>({
    bass: 0, mid: 0, treble: 0, overall: 0,
    bassSmooth: 0, midSmooth: 0, trebleSmooth: 0, overallSmooth: 0,
    peakBass: 0, bassHitCooldown: 0,
  })
  const timeRef = useRef(0)
  const prevFrameTimeRef = useRef(0)

  const mood = useMemo(() => {
    return getSongMoodColor(currentSong?.title || currentSong?.genre || "pop")
  }, [currentSong?.id, currentSong?.title, currentSong?.genre])

  const hslPrimary = useMemo(() => hexToHSL(mood.primary), [mood.primary])
  const hslSecondary = useMemo(() => hexToHSL(mood.secondary), [mood.secondary])
  const hslAccent = useMemo(() => hexToHSL(mood.accent), [mood.accent])

  // ─── Aurora Waves (pre-computed for this mood) ────────────────
  const auroraWaves = useMemo<AuroraWave[]>(() => [
    { offset: 0, amplitude: 80, frequency: 0.003, speed: 0.4, hue: hslPrimary.h, alpha: 0.15, thickness: 120 },
    { offset: 150, amplitude: 60, frequency: 0.004, speed: -0.3, hue: hslSecondary.h, alpha: 0.12, thickness: 90 },
    { offset: 280, amplitude: 100, frequency: 0.002, speed: 0.25, hue: hslAccent.h, alpha: 0.10, thickness: 140 },
    { offset: 400, amplitude: 50, frequency: 0.005, speed: -0.45, hue: (hslPrimary.h + 40) % 360, alpha: 0.08, thickness: 70 },
  ], [hslPrimary.h, hslSecondary.h, hslAccent.h])

  // ─── Spawn Particles ────────────────────────────────────────
  const spawnParticles = useCallback((
    w: number, h: number, bass: number, mid: number, treble: number, overall: number
  ) => {
    const particles = particlesRef.current
    const maxParticles = 300

    // Bass-driven glow particles burst upward
    if (bass > 0.15 && particles.length < maxParticles) {
      const count = Math.floor(bass * 6)
      for (let i = 0; i < count; i++) {
        particles.push({
          x: Math.random() * w,
          y: h + 20,
          vx: (Math.random() - 0.5) * 3 * bass,
          vy: -(2 + Math.random() * 4 * bass),
          radius: 2 + Math.random() * 5 * bass,
          life: 0,
          maxLife: 80 + Math.random() * 120,
          hue: hslPrimary.h + (Math.random() - 0.5) * 40,
          sat: 70 + Math.random() * 30,
          light: 50 + Math.random() * 20,
          alpha: 0.5 + bass * 0.5,
          type: "glow",
        })
      }
    }

    // Treble sparks — small, fast, diagonal
    if (treble > 0.12 && particles.length < maxParticles) {
      const count = Math.floor(treble * 4)
      for (let i = 0; i < count; i++) {
        const side = Math.random() > 0.5
        particles.push({
          x: side ? -5 : w + 5,
          y: Math.random() * h * 0.6,
          vx: (side ? 1 : -1) * (1 + Math.random() * 3 * treble),
          vy: (Math.random() - 0.3) * 2,
          radius: 1 + Math.random() * 2,
          life: 0,
          maxLife: 60 + Math.random() * 80,
          hue: hslAccent.h + (Math.random() - 0.5) * 30,
          sat: 80,
          light: 60 + Math.random() * 30,
          alpha: 0.4 + treble * 0.4,
          type: "spark",
        })
      }
    }

    // Mid-range nebula clouds — slow, large, ambient
    if (mid > 0.1 && Math.random() < mid * 0.3 && particles.length < maxParticles) {
      particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.3,
        radius: 30 + Math.random() * 60 * mid,
        life: 0,
        maxLife: 200 + Math.random() * 200,
        hue: hslSecondary.h + (Math.random() - 0.5) * 50,
        sat: 50 + Math.random() * 30,
        light: 40 + Math.random() * 20,
        alpha: 0.06 + mid * 0.08,
        type: "nebula",
      })
    }
  }, [hslPrimary.h, hslSecondary.h, hslAccent.h])

  // ─── Main Render Loop ───────────────────────────────────────
  const render = useCallback((timestamp: number) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d", { alpha: false })
    if (!ctx) return

    // Delta time
    const dt = prevFrameTimeRef.current ? (timestamp - prevFrameTimeRef.current) / 16.67 : 1
    prevFrameTimeRef.current = timestamp
    timeRef.current += 0.016 * dt

    const W = canvas.width
    const H = canvas.height
    const t = timeRef.current

    // ─── Read Audio Reactivity ──────────────────────────
    const raw = audioDsp.getReactivityData()
    const a = audioRef.current
    const lerpFactor = 0.15
    a.bassSmooth += (raw.bassLevel - a.bassSmooth) * lerpFactor
    a.midSmooth += (raw.midLevel - a.midSmooth) * lerpFactor * 0.8
    a.trebleSmooth += (raw.trebleLevel - a.trebleSmooth) * lerpFactor
    a.overallSmooth += (raw.overallLevel - a.overallSmooth) * lerpFactor
    a.bass = a.bassSmooth
    a.mid = a.midSmooth
    a.treble = a.trebleSmooth
    a.overall = a.overallSmooth

    // Bass kick detection (peak detection with cooldown)
    if (a.bassHitCooldown > 0) a.bassHitCooldown -= dt
    const isBassHit = a.bass > a.peakBass * 0.85 && a.bass > 0.25 && a.bassHitCooldown <= 0
    if (isBassHit) {
      a.bassHitCooldown = 8 // frames cooldown
    }
    a.peakBass = Math.max(a.peakBass * 0.995, a.bass)

    // If paused, use synthesized gentle breathing
    const energy = currentSong?.energy ?? 0.7
    const tempo = currentSong?.tempo && currentSong.tempo > 60 ? currentSong.tempo : 120
    const beatPhase = (timestamp % ((60 / tempo) * 1000)) / ((60 / tempo) * 1000)
    const synthPulse = Math.pow(Math.sin(beatPhase * Math.PI), 2.5) * 0.3 * energy

    const effectiveBass = isPlaying ? (a.bass > 0.02 ? a.bass : synthPulse) : synthPulse * 0.3
    const effectiveMid = isPlaying ? (a.mid > 0.02 ? a.mid : synthPulse * 0.5) : synthPulse * 0.2
    const effectiveTreble = isPlaying ? (a.treble > 0.02 ? a.treble : synthPulse * 0.3) : synthPulse * 0.15
    const effectiveOverall = isPlaying ? (a.overall > 0.02 ? a.overall : synthPulse * 0.6) : synthPulse * 0.25

    // ─── Background: Deep Gradient with Color Breathing ──
    const bgHue = hslPrimary.h + Math.sin(t * 0.1) * 10
    const bgSat = 15 + effectiveOverall * 20
    const bgLight = 3 + effectiveBass * 5
    const grad = ctx.createRadialGradient(W * 0.5, H * 0.4, 0, W * 0.5, H * 0.5, W * 0.8)
    grad.addColorStop(0, `hsl(${bgHue}, ${bgSat}%, ${bgLight + 4}%)`)
    grad.addColorStop(0.5, `hsl(${bgHue + 20}, ${bgSat * 0.7}%, ${bgLight + 1}%)`)
    grad.addColorStop(1, `hsl(${bgHue}, ${bgSat * 0.3}%, ${Math.max(1, bgLight - 2)}%)`)
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, W, H)

    // ─── Bass Kick Shockwave Ring ───────────────────────
    if (isBassHit) {
      const cx = W * 0.5
      const cy = H * 0.5
      const maxR = Math.max(W, H) * 0.6
      for (let ring = 0; ring < 3; ring++) {
        const ringR = maxR * (0.15 + ring * 0.12)
        const ringAlpha = (0.15 - ring * 0.04) * effectiveBass
        ctx.beginPath()
        ctx.arc(cx, cy, ringR, 0, Math.PI * 2)
        ctx.strokeStyle = `hsla(${hslPrimary.h}, 80%, 60%, ${ringAlpha})`
        ctx.lineWidth = 3 - ring * 0.5
        ctx.stroke()
      }
    }

    // ─── Aurora Waves ───────────────────────────────────
    for (const wave of auroraWaves) {
      const waveAmplitude = wave.amplitude * (1 + effectiveBass * 1.5)
      const waveAlpha = wave.alpha * (0.6 + effectiveOverall * 1.2)
      const gradient = ctx.createLinearGradient(0, 0, 0, H)
      gradient.addColorStop(0, `hsla(${wave.hue}, 70%, 50%, 0)`)
      gradient.addColorStop(0.3, `hsla(${wave.hue}, 70%, 50%, ${waveAlpha})`)
      gradient.addColorStop(0.7, `hsla(${(wave.hue + 30) % 360}, 60%, 40%, ${waveAlpha * 0.6})`)
      gradient.addColorStop(1, `hsla(${wave.hue}, 70%, 50%, 0)`)

      ctx.beginPath()
      const yBase = wave.offset + H * 0.15
      ctx.moveTo(-10, yBase)

      for (let x = -10; x <= W + 10; x += 4) {
        const y = yBase +
          Math.sin(x * wave.frequency + t * wave.speed) * waveAmplitude +
          Math.sin(x * wave.frequency * 2.3 + t * wave.speed * 1.7) * waveAmplitude * 0.3 * effectiveMid +
          Math.cos(x * wave.frequency * 0.7 + t * wave.speed * 0.4) * waveAmplitude * 0.2
        ctx.lineTo(x, y)
      }

      ctx.lineTo(W + 10, H + 10)
      ctx.lineTo(-10, H + 10)
      ctx.closePath()
      ctx.fillStyle = gradient
      ctx.fill()
    }

    // ─── Central Frequency Orb ──────────────────────────
    const orbRadius = 60 + effectiveBass * 100 + effectiveOverall * 40
    const orbX = W * 0.5 + Math.sin(t * 0.3) * 30
    const orbY = H * 0.45 + Math.cos(t * 0.2) * 20
    const orbGrad = ctx.createRadialGradient(orbX, orbY, 0, orbX, orbY, orbRadius)
    const orbAlpha = 0.15 + effectiveOverall * 0.25
    orbGrad.addColorStop(0, `hsla(${hslPrimary.h}, 80%, 60%, ${orbAlpha * 1.5})`)
    orbGrad.addColorStop(0.4, `hsla(${hslSecondary.h}, 70%, 50%, ${orbAlpha})`)
    orbGrad.addColorStop(0.8, `hsla(${hslAccent.h}, 60%, 40%, ${orbAlpha * 0.4})`)
    orbGrad.addColorStop(1, `hsla(${hslPrimary.h}, 50%, 30%, 0)`)
    ctx.beginPath()
    ctx.arc(orbX, orbY, orbRadius, 0, Math.PI * 2)
    ctx.fillStyle = orbGrad
    ctx.fill()

    // ─── Frequency Ring (Circular Spectrum) ─────────────
    const ringRadius = 80 + effectiveBass * 60
    const ringSegments = 64
    ctx.lineWidth = 2
    for (let i = 0; i < ringSegments; i++) {
      const angle = (i / ringSegments) * Math.PI * 2 - Math.PI * 0.5
      // Mix bass/mid/treble across the ring
      const segFactor = i < ringSegments * 0.33 ? effectiveBass
        : i < ringSegments * 0.66 ? effectiveMid
        : effectiveTreble
      const extRadius = ringRadius + segFactor * 80 + Math.sin(angle * 3 + t * 2) * 8
      const innerX = orbX + Math.cos(angle) * ringRadius
      const innerY = orbY + Math.sin(angle) * ringRadius
      const outerX = orbX + Math.cos(angle) * extRadius
      const outerY = orbY + Math.sin(angle) * extRadius

      const segHue = hslPrimary.h + (i / ringSegments) * 60
      const segAlpha = 0.3 + segFactor * 0.7
      ctx.beginPath()
      ctx.moveTo(innerX, innerY)
      ctx.lineTo(outerX, outerY)
      ctx.strokeStyle = `hsla(${segHue}, 80%, 55%, ${segAlpha})`
      ctx.stroke()
    }

    // ─── Spawn & Update Particles ───────────────────────
    if (isPlaying) {
      spawnParticles(W, H, effectiveBass, effectiveMid, effectiveTreble, effectiveOverall)
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

      // Gravity-like deceleration for glow particles
      if (p.type === "glow") {
        p.vy += 0.02 * dt
        p.vx *= 0.998
      }

      const lifeRatio = p.life / p.maxLife
      // Smooth fade: in for first 15%, out for last 30%
      const fadeIn = Math.min(1, lifeRatio / 0.15)
      const fadeOut = lifeRatio > 0.7 ? 1 - (lifeRatio - 0.7) / 0.3 : 1
      const currentAlpha = p.alpha * fadeIn * fadeOut

      if (p.type === "nebula") {
        // Large soft radial glow
        const nebGrad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius)
        nebGrad.addColorStop(0, `hsla(${p.hue}, ${p.sat}%, ${p.light}%, ${currentAlpha})`)
        nebGrad.addColorStop(1, `hsla(${p.hue}, ${p.sat}%, ${p.light}%, 0)`)
        ctx.fillStyle = nebGrad
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2)
        ctx.fill()
      } else if (p.type === "spark") {
        ctx.fillStyle = `hsla(${p.hue}, ${p.sat}%, ${p.light}%, ${currentAlpha})`
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2)
        ctx.fill()
      } else {
        // Glow particle with soft bloom
        const glowGrad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius * 3)
        glowGrad.addColorStop(0, `hsla(${p.hue}, ${p.sat}%, ${p.light}%, ${currentAlpha})`)
        glowGrad.addColorStop(0.5, `hsla(${p.hue}, ${p.sat}%, ${p.light}%, ${currentAlpha * 0.3})`)
        glowGrad.addColorStop(1, `hsla(${p.hue}, ${p.sat}%, ${p.light}%, 0)`)
        ctx.fillStyle = glowGrad
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.radius * 3, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    // ─── Vignette Overlay ───────────────────────────────
    const vigGrad = ctx.createRadialGradient(W * 0.5, H * 0.5, W * 0.25, W * 0.5, H * 0.5, W * 0.85)
    vigGrad.addColorStop(0, "rgba(0,0,0,0)")
    vigGrad.addColorStop(1, "rgba(0,0,0,0.45)")
    ctx.fillStyle = vigGrad
    ctx.fillRect(0, 0, W, H)

    animRef.current = requestAnimationFrame(render)
  }, [isPlaying, currentSong, auroraWaves, hslPrimary, hslSecondary, hslAccent, spawnParticles])

  // ─── Canvas Setup & Resize ──────────────────────────────────
  useEffect(() => {
    if (!isImmersiveOpen) return

    const canvas = canvasRef.current
    if (!canvas) return

    const handleResize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = window.innerWidth * dpr
      canvas.height = window.innerHeight * dpr
      canvas.style.width = `${window.innerWidth}px`
      canvas.style.height = `${window.innerHeight}px`
      const ctx = canvas.getContext("2d")
      if (ctx) ctx.scale(dpr, dpr)
    }

    handleResize()
    window.addEventListener("resize", handleResize)

    // Reset particles on open
    particlesRef.current = []
    timeRef.current = 0
    prevFrameTimeRef.current = 0

    animRef.current = requestAnimationFrame(render)

    return () => {
      window.removeEventListener("resize", handleResize)
      if (animRef.current) {
        cancelAnimationFrame(animRef.current)
      }
    }
  }, [isImmersiveOpen, render])

  if (!isImmersiveOpen) return null

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-[199]"
      style={{ display: "block" }}
    />
  )
}
