"use client"

import { useRouter } from "next/navigation"
import { LoginCard } from "@/components/auth/LoginCard"

export default function LoginPage() {
  const router = useRouter()
  return (
    <div className="min-h-screen flex items-center justify-center bg-warm-ivory px-6 py-16">
      <LoginCard onSuccess={() => router.replace("/card")} />
    </div>
  )
}
