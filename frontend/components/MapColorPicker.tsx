"use client"

import { useEffect, useState } from "react"
import {
  type MapPalette,
  type MapTheme,
  BASELINE_PALETTE,
  CLASSIC_THEME,
  CUSTOM_THEME_NAME,
  PALETTE_GROUPS,
} from "@/lib/mapTheme"

type Props = {
  theme: MapTheme
  presets: MapTheme[]
  // The remembered hand-edited palette, or null before the user has made one.
  custom: MapTheme | null
  onApplyPreset: (name: string) => void
  onApplyCustom: () => void
  onSetColors: (patch: Partial<MapPalette>) => void
  onSetGrain: (grain: number) => void
  onReset: () => void
}

const HEX = /^#[0-9a-fA-F]{6}$/

function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [text, setText] = useState(value)
  const [bad, setBad] = useState(false)
  // Resync the local buffer when the canonical value changes externally
  // (preset applied / reset) — the React-recommended "adjust state during
  // render" pattern, avoiding a state-setting effect.
  const [prevValue, setPrevValue] = useState(value)
  if (value !== prevValue) {
    setPrevValue(value)
    setText(value)
    setBad(false)
  }

  function onText(raw: string) {
    setText(raw)
    let v = raw.trim()
    if (v && v[0] !== "#") v = "#" + v
    if (HEX.test(v)) { setBad(false); onChange(v.toUpperCase()) }
    else setBad(true)
  }

  return (
    <div className="flex items-center gap-2">
      <label className="flex-1 text-[13px] text-neutral-700">{label}</label>
      <input
        type="color"
        value={value}
        onChange={e => onChange(e.target.value.toUpperCase())}
        aria-label={label}
        className="h-5 w-7 shrink-0 cursor-pointer rounded border border-neutral-200 bg-transparent p-0"
      />
      <input
        type="text"
        value={text}
        maxLength={7}
        spellCheck={false}
        onChange={e => onText(e.target.value)}
        className={`w-[86px] rounded border px-2 py-0.5 font-mono text-xs uppercase text-neutral-800 outline-none ${
          bad ? "border-red-400 bg-red-50" : "border-neutral-200 focus:border-neutral-400"
        }`}
      />
    </div>
  )
}

function PresetChip({ preset, active, label, onClick }: {
  preset: MapTheme
  active: boolean
  // Overrides the chip's text when the theme's internal name is not what the UI
  // should say — "Custom" is stored on the theme but reads as "Customized".
  label?: string
  onClick: () => void
}) {
  const dots = preset.colors
    ? [preset.colors.LAND, preset.colors.LAWN, preset.colors.WATER]
    : ["#f2f3f0", "#dcdcdc", "#c8c8c8"] // untouched-positron preview
  return (
    <button
      onClick={onClick}
      className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-1 text-[11px] font-medium transition-colors ${
        active ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-200 bg-white text-neutral-800 hover:bg-neutral-100"
      }`}
    >
      <span className="flex">
        {dots.map((d, i) => (
          <span
            key={i}
            className="h-2 w-2 rounded-full border border-black/10"
            style={{ background: d, marginLeft: i === 0 ? 0 : -3 }}
          />
        ))}
      </span>
      <span>{label ?? preset.label ?? preset.name}</span>
    </button>
  )
}

export default function MapColorPicker({ theme, presets, custom, onApplyPreset, onApplyCustom, onSetColors, onSetGrain, onReset }: Props) {
  const [open, setOpen] = useState(false)
  const current = theme.colors ?? BASELINE_PALETTE

  // Escape closes the panel (matches the map page's drawer idiom).
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false) }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [open])

  const grainPct = Math.round(theme.grain * 100)
  // Reset reverts to the preset the current colors derive from, so the button
  // names that preset the way the chips do rather than echoing its stored id.
  const resetTarget = presets.find(p => p.name === (theme.basePreset ?? CLASSIC_THEME.name)) ?? CLASSIC_THEME

  // The panel is absolutely positioned so this can sit inline in the Map's
  // filter chip row: in normal flow it would push the row's height when opened.
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        title="Change map colors"
        className={`flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-medium shadow-[0_2px_10px_-4px_rgba(0,0,0,0.08)] backdrop-blur transition-colors ${
          open ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-200/80 bg-white/90 text-neutral-900 hover:bg-white"
        }`}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M12 3a9 9 0 100 18h.5a2 2 0 001.9-2.6c-.3-.9.2-1.9 1.1-2.1l1-.2A3.5 3.5 0 0021 12.5 8.9 8.9 0 0012 3z"
            stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"
          />
          <circle cx="7.5" cy="11.5" r="1.1" fill="currentColor" />
          <circle cx="10.5" cy="7.5" r="1.1" fill="currentColor" />
          <circle cx="14.5" cy="7.5" r="1.1" fill="currentColor" />
        </svg>
        Colors
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-2 z-50 w-[340px] max-w-[calc(100vw-2rem)] max-h-[calc(100vh-7rem)] overflow-y-auto rounded-2xl border border-neutral-200/70 bg-white/95 p-4 shadow-xl backdrop-blur-sm">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-semibold text-neutral-900">Map colors</div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="flex h-6 w-6 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
            >
              ✕
            </button>
          </div>

          {/* Presets */}
          {/* The three presets fit one row; Customized wraps below them rather than
              squeezing the row to four. Its dots preview the remembered palette, or
              the current one before any edits exist. */}
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            {presets.map(p => (
              <PresetChip key={p.name} preset={p} active={theme.name === p.name} onClick={() => onApplyPreset(p.name)} />
            ))}
            <PresetChip
              preset={custom ?? { name: CUSTOM_THEME_NAME, grain: theme.grain, colors: current }}
              active={theme.name === CUSTOM_THEME_NAME}
              label="Customized"
              onClick={onApplyCustom}
            />
          </div>

          <div className="-mx-1 mb-3 h-px bg-neutral-100" />

          {/* Per-element colors */}
          <div className="flex flex-col gap-2">
            {PALETTE_GROUPS.map(g => (
              <div key={g.group} className="flex flex-col gap-1">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">{g.group}</div>
                {g.items.map(item => (
                  <ColorRow
                    key={item.key}
                    label={item.label}
                    value={current[item.key]}
                    onChange={v => onSetColors({ [item.key]: v })}
                  />
                ))}
              </div>
            ))}
          </div>

          <div className="-mx-1 my-3 h-px bg-neutral-100" />

          {/* Paper grain */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-[13px] text-neutral-700">
              <span>Paper grain</span>
              <span className="font-mono text-xs text-neutral-500">{grainPct}%</span>
            </div>
            <input
              type="range" min={0} max={30} value={grainPct}
              onChange={e => onSetGrain(Number(e.target.value) / 100)}
              className="w-full accent-neutral-900"
            />
          </div>

          <button
            onClick={onReset}
            className="mt-3 w-full rounded-full border border-neutral-200 py-1.5 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-100"
          >
            Reset to {resetTarget.label ?? resetTarget.name}
          </button>
        </div>
      )}
    </div>
  )
}
