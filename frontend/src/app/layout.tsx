import type { Metadata, Viewport } from "next"
import { Inter } from "next/font/google"
import Sidebar from "@/components/Sidebar"
import RightSidebar from "@/components/RightSidebar"
import Player from "@/components/Player"
import MobileTabBar from "@/components/MobileTabBar"
import ImportModal from "@/components/ImportModal"
import LyricView from "@/components/LyricView"
import QueuePanel from "@/components/QueuePanel"
import ToastContainer from "@/components/ToastContainer"
import ContextMenu from "@/components/ContextMenu"
import PlaylistModal from "@/components/PlaylistModal"
import SettingsModal from "@/components/SettingsModal"
import ProfileModal from "@/components/ProfileModal"
import AuthModal from "@/components/AuthModal"
import BackendWarmup from "@/components/BackendWarmup"
import AmbientGlow from "@/components/AmbientGlow"
import ImmersiveVisualizer from "@/components/ImmersiveVisualizer"
import MotionLyrics from "@/components/MotionLyrics"
import "./globals.css"

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: "Tunely - Web Player: Music for everyone",
  description: "Spotify-style web player with intelligent personalization and offline-ready streaming",
  manifest: "/manifest.json",
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Tunely",
  },
}

export const viewport: Viewport = {
  themeColor: "#000000",
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} h-full antialiased dark`}>
      <body suppressHydrationWarning className="flex h-[100dvh] bg-black text-white overflow-hidden relative font-sans">
        {/* Global Reactive Ambient Lighting Aura Canvas */}
        <AmbientGlow />

        {/* Main Application Flex Container */}
        <div className="flex w-full h-[calc(100dvh-56px)] md:h-[calc(100dvh-104px)] p-0 md:p-3 gap-0 md:gap-3 relative z-10">
          {/* Left Sidebar (Desktop full, Tablet collapsed, Mobile hidden) */}
          <div className="hidden md:flex flex-shrink-0">
            <Sidebar />
          </div>

          {/* Center Main View Area with Liquid Glass Refraction */}
          <div className="flex-1 rounded-none md:rounded-2xl overflow-hidden liquid-glass relative flex flex-col min-w-0 transition-all duration-300">
            {children}
          </div>

          {/* Right Sidebar (Now Playing & Queue - Desktop only >= 1024px) */}
          <div className="hidden lg:flex flex-shrink-0">
            <RightSidebar />
          </div>
        </div>

        {/* Floating Liquid Glass Player Bar */}
        <Player />

        {/* Mobile Bottom Navigation Tab Bar (Home, Search, Your Library) */}
        <MobileTabBar />

        {/* Global Modals & Overlays */}
        <AuthModal />
        <ImportModal />
        <PlaylistModal />
        <SettingsModal />
        <ProfileModal />
        <LyricView />
        <QueuePanel />
        <ContextMenu />
        <ToastContainer />
        <BackendWarmup />

        {/* Immersive Full-Screen Audio Visualizer + Motion Graphics Lyrics */}
        <ImmersiveVisualizer />
        <MotionLyrics />
      </body>
    </html>
  )
}

