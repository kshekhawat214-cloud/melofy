/**
 * Melofy Soundstage DSP Audio Presets
 * Custom Acoustic Enhancer Profiles exclusive to Melofy.
 */

export interface SoundstageProfile {
  id: "pure" | "club_bass" | "vocal_air" | "spatial_concert"
  name: string
  shortLabel: string
  description: string
  iconName: string
  accentColor: string
}

export const SOUNDSTAGE_PROFILES: SoundstageProfile[] = [
  {
    id: "pure",
    name: "Studio Reference",
    shortLabel: "Pure",
    description: "Uncolored, crystal-clear studio acoustic curve",
    iconName: "Disc3",
    accentColor: "#1db954",
  },
  {
    id: "club_bass",
    name: "Club Sub-Bass",
    shortLabel: "Bass",
    description: "Deep low-end harmonic resonance & dynamic kick punch",
    iconName: "Zap",
    accentColor: "#ec4899",
  },
  {
    id: "vocal_air",
    name: "Vocal Air",
    shortLabel: "Vocal",
    description: "Crisp acoustic high-shelf shimmer & centered vocal presence",
    iconName: "Sparkles",
    accentColor: "#06b6d4",
  },
  {
    id: "spatial_concert",
    name: "Spatial Concert",
    shortLabel: "Spatial",
    description: "Wide 3D dimensional soundstage with immersive ambience",
    iconName: "Radio",
    accentColor: "#8b5cf6",
  },
]
