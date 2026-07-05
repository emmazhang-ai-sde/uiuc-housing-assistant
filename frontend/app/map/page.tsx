"use client"

import { useEffect, useRef, useState  } from "react"
import dynamic from "next/dynamic"
import AppHeader from "@/components/AppHeader"
import MapFilterBar from "@/components/MapFilterBar"
import SaveButton from "@/components/SaveButton"
import { fetchAllListings } from "@/lib/api"
import type { Listing } from "@/lib/api"
import type { MapViewHandle } from "@/components/MapView"
import { useSaveAction } from "@/hooks/useSaveAction"
import { useFilters } from "@/contexts/FiltersContext"
import { logEvent } from "@/lib/logEvent"

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false })

export default function MapPage() {
  const { filters, setFilters }     = useFilters()
  const [listings, setListings]     = useState<Listing[]>([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(false)
  const mapSave    = useSaveAction()
  const mapViewRef = useRef<MapViewHandle>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(false)

    fetchAllListings(filters)
      .then(data => {
        if (cancelled) return
        setListings(data)
        setLoading(false)
        logEvent("map_search", { filters, result_count: data.length })
      })
      .catch(() => { if (!cancelled) { setError(true); setLoading(false) } })

    return () => { cancelled = true }
  }, [filters])

  const hasAnyFilter =
    !!filters.beds?.length ||
    filters.max_price_per_bed != null ||
    !!filters.property_type ||
    filters.availability_window != null ||
    !!filters.company

  function handleSave() {
    if (!mapViewRef.current) return
    mapSave.trigger(() => mapViewRef.current!.saveMapHtml())
  }

  return (
    <div className="relative h-screen overflow-hidden">
      {/* Full-bleed map fills the entire background */}
      <MapView
        ref={mapViewRef}
        listings={listings}
        filters={filters}
        mapHeight="100%"
        className="absolute inset-0 w-full h-full"
      />

      {/* Floating header pill, centered on top of the map */}
      <div className="absolute top-0 inset-x-0 z-30 pointer-events-none [&_header>div]:pointer-events-auto">
        <AppHeader />
      </div>

      <MapFilterBar filters={filters} onChange={setFilters} />

        {/* Save button — top right */}
        <div className="absolute top-4 right-4 z-10">
          <SaveButton
            status={mapSave.status}
            onClick={handleSave}
            label="Save map HTML"
            disabled={!hasAnyFilter}
            title={!hasAnyFilter ? "No filters selected yet — try picking one above" : undefined}
            className="text-xs py-1.5 shadow-md"
          />
        </div>

        {/* Loading overlay */}
        {loading && (
          <div className="absolute inset-0 bg-white/30 backdrop-blur-[2px] flex items-center justify-center z-20 pointer-events-none">
            <div className="bg-white/90 rounded-2xl shadow-md px-5 py-3 text-sm text-neutral-500">
              Loading listings…
            </div>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && listings.length === 0 && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
            <div className="bg-white/90 rounded-2xl shadow-md px-5 py-3 text-sm text-neutral-500">
              No listings match the current filters.
            </div>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
            <div className="bg-white/90 rounded-2xl shadow-md px-5 py-3 text-sm text-red-500">
              Failed to load listings. Please try again.
            </div>
          </div>
        )}
    </div>
  )
}
