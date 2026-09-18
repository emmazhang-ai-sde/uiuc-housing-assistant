import type { StyleSpecification } from "maplibre-gl"
import baseStyleJson from "./mapBaseStyle.json"

// ── Types ────────────────────────────────────────────────────────────────
// The basemap is broken into recolorable roles. The app ships exactly one
// built-in preset: Default. Users may still keep one custom palette locally.

export type MapPalette = {
  LAND: string        // land / background fill
  RESID: string       // residential + generic landuse fills
  LAWN: string        // parks / grass / recreation
  WOOD: string        // woods / forest
  WATER: string       // water fill
  WATERLINE: string   // water edge / waterway lines
  BLDG: string        // building fill
  BLDG_OUT: string    // building outline
  ROAD: string        // road/street lines + fills
  CASE: string        // road casing / outline lines
  PATH: string        // paths / footways
  LABEL: string       // label text
  HALO: string        // label halo
  BOUNDARY: string    // admin boundaries / contours
  PIN_NOW: string     // "available now" price pin
  PIN_AVAIL: string   // future-availability price pin (e.g. Aug 2026)
  PIN_UNAVAIL: string // leased / unavailable price pin
}

export type MapTheme = {
  name: string
  label?: string
  grain: number
  colors: MapPalette
  basePreset?: string
}

// ── Picker layout ────────────────────────────────────────────────────────
// Drives the grouped rows in MapColorPicker.

export const PALETTE_GROUPS: { group: string; items: { key: keyof MapPalette; label: string }[] }[] = [
  { group: "Land",      items: [ { key: "LAND", label: "Land / background" }, { key: "RESID", label: "Residential areas" } ] },
  { group: "Green",     items: [ { key: "LAWN", label: "Parks / grass" }, { key: "WOOD", label: "Woods / forest" } ] },
  { group: "Water",     items: [ { key: "WATER", label: "Water" }, { key: "WATERLINE", label: "Water edge" } ] },
  { group: "Buildings", items: [ { key: "BLDG", label: "Buildings" }, { key: "BLDG_OUT", label: "Building outline" } ] },
  { group: "Roads",     items: [ { key: "ROAD", label: "Roads" }, { key: "CASE", label: "Road casing" }, { key: "PATH", label: "Paths / footways" } ] },
  { group: "Labels",    items: [ { key: "LABEL", label: "Labels (text)" }, { key: "HALO", label: "Label halo" }, { key: "BOUNDARY", label: "Boundaries" } ] },
  { group: "Availability pins", items: [ { key: "PIN_NOW", label: "Available now" }, { key: "PIN_AVAIL", label: "Future (Aug 2026)" }, { key: "PIN_UNAVAIL", label: "Leased" } ] },
]

// The shipped default look: warm paper land, soft green parks, clear blue
// water, slate labels, and blush availability pins.
export const DEFAULT_PALETTE: MapPalette = {
  LAND: "#FFFFFF", RESID: "#FFFDEE", LAWN: "#CFECCA", WOOD: "#CFECCA",
  WATER: "#A4D5F2", WATERLINE: "#A4D5F2", BLDG: "#E9EAEF", BLDG_OUT: "#E9EAEF",
  ROAD: "#FFFFFF", CASE: "#FFFFFF", PATH: "#D6D6D6", LABEL: "#546E7A", HALO: "#FFFFFF", BOUNDARY: "#C9C4BC",
  PIN_NOW: "#EED6DA", PIN_AVAIL: "#EED6DA", PIN_UNAVAIL: "#F5F5F5",
}

export const DEFAULT_THEME: MapTheme = {
  name: "Default",
  label: "Default",
  grain: 0,
  colors: DEFAULT_PALETTE,
}

export const PRESET_THEMES: MapTheme[] = [DEFAULT_THEME]
export const CUSTOM_THEME_NAME = "Custom"

// ── Availability price-pin colors ──────────────────────────────────────────
// Pin backgrounds come from the single active theme. Text color is auto-picked
// for contrast.
export function themePins(theme: MapTheme): { now: string; available: string; unavailable: string } {
  const c = theme.colors
  return { now: c.PIN_NOW, available: c.PIN_AVAIL, unavailable: c.PIN_UNAVAIL }
}

export function pinTextColor(bg: string): string {
  const h = bg.replace("#", "")
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16)
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? "#1a1a1a" : "#ffffff"
}

// ── Paper grain ──────────────────────────────────────────────────────────
// SVG fractal-noise as a data URI, used as a CSS multiply overlay over the map.
export const GRAIN_DATA_URI = `data:image/svg+xml,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'>" +
  "<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/>" +
  "<feColorMatrix type='saturate' values='0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>",
)}`

// ── Style builder ────────────────────────────────────────────────────────
// Pure: clones the committed positron snapshot and recolors its layers by
// id-keyword + type. IMPORTANT: line-only layout props (line-join/line-cap)
// are set only on line layers — attaching them to fill/symbol layers makes
// MapLibre reject the whole style (renders blank).

const has = (id: string, ...keys: string[]) => keys.some(k => id.toLowerCase().includes(k))

/* eslint-disable @typescript-eslint/no-explicit-any */
function recolor(style: any, c: MapPalette): any {
  for (const layer of style.layers) {
    const id: string = layer.id || ""
    const t: string = layer.type
    const p = (layer.paint = layer.paint || {})
    if (id === "background") { p["background-color"] = c.LAND; continue }

    if (has(id, "water")) {
      if (t === "fill") p["fill-color"] = c.WATER
      if (t === "line") p["line-color"] = c.WATERLINE
    } else if (has(id, "wood", "forest")) {
      if (t === "fill") p["fill-color"] = c.WOOD
    } else if (has(id, "park", "grass", "golf", "pitch", "cemetery", "landcover", "vegetation", "farmland", "meadow", "garden", "recreation")) {
      if (t === "fill") p["fill-color"] = c.LAWN
    } else if (has(id, "residential", "neighbourhood", "suburb", "landuse")) {
      if (t === "fill") p["fill-color"] = c.RESID
    } else if (has(id, "building")) {
      if (t === "fill") { p["fill-color"] = c.BLDG; p["fill-outline-color"] = c.BLDG_OUT }
      if (t === "fill-extrusion") p["fill-extrusion-color"] = c.BLDG
    } else if (has(id, "boundary", "admin")) {
      if (t === "line") p["line-color"] = c.BOUNDARY
    } else if (has(id, "path", "pedestrian", "footway", "track")) {
      if (t === "line") p["line-color"] = c.PATH
    } else if (has(id, "road", "transport", "bridge", "tunnel", "highway", "street", "motorway", "trunk", "primary", "secondary", "tertiary", "minor", "service")) {
      if (t === "line") {
        p["line-color"] = has(id, "casing", "outline") ? c.CASE : c.ROAD
        layer.layout = Object.assign({}, layer.layout || {}, { "line-join": "round", "line-cap": "round" })
      }
      if (t === "fill") p["fill-color"] = c.ROAD
    } else if (has(id, "label", "place", "poi", "name")) {
      if (t === "symbol") { p["text-color"] = c.LABEL; p["text-halo-color"] = c.HALO; p["text-halo-width"] = 1.4 }
    }
  }
  return style
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Build a full MapLibre style for a theme. */
export function buildMapStyle(theme: MapTheme): StyleSpecification {
  const clone = JSON.parse(JSON.stringify(baseStyleJson))
  return recolor(clone, theme.colors) as StyleSpecification
}
