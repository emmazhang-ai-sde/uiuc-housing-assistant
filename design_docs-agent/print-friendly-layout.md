# Print-Friendly Layout

**Created: 2026-06-25**

---

## Problem

Triggering browser print (`Cmd+P`) on the chat results page produced a clipped single-page output — only the visible viewport area was captured. The full chat thread (assistant answer + listing cards) was cut off.

---

## Root Cause

The root layout container in `frontend/app/page.tsx` uses:

```
className="flex h-screen bg-neutral-100 overflow-hidden"
```

`h-screen` locks the element's height to exactly one viewport height. `overflow-hidden` clips everything outside that box. The browser's print renderer honors both constraints, so it never expands to show overflowed content — only what is physically rendered within the clipped box gets printed.

The scrollable chat thread (`overflow-y-auto`) compounds the problem: its overflow content (messages below the fold) is also clipped, because the scroll container itself is inside the `overflow-hidden` root.

---

## Solution

Use Tailwind's `print:` modifier to override layout constraints at print time, and hide purely interactive components that add no value on paper.

No new files, no new abstractions — three targeted class additions in a single file.

---

## Code Changes

**File: `frontend/app/page.tsx`**

### 1. Root container — lift height lock and overflow clip

```diff
- <div className="flex h-screen bg-neutral-100 overflow-hidden">
+ <div className="flex h-screen bg-neutral-100 overflow-hidden print:h-auto print:overflow-visible">
```

`print:h-auto` lets the container grow to its natural content height. `print:overflow-visible` stops the clipping so nested content can render fully.

### 2. Chat thread — let scroll container expand

```diff
- <div className="flex-1 overflow-y-auto overflow-x-hidden px-6 py-6">
+ <div className="flex-1 overflow-y-auto overflow-x-hidden px-6 py-6 print:overflow-visible">
```

The scrollable message list becomes a normal block at print time, expanding to show all messages without a scroll container height limit.

### 3. Filter panel — hidden at print time

```diff
- <FilterPanel filters={filters} onChange={setFilters} onInteract={...} />
+ <div className="print:hidden">
+   <FilterPanel filters={filters} onChange={setFilters} onInteract={...} />
+ </div>
```

The filter bar is an interactive control with no meaning on paper.

### 4. Input bar — hidden at print time

```diff
- <div className="bg-neutral-100 px-6 py-4">
+ <div className="bg-neutral-100 px-6 py-4 print:hidden">
```

The text input and Send button are also interactive-only; hiding them produces a cleaner printed output.

---

## Result

After these changes, printing captures the full chat thread — user query bubble, assistant answer, all listing cards — on as many pages as needed. The sidebar remains visible (it contains useful context: data sources, listing counts, last scraped date). The filter bar and input box are suppressed.

---

# Save Cards PNG Fix

**Updated: 2026-06-26**

---

## Problem

Clicking "Save cards PNG" produced a completely white PNG file with no visible content.

---

## Root Cause (original implementation)

The original `exportDom.ts` used a hand-rolled SVG `foreignObject` pipeline: clone the DOM, inline computed styles with `getComputedStyle`, serialize with `XMLSerializer`, wrap in `<svg><foreignObject>`, load as a `data:image/svg+xml` image, draw to canvas, export PNG.

This had two fatal flaws:

**1. External images are blocked inside SVG foreignObject.** Browsers refuse to load cross-origin `<img src="https://...">` URLs inside SVG for security reasons. Property photos render as nothing.

**2. Tailwind v4 CSS variables are unavailable in the SVG context.** Colors like `text-neutral-900` resolve to `oklch(...)` via `--color-*` custom properties. Those variables come from the document stylesheet, which does not exist inside a `data:image/svg+xml` rendering context. All colors fall back to initial values → transparent/white output.

---

## Debugging path

Several approaches were tried and failed before the final solution:

| Attempt | Why it failed |
|---|---|
| `html2canvas` | Does not support `oklch()` colors; throws a DOM Event (`{}`) on every render |
| `html-to-image` with `fetchRequestInit: { mode: "cors" }` | `ugroupcu.com` has no CORS headers → image fetch fails → html-to-image's internal `Image.onerror` rejects with a DOM Event (`{}`) → entire export throws |
| `visibility: hidden` on failed images | Kept original `src` on the element; html-to-image's internal clone still tried to load the URL and threw the same Event error |

The breakthrough insight: the thrown error printing as `{}` in the console is a DOM `Event` object (its properties are non-enumerable). This identified the failure as `Image.onerror` inside html-to-image's SVG pipeline.

---

## Final Solution

Three parts working together:

### 1. Use `html-to-image` (not `html2canvas`)

`html-to-image` uses the browser's native HTML rendering engine for SVG foreignObject, so Tailwind v4 `oklch()` colors work correctly. `html2canvas` reimplements CSS in JavaScript and does not support oklch.

**Dependency:** `html-to-image@1.11.13`

### 2. Pre-inline images before calling `toBlob`

Before passing the element to html-to-image, replace every `<img src="...">` with a data URL. Images that cannot be fetched get their `src` replaced with a **1×1 transparent GIF** (not left as the external URL) — leaving the external URL causes html-to-image's internal clone to attempt the same fetch and throw.

### 3. Server-side image proxy for CORS-blocked domains

Green Street Realty images fetch fine from the browser. University Group (`ugroupcu.com`) does not send CORS headers, so client-side fetch is blocked. A Next.js API route fetches images server-side (Node.js has no CORS restrictions) and forwards them to the client.

---

## Code Changes

#### `frontend/lib/exportDom.ts` — full rewrite
### `frontend/app/api/proxy-image/route.ts` — new file
 - Server-side image proxy. Restricted to known property image domains to prevent SSRF.

#### `frontend/components/AssistantMessage.tsx` — `saveCardImages` changes

- Export grid repositioned to `top:0; left:0; z-index:-1` (was `left:-10000px`) so html-to-image can measure it from the viewport
- Each card clone gets the listing URL appended as visible 9px text at the bottom, so it's readable in the PNG
