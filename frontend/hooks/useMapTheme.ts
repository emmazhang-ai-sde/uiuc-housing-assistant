"use client"

import { useCallback, useEffect, useState } from "react"
import {
  type MapPalette,
  type MapTheme,
  BASELINE_PALETTE,
  CLASSIC_THEME,
  CUSTOM_THEME_NAME,
  DEFAULT_THEME,
  PRESET_THEMES,
} from "@/lib/mapTheme"

// First client-persisted preference in this app. Per-browser, SSR-guarded.
const STORAGE_KEY = "uiuc:map-theme"
// The hand-edited palette is kept under its own key, separate from the active
// theme: clicking Lavender must not destroy the colors the user mixed, so the
// Customized chip has something to restore.
const CUSTOM_STORAGE_KEY = "uiuc:map-theme-custom"

function parseTheme(raw: string | null): MapTheme | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed.name === "string" && typeof parsed.grain === "number"
        && (parsed.colors === null || typeof parsed.colors === "object")) {
      return parsed as MapTheme
    }
  } catch {
    /* ignore malformed storage */
  }
  return null
}

function loadTheme(): MapTheme {
  if (typeof window === "undefined") return DEFAULT_THEME
  const stored = parseTheme(window.localStorage.getItem(STORAGE_KEY))
  if (!stored) return DEFAULT_THEME
  // Only a hand-edited palette carries its own colors. Anything else is re-read
  // from PRESET_THEMES rather than trusted as stored, so changing a preset's
  // definition reaches users who already have that preset saved — otherwise a
  // returning visitor keeps rendering last release's colors forever.
  if (stored.name === CUSTOM_THEME_NAME) return stored
  const preset = PRESET_THEMES.find(p => p.name === stored.name)
  return preset ? { ...preset, grain: stored.grain, basePreset: preset.name } : DEFAULT_THEME
}

function loadCustom(): MapTheme | null {
  if (typeof window === "undefined") return null
  return parseTheme(window.localStorage.getItem(CUSTOM_STORAGE_KEY))
}

/**
 * Holds the user's chosen basemap color theme, persisted to localStorage.
 * Starts on DEFAULT_THEME (Classic grayscale) during SSR/first paint, then
 * hydrates from storage after mount to avoid a hydration mismatch.
 */
export function useMapTheme() {
  const [theme, setTheme] = useState<MapTheme>(DEFAULT_THEME)
  // Last hand-edited palette, remembered across preset switches. Null until the
  // user edits something (or clicks Customized to start from a copy).
  const [custom, setCustom] = useState<MapTheme | null>(null)

  // Hydrate from localStorage after mount. Reading storage in a lazy initial
  // state instead would diverge from the server-rendered DEFAULT_THEME and
  // cause a hydration mismatch, so the post-mount effect is the correct pattern.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setTheme(loadTheme()); setCustom(loadCustom()) }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(theme)) } catch { /* quota / private mode */ }
  }, [theme])

  useEffect(() => {
    if (typeof window === "undefined" || !custom) return
    try { window.localStorage.setItem(CUSTOM_STORAGE_KEY, JSON.stringify(custom)) } catch { /* quota / private mode */ }
  }, [custom])

  const applyPreset = useCallback((name: string) => {
    const preset = PRESET_THEMES.find(p => p.name === name)
    if (preset) setTheme({ name: preset.name, grain: preset.grain, colors: preset.colors, basePreset: preset.name })
  }, [])

  // Reads `theme` from the closure rather than using a functional update, so the
  // same next-theme object can be stored as the remembered custom palette. Two
  // color events can't land in one render without an intervening paint, and when
  // they do overlap they patch the same key, so last-write-wins is still correct.
  const setColors = useCallback((patch: Partial<MapPalette>) => {
    const next: MapTheme = {
      name: CUSTOM_THEME_NAME,
      grain: theme.grain,
      colors: { ...(theme.colors ?? BASELINE_PALETTE), ...patch },
      // remember which preset these edits started from, so Reset returns there
      basePreset: theme.basePreset ?? (theme.name === CUSTOM_THEME_NAME ? CLASSIC_THEME.name : theme.name),
    }
    setTheme(next)
    setCustom(next)
  }, [theme])

  // The Customized chip. Restores the remembered palette, or — the first time,
  // when there is nothing to restore — forks an editable copy of whatever preset
  // is on screen, so the chip is never a dead end.
  const applyCustom = useCallback(() => {
    const next: MapTheme = custom ?? {
      name: CUSTOM_THEME_NAME,
      grain: theme.grain,
      colors: { ...(theme.colors ?? BASELINE_PALETTE) },
      basePreset: theme.basePreset ?? theme.name,
    }
    setTheme(next)
    setCustom(next)
  }, [custom, theme])

  const setGrain = useCallback((grain: number) => {
    setTheme(t => ({ ...t, grain }))
  }, [])

  // Reset reverts to the preset the current colors derive from, not always Classic.
  const reset = useCallback(() => {
    setTheme(t => {
      const preset = PRESET_THEMES.find(p => p.name === (t.basePreset ?? CLASSIC_THEME.name)) ?? CLASSIC_THEME
      return { name: preset.name, grain: preset.grain, colors: preset.colors, basePreset: preset.name }
    })
  }, [])

  return { theme, presets: PRESET_THEMES, custom, applyPreset, applyCustom, setColors, setGrain, reset }
}
