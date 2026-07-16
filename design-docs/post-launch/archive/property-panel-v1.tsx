"use client"

import { Listing } from "@/lib/api"
import { DrawerContent } from "@/components/PropertyDrawer"

// Docked, always-visible counterpart to PropertyDrawer — used where a modal
// overlay would force clicking back and forth (e.g. the Chat page). Reserves
// a fixed-width column so property details "just appear" next to the
// conversation instead of covering it.
export default function PropertyPanel({
  listing,
  onClose,
}: {
  listing: Listing | null
  onClose: () => void
}) {
  return (
    <aside className="hidden lg:flex flex-col relative w-[420px] shrink-0 h-full bg-white border-l border-neutral-100 overflow-y-auto">
      {listing ? (
        <DrawerContent listing={listing} onClose={onClose} />
      ) : (
        <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-8">
          <div className="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center text-xl">
            🏠
          </div>
          <p className="text-sm text-neutral-400 max-w-[220px] leading-relaxed">
            Select a listing to see its full details here
          </p>
        </div>
      )}
    </aside>
  )
}
