import { create } from "zustand"
import { API_BASE } from "@/lib/api"

export interface AuthUser {
  id: string
  username: string
  displayName: string
  email: string
  avatarUrl?: string
  playlistCount?: number
  likedCount?: number
  createdAt?: string
}

interface AuthState {
  user: AuthUser | null
  token: string | null
  isAuthenticated: boolean
  isAuthModalOpen: boolean
  authModalMode: "login" | "signup"
  isLoading: boolean
  error: string | null

  // Modal actions
  openLoginModal: () => void
  openSignupModal: () => void
  closeAuthModal: () => void
  setAuthModalMode: (mode: "login" | "signup") => void
  clearError: () => void

  // Auth actions
  login: (identifier: string, password: string) => Promise<boolean>
  signup: (email: string, username: string, password: string, displayName?: string) => Promise<boolean>
  logout: () => void
  initAuth: () => Promise<void>
}

const TOKEN_KEY = "melofy_auth_token"
const USER_KEY = "melofy_auth_user"

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  isAuthModalOpen: false,
  authModalMode: "login",
  isLoading: false,
  error: null,

  openLoginModal: () => set({ isAuthModalOpen: true, authModalMode: "login", error: null }),
  openSignupModal: () => set({ isAuthModalOpen: true, authModalMode: "signup", error: null }),
  closeAuthModal: () => set({ isAuthModalOpen: false, error: null }),
  setAuthModalMode: (mode) => set({ authModalMode: mode, error: null }),
  clearError: () => set({ error: null }),

  login: async (identifier: string, password: string): Promise<boolean> => {
    set({ isLoading: true, error: null })
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password }),
      })

      const data = await res.json()
      if (!res.ok) {
        set({ isLoading: false, error: data.detail || "Login failed. Please check your credentials." })
        return false
      }

      const { token, user } = data
      if (typeof window !== "undefined") {
        localStorage.setItem(TOKEN_KEY, token)
        localStorage.setItem(USER_KEY, JSON.stringify(user))
      }

      set({
        user,
        token,
        isAuthenticated: true,
        isAuthModalOpen: false,
        isLoading: false,
        error: null,
      })

      // Dispatch global event for library/shelf refresh
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("melofy_auth_change", { detail: { user } }))
      }

      return true
    } catch (err: any) {
      set({ isLoading: false, error: err.message || "Network error. Please try again." })
      return false
    }
  },

  signup: async (email: string, username: string, password: string, displayName?: string): Promise<boolean> => {
    set({ isLoading: true, error: null })
    try {
      const res = await fetch(`${API_BASE}/api/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          username,
          password,
          display_name: displayName || username,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        set({ isLoading: false, error: data.detail || "Sign up failed. Please check your information." })
        return false
      }

      const { token, user } = data
      if (typeof window !== "undefined") {
        localStorage.setItem(TOKEN_KEY, token)
        localStorage.setItem(USER_KEY, JSON.stringify(user))
      }

      set({
        user,
        token,
        isAuthenticated: true,
        isAuthModalOpen: false,
        isLoading: false,
        error: null,
      })

      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("melofy_auth_change", { detail: { user } }))
      }

      return true
    } catch (err: any) {
      set({ isLoading: false, error: err.message || "Network error. Please try again." })
      return false
    }
  },

  logout: () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(USER_KEY)
    }

    set({
      user: null,
      token: null,
      isAuthenticated: false,
      error: null,
    })

    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("melofy_auth_change", { detail: { user: null } }))
    }
  },

  initAuth: async () => {
    if (typeof window === "undefined") return

    try {
      const savedToken = localStorage.getItem(TOKEN_KEY)
      const savedUserStr = localStorage.getItem(USER_KEY)

      if (savedToken && savedUserStr) {
        const cachedUser = JSON.parse(savedUserStr)
        set({ token: savedToken, user: cachedUser, isAuthenticated: true })

        // Revalidate with server in background
        const res = await fetch(`${API_BASE}/api/auth/me`, {
          headers: { Authorization: `Bearer ${savedToken}` },
        })

        if (res.ok) {
          const data = await res.json()
          if (data.user && data.isAuthenticated) {
            set({ user: data.user, isAuthenticated: true })
            localStorage.setItem(USER_KEY, JSON.stringify(data.user))
          }
        } else if (res.status === 401) {
          // Token expired or invalid
          get().logout()
        }
      }
    } catch (e) {
      console.warn("Auth initialization notice:", e)
    }
  },
}))
