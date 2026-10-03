import { create } from 'zustand'
import { Song, recordInteraction } from '@/lib/api'

export type RepeatMode = 'off' | 'all' | 'one'
export type RightSidebarView = 'now_playing' | 'queue'

interface PlayerState {
  currentSong: Song | null
  isPlaying: boolean
  queue: Song[]
  originalQueue: Song[]
  queueIndex: number
  volume: number
  previousVolume: number
  isMuted: boolean
  progress: number
  duration: number
  shuffle: boolean
  repeatMode: RepeatMode
  isLyricsOpen: boolean
  isQueueOpen: boolean
  isRightSidebarOpen: boolean
  rightSidebarView: RightSidebarView

  // Actions
  setCurrentSong: (song: Song) => void
  setIsPlaying: (isPlaying: boolean) => void
  togglePlay: () => void
  playSongWithQueue: (song: Song, queue: Song[], startIndex?: number) => void
  playNext: () => void
  playPrevious: () => void
  toggleShuffle: () => void
  toggleRepeat: () => void
  setVolume: (volume: number) => void
  toggleMute: () => void
  setProgress: (progress: number) => void
  setDuration: (duration: number) => void
  seekTo: (progress: number) => void
  
  // Queue operations
  addToQueue: (song: Song) => void
  playNextInQueue: (song: Song) => void
  removeFromQueue: (index: number) => void
  clearQueue: () => void
  setQueue: (queue: Song[]) => void

  // Overlays & Panels
  toggleLyrics: () => void
  toggleQueue: () => void
  toggleRightSidebar: () => void
  setRightSidebarView: (view: RightSidebarView) => void
  initFromStorage: () => void
}

function setStorage(key: string, value: any) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {}
}

// Fisher-Yates shuffle
function shuffleArray<T>(array: T[], preserveFirstItem?: T): T[] {
  const arr = [...array]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  if (preserveFirstItem) {
    const idx = arr.findIndex((item: any) => item.id === (preserveFirstItem as any).id)
    if (idx > -1) {
      arr.splice(idx, 1)
      arr.unshift(preserveFirstItem)
    }
  }
  return arr
}

let lastProgressSaveTime = 0

