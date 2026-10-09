/**
 * Melofy Web Audio DSP Soundstage Engine
 * Real-time hardware-accelerated parametric equalization, acoustic spatialization,
 * and audio spectrum analysis attached to the HTML5 Audio element.
 */

import { SoundstageMode } from "@/store/playerStore"

class AudioDspEngine {
  private audioCtx: AudioContext | null = null
  private sourceNode: MediaElementAudioSourceNode | null = null
  private connectedElement: HTMLAudioElement | null = null

  // Equalizer & Acoustic Filters
  private inputGain: GainNode | null = null
  private subBassFilter: BiquadFilterNode | null = null
  private midPunchFilter: BiquadFilterNode | null = null
  private vocalPresenceFilter: BiquadFilterNode | null = null
  private vocalAirFilter: BiquadFilterNode | null = null

  // Spatial Concert Nodes (Haas & Stereo Spacing)
  private spatialDryGain: GainNode | null = null
  private spatialWetGain: GainNode | null = null
  private delayLeft: DelayNode | null = null
  private delayRight: DelayNode | null = null
  private splitter: ChannelSplitterNode | null = null
  private merger: ChannelMergerNode | null = null

  // Analyser Node for Real-time Music Reactivity
  private analyser: AnalyserNode | null = null
  private freqData: Uint8Array<ArrayBuffer> | null = null

  private currentMode: SoundstageMode = "pure"
  private isInitialized = false

