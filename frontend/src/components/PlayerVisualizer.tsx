"use client"
import React, { useEffect, useRef } from "react"
import { usePlayerStore, VisualizerMode } from "@/store/playerStore"
import { ColorTone } from "@/lib/colors"

interface PlayerVisualizerProps {
  mode: VisualizerMode
  moodTone: ColorTone
  height?: number
  barCount?: number
  className?: string
}

export default function PlayerVisualizer({
  mode,
  moodTone,
  height = 24,
  barCount = 16,
  className = "",
}: PlayerVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const currentSong = usePlayerStore((s) => s.currentSong)
  const animationFrameRef = useRef<number | null>(null)

  useEffect(() => {
    if (mode === "off") return

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1
    const width = canvas.clientWidth || 120
    canvas.width = width * dpr
    canvas.height = height * dpr
    ctx.scale(dpr, dpr)

    // Base energy factor
    const trackEnergy = currentSong?.energy ?? 0.72
    const speed = 0.08 + trackEnergy * 0.06
    let step = 0

    // Heights simulation buffer for organic fluid motion
    const heights = new Array(barCount).fill(4)

    const render = () => {
      ctx.clearRect(0, 0, width, height)
      step += speed

      if (mode === "spectrum") {
        const gap = 2.5
        const barWidth = Math.max(2, (width - (barCount - 1) * gap) / barCount)

        for (let i = 0; i < barCount; i++) {
          let targetHeight = 3
          if (isPlaying) {
            // Harmonic wave formula with energy modulation
            const wave1 = Math.sin(step + i * 0.45) * 0.5 + 0.5
            const wave2 = Math.cos(step * 0.7 + i * 0.25) * 0.5 + 0.5
            const wave3 = Math.sin(step * 1.3 + i * 0.8) * 0.5 + 0.5
            const combined = (wave1 * 0.5 + wave2 * 0.3 + wave3 * 0.2) * (0.4 + trackEnergy * 0.6)
            targetHeight = Math.max(3, combined * (height - 2))
          }

          // Smooth interpolation
          heights[i] += (targetHeight - heights[i]) * 0.25

          const x = i * (barWidth + gap)
          const y = height - heights[i]

          // Liquid Neon Gradient for bars
          const grad = ctx.createLinearGradient(0, y, 0, height)
          grad.addColorStop(0, moodTone.accent || "#1db954")
          grad.addColorStop(1, moodTone.primary || "#10b981")

          ctx.fillStyle = grad
          ctx.beginPath()
          const radius = Math.min(barWidth / 2, 2)
          ctx.roundRect(x, y, barWidth, heights[i], [radius, radius, 0, 0])
          ctx.fill()
        }
      } else if (mode === "pulse") {
        // Breathing pulse line
        const centerX = width / 2
        const centerY = height / 2
        const pulse = isPlaying ? Math.sin(step) * 4 * trackEnergy + 6 : 3

        ctx.strokeStyle = moodTone.accent || "#1db954"
        ctx.lineWidth = 2.5
        ctx.beginPath()
        ctx.arc(centerX, centerY, Math.max(2, pulse), 0, Math.PI * 2)
        ctx.stroke()

        if (isPlaying) {
          ctx.strokeStyle = moodTone.glowRgba || "rgba(29, 185, 84, 0.4)"
          ctx.lineWidth = 1.5
          ctx.beginPath()
          ctx.arc(centerX, centerY, Math.max(4, pulse + 4), 0, Math.PI * 2)
          ctx.stroke()
        }
      }

      animationFrameRef.current = requestAnimationFrame(render)
    }

    render()

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [mode, isPlaying, moodTone, height, barCount, currentSong?.id, currentSong?.energy])

  if (mode === "off") return null

  return (
    <canvas
      ref={canvasRef}
      className={`inline-block ${className}`}
      style={{ width: "100%", height: `${height}px` }}
    />
  )
}
