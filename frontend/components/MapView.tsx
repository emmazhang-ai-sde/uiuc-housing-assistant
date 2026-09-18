"use client"

import { useState, useRef, forwardRef, useImperativeHandle, useMemo } from "react"
import Map, { Marker, Popup, Source, Layer } from "react-map-gl/maplibre"
import type { MapRef } from "react-map-gl/maplibre"
import type { FillLayerSpecification, LineLayerSpecification } from "maplibre-gl"
import { Listing, Filters } from "@/lib/api"
import { LANDMARKS, Landmark } from "@/lib/landmarks"
import { COMPANY_LOGOS } from "@/lib/companies"
import { availabilityStatus, bedsLabel } from "@/lib/availability"
import { exportMapAsHtml } from "@/lib/exportMap"
import { buildMapStyle, GRAIN_DATA_URI, DEFAULT_THEME, themePins, pinTextColor, type MapTheme } from "@/lib/mapTheme"
import ListingPhoto from "@/components/ListingPhoto"
import { heroDisplay } from "@/lib/fonts"

const MAP_HEIGHT = "clamp(560px, 60vh, 720px)"

const DEFAULT_VIEW = { longitude: -88.227, latitude: 40.1095, zoom: 14 }

// react-map-gl's MapProps type omits maplibre's preserveDrawingBuffer option
// (needed so the WebGL canvas can be exported); pass it through untyped.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MAP_EXTRA_PROPS = { preserveDrawingBuffer: true } as any

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

function priceLabel(l: Listing): string {
  const v = l.beds <= 1 ? l.price_total_low : l.price_per_bed_low
  return v != null ? `$${v.toLocaleString()}` : "—"
}

// ── Illustrated building stickers (geo-anchored, scale with zoom) ──────────
// Each hand-drawn building is pinned over its real footprint via an image
// source, so it grows/shrinks with zoom. `widthMeters` is the on-ground width;
// `aspect` is the PNG's height/width so it never distorts. Add more by
// extending this array.
type BuildingSticker = { id: string; url: string; lat: number; lng: number; widthMeters: number; aspect: number }

const BUILDING_STICKERS: BuildingSticker[] = [
  // Grainger Engineering Library illustration over its real footprint.
  { id: "grainger-library", url: "/landmark/Grainger-library.png", lat: 40.1125, lng: -88.2269, widthMeters: 150, aspect: 0.512 },
  // Campus Instructional Facility, one block west of Grainger.
  { id: "cif", url: "/landmark/CIF.png", lat: 40.1125, lng: -88.2283, widthMeters: 90, aspect: 0.667 },
]

function stickerCorners(s: BuildingSticker): [[number, number], [number, number], [number, number], [number, number]] {
  const dLng = (s.widthMeters / 2) / (111320 * Math.cos((s.lat * Math.PI) / 180))
  const dLat = (s.widthMeters * s.aspect / 2) / 110540
  return [
    [s.lng - dLng, s.lat + dLat], // top-left
    [s.lng + dLng, s.lat + dLat], // top-right
    [s.lng + dLng, s.lat - dLat], // bottom-right
    [s.lng - dLng, s.lat - dLat], // bottom-left
  ]
}

interface Props {
  listings: Listing[]
  filters: Filters
  theme?: MapTheme
  showBuildingSticker?: boolean
  walkMinsByUrl?: Record<string, number | null>
  mapHeight?: string
  className?: string
  // Panel mode: when onSelectListing is provided, pin clicks hand the listing
  // to an external detail panel instead of opening the built-in popup.
  selectedListing?: Listing | null
  onSelectListing?: (l: Listing | null) => void
}

export interface MapViewHandle {
  saveMapHtml: () => Promise<void>
}

