# Frontend Changelog

Granular UI changes live here. Major milestones are summarized in the root [CHANGELOG.md](../CHANGELOG.md).

---

## 2026-07-05 — Coming-soon page waitlist/messaging pass

### Changed
- `app/coming-soon/page.tsx`:
  - Badge: "Private Beta · Coming Soon" → "Launching July 5 · Waitlist Only"; dropped `border border-neutral-200 text-neutral-900` in favor of a solid orange pill (`backgroundColor: rgb(255, 95, 5)`, `text-white`, no border)
  - Added a `WAITLIST_CAPACITY = 100` constant and a new "🔥 N spots left for the beta." line (`text-lg font-bold underline underline-offset-2`, orange), computed as `Math.max(0, WAITLIST_CAPACITY - totalCount)`. Placed above the existing "🍀 N UIUC students already on the waitlist!" line (which gained the 🍀 emoji and switched from `rgb(255, 95, 5)` to grass green `#2d8a4e`, matching the "You're on the list" success color); both lines bumped from `font-semibold` to `font-bold`
  - The spots-left line sits in its own `border-t border-black` divider `<div>` (`mt-10 pt-8`), separate from the "Why a waitlist?" divider further down the page — spacing below the line matches that section's `pt-8`, spacing above is one line taller than that section's `gap-10`, by request
  - Removed the "Can't wait" section entirely: the `lang` state, the EN/CN toggle buttons, the "Need housing before we launch? I'll search manually for you." pitch, and the whole Xiaohongshu group-chat flow (QR code image, `@momo在coding` links). Replaced with a single English paragraph that keeps the original Reddit thread link — "Have any questions about the website?<br />Feel free to **DM me on Reddit**." — with a manual line break before "Feel free to"
  - Waitlist signup input changed from a NetID-only field (auto-appending `@illinois.edu`, `netid`/`netidFocused`/`netidError` state) to a free-text `type="email"` field (`emailInput`/`emailFocused`/`emailError` state), so any email domain can join; the fixed `@illinois.edu` suffix span and the "@illinois.edu only" copy were removed, success-state copy now echoes back whatever the user typed

### Added
- `design-docs/product-launch/archive/coming-soon-page-v1.tsx` — pre-change snapshot of the page for reference, not part of the Next.js route tree

---

## 2026-07-05 — Shared filter state across Map/Card, Account page polish

### Added
- `contexts/FiltersContext.tsx` (new) — `FiltersProvider`/`useFilters()` context mounted once in the persistent root layout (`app/layout.tsx`). `app/map/page.tsx` and `app/card/page.tsx` both replaced their independent `useState<Filters>(DEFAULT_FILTERS)` with this shared hook, so picking a filter on one view is now reflected live on the other instead of resetting when navigating between them.
- `app/account/page.tsx` — waitlist badge: reuses the `is_email_on_waitlist` Supabase RPC (already called at signup in `app/login/page.tsx`) to check the signed-in user's email, then renders a black "🌟 Waitlist Member" pill when it comes back true, so only genuine waitlist users see it.
- `public/logos/user-avatar.jpeg` (renamed from `HEIF Image.jpeg`) — replaces the single-letter circle avatar on `/account` with an actual avatar image.

### Changed
- `app/card/page.tsx` — filter column padding `pt-24` → `pt-4`, so the Filter block's top-left corner lands at the same (16px, 16px) offset from the viewport as Map's `absolute top-4 left-4` panel.
- `app/account/page.tsx` — dropped the standalone "Account" heading; the email now sits in that slot (bold, 20px) with the waitlist badge centered directly beneath it. The divider above the Log out button now spans the full card width (previously constrained to the 420px button column), matching the divider above "Your saved property / unit".

---

## 2026-07-04 — Card page toolbar overlay fix, login page redesign pass

