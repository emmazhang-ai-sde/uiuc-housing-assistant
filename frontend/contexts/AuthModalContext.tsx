"use client"

// Pops the login card in place instead of redirecting to /login when a request
// comes back 401 (no session, or an expired one). Mounted once in the root
// layout so any hook/component under it — notably useChat — can call
// openAuthModal() on a 401 and let the user re-authenticate without leaving the
// page they were on. On success the modal just closes; the user can retry the
// action that failed.
import { createContext, useContext, useState, useCallback, ReactNode } from "react"
import { LoginCard } from "@/components/auth/LoginCard"

type AuthModalContextValue = {
  openAuthModal: () => void
  closeAuthModal: () => void
}

const AuthModalContext = createContext<AuthModalContextValue | null>(null)

export function AuthModalProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const openAuthModal = useCallback(() => setOpen(true), [])
  const closeAuthModal = useCallback(() => setOpen(false), [])

  return (
    <AuthModalContext.Provider value={{ openAuthModal, closeAuthModal }}>
      {children}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={closeAuthModal}
          role="dialog"
          aria-modal="true"
        >
          <div className="relative w-full max-w-[480px]" onClick={e => e.stopPropagation()}>
            <button
              type="button"
              onClick={closeAuthModal}
              aria-label="Close"
              className="absolute -top-3 -right-3 z-10 h-8 w-8 rounded-full bg-white shadow-md flex items-center justify-center text-neutral-500 hover:text-black transition-colors"
            >
              ✕
            </button>
            <LoginCard onSuccess={closeAuthModal} />
          </div>
        </div>
      )}
    </AuthModalContext.Provider>
  )
}

export function useAuthModal() {
  const ctx = useContext(AuthModalContext)
  if (!ctx) throw new Error("useAuthModal must be used within AuthModalProvider")
  return ctx
}
