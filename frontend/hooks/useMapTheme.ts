"use client"

import { useCallback, useEffect, useState } from "react"
import {
  type MapPalette,
  type MapTheme,
  CUSTOM_THEME_NAME,
  DEFAULT_THEME,
  PRESET_THEMES,
} from "@/lib/mapTheme"

const STORAGE_KEY = "uiuc:map-theme"
const CUSTOM_STORAGE_KEY = "uiuc:map-theme-custom"

function isPalette(value: unknown): value is MapPalette {
  if (!value || typeof value !== "object") return false
  const palette = value as Record<keyof MapPalette, unknown>
  return [
    "LAND", "RESID", "LAWN", "WOOD", "WATER", "WATERLINE", "BLDG", "BLDG_OUT",
    "ROAD", "CASE", "PATH", "LABEL", "HALO", "BOUNDARY", "PIN_NOW", "PIN_AVAIL", "PIN_UNAVAIL",
  ].every(key => typeof palette[key as keyof MapPalette] === "string")
}

function parseTheme(raw: string | null): MapTheme | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (
      parsed &&
      typeof parsed.name === "string" &&
      typeof parsed.grain === "number" &&
      isPalette(parsed.colors)
    ) {
      return parsed as MapTheme
    }
  } catch {
    /* ignore malformed storage */
  }
  return null
}

function normalizeTheme(theme: MapTheme | null): MapTheme {
  if (!theme) return DEFAULT_THEME
  if (theme.name === CUSTOM_THEME_NAME) {
    return { ...theme, label: "Customized", basePreset: DEFAULT_THEME.name }
  }
  return DEFAULT_THEME
}

function loadStoredTheme(): MapTheme {
  if (typeof window === "undefined") return DEFAULT_THEME
  return normalizeTheme(parseTheme(window.localStorage.getItem(STORAGE_KEY)))
}

function loadStoredCustom(): MapTheme | null {
  if (typeof window === "undefined") return null
  const custom = normalizeTheme(parseTheme(window.localStorage.getItem(CUSTOM_STORAGE_KEY)))
  return custom.name === CUSTOM_THEME_NAME ? custom : null
}

/**
 * Holds the map color theme. Default is the only built-in preset; edits fork a
 * per-browser Customized palette.
 */
export function useMapTheme() {
  const [theme, setTheme] = useState<MapTheme>(DEFAULT_THEME)
  const [custom, setCustom] = useState<MapTheme | null>(null)

  // Hydrate after mount to avoid server/client markup drift in the color panel.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { const storedTheme = loadStoredTheme(); setTheme(storedTheme); setCustom(loadStoredCustom() ?? (storedTheme.name === CUSTOM_THEME_NAME ? storedTheme : null)) }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(theme)) } catch { /* quota / private mode */ }
  }, [theme])

  useEffect(() => {
    if (typeof window === "undefined" || !custom) return
    try { window.localStorage.setItem(CUSTOM_STORAGE_KEY, JSON.stringify(custom)) } catch { /* quota / private mode */ }
  }, [custom])

  const applyDefault = useCallback(() => setTheme(DEFAULT_THEME), [])

  const applyCustom = useCallback(() => {
    const next = custom ?? {
      name: CUSTOM_THEME_NAME,
      label: "Customized",
      grain: theme.grain,
      colors: { ...theme.colors },
      basePreset: DEFAULT_THEME.name,
    }
    setTheme(next)
    setCustom(next)
  }, [custom, theme])

  const setColors = useCallback((patch: Partial<MapPalette>) => {
    const next: MapTheme = {
      name: CUSTOM_THEME_NAME,
      label: "Customized",
      grain: theme.grain,
      colors: { ...theme.colors, ...patch },
      basePreset: DEFAULT_THEME.name,
    }
    setTheme(next)
    setCustom(next)
  }, [theme])

  const setGrain = useCallback((grain: number) => {
    const next: MapTheme = {
      name: CUSTOM_THEME_NAME,
      label: "Customized",
      grain,
      colors: { ...theme.colors },
      basePreset: DEFAULT_THEME.name,
    }
    setTheme(next)
    setCustom(next)
  }, [theme])

  const reset = useCallback(() => setTheme(DEFAULT_THEME), [])

  return {
    theme,
    presets: PRESET_THEMES,
    custom,
    applyDefault,
    applyCustom,
    setColors,
    setGrain,
    reset,
  }
}
