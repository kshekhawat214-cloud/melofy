"use client"
import { useEffect } from "react"
import { pingBackend } from "@/lib/api"

export default function BackendWarmup() {
  useEffect(() => {
    pingBackend()
  }, [])

  return null
}
