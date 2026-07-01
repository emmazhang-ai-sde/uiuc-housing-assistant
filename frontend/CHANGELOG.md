# Frontend Changelog

Granular UI changes live here. Major milestones are summarized in the root [CHANGELOG.md](../CHANGELOG.md).

---

## 2026-06-28 — Export PNG: filename convention & image layout

### Changed
- `lib/exportDom.ts` — added `buildExportSlug(filters: Filters)`: produces a kebab-case slug from active filters in field order: type → beds → availability → source → budget. Special cases: `beds=0` → `studio`; `"Green Street Realty"` → `gsr`; `"University Group"` → `ug`. Returns `"all"` when no filters are active.
- `AssistantMessage.tsx` — `saveCardImages()` filename now encodes filter slug + sort suffix + chunk suffix: `uiuc-housing-cards-{slug}{sort-suffix}{chunk-suffix}.png`. Sort suffixes: `-beds-asc/desc`, `-price-asc/desc`, `-avail-asc/desc`, `-walk-{landmark-slug}`; omitted when sort is default. Each exported PNG now includes a header bar (unit range left · filename centered · page number right, e.g. `2 / 3`) separated from the cards grid by a `1px #e5e5e5` divider.
- `SummaryTable.tsx` — replaced `query: string` prop with `filters: Filters`; table PNG filename follows the same slug convention: `uiuc-housing-table-{slug}.png`.

### Added
- `design_docs-agent/export.md` — documents filename convention, PNG image layout, and DOM construction details.

---

## 2026-06-29 — Map export + table refactor + dev mode fixes

### Added
- `lib/exportMap.ts` — `exportMapAsHtml()`: generates a self-contained interactive HTML file with MapLibre GL, all listing pins (price labels + popup), landmark dots, Main Quad polygon, and a bed-type filter bar; filename: `uiuc-housing-map-{slug}.html`
- `AssistantMessage.tsx` — **copy table** (HTML + TSV to clipboard), **save table PNG**, and **save map HTML** action buttons; each view's toolbar now has its own export controls; sort suffix included in card image filenames (`-walk-{landmark}`, `-beds-asc/desc`, `-price-asc/desc`, `-avail-asc/desc`)
- `lib/exportDom.ts` — `buildExportSlug(filters: Filters)`: kebab-case slug from active filter state (field order: type → beds → availability → source → budget); `downloadBlob()` utility extracted for non-DOM blob downloads

### Changed
- `components/MapView.tsx` — converted to `forwardRef<MapViewHandle>`; `saveMapHtml()` imperative handle allows `AssistantMessage` to trigger export without prop drilling callbacks; `mapRef` with `preserveDrawingBuffer: true` for canvas reads; accepts `filters: Filters` prop
- `components/SummaryTable.tsx` — converted to `forwardRef`; `tableRowsHtml` and `tableRowsTsv` are now exported functions (used by `AssistantMessage.copyTable`); copy/save state and handlers moved up to `AssistantMessage`; accepts `filters: Filters` prop; PNG filename uses `buildExportSlug`

### Fixed
- `app/api/chat/route.ts` — auth bypass in `NODE_ENV === "development"` so chat works without a Supabase session in local dev
- `app/api/conversations/route.ts` — GET returns `[]` in dev; POST returns a random UUID without hitting Supabase
- `app/api/conversations/[id]/messages/route.ts` — GET/POST both return early with empty/stub data in dev
- `hooks/useChat.ts` — `newConversation()` guards against undefined conversation id; `sendMessage()` wrapped in try/catch/finally so `isLoading` always resets even on error
- `components/chat/ConversationSidebar.tsx` — `key={conv.id ?? i}` prevents React key warning when id is temporarily undefined

---

## [Unreleased]

### Auth UI: Login/Sign-Up split, user menu, branding

