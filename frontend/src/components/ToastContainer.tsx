"use client"
import { useUIStore } from "@/store/uiStore"
import { Check, Info, AlertCircle, X } from "lucide-react"

export default function ToastContainer() {
  const { toasts, removeToast } = useUIStore()

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center space-y-2 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="pointer-events-auto flex items-center space-x-3 px-4 py-3 rounded-full bg-[#181818] border border-[#2a2a2a] text-white shadow-2xl text-sm font-medium animate-in fade-in slide-in-from-bottom-3 duration-200"
        >
          {toast.type === "error" ? (
            <AlertCircle size={18} className="text-[#e91429]" />
          ) : toast.type === "info" ? (
            <Info size={18} className="text-[#3d91f4]" />
          ) : (
            <Check size={18} className="text-[#1db954]" />
          )}
          <span>{toast.message}</span>
          <button
            onClick={() => removeToast(toast.id)}
            className="ml-2 text-[#b3b3b3] hover:text-white transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}
