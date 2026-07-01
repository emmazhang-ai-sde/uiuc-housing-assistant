"use client"

import { useState, useRef, forwardRef, useImperativeHandle } from "react"
import Map, { Marker, Popup, Source, Layer } from "react-map-gl/maplibre"
import type { MapRef } from "react-map-gl/maplibre"
import type { FillLayerSpecification, LineLayerSpecification } from "maplibre-gl"
import { Listing, Filters } from "@/lib/api"
import { LANDMARKS, Landmark } from "@/lib/landmarks"
import { COMPANY_LOGOS } from "@/lib/companies"
import { availabilityStatus, bedsLabel } from "@/lib/availability"
import { exportMapAsHtml } from "@/lib/exportMap"

const MAP_STYLE = "https://tiles.openfreemap.org/styles/positron"
const MAP_HEIGHT = "clamp(560px, 60vh, 720px)"

const DEFAULT_VIEW = { longitude: -88.227, latitude: 40.1095, zoom: 14 }

// Exact OSM polygon for the UIUC Main Quad (way fetched from Overpass API).
// Coordinates are [lng, lat] per GeoJSON spec.
const MAIN_QUAD_GEOJSON: GeoJSON.Feature<GeoJSON.Polygon> = {
  type: "Feature",
  properties: {},
  geometry: {
    type: "Polygon",
    coordinates: [[
      [-88.2276394, 40.1088443],
      [-88.2269468, 40.1088492],
      [-88.2267993, 40.1088497],
      [-88.2267988, 40.1087509],
      [-88.2267987, 40.1087378],
      [-88.2267984, 40.1086771],
      [-88.2268027, 40.1082303],
      [-88.2268030, 40.1081968],
      [-88.2268054, 40.1078911],
      [-88.2268063, 40.1077776],
      [-88.2268065, 40.1077527],
      [-88.2268084, 40.1075054],
      [-88.2268091, 40.1074146],
      [-88.2268103, 40.1072329],
      [-88.2268109, 40.1071679],
      [-88.2268121, 40.1070321],
      [-88.2268132, 40.1069110],
      [-88.2268191, 40.1064358],
      [-88.2268191, 40.1062461],
      [-88.2268784, 40.1062460],
      [-88.2275150, 40.1062474],
      [-88.2275699, 40.1062482],
      [-88.2275737, 40.1063880],
      [-88.2275804, 40.1066311],
      [-88.2275821, 40.1066940],
      [-88.2275857, 40.1068253],
      [-88.2275883, 40.1069199],
      [-88.2275904, 40.1069970],
      [-88.2275909, 40.1070163],
      [-88.2275974, 40.1072531],
      [-88.2276191, 40.1080493],
      [-88.2276394, 40.1088443],
    ]],
  },
}

const QUAD_FILL_LAYER: FillLayerSpecification = {
  id: "main-quad-fill",
  type: "fill",
  source: "main-quad",
  paint: {
    "fill-color": "#4a7c59",
    "fill-opacity": 0.22,
  },
}

const QUAD_OUTLINE_LAYER: LineLayerSpecification = {
  id: "main-quad-outline",
  type: "line",
  source: "main-quad",
  paint: {
    "line-color": "#4a7c59",
    "line-width": 1.5,
    "line-opacity": 0.7,
  },
}

// Mirrors the badge colors in ListingCard.tsx / globals.css exactly.
const PIN_COLORS: Record<string, { bg: string; text: string }> = {
  now:         { bg: "#D2F55E", text: "#1a1a1a" },  // --color-now-100
  available:   { bg: "#C7DDB5", text: "#1a1a1a" },  // same as badge
  unavailable: { bg: "#f5f5f5", text: "#1a1a1a" },  // neutral-100
}

function pinColors(l: Listing) {
  return PIN_COLORS[availabilityStatus(l.availability ?? "")]
}

function priceLabel(l: Listing): string {
  const v = l.beds <= 1 ? l.price_total_low : l.price_per_bed_low
  return v != null ? `$${v.toLocaleString()}` : "—"
}

interface Props {
  listings: Listing[]
  filters: Filters
  walkMinsByUrl?: Record<string, number | null>
  mapHeight?: string
  className?: string
}

export interface MapViewHandle {
  saveMapHtml: () => Promise<void>
}