### Fixed
- `app/card/page.tsx` — header switched from in-flow (`<AppHeader />` as a flex child spanning full width) to the floating-overlay pattern used by `/chat` and `/map`: outer container gained `relative`, `AppHeader` moved into an `absolute top-0 inset-x-0 z-30 pointer-events-none [&_header>div]:pointer-events-auto` wrapper. Both the filter column and the grid column gained `pt-24` (was `p-4`/`py-6`) so content clears the pill instead of scrolling underneath a full-width strip

### Changed
- `app/login/page.tsx`:
  - Waitlist email input simplified from two mutually-exclusive suffix fields (`netid@illinois.edu` / `username@gmail.com`, `illinoisInput`/`gmailInput` state + `getLoginEmail()` helper) to a single free-text `type="email"` field (`emailInput` state); users now type their full address
  - "Waiting-list only" notice restyled: bold Illini-orange (`rgb(255, 95, 5)`, matching `app/coming-soon/page.tsx`) headline with a 🎉🎉 celebratory note, followed by two centered steps each prefixed with a circled Unicode number (①②) and a bolded "Sign up"/"Log in"
  - Sign Up/Log In segmented toggle reordered (Sign Up first, Log In second); active tab fills with the same Illini orange; each toggle label is now prefixed with the matching circled number, echoing the steps above it
  - Per-mode guidance copy ("Enter the email you signed up with…" / "Enter any waitlisted email…") moved from below the submit button to directly above the email field, and split onto two lines with `<br />` instead of wrapping as one sentence
  - All text on the page set to `text-black` (previously a mix of `neutral-400/500/600/700` grays); font sizes bumped one step across the page, with the wordmark bumped two steps; card width tuned `max-w-sm` → `max-w-[480px]`
  - Explored a full "Apple minimalist" re-skin (near-black ink/opacity hierarchy, Illini-orange CTA pills, a shared circular step-badge component) end to end, then rolled back to the version above per explicit user preference — not in the tree, but the direction is documented here in case it's revisited

---

## 2026-07-04 — Floating header on Chat page, Account view as its own route, Card view moved to /card

### Changed
- `app/chat/page.tsx` — layout switched from an in-flow header (`flex-col`) to the floating-header-overlay pattern already used by `/map`: outer container is `relative h-screen overflow-hidden`, `AppHeader` is wrapped in an `absolute top-0 inset-x-0 z-30` pill, and the sidebar/chat/detail-panel row is a plain `flex h-full` that now spans the full viewport height. Previously the header took flow space, leaving a `neutral-100` gap above `ConversationSidebar` and an abrupt top edge on `PropertyPanel`; both columns' backgrounds now run flush to the top like they do on Map/Card
- `components/chat/ChatWindow.tsx` — both the empty-state and message-list containers gained `pt-24` (was `py-6`) so the hero heading and first messages clear the now-floating header pill instead of sitting behind it
- `components/UserMenu.tsx` — dropped the popup dropdown (avatar/email + "Log out" in a small floating card). Signed-in state is now a plain `Link` to `/account`, matching how Chat/Map/Card are all just routes
- `app/account/page.tsx` (new) — account view built like `/chat`/`/map`: floating header overlay over a full-height `neutral-100` content area with a centered card (avatar, email, Log out). Redirects to `/login` if the session check comes back signed-out
- Card view moved from `app/page.tsx` to `app/card/page.tsx` (`git mv`), content unchanged. `app/page.tsx` is now a two-line server redirect to `/card`, so old bookmarks/links to `/` keep working
- `components/AppHeader.tsx` — Card tab now points at `/card` instead of `/`; the active-tab check no longer needs its `href === "/"` special case
- `app/login/page.tsx`, `app/about/page.tsx` — the three hardcoded `"/"` references (post-login redirect, "Card view" link, "Get started" CTA) updated to `/card`

---

## [Unreleased] — Chat persistence: conversations & messages now save and reload

