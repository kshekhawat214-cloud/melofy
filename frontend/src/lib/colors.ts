// Dynamic mood color palette tailored for Spotify dark mode aesthetic
export interface ColorTone {
  primary: string
  bgFrom: string
  accent: string
}

const PRESET_PALETTE: ColorTone[] = [
  { primary: "#7c3aed", bgFrom: "from-purple-900/70", accent: "#a855f7" },
  { primary: "#2563eb", bgFrom: "from-blue-900/70", accent: "#3b82f6" },
  { primary: "#059669", bgFrom: "from-emerald-900/70", accent: "#10b981" },
  { primary: "#e11d48", bgFrom: "from-rose-900/70", accent: "#f43f5e" },
  { primary: "#d97706", bgFrom: "from-amber-900/70", accent: "#f59e0b" },
  { primary: "#0891b2", bgFrom: "from-cyan-900/70", accent: "#06b6d4" },
  { primary: "#4f46e5", bgFrom: "from-indigo-900/70", accent: "#6366f1" },
  { primary: "#c026d3", bgFrom: "from-fuchsia-900/70", accent: "#d946ef" },
  { primary: "#ea580c", bgFrom: "from-orange-900/70", accent: "#f97316" },
  { primary: "#0d9488", bgFrom: "from-teal-900/70", accent: "#14b8a6" },
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