const MapView = forwardRef<MapViewHandle, Props>(function MapView({ listings, filters, walkMinsByUrl, mapHeight, className }, ref) {
  const [popup, setPopup]                   = useState<Listing | null>(null)
  const [landmarkPopup, setLandmarkPopup]   = useState<Landmark | null>(null)
  const [saving, setSaving]                 = useState(false)
  const mapRef                              = useRef<MapRef>(null)
  const mapped = listings.filter(l => l.lat != null && l.lng != null)

  async function saveMapImage() {
    const mapInstance = mapRef.current?.getMap()
    if (!mapInstance) return
    setSaving(true)
    try {
      await exportMapAsHtml(mapInstance, listings, filters)
    } catch (e) {
      console.error("Map export failed:", e)
    } finally {
      setSaving(false)
    }
  }

  useImperativeHandle(ref, () => ({ saveMapHtml: saveMapImage }))

  return (
    <div className={className ?? "relative rounded-3xl overflow-hidden shadow-[0_2px_12px_-2px_rgba(0,0,0,0.06)]"}>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <Map
        ref={mapRef}
        {...({ preserveDrawingBuffer: true } as any)}
        initialViewState={DEFAULT_VIEW}
        style={{ width: "100%", height: mapHeight ?? MAP_HEIGHT }}
        mapStyle={MAP_STYLE}
        onClick={() => { setPopup(null); setLandmarkPopup(null) }}
      >
        {/* Main Quad polygon */}
        <Source id="main-quad" type="geojson" data={MAIN_QUAD_GEOJSON}>
          <Layer {...QUAD_FILL_LAYER} />
          <Layer {...QUAD_OUTLINE_LAYER} />
        </Source>

        {/* Listing price pins */}
        {mapped.map((l, i) => {
          const { bg, text } = pinColors(l)
          return (
            <Marker
              key={i}
              longitude={l.lng!}
              latitude={l.lat!}
              anchor="bottom"
              onClick={e => { e.originalEvent.stopPropagation(); setPopup(l); setLandmarkPopup(null) }}
            >
              <div
                style={{ background: bg, color: text }}
                className="px-2 py-0.5 rounded-full text-[11px] font-semibold shadow-md
                           cursor-pointer hover:scale-110 transition-transform select-none
                           border border-white/60"
              >
                {priceLabel(l)}
              </div>
            </Marker>
          )
        })}

        {/* Landmark pins */}
        {LANDMARKS.map((lm) => (
          <Marker
            key={lm.name}
            longitude={lm.lng}
            latitude={lm.lat}
            anchor="bottom"
            onClick={e => { e.originalEvent.stopPropagation(); setLandmarkPopup(lm); setPopup(null) }}
          >
            <div
              title={lm.name}
              className="w-2.5 h-2.5 rounded-full bg-[#4a7c59] border-2 border-white
                         shadow-md cursor-pointer hover:scale-125 transition-transform"
            />
          </Marker>
        ))}

        {landmarkPopup && (
          <Popup
            longitude={landmarkPopup.lng}
            latitude={landmarkPopup.lat}
            anchor="top"
            onClose={() => setLandmarkPopup(null)}
            closeButton={false}
            maxWidth="180px"
          >
            <div className="text-xs font-semibold text-[#2d4f39] px-1 py-0.5">
              {landmarkPopup.name}
            </div>
          </Popup>
        )}

        {popup && (
          <Popup
            longitude={popup.lng!}
            latitude={popup.lat!}
            anchor="top"
            onClose={() => setPopup(null)}
            closeButton={false}
            maxWidth="240px"
          >
            <div className="h-28 bg-neutral-100">
              {popup.photo_url && (
                <img src={popup.photo_url} alt="" className="w-full h-full object-cover block" />
              )}
            </div>
            <div className="text-xs text-neutral-700 p-3 space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                {COMPANY_LOGOS[popup.company]
                  ? <img src={COMPANY_LOGOS[popup.company]} alt={popup.company} className="h-3.5 object-contain object-left" />
                  : <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-wide">{popup.company}</div>
                }
                <a
                  href={popup.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-[11px] font-bold text-neutral-900
                             bg-neutral-100 hover:bg-neutral-900 hover:text-white
                             px-2.5 py-1 rounded-full transition-colors"
                >
                  View Listing
                </a>
              </div>
              <div className="font-semibold text-neutral-900 leading-snug">{popup.address}</div>
              {popup.area && (
                <div className="text-neutral-400 text-[11px] capitalize">{popup.area}</div>
              )}
              <div className="text-neutral-500">
                {popup.unit_type}{bedsLabel(popup.beds, popup.unit_type) ? ` · ${bedsLabel(popup.beds, popup.unit_type)}` : ""}{popup.property_type ? ` · ${popup.property_type}` : ""}
              </div>
              <div className="font-bold text-neutral-900 text-sm">
                {popup.beds <= 1
                  ? <>{priceLabel(popup)}<span className="font-normal text-neutral-400 text-xs">/mo</span></>
                  : <>{priceLabel(popup)}<span className="font-normal text-neutral-400 text-xs">/bed</span></>
                }
              </div>
              <div className={popup.is_available ? "text-green-700 font-medium" : "text-neutral-400"}>
                {popup.availability}
              </div>
              {walkMinsByUrl?.[popup.url] != null && (
                <div className="text-neutral-500 text-[11px]">~{walkMinsByUrl[popup.url]} min walk</div>
              )}
            </div>
          </Popup>
        )}
      </Map>

      {mapped.length < listings.length && (
        <div className="px-4 py-2 text-xs text-neutral-400 bg-white border-t border-neutral-100">
          {mapped.length} of {listings.length} listings have map coordinates
        </div>
      )}
    </div>
  )
})

export default MapView
