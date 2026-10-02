"use client"
import { useState, useRef, useMemo } from "react"
import { useUIStore } from "@/store/uiStore"
import {
  X,
  Link as LinkIcon,
  Download,
  CheckCircle,
  Loader2,
  AlertCircle,
  Music,
  FileText,
  ArrowRight,
  Sparkles,
  Layers,
  Heart,
  ListPlus,
  ExternalLink,
  Upload,
  Info,
  Check,
} from "lucide-react"
import { ingestLink, getIngestStatus, IngestOptions } from "@/lib/api"
import { useRouter } from "next/navigation"

type PlatformKey = "spotify" | "youtube" | "apple" | "csv"

interface PlatformOption {
  key: PlatformKey
  name: string
  label: string
  color: string
  bgLight: string
  borderActive: string
  placeholder: string
  hint: string
}

const PLATFORMS: PlatformOption[] = [
  {
    key: "spotify",
    name: "Spotify",
    label: "Spotify",
    color: "#1db954",
    bgLight: "rgba(29, 185, 84, 0.12)",
    borderActive: "border-[#1db954]",
    placeholder: "https://open.spotify.com/playlist/... or /album/... or /track/...",
    hint: "Paste any Spotify playlist, album, or track link.",
  },
  {
    key: "youtube",
    name: "YouTube Music",
    label: "YouTube",
    color: "#ff0000",
    bgLight: "rgba(255, 0, 0, 0.12)",
    borderActive: "border-red-500",
    placeholder: "https://music.youtube.com/playlist?list=... or youtube.com/watch?v=...",
    hint: "Paste a YouTube or YouTube Music playlist or video URL.",
  },
  {
    key: "apple",
    name: "Apple Music",
    label: "Apple Music",
    color: "#fc3c44",
    bgLight: "rgba(252, 60, 68, 0.12)",
    borderActive: "border-[#fc3c44]",
    placeholder: "https://music.apple.com/us/playlist/... or /album/...",
    hint: "Paste any public Apple Music playlist or album URL.",
  },
  {
    key: "csv",
    name: "TuneMyMusic / File Export",
    label: "TuneMyMusic",
    color: "#a855f7",
    bgLight: "rgba(168, 85, 247, 0.15)",
    borderActive: "border-purple-500",
    placeholder: "Upload TuneMyMusic .csv / .txt file or paste tracklist...",
    hint: "Upload a file exported from TuneMyMusic, Soundiiz, or paste tracklist.",
  },
]

