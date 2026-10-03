"use client"
import { useState, useEffect } from "react"

export function useBreakpoint() {
  const [state, setState] = useState({
    isMobile: false,
    isTablet: false,
    isDesktop: true,
    width: 1200,
  })

  useEffect(() => {
    function update() {
      const width = window.innerWidth
      setState({
        isMobile: width < 768,
        isTablet: width >= 768 && width < 1024,
        isDesktop: width >= 1024,
        width,
      })
    }

    update()
    window.addEventListener("resize", update, { passive: true })
    return () => window.removeEventListener("resize", update)
  }, [])

  return state
}