Chat had silently saved nothing to Supabase, across five stacked bugs found over 2026-07-03/04. Full root-cause writeup: `design-docs/agent-implementation-steps/chat-persistence-debugging.md`.

### Fixed
- `proxy.ts` — the Supabase session refresh (`supabase.auth.getUser()`) now runs on **every** request including local dev, instead of being skipped in dev. Skipping it let the 1-hour access token go stale, so concurrent API routes each refreshed ad hoc and raced on Supabase's *rotating* refresh token: some resolved a valid user, some got `null`. A `null` user fell into the route dev mocks (below) and minted a fake conversation id that was never written, so the following message inserts failed the `messages` RLS check against a parent row that never existed. In dev, only the `LAUNCH_MODE` gating is skipped now, not the refresh. Token refresh sends no email, so this does not touch the magic-link quota. (Reverses part of the 2026-06-29 "dev mode fixes" entry, which had added these bypasses.)
- `app/api/conversations/route.ts`, `app/api/conversations/[id]/messages/route.ts` — removed the `NODE_ENV === "development"` mock branches that returned stub data / random ids without hitting Supabase (the source of the ghost conversations). Both routes now check `getUser()` first and return a real `401` when there is no session, so a failure is loud instead of a fake id that corrupts later inserts. Both also now read the `error` from every Supabase call and surface it as a `500` (with `console.error`) instead of silently returning `200` with `null` data, which had hidden the underlying failures (missing table grants, then RLS violations) for two debugging rounds.
- `hooks/useChat.ts` — history was never loaded on mount. The on-mount effect set `activeId` to the most recent conversation but never fetched its messages (that logic lived only in `selectConversation`, which fires on click), so a refresh rendered the empty state even though the rows were in the DB. Extracted a shared `fetchMessages(id)` helper and now call it from both the on-mount effect (for the auto-selected conversation) and `selectConversation`.

### Added
- `hooks/useChat.ts` — each turn now persists its `metadata` (jsonb): the user message stores `{ filters }`, the assistant message stores `{ listings, filtersApplied, filters, maxPricePerBed }`. `fetchMessages` rehydrates those fields back onto the loaded messages, so a reopened conversation shows its filters and card grid, not just the text. `app/api/conversations/[id]/messages/route.ts` GET now selects `metadata`. Persist calls also log loudly (`console.error` with status + response body) on failure instead of being fire-and-forget.

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

## 2026-07-02 — Pre-launch access hardening

### Added
- `app/robots.ts` — disallow-all for every crawler while `LAUNCH_MODE !== "live"`, so gated pages can't be indexed before the site officially launches; switches to allow-all once `LAUNCH_MODE=live`

### Fixed
- `proxy.ts` — `/login` was public regardless of `LAUNCH_MODE`, so it was directly reachable (and crawlable) during `coming_soon` even though `/`, `/chat`, `/map`, and `/about` were already gated. `/login` is now only public when `LAUNCH_MODE === "live"`; during `coming_soon` it falls through to the same `/coming-soon` redirect as every other route
- `app/login/page.tsx` — `src="/logo.png"` pointed at a path removed by the `public/logo.png` → `public/logos/project-picture.png` rename, leaving a broken image on the login card; corrected to the new path

---

## 2026-07-03 — /about carved out as the one public pre-launch page

### Changed
- `proxy.ts` — `/about` is now unconditionally public (no longer subject to the `LAUNCH_MODE`/auth gate that `/`, `/chat`, `/map`, and `/login` fall under), so the marketing page can be shared and browsed without an account or waiting for launch
- `app/robots.ts` — during `coming_soon`, rules changed from disallow-all to `allow: "/about", disallow: "/"`, so `/about` stays crawlable while every gated route stays out of search results
- `components/UserMenu.tsx` — the signed-out **Log In** link is now hidden whenever `NEXT_PUBLIC_LAUNCH_MODE !== "live"`, since `/login` isn't a real destination pre-launch (see 2026-07-02 entry above) and shouldn't be advertised from the public `/about` page's header. Requires a new `NEXT_PUBLIC_LAUNCH_MODE` Vercel env var mirroring the existing server-only `LAUNCH_MODE` (client components can't read unprefixed env vars)

