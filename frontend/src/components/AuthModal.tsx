"use client"
import React, { useState } from "react"
import { useAuthStore } from "@/store/authStore"
import { useUIStore } from "@/store/uiStore"
import { X, Lock, Mail, User, Eye, EyeOff, Music, AlertCircle } from "lucide-react"

export default function AuthModal() {
  const {
    isAuthModalOpen,
    authModalMode,
    isLoading,
    error,
    closeAuthModal,
    setAuthModalMode,
    login,
    signup,
    clearError,
  } = useAuthStore()

  const { addToast, loadPlaylists, loadLikedSongIds } = useUIStore()

  // Form State
  const [identifier, setIdentifier] = useState("")
  const [email, setEmail] = useState("")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [showPassword, setShowPassword] = useState(false)

  if (!isAuthModalOpen) return null

  const handleModeSwitch = (mode: "login" | "signup") => {
    clearError()
    setAuthModalMode(mode)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    clearError()

    if (authModalMode === "login") {
      if (!identifier.trim() || !password) {
        return
      }
      const success = await login(identifier.trim(), password)
      if (success) {
        addToast("Welcome back!", "success")
        await Promise.all([loadPlaylists(), loadLikedSongIds()])
      }
    } else {
      if (!email.trim() || !username.trim() || !password) {
        return
      }
      const success = await signup(email.trim(), username.trim(), password, displayName.trim())
      if (success) {
        addToast("Account created successfully! Welcome to Melofy.", "success")
        await Promise.all([loadPlaylists(), loadLikedSongIds()])
      }
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-md bg-[#121212] border border-[#282828] rounded-2xl shadow-2xl overflow-hidden flex flex-col p-6 sm:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={closeAuthModal}
          className="absolute top-5 right-5 text-[#b3b3b3] hover:text-white p-1 rounded-full hover:bg-white/10 transition"
          aria-label="Close dialog"
        >
          <X size={20} />
        </button>

        {/* Brand Header */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-12 h-12 rounded-full bg-[#1db954] flex items-center justify-center text-black shadow-lg shadow-[#1db954]/20 mb-3">
            <Music size={26} strokeWidth={2.5} />
          </div>
          <h2 className="text-2xl font-black text-white tracking-tight">
            {authModalMode === "login" ? "Log in to Melofy" : "Sign up for Melofy"}
          </h2>
          <p className="text-xs text-[#b3b3b3] mt-1">
            {authModalMode === "login"
              ? "Access your personalized playlists, recommendations, and library."
              : "Discover music personalized just for you, like Spotify."}
          </p>
        </div>

        {/* Mode Tabs */}
        <div className="flex rounded-full bg-[#242424] p-1 mb-6 border border-white/5">
          <button
            type="button"
            onClick={() => handleModeSwitch("login")}
            className={`flex-1 py-2 text-xs font-bold rounded-full transition-all ${
              authModalMode === "login"
                ? "bg-[#333] text-white shadow"
                : "text-[#b3b3b3] hover:text-white"
            }`}
          >
            Log In
          </button>
          <button
            type="button"
            onClick={() => handleModeSwitch("signup")}
            className={`flex-1 py-2 text-xs font-bold rounded-full transition-all ${
              authModalMode === "signup"
                ? "bg-[#333] text-white shadow"
                : "text-[#b3b3b3] hover:text-white"
            }`}
          >
            Sign Up
          </button>
        </div>

        {/* Error Alert Box */}
        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start space-x-2 text-red-400 text-xs animate-in slide-in-from-top-1">
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
            <span className="leading-tight">{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col space-y-4">
          {authModalMode === "login" ? (
            <>
              {/* Login Identifier */}
              <div>
                <label className="block text-xs font-bold text-white mb-1.5">
                  Email or username
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#727272]">
                    <User size={16} />
                  </div>
                  <input
                    type="text"
                    required
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="Username or email"
                    className="w-full bg-[#242424] hover:bg-[#2a2a2a] focus:bg-[#242424] border border-[#3e3e3e] focus:border-white rounded-md pl-10 pr-4 py-2.5 text-sm text-white placeholder-[#727272] outline-none transition"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs font-bold text-white mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#727272]">
                    <Lock size={16} />
                  </div>
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password"
                    className="w-full bg-[#242424] hover:bg-[#2a2a2a] focus:bg-[#242424] border border-[#3e3e3e] focus:border-white rounded-md pl-10 pr-10 py-2.5 text-sm text-white placeholder-[#727272] outline-none transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-[#727272] hover:text-white"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Sign Up Email */}
              <div>
                <label className="block text-xs font-bold text-white mb-1.5">
                  Email address
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#727272]">
                    <Mail size={16} />
                  </div>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@domain.com"
                    className="w-full bg-[#242424] hover:bg-[#2a2a2a] focus:bg-[#242424] border border-[#3e3e3e] focus:border-white rounded-md pl-10 pr-4 py-2.5 text-sm text-white placeholder-[#727272] outline-none transition"
                  />
                </div>
              </div>

              {/* Username */}
              <div>
                <label className="block text-xs font-bold text-white mb-1.5">
                  Username
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#727272]">
                    <User size={16} />
                  </div>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="e.g. panda"
                    className="w-full bg-[#242424] hover:bg-[#2a2a2a] focus:bg-[#242424] border border-[#3e3e3e] focus:border-white rounded-md pl-10 pr-4 py-2.5 text-sm text-white placeholder-[#727272] outline-none transition"
                  />
                </div>
              </div>

              {/* Display Name */}
              <div>
                <label className="block text-xs font-bold text-white mb-1.5">
                  Display name <span className="text-[#727272] font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="What should we call you?"
                  className="w-full bg-[#242424] hover:bg-[#2a2a2a] focus:bg-[#242424] border border-[#3e3e3e] focus:border-white rounded-md px-4 py-2.5 text-sm text-white placeholder-[#727272] outline-none transition"
                />
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs font-bold text-white mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#727272]">
                    <Lock size={16} />
                  </div>
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    className="w-full bg-[#242424] hover:bg-[#2a2a2a] focus:bg-[#242424] border border-[#3e3e3e] focus:border-white rounded-md pl-10 pr-10 py-2.5 text-sm text-white placeholder-[#727272] outline-none transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-[#727272] hover:text-white"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full mt-2 py-3 bg-[#1db954] hover:bg-[#1ed760] text-black font-bold text-sm rounded-full transition-all duration-200 transform active:scale-[0.98] shadow-md flex items-center justify-center disabled:opacity-50"
          >
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
            ) : authModalMode === "login" ? (
              "Log In"
            ) : (
              "Create Account"
            )}
          </button>
        </form>

        {/* Footer switch prompt */}
        <div className="mt-6 pt-4 border-t border-[#282828] text-center text-xs text-[#b3b3b3]">
          {authModalMode === "login" ? (
            <p>
              Don't have an account?{" "}
              <button
                type="button"
                onClick={() => handleModeSwitch("signup")}
                className="text-white font-bold underline hover:text-[#1db954] transition"
              >
                Sign up for Melofy
              </button>
            </p>
          ) : (
            <p>
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => handleModeSwitch("login")}
                className="text-white font-bold underline hover:text-[#1db954] transition"
              >
                Log in
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