  /**
   * Initializes the Web Audio graph and attaches it to the given HTML5 Audio element.
   * Safe to call multiple times with the same element.
   */
  public init(audioEl: HTMLAudioElement): boolean {
    if (typeof window === "undefined") return false
    if (this.connectedElement === audioEl && this.isInitialized) return true

    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
      if (!AudioContextClass) return false

      if (!this.audioCtx || this.audioCtx.state === "closed") {
        this.audioCtx = new AudioContextClass()
      }

      // MediaElementAudioSourceNode can ONLY be created once per HTMLMediaElement
      if (!this.sourceNode || this.connectedElement !== audioEl) {
        this.connectedElement = audioEl
        this.sourceNode = this.audioCtx.createMediaElementSource(audioEl)
      }

      // Master Input Headroom Gain (prevents digital clipping during boosts)
      this.inputGain = this.audioCtx.createGain()
      this.inputGain.gain.value = 0.95

      // Sub-Bass Shelf (low frequencies 40Hz - 100Hz)
      this.subBassFilter = this.audioCtx.createBiquadFilter()
      this.subBassFilter.type = "lowshelf"
      this.subBassFilter.frequency.value = 85
      this.subBassFilter.gain.value = 0

      // Low-Mid Punch Filter (180Hz - 320Hz)
      this.midPunchFilter = this.audioCtx.createBiquadFilter()
      this.midPunchFilter.type = "peaking"
      this.midPunchFilter.frequency.value = 240
      this.midPunchFilter.Q.value = 1.1
      this.midPunchFilter.gain.value = 0

      // Vocal Presence Filter (2.4kHz - 3.4kHz)
      this.vocalPresenceFilter = this.audioCtx.createBiquadFilter()
      this.vocalPresenceFilter.type = "peaking"
      this.vocalPresenceFilter.frequency.value = 2800
      this.vocalPresenceFilter.Q.value = 1.2
      this.vocalPresenceFilter.gain.value = 0

      // Vocal Air High-Shelf Filter (9kHz - 14kHz)
      this.vocalAirFilter = this.audioCtx.createBiquadFilter()
      this.vocalAirFilter.type = "highshelf"
      this.vocalAirFilter.frequency.value = 11000
      this.vocalAirFilter.gain.value = 0

      // Real-time Audio Analyser
      this.analyser = this.audioCtx.createAnalyser()
      this.analyser.fftSize = 128
      this.analyser.smoothingTimeConstant = 0.75
      this.freqData = new Uint8Array(new ArrayBuffer(this.analyser.frequencyBinCount))

      // Spatial Concert Processing Chain (Binaural Cross-feed & Ambient Delay)
      this.spatialDryGain = this.audioCtx.createGain()
      this.spatialDryGain.gain.value = 1.0

      this.spatialWetGain = this.audioCtx.createGain()
      this.spatialWetGain.gain.value = 0.0

      this.splitter = this.audioCtx.createChannelSplitter(2)
      this.merger = this.audioCtx.createChannelMerger(2)
      this.delayLeft = this.audioCtx.createDelay()
      this.delayLeft.delayTime.value = 0.007 // 7ms left separation
      this.delayRight = this.audioCtx.createDelay()
      this.delayRight.delayTime.value = 0.016 // 16ms right separation

      // Connect Equalizer Chain:
      // Source -> InputGain -> SubBass -> MidPunch -> VocalPresence -> VocalAir -> Analyser
      this.sourceNode.connect(this.inputGain)
      this.inputGain.connect(this.subBassFilter)
      this.subBassFilter.connect(this.midPunchFilter)
      this.midPunchFilter.connect(this.vocalPresenceFilter)
      this.vocalPresenceFilter.connect(this.vocalAirFilter)
      this.vocalAirFilter.connect(this.analyser)

      // Split Analyser out into Dry and Wet paths:
      // Dry path: Analyser -> SpatialDryGain -> Destination
      this.analyser.connect(this.spatialDryGain)
      this.spatialDryGain.connect(this.audioCtx.destination)

      // Wet Spatial path: Analyser -> Splitter -> Delays -> Merger -> SpatialWetGain -> Destination
      this.analyser.connect(this.splitter)
      this.splitter.connect(this.delayLeft, 0)
      this.splitter.connect(this.delayRight, 1)
      this.delayLeft.connect(this.merger, 0, 0)
      this.delayRight.connect(this.merger, 0, 1)
      this.merger.connect(this.spatialWetGain)
      this.spatialWetGain.connect(this.audioCtx.destination)

      this.isInitialized = true
      this.applyMode(this.currentMode)
      return true
    } catch (err) {
      console.warn("Melofy AudioDspEngine initialization note:", err)
      return false
    }
  }

  /**
   * Resumes AudioContext if suspended by browser autoplay policies.
   */
  public resume(): void {
    if (this.audioCtx && this.audioCtx.state === "suspended") {
      this.audioCtx.resume().catch(() => {})
    }
  }

  /**
   * Smoothly changes soundstage acoustic profile with smooth parameter ramping.
   */
  public applyMode(mode: SoundstageMode): void {
    this.currentMode = mode
    if (!this.audioCtx || !this.isInitialized) return

    this.resume()
    const now = this.audioCtx.currentTime
    const t = 0.08 // 80ms smooth transition ramp to eliminate any clicks

    if (
      !this.subBassFilter ||
      !this.midPunchFilter ||
      !this.vocalPresenceFilter ||
      !this.vocalAirFilter ||
      !this.spatialDryGain ||
      !this.spatialWetGain
    ) {
      return
    }

    switch (mode) {
      case "club_bass":
        // Deep low-end harmonic boost (+8.5dB sub-bass, +3.5dB kick punch, subtle treble shimmer)
        this.subBassFilter.gain.setTargetAtTime(8.5, now, t)
        this.midPunchFilter.gain.setTargetAtTime(3.5, now, t)
        this.vocalPresenceFilter.gain.setTargetAtTime(-1.0, now, t)
        this.vocalAirFilter.gain.setTargetAtTime(1.5, now, t)
        this.spatialDryGain.gain.setTargetAtTime(1.0, now, t)
        this.spatialWetGain.gain.setTargetAtTime(0.08, now, t)
        break

      case "vocal_air":
        // Clear de-mudded low end, crisp vocal presence, and high-frequency acoustic air
        this.subBassFilter.gain.setTargetAtTime(-2.5, now, t)
        this.midPunchFilter.gain.setTargetAtTime(-3.0, now, t)
        this.vocalPresenceFilter.gain.setTargetAtTime(5.5, now, t)
        this.vocalAirFilter.gain.setTargetAtTime(6.5, now, t)
        this.spatialDryGain.gain.setTargetAtTime(1.0, now, t)
        this.spatialWetGain.gain.setTargetAtTime(0.05, now, t)
        break

      case "spatial_concert":
        // Wide 3D binaural dimensional stage with concert hall depth
        this.subBassFilter.gain.setTargetAtTime(2.5, now, t)
        this.midPunchFilter.gain.setTargetAtTime(0.5, now, t)
        this.vocalPresenceFilter.gain.setTargetAtTime(2.5, now, t)
        this.vocalAirFilter.gain.setTargetAtTime(4.0, now, t)
        this.spatialDryGain.gain.setTargetAtTime(0.7, now, t)
        this.spatialWetGain.gain.setTargetAtTime(0.75, now, t)
        break

      case "pure":
      default:
        // Studio Reference: Perfectly flat, zero coloration bit-perfect master curve
        this.subBassFilter.gain.setTargetAtTime(0.0, now, t)
        this.midPunchFilter.gain.setTargetAtTime(0.0, now, t)
        this.vocalPresenceFilter.gain.setTargetAtTime(0.0, now, t)
        this.vocalAirFilter.gain.setTargetAtTime(0.0, now, t)
        this.spatialDryGain.gain.setTargetAtTime(1.0, now, t)
        this.spatialWetGain.gain.setTargetAtTime(0.0, now, t)
        break
    }
  }

  /**
   * Retrieves real-time audio metrics for dynamic visualizers and reactive ambient lighting.
   */
  public getReactivityData(): {
    bassLevel: number
    midLevel: number
    trebleLevel: number
    overallLevel: number
  } {
    if (!this.analyser || !this.freqData) {
      return { bassLevel: 0, midLevel: 0, trebleLevel: 0, overallLevel: 0 }
    }

    try {
      this.analyser.getByteFrequencyData(this.freqData as any)
      const binCount = this.freqData.length
      if (binCount === 0) return { bassLevel: 0, midLevel: 0, trebleLevel: 0, overallLevel: 0 }

      // Sub-bass / Bass range (bins 0 to 6)
      let bassSum = 0
      const bassBins = Math.min(6, binCount)
      for (let i = 0; i < bassBins; i++) {
        bassSum += this.freqData[i]
      }
      const bassLevel = bassSum / (bassBins * 255)

      // Mid range (bins 6 to 24)
      let midSum = 0
      const midBinsEnd = Math.min(24, binCount)
      const midCount = Math.max(1, midBinsEnd - bassBins)
      for (let i = bassBins; i < midBinsEnd; i++) {
        midSum += this.freqData[i]
      }
      const midLevel = midSum / (midCount * 255)

      // Treble range (bins 24 to binCount)
      let trebleSum = 0
      const trebleCount = Math.max(1, binCount - midBinsEnd)
      for (let i = midBinsEnd; i < binCount; i++) {
        trebleSum += this.freqData[i]
      }
      const trebleLevel = trebleSum / (trebleCount * 255)

      const overallLevel = bassLevel * 0.5 + midLevel * 0.35 + trebleLevel * 0.15

      return { bassLevel, midLevel, trebleLevel, overallLevel }
    } catch {
      return { bassLevel: 0, midLevel: 0, trebleLevel: 0, overallLevel: 0 }
    }
  }
}

// Global singleton instance
export const audioDsp = new AudioDspEngine()
