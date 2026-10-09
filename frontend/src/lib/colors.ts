// Dynamic RGB Mood & Vibe Palette System for Next-Gen Ambient Lighting & Motion Graphics
export interface ColorTone {
  primary: string
  secondary: string
  accent: string
  glowRgba: string
  secondaryGlowRgba: string
  bgFrom: string
  bgMesh: string
}

export interface RgbVibe {
  id: string
  name: string
  description: string
  primary: string
  secondary: string
  accent: string
  neonHighlight: string
  rgbPalette: string[] // multi-zone perimeter cycle
  lightingStyle: "laser_strobe" | "aurora_stream" | "heavy_bass_pulse" | "amber_embers" | "prism_chromatic"
  particleType: "sparks" | "glow" | "embers" | "starlight" | "nebula"
  bassShockwaveColor: string
  vocalAuraColor: string
  trebleSparkColor: string
}

export const RGB_VIBE_PRESETS: Record<string, RgbVibe> = {
  cyberpunk: {
    id: "cyberpunk",
    name: "Cyberpunk Neon",
    description: "High-voltage magenta, electric cyan, and sub-bass lasers",
    primary: "#ff007f",
    secondary: "#00f0ff",
    accent: "#ffe600",
    neonHighlight: "#00f0ff",
    rgbPalette: ["#ff007f", "#7928ca", "#00f0ff", "#00ff66", "#ffe600"],
    lightingStyle: "laser_strobe",
    particleType: "sparks",
    bassShockwaveColor: "#ff007f",
    vocalAuraColor: "#00f0ff",
    trebleSparkColor: "#ffe600",
  },
  synthwave: {
    id: "synthwave",
    name: "Sunset Synthwave",
    description: "Retro violet, tropical orange, and neon pink horizon",
    primary: "#ec4899",
    secondary: "#f97316",
    accent: "#8b5cf6",
    neonHighlight: "#f43f5e",
    rgbPalette: ["#ec4899", "#8b5cf6", "#3b82f6", "#f97316", "#fbbf24"],
    lightingStyle: "prism_chromatic",
    particleType: "glow",
    bassShockwaveColor: "#ec4899",
    vocalAuraColor: "#8b5cf6",
    trebleSparkColor: "#f97316",
  },
  trap_gold: {
    id: "trap_gold",
    name: "Golden Trap & Bass",
    description: "Sub-woofer crimson, 24k gold flashes, and dark shadow-fall",
    primary: "#e11d48",
    secondary: "#eab308",
    accent: "#f43f5e",
    neonHighlight: "#ffd700",
    rgbPalette: ["#e11d48", "#f59e0b", "#dc2626", "#fbbf24", "#7f1d1d"],
    lightingStyle: "heavy_bass_pulse",
    particleType: "embers",
    bassShockwaveColor: "#e11d48",
    vocalAuraColor: "#eab308",
    trebleSparkColor: "#ffd700",
  },
  cosmic_aurora: {
    id: "cosmic_aurora",
    name: "Cosmic Aurora",
    description: "Deep space indigo, emerald ribbon waves, and stardust",
    primary: "#10b981",
    secondary: "#6366f1",
    accent: "#06b6d4",
    neonHighlight: "#34d399",
    rgbPalette: ["#10b981", "#06b6d4", "#6366f1", "#a855f7", "#3b82f6"],
    lightingStyle: "aurora_stream",
    particleType: "starlight",
    bassShockwaveColor: "#10b981",
    vocalAuraColor: "#6366f1",
    trebleSparkColor: "#06b6d4",
  },
  warm_amber: {
    id: "warm_amber",
    name: "Warm Sunset & Acoustic",
    description: "Analog tube-amp amber, honey glow, and floating candle embers",
    primary: "#d97706",
    secondary: "#ea580c",
    accent: "#fbbf24",
    neonHighlight: "#f59e0b",
    rgbPalette: ["#d97706", "#ea580c", "#f59e0b", "#b45309", "#fcd34d"],
    lightingStyle: "amber_embers",
    particleType: "embers",
    bassShockwaveColor: "#d97706",
    vocalAuraColor: "#f59e0b",
    trebleSparkColor: "#fbbf24",
  },
  chroma_rainbow: {
    id: "chroma_rainbow",
    name: "RGB Chroma Flow",
    description: "Full-spectrum 360° fluid rainbow sweep across all zones",
    primary: "#8b5cf6",
    secondary: "#06b6d4",
    accent: "#ec4899",
    neonHighlight: "#22c55e",
    rgbPalette: ["#ff0055", "#ff7700", "#ffee00", "#00ff66", "#00f0ff", "#7928ca"],
    lightingStyle: "prism_chromatic",
    particleType: "sparks",
    bassShockwaveColor: "#ff0055",
    vocalAuraColor: "#00f0ff",
    trebleSparkColor: "#ffee00",
  },
  midnight_velvet: {
    id: "midnight_velvet",
    name: "Midnight R&B Velvet",
    description: "Sensual ultraviolet, rose gold, and champagne haze",
    primary: "#7c3aed",
    secondary: "#db2777",
    accent: "#f472b6",
    neonHighlight: "#c084fc",
    rgbPalette: ["#7c3aed", "#db2777", "#a855f7", "#f472b6", "#4f46e5"],
    lightingStyle: "aurora_stream",
    particleType: "glow",
    bassShockwaveColor: "#7c3aed",
    vocalAuraColor: "#db2777",
    trebleSparkColor: "#f472b6",
  },
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

/**
 * Intelligent RGB Vibe matching: Inspects title, artist, genre, energy, and tempo
 * to return a curated, high-end RGB lighting profile.
 */
export function getSongRgbVibe(
  titleOrId?: string,
  artist?: string,
  genre?: string,
  energy?: number
): RgbVibe {
  const text = `${titleOrId || ""} ${artist || ""} ${genre || ""}`.toLowerCase()

  // 1. Electronic / Club / Cyberpunk / EDM
  if (
    text.includes("edm") ||
    text.includes("club") ||
    text.includes("electronic") ||
    text.includes("techno") ||
    text.includes("dance") ||
    text.includes("remix") ||
    text.includes("rave") ||
    text.includes("party") ||
    text.includes("bass")
  ) {
    return RGB_VIBE_PRESETS.cyberpunk
  }

  // 2. Hip-Hop / Rap / Trap / Drill
  if (
    text.includes("hip hop") ||
    text.includes("hiphop") ||
    text.includes("rap") ||
    text.includes("trap") ||
    text.includes("drill") ||
    text.includes("dhurandhar") ||
    text.includes("revenge")
  ) {
    return RGB_VIBE_PRESETS.trap_gold
  }

  // 3. Synthwave / 80s / Retro / Pop
  if (
    text.includes("synth") ||
    text.includes("retro") ||
    text.includes("future") ||
    text.includes("training") ||
    text.includes("pop") ||
    text.includes("dua")
  ) {
    return RGB_VIBE_PRESETS.synthwave
  }

  // 4. Acoustic / Classical / Folk / Cozy
  if (
    text.includes("acoustic") ||
    text.includes("guitar") ||
    text.includes("piano") ||
    text.includes("coffee") ||
    text.includes("candle") ||
    text.includes("unplugged")
  ) {
    return RGB_VIBE_PRESETS.warm_amber
  }

  // 5. Indie / Dream / Lo-Fi / Ambient
  if (
    text.includes("lofi") ||
    text.includes("lo-fi") ||
    text.includes("indie") ||
    text.includes("chill") ||
    text.includes("dream") ||
    text.includes("night") ||
    text.includes("sleep")
  ) {
    return RGB_VIBE_PRESETS.cosmic_aurora
  }

  // 6. R&B / Soul / Romantic / Velvet
  if (
    text.includes("r&b") ||
    text.includes("rnb") ||
    text.includes("soul") ||
    text.includes("romantic") ||
    text.includes("love") ||
    text.includes("slow")
  ) {
    return RGB_VIBE_PRESETS.midnight_velvet
  }

  // High energy fallback
  if (energy !== undefined && energy > 0.8) {
    return RGB_VIBE_PRESETS.chroma_rainbow
  }

  // Default hash selection among the presets
  const presetKeys = Object.keys(RGB_VIBE_PRESETS)
  let hash = 0
  for (let i = 0; i < (titleOrId || "pop").length; i++) {
    hash = (hash << 5) - hash + (titleOrId || "pop").charCodeAt(i)
    hash |= 0
  }
  const selectedKey = presetKeys[Math.abs(hash) % presetKeys.length]
  return RGB_VIBE_PRESETS[selectedKey]
}

/**
 * Converts a hex color (#rgb or #rrggbb) to rgba(r, g, b, alpha) string
 */
export function hexToRgba(hex: string, alpha = 1): string {
  let c = (hex || "#ffffff").replace("#", "")
  if (c.length === 3) {
    c = c.split("").map((ch) => ch + ch).join("")
  }
  const num = parseInt(c, 16) || 0
  const r = (num >> 16) & 255
  const g = (num >> 8) & 255
  const b = num & 255
  const safeAlpha = Math.min(1, Math.max(0, isNaN(alpha) ? 1 : alpha))
  return `rgba(${r}, ${g}, ${b}, ${safeAlpha})`
}
