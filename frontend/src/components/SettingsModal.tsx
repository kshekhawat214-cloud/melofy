"use client"
import { useState, useEffect } from "react"
import { useUIStore } from "@/store/uiStore"
import { getUserSettings, updateUserSettings } from "@/lib/api"
import { X, Sliders, Volume2, ShieldCheck, Check } from "lucide-react"

export default function SettingsModal() {
  const { isSettingsOpen, closeSettings, addToast } = useUIStore()
  const [displayName, setDisplayName] = useState("Guest")
  const [audioQuality, setAudioQuality] = useState("high")
  const [crossfadeMs, setCrossfadeMs] = useState(3000)
  const [autoplay, setAutoplay] = useState(true)
  const [accentColor, setAccentColor] = useState("#1db954")
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (isSettingsOpen) {
      getUserSettings().then((s) => {
        setDisplayName(s.displayName || "Guest")
        setAudioQuality(s.audioQuality || "high")
        setCrossfadeMs(s.crossfadeMs ?? 3000)
        setAutoplay(s.autoplay ?? true)
        setAccentColor(s.accentColor || "#1db954")
      })
    }
  }, [isSettingsOpen])

  if (!isSettingsOpen) return null

  const handleSave = async () => {
    setIsSaving(true)
    try {
      await updateUserSettings({
        displayName,
        audioQuality,
        crossfadeMs,
        autoplay,
        accentColor,
      })
      addToast("Settings saved successfully")
      closeSettings()
    } catch {
      addToast("Failed to save settings", "error")
    } finally {
      setIsSaving(false)
    }
  }

  const ACCENT_COLORS = ["#1db954", "#1ed760", "#3d91f4", "#9b51e0", "#ff4b4b", "#f59e0b"]

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-[110] flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="liquid-glass-elevated w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden border border-white/20 backdrop-blur-3xl text-white">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div className="flex items-center space-x-2">
            <Sliders size={20} className="text-[#1db954]" />
            <h2 className="text-xl font-bold">Settings</h2>
          </div>
          <button
            onClick={closeSettings}
            className="text-[#b3b3b3] hover:text-white p-1 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          {/* User Profile display */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-[#b3b3b3] uppercase tracking-wider block">
              Display Name
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full bg-[#242424] focus:bg-[#282828] border border-transparent focus:border-white/40 text-white rounded-lg px-4 py-2.5 text-sm outline-none transition"
            />
          </div>

          {/* Audio Quality */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center space-x-2">
              <Volume2 size={18} className="text-[#b3b3b3]" />
              <h3 className="font-bold text-sm">Streaming Audio Quality</h3>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[
                { id: "normal", label: "Normal (96 kbps)" },
                { id: "high", label: "High (160 kbps)" },
                { id: "very_high", label: "Very High (320 kbps)" },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setAudioQuality(opt.id)}
                  className={`p-3 rounded-lg border text-xs font-semibold text-center transition-all ${
                    audioQuality === opt.id
                      ? "border-[#1db954] bg-[#1db954]/10 text-white"
                      : "border-[#333] bg-[#242424] text-[#b3b3b3] hover:border-white/30"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Crossfade */}
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between text-sm font-semibold">
              <span>Crossfade songs</span>
              <span className="text-[#1db954]">{crossfadeMs / 1000}s</span>
            </div>
            <input
              type="range"
              min={0}
              max={12000}
              step={1000}
              value={crossfadeMs}
              onChange={(e) => setCrossfadeMs(Number(e.target.value))}
              className="w-full accent-[#1db954] cursor-pointer"
            />
            <p className="text-xs text-[#a7a7a7]">
              Allows a smooth transition between consecutive tracks in the queue.
            </p>
          </div>

          {/* Autoplay Toggle */}
          <div className="flex items-center justify-between pt-2">
            <div>
              <span className="text-sm font-semibold block">Autoplay similar content</span>
              <span className="text-xs text-[#a7a7a7] block">
                Keep the music flowing when your album or playlist ends.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setAutoplay(!autoplay)}
              className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors ${
                autoplay ? "bg-[#1db954]" : "bg-[#333]"
              }`}
            >
              <div
                className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                  autoplay ? "translate-x-6" : ""
                }`}
              />
            </button>
          </div>

          {/* Accent Color */}
          <div className="space-y-2 pt-2">
            <span className="text-xs font-bold text-[#b3b3b3] uppercase tracking-wider block">
              Player Accent Color
            </span>
            <div className="flex space-x-3">
              {ACCENT_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setAccentColor(color)}
                  style={{ backgroundColor: color }}
                  className="w-8 h-8 rounded-full flex items-center justify-center transition hover:scale-110 active:scale-95 shadow-lg"
                >
                  {accentColor === color && <Check size={16} className="text-black font-bold" />}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Action Row */}
        <div className="flex justify-end space-x-3 px-6 py-4 bg-[#141414] border-t border-[#2a2a2a]">
          <button
            onClick={closeSettings}
            className="px-5 py-2 rounded-full text-sm font-bold text-white hover:bg-white/10 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-7 py-2 rounded-full text-sm font-bold bg-[#1db954] hover:bg-[#1ed760] text-black hover:scale-105 active:scale-95 transition disabled:opacity-50"
          >
            {isSaving ? "Saving..." : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  )
}
