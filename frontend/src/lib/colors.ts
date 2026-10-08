// Dynamic mood color palette tailored for Spotify dark mode aesthetic & Liquid Glass Ambient Lighting
export interface ColorTone {
  primary: string
  secondary: string
  accent: string
  glowRgba: string
  secondaryGlowRgba: string
  bgFrom: string
  bgMesh: string
}

const PRESET_PALETTE: ColorTone[] = [
  {
    primary: "#7c3aed",
    secondary: "#3b82f6",
    accent: "#a855f7",
    glowRgba: "rgba(124, 58, 237, 0.45)",
    secondaryGlowRgba: "rgba(59, 130, 246, 0.35)",
    bgFrom: "from-purple-900/70",
    bgMesh: "radial-gradient(at 0% 0%, rgba(124, 58, 237, 0.35) 0px, transparent 50%), radial-gradient(at 100% 100%, rgba(59, 130, 246, 0.25) 0px, transparent 50%)",
  },
  {
    primary: "#2563eb",
    secondary: "#06b6d4",
    accent: "#3b82f6",
    glowRgba: "rgba(37, 99, 235, 0.45)",
    secondaryGlowRgba: "rgba(6, 182, 212, 0.35)",
    bgFrom: "from-blue-900/70",
    bgMesh: "radial-gradient(at 0% 0%, rgba(37, 99, 235, 0.35) 0px, transparent 50%), radial-gradient(at 100% 100%, rgba(6, 182, 212, 0.25) 0px, transparent 50%)",
  },
  {
    primary: "#059669",
    secondary: "#10b981",
    accent: "#34d399",
    glowRgba: "rgba(5, 150, 105, 0.45)",
    secondaryGlowRgba: "rgba(16, 185, 129, 0.35)",
    bgFrom: "from-emerald-900/70",
    bgMesh: "radial-gradient(at 0% 0%, rgba(5, 150, 105, 0.35) 0px, transparent 50%), radial-gradient(at 100% 100%, rgba(16, 185, 129, 0.25) 0px, transparent 50%)",
  },
  {
    primary: "#e11d48",
    secondary: "#f43f5e",
    accent: "#fb7185",
    glowRgba: "rgba(225, 29, 72, 0.45)",
    secondaryGlowRgba: "rgba(244, 63, 94, 0.35)",
    bgFrom: "from-rose-900/70",
    bgMesh: "radial-gradient(at 0% 0%, rgba(225, 29, 72, 0.35) 0px, transparent 50%), radial-gradient(at 100% 100%, rgba(244, 63, 94, 0.25) 0px, transparent 50%)",
  },
  {
    primary: "#d97706",
    secondary: "#f59e0b",
    accent: "#fbbf24",
    glowRgba: "rgba(217, 119, 6, 0.45)",
    secondaryGlowRgba: "rgba(245, 158, 11, 0.35)",
    bgFrom: "from-amber-900/70",
    bgMesh: "radial-gradient(at 0% 0%, rgba(217, 119, 6, 0.35) 0px, transparent 50%), radial-gradient(at 100% 100%, rgba(245, 158, 11, 0.25) 0px, transparent 50%)",
  },
  {
    primary: "#0891b2",
    secondary: "#06b6d4",
    accent: "#22d3ee",
    glowRgba: "rgba(8, 145, 178, 0.45)",
    secondaryGlowRgba: "rgba(6, 182, 212, 0.35)",
    bgFrom: "from-cyan-900/70",
    bgMesh: "radial-gradient(at 0% 0%, rgba(8, 145, 178, 0.35) 0px, transparent 50%), radial-gradient(at 100% 100%, rgba(6, 182, 212, 0.25) 0px, transparent 50%)",
  },
  {
    primary: "#4f46e5",
    secondary: "#6366f1",
    accent: "#818cf8",
    glowRgba: "rgba(79, 70, 229, 0.45)",
    secondaryGlowRgba: "rgba(99, 102, 241, 0.35)",
    bgFrom: "from-indigo-900/70",
    bgMesh: "radial-gradient(at 0% 0%, rgba(79, 70, 229, 0.35) 0px, transparent 50%), radial-gradient(at 100% 100%, rgba(99, 102, 241, 0.25) 0px, transparent 50%)",
  },
  {
    primary: "#c026d3",
    secondary: "#d946ef",
    accent: "#e879f9",
    glowRgba: "rgba(192, 38, 211, 0.45)",
    secondaryGlowRgba: "rgba(217, 70, 239, 0.35)",
    bgFrom: "from-fuchsia-900/70",
    bgMesh: "radial-gradient(at 0% 0%, rgba(192, 38, 211, 0.35) 0px, transparent 50%), radial-gradient(at 100% 100%, rgba(217, 70, 239, 0.25) 0px, transparent 50%)",
  },
  {
    primary: "#ea580c",
    secondary: "#f97316",
    accent: "#fb923c",
    glowRgba: "rgba(234, 88, 12, 0.45)",
    secondaryGlowRgba: "rgba(249, 115, 22, 0.35)",
    bgFrom: "from-orange-900/70",
    bgMesh: "radial-gradient(at 0% 0%, rgba(234, 88, 12, 0.35) 0px, transparent 50%), radial-gradient(at 100% 100%, rgba(249, 115, 22, 0.25) 0px, transparent 50%)",
  },
  {
    primary: "#0d9488",
    secondary: "#14b8a6",
    accent: "#2dd4bf",
    glowRgba: "rgba(13, 148, 136, 0.45)",
    secondaryGlowRgba: "rgba(20, 184, 166, 0.35)",
    bgFrom: "from-teal-900/70",
    bgMesh: "radial-gradient(at 0% 0%, rgba(13, 148, 136, 0.35) 0px, transparent 50%), radial-gradient(at 100% 100%, rgba(20, 184, 166, 0.25) 0px, transparent 50%)",
  },
]

export function getSongMoodColor(identifier?: string): ColorTone {
  if (!identifier) return PRESET_PALETTE[0]
  
  let hash = 0
  for (let i = 0; i < identifier.length; i++) {
    hash = (hash << 5) - hash + identifier.charCodeAt(i)
    hash |= 0
  }
  
  const index = Math.abs(hash) % PRESET_PALETTE.length
  return PRESET_PALETTE[index]
}