#### Added
- `components/UserMenu.tsx` — user control in `AppHeader` (right-aligned): shows a `#7B90A0` avatar with the email's first initial when signed in; clicking opens a dropdown with the email + **Log out**. Shows a **Log In** link when signed out, and a neutral placeholder while the session resolves. Subscribes to `supabase.auth.onAuthStateChange` so it updates without a reload.
- `app/login/page.tsx` — **Log In / Sign Up** segmented toggle (pill switcher) on the email step. Sign Up keeps the beta-waitlist RPC check + `shouldCreateUser: true`; Log In skips the waitlist check, sends with `shouldCreateUser: false`, and shows a "No account found — try Sign Up instead" fallback when the email isn't registered. Button label + helper copy are mode-aware.
- `public/logo.png` — product logo/illustration; rendered as a rounded banner above the title on the login card.

#### Changed
- `components/AppHeader.tsx` — imports and renders `<UserMenu />` in a right-aligned (`ml-auto`) slot next to the Chat/Map tabs.
- `app/login/page.tsx` — page wrapper now uses the **Nunito Sans** font, self-hosted and scoped to `/login` via `next/font/google` (`Nunito_Sans`); rest of the app is unaffected.

### FilterPanel: responsive reflow + row reorder

#### Changed
- `components/FilterPanel.tsx` — replaced the rigid `grid grid-cols-2` layout with `flex flex-wrap`; every label+pills row is now `flex-wrap` with `min-w-0` so chips wrap under their label instead of overlapping when the panel is narrow. The two columns are `flex-1` with a `min-w-[240px]` floor, so they stack vertically once too narrow to sit side by side.
- Rows regrouped so the narrow-width stacking order is **Type → Beds → Max $/bed → Buffer → Availability → Source** (col 1: Type/Beds/Max $/bed/Buffer; col 2: Availability/Source).
- Unified all row label widths to a single `w-20` (`labelCls`) so the first option in every row starts at the same x-position (previously Max $/bed and Buffer used a wider `w-20` label vs `w-16` elsewhere, shifting their first pill right).

### Map View Tab

#### Added
- `app/map/page.tsx` — new standalone `/map` route: full-screen MapView + floating `MapFilterBar` + filter-gated Save map HTML button; listings fetched directly from backend via `fetchAllListings()` on filter change; loading / empty / error overlay states
- `app/api/listings/route.ts` — Next.js proxy for `GET /api/listings`; auth-gated in production (Supabase), bypassed in dev
- `components/AppHeader.tsx` — top header bar with **Chat** / **Map** tab switcher; `usePathname()` highlights the active tab
- `components/MapFilterBar.tsx` — floating inline filter card (`position: absolute`, top-left of map); all filter options always visible (no dropdown); rows: Beds, Max $/bed + Buffer, Type + Penthouse, Availability, Source; availability pills show colored dots — Now `#D2F55E`, Aug '26 `#C7DDB5`, Leased `#f5f5f5` with border; Clear all appears only when a filter is active
- `hooks/useSaveAction.ts` — `useSaveAction()`: reusable hook encapsulating `idle → saving → idle/failed` lifecycle with 1.6 s auto-reset
- `components/SaveButton.tsx` — dark pill button whose label reflects `SaveStatus`; accepts `label`, `savingLabel`, `disabled`, `title`, `className`
- `lib/api.ts` — `fetchAllListings(filters)`: serializes `Filters` to query params, calls `/api/listings` proxy, returns `Listing[]`

#### Changed
- `components/MapView.tsx` — added `mapHeight?: string` and `className?: string` props; map page passes `mapHeight="100%"` and `className="relative w-full h-full"` for full-screen rendering; existing chat usage unchanged
- `app/chat/page.tsx` — outer div restructured to `flex-col h-screen`; `<AppHeader />` inserted above main content area; main area wrapped in `flex-1 min-h-0 overflow-hidden`
- `components/AssistantMessage.tsx` — `cardSaveStatus` / `tableSaveStatus` / `mapSaveStatus` states + handlers replaced with three independent `useSaveAction()` instances; save buttons replaced with `<SaveButton>`

#### Save map HTML (Map Tab)
Button is **disabled** when no filters are active (tooltip: "No filters selected yet — try picking one above") to prevent full-database exports. When enabled, exports only the currently filtered listings via the existing `MapViewHandle.saveMapHtml()` path.

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
