"use client"

import { useRouter } from "next/navigation"
import { Nunito_Sans } from "next/font/google"
import { LoginCard } from "@/components/auth/LoginCard"

const nunitoSans = Nunito_Sans({ subsets: ["latin"] })

export default function LoginPage() {
  const router = useRouter()
  return (
    <div className={`min-h-screen flex items-center justify-center bg-neutral-100 ${nunitoSans.className}`}>
      <LoginCard onSuccess={() => router.replace("/card")} />
    </div>
  )
}