---

## 2026-07-03 — Gated routes rewrite to Coming Soon instead of redirecting

### Changed
- `proxy.ts` — pre-launch, an unauthenticated visit to a gated page route (`/`, `/chat`, `/map`, `/login`) now `NextResponse.rewrite()`s to `/coming-soon` instead of `NextResponse.redirect()`ing there: the address bar keeps the originally-requested path (e.g. clicking **Chat** lands you on `/chat`, still showing "coming soon"), rather than bouncing to a different URL. API routes (`/api/*`) are excluded from this and keep the old redirect behavior — each already does its own auth check and returns JSON, so serving them the coming-soon page's HTML would break them
- `proxy.ts` matcher — added `robots.txt` to the excluded-paths list; without it, `/robots.txt` would itself get rewritten to the coming-soon page's HTML during `coming_soon`, breaking the crawler-blocking rules added in the 2026-07-02 entry above

---

## [Unreleased]

### About page

#### Added
- `app/about/page.tsx` — new page, linked from the "UIUC Housing" wordmark in `AppHeader` (`Link` to `/about`). Hero section shows a live stat line (`GET /api/status` listing/property counts) and the illustrated `public/logos/project-picture.png` banner. "What you can do here" section has two scenario cards — "Know exactly what you want?" (links to Card/Map view, mentions Table view) and "Not sure yet?" (links to Chat) — each broken into intro line + bullet list + closing sentence, matching structure. "Why it's better" is a 6-item bullet grid (one search across companies, honest price-per-bed with bolded key phrases, plain-English search, live availability, map view, free/UIUC-students-only). "Built for the way UIUC students actually search" is a Before/Now `<table>` with column headers (not repeated per-row). No em dashes anywhere on the page (commas/sentence breaks used instead), per content style requirement.

### Card view: filter-driven browsing + pagination

#### Added
- `components/FilterBar.tsx` — the Beds/Max-$/bed/Type/Availability/Source filter UI extracted out of `MapFilterBar.tsx` (which is now a thin `absolute`-positioned wrapper around it), so the Map view and the Card page's filter column share one implementation and stay visually identical
- `components/ListingGrid.tsx` — shared `ListingCard` grid component (`entries`, `filters`, `maxPricePerBed`, forwarded `ref`, required `columns: 3 | 4`); used by both the Card page (`columns={4}`) and `AssistantMessage`'s cards view (`columns={3}`, since Chat's conversation column is narrower now that it sits next to `PropertyPanel`)
- `lib/api.ts` — `fetchListingsPage(filters, page, pageSize)`: paginated counterpart to `fetchAllListings`, returns `{ listings, total }`

#### Changed
- `app/page.tsx` — rebuilt from a chat-thread + search-box page into a pure filter-driven browsing view: left column is `FilterBar` (static, not floating), right side is a `ListingGrid` of every matching listing sorted by beds. With no filter active, results are paginated 24/page via `fetchListingsPage` (Previous/Next buttons; clicking Next fetches that page from the backend rather than pre-loading everything). Once any filter is applied, the whole (much smaller) result set loads via `fetchAllListings` for scrolling instead, and pagination controls are hidden. All chat-thread state (`messages`, `submit`, `UserBubble`/`AssistantMessage`/`search`/`createClient`) removed since the input bar was removed
- `components/Sidebar.tsx` usage removed from the Card page — the info/search-tips sidebar is Chat-only now
- `components/ListingCard.tsx` — the `unit_type · beds · property_type` line changed from one string joined with `" · "` to three separate pill `<span>` tags with no divider between them (avoids a stray `·` when tags wrap to a second line). Added a `filters?: Filters | null` prop: the beds-label tag is hidden when `filters.beds` is pinned to exactly one value, and the property-type tag is hidden when `filters.property_type` is set, since the value is identical on every visible card in that case; `unit_type` always shows
- `backend/main.py` — `GET /api/listings` gained optional `page`/`page_size` params (adds a `COUNT(*)` query + `LIMIT`/`OFFSET` when provided, returns `total`); results now always `ORDER BY (beds IS NULL) ASC, beds ASC, price_per_bed_low ASC` regardless of pagination, so the Map view's unpaginated `fetchAllListings()` calls gained consistent ordering as a side effect

