"use client"

import AppHeader from "@/components/AppHeader"
import FeedbackForm from "@/components/FeedbackForm"
import { inter } from "@/lib/fonts"

export default function FeedbackPage() {
  return (
    <div className={`${inter.className} relative h-screen bg-mist-50 overflow-hidden`}>
      <div className="h-full overflow-y-auto">
        <div className="min-h-full flex items-start justify-center pt-28 pb-10 px-6">
          <div className="w-full max-w-[560px] bg-white rounded-2xl border border-mist-100 shadow-[0_2px_10px_-4px_rgba(53,20,11,0.12)] p-8 sm:p-10">
            <FeedbackForm />
          </div>
        </div>
      </div>

      <div className="absolute top-0 inset-x-0 z-30 pointer-events-none [&_header>div]:pointer-events-auto">
        <AppHeader />
      </div>
    </div>
  )
}
