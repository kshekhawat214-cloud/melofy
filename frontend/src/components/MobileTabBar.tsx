"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Home, Search, Library } from "lucide-react"

export default function MobileTabBar() {
  const pathname = usePathname()

  const tabs = [
    {
      label: "Home",
      href: "/",
      icon: Home,
      isActive: pathname === "/",
    },
    {
      label: "Search",
      href: "/search",
      icon: Search,
      isActive: pathname.startsWith("/search"),
    },
    {
      label: "Your Library",
      href: "/library",
      icon: Library,
      isActive: pathname.startsWith("/library") || pathname.startsWith("/liked") || pathname.startsWith("/playlist"),
    },
  ]

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#121212]/95 backdrop-blur-md border-t border-[#222] h-14 flex items-center justify-around px-4 pb-[env(safe-area-inset-bottom)] select-none">
      {tabs.map((tab) => {
        const Icon = tab.icon
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex flex-col items-center justify-center flex-1 py-1 transition-colors min-h-[44px] ${
              tab.isActive ? "text-white font-semibold" : "text-[#b3b3b3] hover:text-white"
            }`}
          >
            <Icon size={22} strokeWidth={tab.isActive ? 2.5 : 2} className="mb-0.5" />
            <span className="text-[10px] tracking-tight">{tab.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