### Chat view: docked detail panel + simplified composer

#### Added
- `components/PropertyPanel.tsx` — docked, always-visible right column for the Chat page; reuses `PropertyDrawer`'s newly-exported `DrawerContent`. Shows a placeholder ("Select a listing to see its full details here") when nothing is selected, full property details in place when a card is clicked. No backdrop, no slide-in animation — clicking a card just populates the column directly

#### Changed
- `components/PropertyDrawer.tsx` — `DrawerContent` is now an exported named function (was a private inline component) so `PropertyPanel` can render the same content outside the modal
- `app/chat/page.tsx` — layout changed from `ConversationSidebar` + chat column + `PropertyDrawer` modal overlay to a fixed 3-column split: `ConversationSidebar` | chat column | `PropertyPanel`. Filter toggle button and `FilterPanel` removed entirely; `sendMessage` now always passes `DEFAULT_FILTERS` (Chat relies on the NL query parser picking up filters from the message text instead of a manual filter UI)
- `components/chat/MessageInput.tsx` — removed the `filtersOpen`/`onToggleFilters` props and the filter-toggle button (no longer used by any caller)
- `components/chat/ChatWindow.tsx` — empty-state headline/subtitle/suggested-prompts rewritten to describe what Chat itself is for ("Let's talk it through" — general questions + specific ones, conversation remembers context) instead of the generic "Find Your Dream Homes... Search 879 floor plans..." project pitch it previously shared verbatim with the Card page's empty state. Suggested-prompt chips changed from a fixed 2-column grid to `flex flex-wrap` with `whitespace-nowrap` so each stays on one line instead of wrapping mid-sentence
- `components/AssistantMessage.tsx` — cards view now renders via the shared `ListingGrid` (`columns={3}`) instead of its own inline grid + `ListingCard.map()`; "Sort"/"Distance" labels and the sort/view-toggle pill buttons in the white toolbar changed from `font-semibold`/`font-medium` to `font-normal`

### Global font: Nunito Sans

#### Changed
- `app/layout.tsx` — switched from Geist Sans/Geist Mono to **Nunito Sans** (`next/font/google`), applied via `nunitoSans.className` on `<body>`. The previous Geist setup only exported CSS custom properties that nothing in the app actually referenced (no `font-family: var(--font-geist-sans)` anywhere), so the whole app had silently been rendering in the browser's default system font the entire time; this was the first change that made the intended font actually apply globally

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

### Login page: waiting-list notice + dual-domain email picker

#### Changed
- `app/login/page.tsx` — email step now opens with a "waiting-list only" notice above the Log In/Sign Up toggle. The waitlist email field is split into two mutually exclusive inputs stacked with an "or" divider: NetID input with a fixed `@illinois.edu` suffix, or username input with a fixed `@gmail.com` suffix — for waitlisters who signed up with a personal Gmail before getting an Illinois email. Filling one input disables the other (`disabled` + dimmed) until it's cleared; a "Use only one — the email you joined the waitlist with." note sits above both. State replaced `loginInput`/`domain` with separate `illinoisInput`/`gmailInput`, and `getLoginEmail()` now derives the active email from whichever is non-empty. Log In helper text now reads "Enter the email you signed up with. We'll send an 8-digit one-time passcode."

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