export const usePlayerStore = create<PlayerState>((set, get) => ({
  currentSong: null,
  isPlaying: false,
  queue: [],
  originalQueue: [],
  queueIndex: 0,
  volume: 0.8,
  previousVolume: 0.8,
  isMuted: false,
  progress: 0,
  duration: 0,
  shuffle: false,
  repeatMode: 'off',
  isLyricsOpen: false,
  isQueueOpen: false,
  isRightSidebarOpen: false,
  rightSidebarView: 'now_playing',

  initFromStorage: () => {
    if (typeof window === 'undefined') return
    try {
      const v = localStorage.getItem('tunely_volume')
      const s = localStorage.getItem('tunely_shuffle')
      const r = localStorage.getItem('tunely_repeat')
      const rs = localStorage.getItem('tunely_right_sidebar')

      const savedSongStr = localStorage.getItem('melofy_current_song')
      const savedQueueStr = localStorage.getItem('melofy_queue')
      const savedQueueIdx = localStorage.getItem('melofy_queue_index')
      const savedProgress = localStorage.getItem('melofy_last_progress')

      let restoredSong: Song | null = null
      let restoredQueue: Song[] = []
      let restoredIndex = 0
      let restoredProgress = 0

      if (savedSongStr) {
        try {
          restoredSong = JSON.parse(savedSongStr)
        } catch {}
      }
      if (savedQueueStr) {
        try {
          restoredQueue = JSON.parse(savedQueueStr)
        } catch {}
      }
      if (savedQueueIdx !== null) {
        try {
          restoredIndex = Number(JSON.parse(savedQueueIdx)) || 0
        } catch {
          restoredIndex = Number(savedQueueIdx) || 0
        }
      }
      if (savedProgress !== null) {
        try {
          restoredProgress = Number(JSON.parse(savedProgress)) || 0
        } catch {
          restoredProgress = Number(savedProgress) || 0
        }
      }

      set({
        ...(restoredSong
          ? {
              currentSong: restoredSong,
              isPlaying: false, // Start paused on initial session restore
              progress: restoredProgress,
              duration: restoredSong.duration || 0,
            }
          : {}),
        ...(restoredQueue && restoredQueue.length > 0
          ? {
              queue: restoredQueue,
              originalQueue: restoredQueue,
              queueIndex: restoredIndex,
            }
          : {}),
        ...(v !== null ? { volume: Number(JSON.parse(v)) } : {}),
        ...(s !== null ? { shuffle: Boolean(JSON.parse(s)) } : {}),
        ...(r !== null ? { repeatMode: JSON.parse(r) } : {}),
        ...(rs !== null ? { isRightSidebarOpen: Boolean(JSON.parse(rs)) } : {}),
      })
    } catch (e) {
      console.warn("Player storage restoration note:", e)
    }
  },

  setCurrentSong: (song) => {
    set({ currentSong: song, isPlaying: true, progress: 0, duration: song.duration || 0 })
    setStorage('melofy_current_song', song)
    setStorage('melofy_last_progress', 0)
  },

  setIsPlaying: (isPlaying) => set({ isPlaying }),

  togglePlay: () => {
    const { isPlaying, currentSong, queue } = get()
    if (!currentSong && queue.length > 0) {
      get().playSongWithQueue(queue[0], queue, 0)
      return
    }
    set({ isPlaying: !isPlaying })
  },

  playSongWithQueue: (song, queue, startIndex) => {
    const { shuffle } = get()
    const rawQueue = queue.length > 0 ? queue : [song]
    const idx = startIndex !== undefined ? startIndex : rawQueue.findIndex((s) => s.id === song.id)
    const effectiveIdx = idx >= 0 ? idx : 0

    let activeQueue = rawQueue
    if (shuffle) {
      activeQueue = shuffleArray(rawQueue, song)
    }

    set({
      currentSong: song,
      queue: activeQueue,
      originalQueue: rawQueue,
      queueIndex: shuffle ? 0 : effectiveIdx,
      isPlaying: true,
      progress: 0,
      duration: song.duration || 0,
    })

    setStorage('melofy_current_song', song)
    setStorage('melofy_queue', rawQueue)
    setStorage('melofy_queue_index', shuffle ? 0 : effectiveIdx)
    setStorage('melofy_last_progress', 0)
  },

  playNext: () => {
    const { queue, queueIndex, repeatMode, currentSong } = get()
    if (repeatMode === 'one' && currentSong) {
      // Repeat track: reset progress and play
      set({ progress: 0, isPlaying: true })
      setStorage('melofy_last_progress', 0)
      return
    }

    if (queue.length === 0) return

    const nextIndex = queueIndex + 1
    if (nextIndex < queue.length) {
      const nextSong = queue[nextIndex]
      set({
        currentSong: nextSong,
        queueIndex: nextIndex,
        isPlaying: true,
        progress: 0,
        duration: nextSong.duration || 0,
      })
      setStorage('melofy_current_song', nextSong)
      setStorage('melofy_queue_index', nextIndex)
      setStorage('melofy_last_progress', 0)
    } else if (repeatMode === 'all') {
      // Wrap around
      const firstSong = queue[0]
      set({
        currentSong: firstSong,
        queueIndex: 0,
        isPlaying: true,
        progress: 0,
        duration: firstSong.duration || 0,
      })
      setStorage('melofy_current_song', firstSong)
      setStorage('melofy_queue_index', 0)
      setStorage('melofy_last_progress', 0)
    } else {
      set({ isPlaying: false, progress: 0 })
      setStorage('melofy_last_progress', 0)
    }
  },

  playPrevious: () => {
    const { progress, queue, queueIndex } = get()
    // Spotify logic: If song played for more than 3 seconds, restart it
    if (progress > 3) {
      set({ progress: 0 })
      setStorage('melofy_last_progress', 0)
      return
    }

    if (queueIndex > 0) {
      const prevIndex = queueIndex - 1
      const prevSong = queue[prevIndex]
      set({
        currentSong: prevSong,
        queueIndex: prevIndex,
        isPlaying: true,
        progress: 0,
        duration: prevSong.duration || 0,
      })
      setStorage('melofy_current_song', prevSong)
      setStorage('melofy_queue_index', prevIndex)
      setStorage('melofy_last_progress', 0)
    } else {
      set({ progress: 0 })
      setStorage('melofy_last_progress', 0)
    }
  },

  toggleShuffle: () => {
    const { shuffle, queue, currentSong, originalQueue } = get()
    const nextShuffle = !shuffle
    setStorage('tunely_shuffle', nextShuffle)

    if (nextShuffle) {
      // Turn shuffle ON
      const shuffled = shuffleArray(queue, currentSong || undefined)
      set({
        shuffle: true,
        queue: shuffled,
        queueIndex: currentSong ? shuffled.findIndex((s) => s.id === currentSong.id) : 0,
      })
    } else {
      // Turn shuffle OFF: restore original queue order
      const restored = originalQueue.length > 0 ? originalQueue : queue
      set({
        shuffle: false,
        queue: restored,
        queueIndex: currentSong ? restored.findIndex((s) => s.id === currentSong.id) : 0,
      })
    }
  },

  toggleRepeat: () => {
    const { repeatMode } = get()
    const nextMode: RepeatMode = repeatMode === 'off' ? 'all' : repeatMode === 'all' ? 'one' : 'off'
    setStorage('tunely_repeat', nextMode)
    set({ repeatMode: nextMode })
  },

  setVolume: (volume) => {
    const bounded = Math.max(0, Math.min(1, volume))
    setStorage('tunely_volume', bounded)
    set({ volume: bounded, isMuted: bounded === 0 })
  },

  toggleMute: () => {
    const { isMuted, volume, previousVolume } = get()
    if (isMuted) {
      set({ volume: previousVolume || 0.8, isMuted: false })
    } else {
      set({ previousVolume: volume, volume: 0, isMuted: true })
    }
  },

  setProgress: (progress) => {
    set({ progress })
    const now = Date.now()
    if (now - lastProgressSaveTime > 1500) {
      lastProgressSaveTime = now
      setStorage('melofy_last_progress', Math.floor(progress))
    }
  },
  setDuration: (duration) => set({ duration }),
  seekTo: (progress) => {
    set({ progress })
    setStorage('melofy_last_progress', Math.floor(progress))
  },

  addToQueue: (song) => {
    const { queue, originalQueue, currentSong } = get()
    if (!currentSong) {
      get().playSongWithQueue(song, [song], 0)
      return
    }
    const newQueue = [...queue, song]
    set({
      queue: newQueue,
      originalQueue: [...originalQueue, song],
    })
    setStorage('melofy_queue', newQueue)
  },

  playNextInQueue: (song) => {
    const { queue, queueIndex, originalQueue } = get()
    const newQueue = [...queue]
    newQueue.splice(queueIndex + 1, 0, song)
    set({
      queue: newQueue,
      originalQueue: [...originalQueue, song],
    })
    setStorage('melofy_queue', newQueue)
  },

  removeFromQueue: (index) => {
    const { queue, queueIndex } = get()
    const newQueue = queue.filter((_, i) => i !== index)
    let newIndex = queueIndex
    if (index < queueIndex) {
      newIndex = queueIndex - 1
    }
    set({ queue: newQueue, queueIndex: newIndex })
    setStorage('melofy_queue', newQueue)
    setStorage('melofy_queue_index', newIndex)
  },

  clearQueue: () => {
    const { currentSong } = get()
    const q = currentSong ? [currentSong] : []
    set({
      queue: q,
      originalQueue: q,
      queueIndex: 0,
    })
    setStorage('melofy_queue', q)
    setStorage('melofy_queue_index', 0)
  },

  setQueue: (queue) => {
    set({ queue, originalQueue: queue })
    setStorage('melofy_queue', queue)
  },

  toggleLyrics: () => set((state) => ({ isLyricsOpen: !state.isLyricsOpen, isQueueOpen: false })),
  toggleQueue: () => set((state) => ({ isQueueOpen: !state.isQueueOpen, isLyricsOpen: false })),
  toggleRightSidebar: () => {
    const nextState = !get().isRightSidebarOpen
    setStorage('tunely_right_sidebar', nextState)
    set({ isRightSidebarOpen: nextState })
  },
  setRightSidebarView: (view) => set({ rightSidebarView: view, isRightSidebarOpen: true }),
}))