const MapView = forwardRef<MapViewHandle, Props>(function MapView({ listings, filters, theme = DEFAULT_THEME, showBuildingSticker, walkMinsByUrl, mapHeight, className, selectedListing, onSelectListing }, ref) {
  const [popup, setPopup]                   = useState<Listing | null>(null)
  const [landmarkPopup, setLandmarkPopup]   = useState<Landmark | null>(null)
  const [saving, setSaving]                 = useState(false)
  const mapRef                              = useRef<MapRef>(null)
  const mapped = listings.filter(l => l.lat != null && l.lng != null)

  // Basemap style derived from the chosen theme (Classic → untouched positron).
  const mapStyle = useMemo(() => buildMapStyle(theme), [theme])
  // Availability price-pin backgrounds from the theme (Classic → lime/sage).
  const pins = useMemo(() => themePins(theme), [theme])

  async function saveMapImage() {
    const mapInstance = mapRef.current?.getMap()
    if (!mapInstance) return
    setSaving(true)
    try {
      await exportMapAsHtml(mapInstance, listings, filters, theme)
    } catch (e) {
      console.error("Map export failed:", e)
    } finally {
      setSaving(false)
    }
  }

  useImperativeHandle(ref, () => ({ saveMapHtml: saveMapImage }))

  return (
    <div className={className ?? "relative rounded-3xl overflow-hidden shadow-[0_2px_12px_-2px_rgba(0,0,0,0.06)]"}>
      <Map
        ref={mapRef}
        {...MAP_EXTRA_PROPS}
        initialViewState={DEFAULT_VIEW}
        style={{ width: "100%", height: mapHeight ?? MAP_HEIGHT }}
        mapStyle={mapStyle}
        onClick={() => { setPopup(null); setLandmarkPopup(null); onSelectListing?.(null) }}
      >
        {/* Main Quad polygon */}
        <Source id="main-quad" type="geojson" data={MAIN_QUAD_GEOJSON}>
          <Layer {...QUAD_FILL_LAYER} />
          <Layer {...QUAD_OUTLINE_LAYER} />
        </Source>

        {/* Illustrated building stickers, pinned over their real footprint */}
        {showBuildingSticker && BUILDING_STICKERS.map(s => (
          <Source key={s.id} id={`sticker-${s.id}`} type="image" url={s.url} coordinates={stickerCorners(s)}>
            <Layer id={`sticker-${s.id}-img`} type="raster" paint={{ "raster-opacity": 1, "raster-fade-duration": 0, "raster-resampling": "linear" }} />
          </Source>
        ))}

        {/* Listing price pins */}
        {mapped.map((l, i) => {
          const bg = pins[availabilityStatus(l.availability ?? "")]
          const text = pinTextColor(bg)
          // Same identity the pipeline uses for stable listing IDs: address|unit_type.
          const isSelected = selectedListing != null
            && l.address === selectedListing.address
            && l.unit_type === selectedListing.unit_type
          return (
            <Marker
              key={i}
              longitude={l.lng!}
              latitude={l.lat!}
              anchor="bottom"
              onClick={e => {
                e.originalEvent.stopPropagation()
                if (onSelectListing) onSelectListing(l)
                else setPopup(l)
                setLandmarkPopup(null)
              }}
            >
              <div
                style={{ background: bg, color: text }}
                className={`${heroDisplay.className} px-2.5 py-0.5 rounded-full text-[13px] font-normal leading-none shadow-md
                           cursor-pointer hover:scale-110 transition-transform select-none
                           border ${isSelected ? "border-neutral-900 scale-110 ring-2 ring-neutral-900/20" : "border-white/60"}`}
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
            <ListingPhoto src={popup.photo_url} className="h-28" compact />
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
                  className="shrink-0 text-[11px] font-bold text-white
                             bg-neutral-900 hover:bg-black
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
              {popup.price_note ? (
                <div className="text-xs font-medium text-neutral-500 leading-snug">{popup.price_note}</div>
              ) : (
                <div className={`${heroDisplay.className} text-base font-normal leading-none text-neutral-900`}>
                  {popup.beds <= 1
                    ? <>{priceLabel(popup)}<span className="font-normal text-neutral-400 text-xs">/mo</span></>
                    : <>{priceLabel(popup)}<span className="font-normal text-neutral-400 text-xs">/bed</span></>
                  }
                </div>
              )}
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

      {/* Paper-grain overlay — sits above tiles (and pins) at low opacity */}
      {theme.grain > 0 && (
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `url("${GRAIN_DATA_URI}")`,
            backgroundSize: "220px 220px",
            mixBlendMode: "multiply",
            opacity: theme.grain,
          }}
        />
      )}

      {mapped.length < listings.length && (
        <div className="px-4 py-2 text-xs text-neutral-400 bg-white border-t border-neutral-100">
          {mapped.length} of {listings.length} listings have map coordinates
        </div>
      )}
    </div>
  )
})

export default MapView
