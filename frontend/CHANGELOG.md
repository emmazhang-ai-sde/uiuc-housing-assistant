# Frontend Changelog

Granular UI changes live here. Major milestones are summarized in the root [CHANGELOG.md](../CHANGELOG.md).

---

## [Unreleased]

### Phase 8 — Detail Drawer
- Replace "View Listing →" button on each card with an `onSelect(listing)` callback
- `DrawerPanel` component (slide-in from right)
- Drawer content: exterior photo, address, tagline, availability summary, amenities chips, laundry, utilities, lease dates
- "View on website →" link inside the drawer

### Walk/Drive Distance Sort & Print Support

#### Added
- `lib/osrm.ts` — OSRM routing client with `fetchWalkingSeconds` and `fetchDrivingSeconds`; results are per-listing arrays parallel to the `listings` prop
- `AssistantMessage.tsx` — sort controls (by unit type, price, availability); landmark-based walking distance sort auto-resolved from `filtersApplied.location_hint`; walk/drive results cached per landmark per message
- `ListingCard.tsx` — accepts `walkMins` and `driveMins` props; displays walking/driving time as small badges in the top-right corner alongside the availability badge
- `MapView.tsx` — accepts `walkMinsByUrl` prop; shows walk time in listing popups
- `SummaryTable.tsx` — added sortable "Walk" column (only rendered when walk data is present); refactored to accept `TableRow[]` (`{ listing, walkMins, driveMins }`) instead of `Listing[]`; `TableRow` type exported for reuse
- `page.tsx` — `filtersApplied` field added to the assistant message type and threaded through from the API response; `print:` CSS utilities added so filter bar and input are hidden during print and the chat thread scrolls fully visible

#### Changed
- `lib/landmarks.ts` — replaced the generic "Green Street (Campustown)" and standalone McDonald's / Target pins with two precise intersection landmarks: Green & 6th St (Target) and Green & 5th St (Potbelly/Raising Cane's)

#### Dependencies
- Added `html-to-image` and `react-markdown`

### Export (PNG) Rewrite

#### Changed
- `lib/exportDom.ts` — replaced the hand-rolled SVG/foreignObject/Canvas pipeline with `html-to-image`; external images are now pre-inlined via a `/api/proxy-image` server route to bypass CORS; images that still fail get a blank `data:` GIF placeholder so the export never throws on missing assets

### UI Polish Round 2

#### Added
- `lib/companies.ts` — single source of truth for company name/logo data (`COMPANIES[]`, `COMPANY_LOGOS`); `FilterPanel`, `SummaryTable`, `ListingCard`, and `Sidebar` now import from here instead of each duplicating the list
- Over-budget amber badge in card view (`ListingCard` accepts optional `maxPricePerBed` prop), matching the existing table view badge

#### Changed
- `Sidebar.tsx` — "About" section restructured: data sources and listing counts as indented bullet lists; each company logo on its own line
- `FilterPanel.tsx` — filter bar centered (`justify-center`); buffer control always visible (greyed out via `opacity-35 pointer-events-none` until a max price is set) instead of hidden conditionally; **filter labels changed to `text-black font-bold`** (was `text-neutral-400`); inactive pill buttons changed to `text-neutral-900` (was `text-neutral-600`); buffer type order changed to `exact → +% → +$`; "All" source button is now always highlighted when `company === null` (removed `sourceTouched` guard)
- `AssistantMessage.tsx` — card grid changed from 2 → 4 → settled on 3 columns per row
- `ListingCard.tsx` — redesigned for 3-column layout: reduced padding/font sizes, elements stacked vertically; availability badge moved to top-right corner (absolute positioning); badge changed from `<span>` to `inline-block` so wrapped text renders as one solid background instead of per-line fragments; availability text splits at every comma, colon, or exclamation mark (lookbehind regex, punctuation retained); address font size increased one step
- `SummaryTable.tsx` — company logos enlarged (`h-5` → `h-7`); "Link" column removed, address is now the hyperlink (Morandi `#7B90A0`, hover `#556070`); availability column uses same comma/colon/exclamation wrapping as card view

### Coming-Soon Form Validation

#### Added
- `coming-soon/page.tsx` — `referralError` and `netidError` state; both fields are now validated before submission; error state renders inline with a yellow highlight and a "Please fill out this field. 💗" message on the label; referral source is always written to the database (no conditional spread); field label font size bumped from `text-sm` to `text-base`; `required` attribute removed from the NetID input in favour of custom JS validation

---

## Phase 7 — Map View & Proximity Filter

### Added
- `MapView` component (Leaflet) — all geocoded listings rendered as pins
- Proximity filter: "Within X km of campus" slider
- Map / list toggle in the main results view

---

## Phase 5/6 — Multi-source Data & Live Status

### Added
- `ListingCard` — company name displayed above address; availability badge fix: "Not Available" / "Fully Leased" no longer matched as green
- `SummaryTable` — Company column added; Price/Month Total column removed; Price/Bed is now the sole sortable price column
- `Sidebar` — fetches live listing counts and scrape date from `GET /api/status` on mount; replaced hardcoded values

### Changed
- `lib/api.ts` — `company: string` added to `Listing` interface
- `.env.local` — `NEXT_PUBLIC_API_URL` corrected from `8001` to `8000`

---

## Phase 3 — Next.js Migration

### Added
- `components/Sidebar.tsx` — collapsible sidebar with About section and Search Tips
- `components/AssistantMessage.tsx` — renders listing cards + summary table; hides answer text when listings are present
- `components/ListingCard.tsx` — per-listing card with price range, beds, availability badge
- `components/SummaryTable.tsx` — sortable by Beds and Price/mo; default sort: price ascending, nulls last
- `lib/api.ts` — typed `search()` function + `Listing` interface with `price_per_bed_low/high` and `price_total_low/high` as numeric fields
- `.env.local` — `NEXT_PUBLIC_API_URL=http://localhost:8001`
