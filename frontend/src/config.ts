/**
 * Global Configuration for Tunely Music Web Player.
 */
const envApi = process.env.NEXT_PUBLIC_API_URL?.trim()
export const APP_CONFIG = {
  name: "Tunely",
  version: "1.0.0",
  defaultUser: {
    id: "1",
    displayName: "Guest",
    avatarUrl: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&q=80",
  },
  apiBase: (envApi && envApi.length > 0 ? envApi : "https://melofy-ubj8.onrender.com").replace(/\/$/, ""),
  accentColor: "#1DB954",
  accentColorHover: "#1ED760",
}