export default function ImportModal() {
  const router = useRouter()
  const { isImportModalOpen, closeImportModal, loadPlaylists, loadLikedSongIds } = useUIStore()

  const [activePlatform, setActivePlatform] = useState<PlatformKey>("spotify")
  const [url, setUrl] = useState("")
  const [textData, setTextData] = useState("")
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null)
  const [csvInputMode, setCsvInputMode] = useState<"upload" | "paste">("upload")
  const [isDragging, setIsDragging] = useState(false)
  const [showTuneGuide, setShowTuneGuide] = useState(false)

  const [destination, setDestination] = useState<"playlist" | "liked">("playlist")
  const [customPlaylistName, setCustomPlaylistName] = useState("")

  const [status, setStatus] = useState<"idle" | "submitting" | "processing" | "success" | "error">("idle")
  const [message, setMessage] = useState("")
  const [errorMessage, setErrorMessage] = useState("")
  const [currentTrack, setCurrentTrack] = useState("")
  const [totalTracks, setTotalTracks] = useState(0)
  const [processedTracks, setProcessedTracks] = useState(0)
  const [completedPlaylistId, setCompletedPlaylistId] = useState<string | null>(null)
  const [completedPlaylistName, setCompletedPlaylistName] = useState<string>("")
  const [importedSongsList, setImportedSongsList] = useState<Array<{ id: string; title: string; artist: string }>>([])

  const fileInputRef = useRef<HTMLInputElement>(null)

  // Auto-detect platform when typing/pasting URLs
  const handleUrlChange = (val: string) => {
    setUrl(val)
    if (val.includes("spotify.com")) setActivePlatform("spotify")
    else if (val.includes("youtube.com") || val.includes("youtu.be")) setActivePlatform("youtube")
    else if (val.includes("music.apple.com")) setActivePlatform("apple")
    else if (val.includes("tunemymusic.com")) setActivePlatform("csv")
  }

  // Handle file reading from TuneMyMusic export (.csv or .txt)
  const processFile = (file: File) => {
    if (!file) return
    setUploadedFileName(file.name)
    const reader = new FileReader()
    reader.onload = (e) => {
      const content = (e.target?.result as string) || ""
      setTextData(content)

      // Clean up filename to suggest playlist title if empty
      // E.g. "TuneMyMusic - Top Hits 2026.csv" -> "Top Hits 2026"
      const cleanTitle = file.name
        .replace(/\.[^/.]+$/, "")
        .replace(/^TuneMyMusic[_\-\s]*/i, "")
        .replace(/[_\-]/g, " ")
        .trim()

      if (cleanTitle && !customPlaylistName) {
        setCustomPlaylistName(cleanTitle)
      }
    }
    reader.readAsText(file)
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) processFile(file)
  }

  const handleRemoveFile = () => {
    setUploadedFileName(null)
    setTextData("")
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  // Parse track count and samples from textData for instant feedback
  const trackPreview = useMemo(() => {
    if (!textData.trim()) return { count: 0, samples: [] }
    const lines = textData.split("\n").map((l) => l.trim()).filter(Boolean)
    if (!lines.length) return { count: 0, samples: [] }

    const isCsv = lines[0].includes(",") || lines[0].includes(";")
    const dataLines = isCsv && (lines[0].toLowerCase().includes("track") || lines[0].toLowerCase().includes("title"))
      ? lines.slice(1)
      : lines

    const samples = dataLines.slice(0, 3).map((l) => {
      if (isCsv) {
        const parts = l.split(/[,;]/).map((p) => p.replace(/"/g, "").trim())
        return parts.length >= 2 ? `${parts[0]} - ${parts[1]}` : parts[0]
      }
      return l.replace(/^\d+[\.\-\)]\s*/, "")
    })

    return {
      count: dataLines.length,
      samples,
    }
  }, [textData])

  if (!isImportModalOpen) return null

  const handleStartImport = async () => {
    const isTextMode = activePlatform === "csv"
    const inputVal = isTextMode ? textData.trim() : url.trim()

    if (!inputVal) return

    setStatus("submitting")
    setMessage("Connecting to music service...")
    setErrorMessage("")
    setImportedSongsList([])
    setCompletedPlaylistId(null)

    const payload: IngestOptions = {
      platform: activePlatform,
      destination: destination,
      playlist_name: customPlaylistName.trim() || undefined,
      ...(isTextMode ? { text_data: inputVal } : { url: inputVal }),
    }

    try {
      const { job_id } = await ingestLink(payload)
      setStatus("processing")
      setMessage("Extracting tracklist & resolving metadata...")

      const poll = setInterval(async () => {
        try {
          const job = await getIngestStatus(job_id)

          if (job.status === "parsing" || job.status === "importing") {
            setMessage(job.message || "Importing tracks...")
            if (job.total_tracks) setTotalTracks(job.total_tracks)
            if (job.processed_tracks !== undefined) setProcessedTracks(job.processed_tracks)
            if (job.current_track) setCurrentTrack(job.current_track)
            if (job.tracks && Array.isArray(job.tracks)) setImportedSongsList(job.tracks)
          } else if (job.status === "done") {
            clearInterval(poll)
            setStatus("success")
            setTotalTracks(job.total_tracks || job.count || 0)
            setProcessedTracks(job.total_tracks || job.count || 0)
            setMessage(job.message || `Successfully imported ${job.count} tracks!`)
            if (job.playlist_id) setCompletedPlaylistId(job.playlist_id)
            if (job.playlist_name) setCompletedPlaylistName(job.playlist_name)
            if (job.tracks) setImportedSongsList(job.tracks)

            // Refresh user's playlists and liked songs in the UI
            loadPlaylists()
            loadLikedSongIds()
          } else if (job.status === "failed") {
            clearInterval(poll)
            setStatus("error")
            setErrorMessage(job.error || job.message || "Failed to import tracks.")
          }
        } catch {
          clearInterval(poll)
          setStatus("error")
          setErrorMessage("Lost connection to backend server.")
        }
      }, 1500)
    } catch (err: any) {
      setStatus("error")
      setErrorMessage(err.message || "Could not connect to backend server.")
    }
  }

  const handleReset = () => {
    setStatus("idle")
    setUrl("")
    setTextData("")
    setUploadedFileName(null)
    setMessage("")
    setErrorMessage("")
    setCurrentTrack("")
    setTotalTracks(0)
    setProcessedTracks(0)
    setCompletedPlaylistId(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const handleNavigateToPlaylist = () => {
    if (completedPlaylistId) {
      closeImportModal()
      handleReset()
      router.push(`/playlist/${completedPlaylistId}`)
    }
  }

  const currentPlatformInfo = PLATFORMS.find((p) => p.key === activePlatform) || PLATFORMS[0]
  const progressPercent = totalTracks > 0 ? Math.min(100, Math.round((processedTracks / totalTracks) * 100)) : 0

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-[#181818] border border-[#2d2d2d] w-full max-w-[580px] rounded-2xl shadow-2xl relative overflow-hidden flex flex-col max-h-[92vh]">
        {/* Top Header */}
        <div className="p-6 pb-4 border-b border-[#282828] relative">
          <button
            onClick={() => {
              closeImportModal()
              if (status === "success") handleReset()
            }}
            className="absolute top-5 right-5 text-gray-400 hover:text-white transition-colors p-1 rounded-full hover:bg-white/10"
          >
            <X size={20} />
          </button>

          <div className="flex items-center space-x-3 mb-1.5">
            <div className="bg-gradient-to-br from-[#1db954] to-[#128a3c] p-2.5 rounded-xl shadow-lg shadow-[#1db954]/20 text-black">
              <Sparkles size={22} className="stroke-[2.5]" />
            </div>
            <div>
              <h2 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
                Transfer Your Library
                <span className="text-[10px] uppercase font-bold tracking-widest bg-white/10 text-[#1db954] px-2 py-0.5 rounded-full">
                  Universal
                </span>
              </h2>
              <p className="text-[#a0a0a0] text-xs">
                Import playlists and songs from TuneMyMusic, Spotify, YouTube Music & Apple Music.
              </p>
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="p-6 overflow-y-auto space-y-5 scrollbar-hidden">
          {status !== "processing" && status !== "success" && (
            <>
              {/* Platform Selector Tabs */}
              <div>
                <label className="text-xs font-bold text-[#b3b3b3] uppercase tracking-wider block mb-2">
                  Select Source Platform
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {PLATFORMS.map((p) => {
                    const isActive = activePlatform === p.key
                    return (
                      <button
                        key={p.key}
                        onClick={() => setActivePlatform(p.key)}
                        className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all text-center group ${
                          isActive
                            ? `${p.borderActive} bg-white/10 text-white shadow-lg`
                            : "border-[#2c2c2c] bg-white/[0.03] text-[#a0a0a0] hover:bg-white/[0.07] hover:text-white"
                        }`}
                      >
                        <span
                          className="w-3 h-3 rounded-full mb-1.5 transition-transform group-hover:scale-125"
                          style={{ backgroundColor: p.color }}
                        />
                        <span className="text-xs font-bold truncate max-w-full">{p.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Source Input Area */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-[#b3b3b3] uppercase tracking-wider">
                    {activePlatform === "csv" ? "TuneMyMusic Library Import" : "Playlist or Track Link"}
                  </label>

                  {/* Mode switcher for TuneMyMusic */}
                  {activePlatform === "csv" && (
                    <div className="flex items-center space-x-1 bg-black/40 p-0.5 rounded-lg border border-[#333]">
                      <button
                        onClick={() => setCsvInputMode("upload")}
                        className={`text-[11px] font-bold px-2.5 py-1 rounded-md transition-all ${
                          csvInputMode === "upload"
                            ? "bg-purple-600 text-white shadow"
                            : "text-gray-400 hover:text-white"
                        }`}
                      >
                        Upload File
                      </button>
                      <button
                        onClick={() => setCsvInputMode("paste")}
                        className={`text-[11px] font-bold px-2.5 py-1 rounded-md transition-all ${
                          csvInputMode === "paste"
                            ? "bg-purple-600 text-white shadow"
                            : "text-gray-400 hover:text-white"
                        }`}
                      >
                        Paste Text
                      </button>
                    </div>
                  )}
                </div>

                {/* TuneMyMusic Custom UI */}
                {activePlatform === "csv" ? (
                  <div className="space-y-3">
                    {csvInputMode === "upload" ? (
                      <div>
                        <input
                          type="file"
                          ref={fileInputRef}
                          accept=".csv,.txt,text/plain,text/csv"
                          onChange={handleFileSelect}
                          className="hidden"
                        />

                        {uploadedFileName ? (
                          <div className="bg-purple-950/20 border border-purple-500/40 rounded-xl p-4 flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                              <div className="w-10 h-10 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center flex-shrink-0">
                                <FileText size={20} />
                              </div>
                              <div>
                                <p className="text-sm font-bold text-white truncate max-w-[320px]">
                                  {uploadedFileName}
                                </p>
                                <p className="text-xs text-purple-300">
                                  {trackPreview.count > 0
                                    ? `✓ ${trackPreview.count} tracks detected`
                                    : "File loaded"}
                                </p>
                              </div>
                            </div>
                            <button
                              onClick={handleRemoveFile}
                              className="text-gray-400 hover:text-white p-1 rounded-full hover:bg-white/10"
                              title="Remove file"
                            >
                              <X size={18} />
                            </button>
                          </div>
                        ) : (
                          <div
                            onDragOver={(e) => {
                              e.preventDefault()
                              setIsDragging(true)
                            }}
                            onDragLeave={() => setIsDragging(false)}
                            onDrop={handleDrop}
                            onClick={() => fileInputRef.current?.click()}
                            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all flex flex-col items-center justify-center space-y-2.5 ${
                              isDragging
                                ? "border-purple-400 bg-purple-500/10 scale-[1.01]"
                                : "border-[#383838] bg-white/[0.02] hover:border-purple-500/60 hover:bg-purple-500/[0.04]"
                            }`}
                          >
                            <div className="w-12 h-12 rounded-full bg-purple-500/10 text-purple-400 flex items-center justify-center mb-1">
                              <Upload size={24} />
                            </div>
                            <div>
                              <p className="text-sm font-bold text-white">
                                Drop TuneMyMusic <span className="text-purple-400">.csv</span> or{" "}
                                <span className="text-purple-400">.txt</span> file
                              </p>
                              <p className="text-xs text-[#808080] mt-0.5">
                                Or click to browse from your device
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <textarea
                        rows={4}
                        placeholder={
                          "Paste tracklist or TuneMyMusic CSV:\nTrack name,Artist name,Album name\nBlinding Lights,The Weeknd,After Hours\nLevitating,Dua Lipa,Future Nostalgia\n\nOr plain text:\nSong - Artist"
                        }
                        value={textData}
                        onChange={(e) => setTextData(e.target.value)}
                        className="w-full bg-[#242424] border border-[#383838] focus:border-purple-500 text-white p-3.5 rounded-xl outline-none placeholder-gray-500 text-xs font-mono transition-colors"
                      />
                    )}

                    {/* Live Preview of Detected Tracks */}
                    {trackPreview.samples.length > 0 && (
                      <div className="bg-white/[0.03] border border-[#2b2b2b] rounded-lg p-2.5 text-xs">
                        <span className="text-[10px] font-bold text-purple-400 uppercase tracking-wider block mb-1">
                          Preview ({trackPreview.count} tracks detected):
                        </span>
                        <div className="space-y-1 text-gray-300">
                          {trackPreview.samples.map((s, idx) => (
                            <div key={idx} className="truncate flex items-center space-x-1.5">
                              <span className="text-purple-400">•</span>
                              <span className="truncate">{s}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* TuneMyMusic Explainer & Quick Link */}
                    <div className="bg-purple-950/15 border border-purple-500/20 rounded-xl p-3 flex items-start justify-between text-xs space-x-3">
                      <div className="flex items-start space-x-2.5">
                        <Info size={16} className="text-purple-400 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="font-bold text-white">How TuneMyMusic Works</p>
                          <p className="text-[#a0a0a0] text-[11px] leading-relaxed mt-0.5">
                            Export playlists from Tidal, Deezer, Amazon, Apple, or Spotify to CSV on TuneMyMusic, then drop the file here to transfer your library free!
                          </p>
                        </div>
                      </div>
                      <a
                        href="https://www.tunemymusic.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center space-x-1 bg-purple-600/30 hover:bg-purple-600/50 text-purple-300 text-[11px] font-bold px-2.5 py-1.5 rounded-lg transition-colors flex-shrink-0"
                      >
                        <span>TuneMyMusic</span>
                        <ExternalLink size={12} />
                      </a>
                    </div>
                  </div>
                ) : (
                  /* Standard Link Input for Spotify / YouTube / Apple */
                  <div>
                    <div
                      className={`flex items-center bg-[#242424] border rounded-xl overflow-hidden px-3.5 py-3 transition-colors ${
                        url ? currentPlatformInfo.borderActive : "border-[#383838] focus-within:border-white/40"
                      }`}
                    >
                      <LinkIcon size={17} className="text-gray-400 mr-2.5 flex-shrink-0" />
                      <input
                        type="text"
                        placeholder={currentPlatformInfo.placeholder}
                        value={url}
                        onChange={(e) => handleUrlChange(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleStartImport()}
                        className="w-full bg-transparent text-white outline-none placeholder-gray-500 text-sm"
                      />
                    </div>
                    <p className="text-[11px] text-[#808080] mt-1.5">{currentPlatformInfo.hint}</p>
                  </div>
                )}
              </div>

              {/* Destination Selector */}
              <div className="bg-white/[0.03] border border-[#2b2b2b] rounded-xl p-3.5 space-y-3">
                <span className="text-xs font-bold text-[#b3b3b3] uppercase tracking-wider block">
                  Import Destination
                </span>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setDestination("playlist")}
                    className={`flex items-center space-x-2.5 p-2.5 rounded-lg border text-left transition-all ${
                      destination === "playlist"
                        ? "border-[#1db954] bg-[#1db954]/10 text-white font-bold"
                        : "border-transparent bg-white/5 text-[#b3b3b3] hover:text-white"
                    }`}
                  >
                    <ListPlus size={18} className={destination === "playlist" ? "text-[#1db954]" : ""} />
                    <div className="text-xs">
                      <div className="font-bold">New Playlist</div>
                      <div className="text-[10px] text-gray-400">Keep original name</div>
                    </div>
                  </button>

                  <button
                    onClick={() => setDestination("liked")}
                    className={`flex items-center space-x-2.5 p-2.5 rounded-lg border text-left transition-all ${
                      destination === "liked"
                        ? "border-[#1db954] bg-[#1db954]/10 text-white font-bold"
                        : "border-transparent bg-white/5 text-[#b3b3b3] hover:text-white"
                    }`}
                  >
                    <Heart size={18} className={destination === "liked" ? "text-[#1db954] fill-[#1db954]" : ""} />
                    <div className="text-xs">
                      <div className="font-bold">Liked Songs</div>
                      <div className="text-[10px] text-gray-400">Add to your library</div>
                    </div>
                  </button>
                </div>

                {destination === "playlist" && (
                  <div className="pt-1">
                    <input
                      type="text"
                      placeholder="Custom playlist title (optional, defaults to original)"
                      value={customPlaylistName}
                      onChange={(e) => setCustomPlaylistName(e.target.value)}
                      className="w-full bg-[#1e1e1e] border border-[#333] text-white text-xs px-3 py-2 rounded-lg outline-none placeholder-gray-600 focus:border-white/30"
                    />
                  </div>
                )}
              </div>
            </>
          )}

          {/* Real-time Progress & Status View */}
          {(status === "processing" || status === "submitting" || status === "success") && (
            <div className="bg-white/[0.04] border border-[#2d2d2d] rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  {status === "success" ? (
                    <div className="w-9 h-9 rounded-full bg-[#1db954]/20 flex items-center justify-center text-[#1db954]">
                      <CheckCircle size={22} />
                    </div>
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-[#1db954]/20 flex items-center justify-center text-[#1db954]">
                      <Loader2 size={22} className="animate-spin" />
                    </div>
                  )}
                  <div>
                    <h4 className="text-sm font-bold text-white">
                      {status === "success" ? "Transfer Complete!" : "Transferring Music..."}
                    </h4>
                    <p className="text-xs text-[#a0a0a0] truncate max-w-[280px]">
                      {currentTrack || message}
                    </p>
                  </div>
                </div>

                {totalTracks > 0 && (
                  <div className="text-right">
                    <span className="text-xs font-mono font-bold text-[#1db954]">{progressPercent}%</span>
                    <p className="text-[10px] text-gray-400 font-mono">
                      {processedTracks} / {totalTracks} tracks
                    </p>
                  </div>
                )}
              </div>

              {/* Progress Bar */}
              <div className="h-2 w-full bg-[#2a2a2a] rounded-full overflow-hidden relative">
                <div
                  className="h-full bg-gradient-to-r from-[#1db954] to-[#1ed760] transition-all duration-300 rounded-full"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              {/* Live Tracklist Feed */}
              {importedSongsList.length > 0 && (
                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block pb-0.5">
                    Imported ({importedSongsList.length}):
                  </span>
                  {importedSongsList.slice(-6).reverse().map((t, idx) => (
                    <div
                      key={t.id || idx}
                      className="flex items-center space-x-2 text-xs bg-white/[0.03] p-1.5 px-2.5 rounded-md"
                    >
                      <CheckCircle size={13} className="text-[#1db954] flex-shrink-0" />
                      <span className="text-white font-medium truncate">{t.title}</span>
                      <span className="text-gray-400 truncate">• {t.artist}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Error Message */}
          {status === "error" && (
            <div className="flex items-start space-x-3 bg-red-500/10 border border-red-500/30 text-red-400 p-3.5 rounded-xl text-xs">
              <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Import Error</p>
                <p>{errorMessage}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-6 pt-3 border-t border-[#282828] bg-[#141414]">
          {status === "success" ? (
            <div className="flex items-center space-x-3">
              {completedPlaylistId && (
                <button
                  onClick={handleNavigateToPlaylist}
                  className="flex-1 bg-[#1db954] hover:bg-[#1ed760] text-black font-extrabold py-3.5 px-5 rounded-full transition-all flex items-center justify-center space-x-2 shadow-lg shadow-[#1db954]/25 hover:scale-[1.02]"
                >
                  <span>Open {completedPlaylistName || "Playlist"}</span>
                  <ArrowRight size={17} />
                </button>
              )}
              <button
                onClick={() => {
                  closeImportModal()
                  handleReset()
                }}
                className="bg-white/10 hover:bg-white/20 text-white font-bold py-3.5 px-5 rounded-full transition-all text-xs"
              >
                Close
              </button>
            </div>
          ) : (
            <button
              onClick={handleStartImport}
              disabled={
                status === "processing" ||
                status === "submitting" ||
                (activePlatform === "csv" ? !textData.trim() : !url.trim())
              }
              className="w-full bg-[#1db954] hover:bg-[#1ed760] text-black font-extrabold py-3.5 rounded-full transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-[#1db954]/20 flex items-center justify-center space-x-2"
            >
              {status === "submitting" ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  <span>Connecting...</span>
                </>
              ) : status === "processing" ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  <span>Importing Tracks...</span>
                </>
              ) : (
                <>
                  <Download size={18} />
                  <span>Start Transfer</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

