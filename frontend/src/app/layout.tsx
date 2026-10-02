import type { Metadata } from "next"
import { Inter } from "next/font/google"
import Sidebar from "@/components/Sidebar"
import RightSidebar from "@/components/RightSidebar"
import Player from "@/components/Player"
import ImportModal from "@/components/ImportModal"
import LyricView from "@/components/LyricView"
import QueuePanel from "@/components/QueuePanel"
import ToastContainer from "@/components/ToastContainer"
import ContextMenu from "@/components/ContextMenu"
import PlaylistModal from "@/components/PlaylistModal"
import SettingsModal from "@/components/SettingsModal"
import ProfileModal from "@/components/ProfileModal"
import "./globals.css"

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: "Tunely - Web Player: Music for everyone",
  description: "Spotify-style web player with intelligent personalization and offline-ready streaming",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} h-full antialiased dark`}>
      <body suppressHydrationWarning className="flex h-screen bg-black text-white overflow-hidden relative font-sans">
        {/* Main Application Flex Container (8px outer padding & gap) */}
        <div className="flex w-full h-[calc(100vh-88px)] p-2 gap-2">
          {/* Left Sidebar */}
          <Sidebar />

          {/* Center Main View Area */}
          <div className="flex-1 rounded-lg overflow-hidden bg-[#121212] relative flex flex-col min-w-0">
            {children}
          </div>

          {/* Right Sidebar (Now Playing & Queue) */}
          <RightSidebar />
        </div>

        {/* Fixed Player Bar */}
        <Player />

        {/* Global Modals & Overlays */}
        <ImportModal />
        <PlaylistModal />
        <SettingsModal />
        <ProfileModal />
        <LyricView />
        <QueuePanel />
        <ContextMenu />
        <ToastContainer />
      </body>
    </html>
  )
}
