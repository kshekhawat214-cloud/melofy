import { create } from 'zustand'
import { Song, Playlist, getPlaylists, getLikedSongIds, likeSong, unlikeSong, getCachedPlaylists, getCachedLikedIds } from '@/lib/api'
import { SEED_PLAYLISTS } from '@/lib/seedCatalog'

export interface Toast {
  id: string
  message: string
  type?: 'success' | 'info' | 'error'
}

export interface ContextMenuState {
  isOpen: boolean
  x: number
  y: number
  song?: Song
  playlistId?: string
  playlist?: Playlist
}

interface UIState {
  // Modals
  isImportModalOpen: boolean
  openImportModal: () => void
  closeImportModal: () => void

  isPlaylistModalOpen: boolean
  playlistModalData: { id?: string; name?: string; description?: string; coverUrl?: string } | null
  openPlaylistModal: (data?: { id?: string; name?: string; description?: string; coverUrl?: string }) => void
  closePlaylistModal: () => void

  isProfileOpen: boolean
  openProfile: () => void
  closeProfile: () => void

  isSettingsOpen: boolean
  openSettings: () => void
  closeSettings: () => void

  // Context Menu
  contextMenu: ContextMenuState
  openContextMenu: (x: number, y: number, song?: Song, playlistId?: string, playlist?: Playlist) => void
  closeContextMenu: () => void

  // Toasts
  toasts: Toast[]
  addToast: (message: string, type?: 'success' | 'info' | 'error') => void
  removeToast: (id: string) => void

  // Sidebar Layout state
  sidebarWidth: number
  isSidebarCollapsed: boolean
  setSidebarWidth: (width: number) => void
  toggleSidebarCollapsed: () => void
  initFromStorage: () => void

  // Liked Songs
  likedSongIds: Set<string>
  loadLikedSongIds: () => Promise<void>
  toggleLikeSong: (song: Song) => Promise<boolean>

  // Playlists
  playlists: Playlist[]
  loadPlaylists: () => Promise<void>
}

export const useUIStore = create<UIState>((set, get) => ({
  isImportModalOpen: false,
  openImportModal: () => set({ isImportModalOpen: true }),
  closeImportModal: () => set({ isImportModalOpen: false }),

  isPlaylistModalOpen: false,
  playlistModalData: null,
  openPlaylistModal: (data) => set({ isPlaylistModalOpen: true, playlistModalData: data || null }),
  closePlaylistModal: () => set({ isPlaylistModalOpen: false, playlistModalData: null }),

  isProfileOpen: false,
  openProfile: () => set({ isProfileOpen: true }),
  closeProfile: () => set({ isProfileOpen: false }),

  isSettingsOpen: false,
  openSettings: () => set({ isSettingsOpen: true }),
  closeSettings: () => set({ isSettingsOpen: false }),

  contextMenu: { isOpen: false, x: 0, y: 0 },
  openContextMenu: (x, y, song, playlistId, playlist) => {
    // Keep context menu on screen
    const menuWidth = 240
    const menuHeight = 260
    const boundedX = Math.min(x, window.innerWidth - menuWidth - 10)
    const boundedY = Math.min(y, window.innerHeight - menuHeight - 10)
    set({ contextMenu: { isOpen: true, x: Math.max(10, boundedX), y: Math.max(10, boundedY), song, playlistId, playlist } })
  },
  closeContextMenu: () => set((state) => ({ contextMenu: { ...state.contextMenu, isOpen: false } })),

  toasts: [],
  addToast: (message, type = 'success') => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    set((state) => ({ toasts: [...state.toasts, { id, message, type }] }))
    setTimeout(() => {
      get().removeToast(id)
    }, 3200)
  },
  removeToast: (id) => {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }))
  },

  sidebarWidth: 280,
  isSidebarCollapsed: false,
  initFromStorage: () => {
    if (typeof window === 'undefined') return
    try {
      const w = localStorage.getItem('tunely_sidebar_w')
      if (w) {
        const num = Number(w)
        if (!isNaN(num)) {
          const clamped = Math.max(72, Math.min(460, num))
          set({ sidebarWidth: clamped, isSidebarCollapsed: clamped <= 90 })
        }
      }
    } catch {}
  },
  setSidebarWidth: (width) => {
    const clamped = Math.max(72, Math.min(460, width))
    if (typeof window !== 'undefined') localStorage.setItem('tunely_sidebar_w', String(clamped))
    set({ sidebarWidth: clamped, isSidebarCollapsed: clamped <= 90 })
  },
  toggleSidebarCollapsed: () => {
    const { isSidebarCollapsed, sidebarWidth } = get()
    if (isSidebarCollapsed) {
      set({ isSidebarCollapsed: false, sidebarWidth: 280 })
      if (typeof window !== 'undefined') localStorage.setItem('tunely_sidebar_w', '280')
    } else {
      set({ isSidebarCollapsed: true, sidebarWidth: 72 })
      if (typeof window !== 'undefined') localStorage.setItem('tunely_sidebar_w', '72')
    }
  },

  likedSongIds: new Set<string>(),
  loadLikedSongIds: async () => {
    if (get().likedSongIds.size === 0) {
      const cached = getCachedLikedIds()
      if (cached.length > 0) {
        set({ likedSongIds: new Set(cached) })
      }
    }
    const ids = await getLikedSongIds()
    if (ids && ids.length >= 0) {
      set({ likedSongIds: new Set(ids) })
    }
  },
  toggleLikeSong: async (song: Song) => {
    const { likedSongIds, addToast } = get()
    const isCurrentlyLiked = likedSongIds.has(song.id)
    const updated = new Set(likedSongIds)

    if (isCurrentlyLiked) {
      updated.delete(song.id)
      set({ likedSongIds: updated })
      await unlikeSong(song.id)
      addToast(`Removed from your Liked Songs`, 'info')
      return false
    } else {
      updated.add(song.id)
      set({ likedSongIds: updated })
      await likeSong(song.id)
      addToast(`Added to your Liked Songs`, 'success')
      return true
    }
  },

  playlists: [],
  loadPlaylists: async () => {
    // 1. Immediately hydrate from cache or seed catalog so sidebar is never empty
    if (get().playlists.length === 0) {
      const cached = getCachedPlaylists()
      if (cached.length > 0) {
        set({ playlists: cached })
      } else if (SEED_PLAYLISTS.length > 0) {
        set({ playlists: SEED_PLAYLISTS })
      }
    }
    // 2. Fetch fresh playlists from server
    const pls = await getPlaylists()
    if (pls && pls.length > 0) {
      set({ playlists: pls })
    } else if (get().playlists.length === 0) {
      // Backend may be cold starting; auto-retry after 2.5s
      setTimeout(() => {
        get().loadPlaylists()
      }, 2500)
    }
  },
}))

if (typeof window !== "undefined") {
  window.addEventListener("melofy_auth_change", () => {
    useUIStore.getState().loadPlaylists()
    useUIStore.getState().loadLikedSongIds()
  })
}
