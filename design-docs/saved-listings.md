# Saved Listings (Heart / Favorite)

**Created: 2026-07-02**

Lets a signed-in user favorite a listing from a heart icon on the card view or the map
popup, and browse everything they've saved on a dedicated page. Per-user, persisted in
Supabase (Auth + Postgres already power [`user-authentication.md`](./user-authentication.md)).

---

## 1. Scope

1.1 **A saved unit shows the same saved/unsaved state everywhere it can be viewed** —
Cards, Table, and Map are three interchangeable views of the same listing set
(`AssistantMessage.tsx`'s `view` toggle), so the heart must appear in all three, not just
the ones named first. Concretely: `ListingCard` (Cards view, tabs `/` and `/chat`),
`SummaryTable` (Table view, same two tabs), and the `MapView` popup (Map view within `/`
and `/chat`, and the standalone `/map` tab). Clicking toggles saved state from any of the
three; the icon reflects current state everywhere (outline = not saved, filled = saved)
because they all read from the same `useSavedListings()` instance per page (§5, §7).

1.2 A new **Saved Homes** page lets a user browse everything they've saved in the same
three view modes as search results — Cards, List, and Map — sortable by price and
availability, with a visible "saved on" date in every view. See §8.

1.3 Out of scope for v1 (listed under §9): live-refresh of price/availability for
already-saved listings, and any notification when a saved listing's status changes.

## 2. Stable listing identity — `listing_key`

The `Listing` type has no `id` field — a listing is only ever identified by its full
field set. Saving requires a stable key that survives across re-scrapes (price/availability
change, but the listing itself doesn't).

The pipeline already solved this for Chroma document IDs:

```python
# pipeline/ingest.py
def listing_id(address: str, unit_type: str) -> str:
    """Stable document ID: MD5 of 'address|unit_type'."""
    return hashlib.md5(f"{address}|{unit_type}".encode()).hexdigest()
```

`address + unit_type` uniquely identifies a floor plan within a building — same rule this
feature needs. Reuse `listing_id()` directly rather than defining a second convention.

**Decision: compute `listing_key` server-side, not client-side.** The alternative — hashing
`address|unit_type` in the browser with an MD5 JS library — adds a new frontend dependency
and a second place the ID format could drift from the Python side. Instead, add a
`listing_key` field to every listing dict the backend already returns, computed with the
same `listing_id()` function.

There are **three** places that build a listing dict for the frontend, and all three need
the field added:

| Producer | File | Feeds |
|---|---|---|
| `/api/search` | `backend/main.py` (`listings = [doc.metadata for doc in docs]`) | Card Tab `/` |
| `housing_search` tool | `rag/agent.py` (`listings = [doc.metadata for doc in docs]`) | Chat `/chat` |
| `/api/listings` | `backend/main.py` `_to_listing()` | Map tab `/map` |

Add, in each:
```python
from pipeline.ingest import listing_id
...
listings = [{**doc.metadata, "listing_key": listing_id(doc.metadata["address"], doc.metadata["unit_type"])} for doc in docs]
```
(Build a **new** dict — don't mutate `doc.metadata` in place; it may be a reference into
Chroma's internal cache.)

For `_to_listing()` in `/api/listings`:
```python
"listing_key": listing_id(row["address"] or "", row["unit_type"] or ""),
```

Frontend: add the field to the `Listing` interface in `frontend/lib/api.ts`:
```ts
export interface Listing {
  ...
  listing_key: string   // md5(address|unit_type) — stable across re-scrapes, see pipeline/ingest.py::listing_id
}
```

## 3. Data model — Supabase `saved_listings` table

Unlike the `waitlist` table (checked by an *anonymous* user before login, hence the
security-definer RPC in §5.3–5.6 of `user-authentication.md`), this table is only ever
touched by an *already-authenticated* user acting on their own rows. Row Level Security
alone is sufficient — no RPC, no Auth Hook needed.

```sql
create table public.saved_listings (
  id                 bigint generated always as identity primary key,
  user_id            uuid not null references auth.users(id) on delete cascade,
  listing_key        text not null,
  address            text not null,
  unit_type          text not null,
  company            text,
  url                text,
  photo_url          text,
  property_type      text,
  beds               integer,
  price_per_bed_low  integer,
  price_per_bed_high integer,
  price_total_low    integer,
  price_total_high   integer,
  availability       text,     -- snapshot at save time (see §9 staleness note)
  area               text,
  lat                double precision,
  lng                double precision,
  saved_at           timestamptz not null default now(),
  unique (user_id, listing_key)
);

alter table public.saved_listings enable row level security;

create policy "Users manage their own saved listings"
  on public.saved_listings
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

**Why a partial field snapshot, not the full `Listing` shape:** storing `description`,
`amenities`, `lease_dates`, `utility_fees`, `brochure_url`, `tagline`, `availability_summary`
would let the Saved page render `PropertyDrawer` with full fidelity, but bloats every row
for fields most users never revisit. The stored subset is exactly what `ListingCard` and
the `MapView` popup need. If a saved listing is opened in `PropertyDrawer`, the extra
sections (`About`, `Amenities`, `Lease Info`) are already conditionally rendered — they
just won't show, which the component already handles for listings missing that data.

## 4. Client data-access layer — `frontend/lib/supabase/savedListings.ts` (new)

Thin wrapper around `supabase-js`, mirroring the pattern in `frontend/lib/supabase/client.ts`:

```ts
export interface SavedListingRow { /* mirrors the table above */ }

export async function listSaved(): Promise<SavedListingRow[]>
export async function saveListing(listing: Listing): Promise<void>   // upsert on (user_id, listing_key)
export async function unsaveListing(listingKey: string): Promise<void>
export function rowToListing(row: SavedListingRow): Listing           // fills omitted fields with "" / null
```

`saveListing` upserts (`onConflict: "user_id,listing_key"`) so double-clicking the heart
before the previous request resolves doesn't throw a unique-violation.

## 5. `frontend/hooks/useSavedListings.ts` (new)

One instance per page that renders listings, shared across every `ListingCard` /
`MapView` popup on that page (not one hook call per card — avoids N parallel fetches).

```ts
export function useSavedListings() {
  const [savedKeys, setSavedKeys]     = useState<Set<string>>(new Set())
  const [savedRows, setSavedRows]     = useState<SavedListingRow[]>([])
  const [loading, setLoading]         = useState(true)

  // load on mount + on auth state change (mirrors UserMenu.tsx's onAuthStateChange pattern)

  async function toggle(listing: Listing) {
    // optimistic: flip savedKeys immediately, roll back on failure
    if (savedKeys.has(listing.listing_key)) await unsaveListing(listing.listing_key)
    else await saveListing(listing)
  }

  function isSaved(key: string) { return savedKeys.has(key) }

  return { isSaved, toggle, savedRows, loading }
}
```

Signed-out: `listSaved()` returns `[]` (RLS blocks the query with no session), so
`isSaved()` is always `false` — the heart renders unfilled everywhere without special-casing.

## 6. `frontend/components/SaveListingButton.tsx` (new)

Small presentational heart button:

```tsx
function SaveListingButton({ saved, onToggle, size }: { saved: boolean; onToggle: () => void; size?: "sm" | "md" }) {
  const router = useRouter()
  const [email, setEmail] = useState<string | null | undefined>(undefined)  // same pattern as UserMenu.tsx

  return (
    <button
      onClick={e => {
        e.stopPropagation()   // same guard ListingCard's "View Listing →" anchor already uses
        if (!email) { router.push("/login"); return }
        onToggle()
      }}
      aria-label={saved ? "Remove from saved" : "Save listing"}
      className="..."
    >
      {saved ? "♥" : "♡"}
    </button>
  )
}
```

**Decision: show the heart to signed-out users, redirect to `/login` on click** (rather
than hiding it) — same rationale as showing the "Log In" pill in `UserMenu.tsx` instead of
hiding account UI entirely: it advertises the feature instead of hiding it behind an
account wall the user hasn't discovered yet.

## 7. Where the heart is wired in

| Component | Placement | Threading |
|---|---|---|
| `ListingCard.tsx` | Top-right, in the same `absolute top-4 right-4` badge stack as `AvailabilityBadge` — add before/alongside it | New props `saved: boolean`, `onToggleSave: () => void` |
| `SummaryTable.tsx` | New leading column, before the existing `#` index column (colgroup widths shrink slightly to make room) | New props `savedKeys: Set<string>`, `onToggleSave: (listing: Listing) => void` — the table renders all rows itself from a `TableRow[]` array, so it takes the full set rather than a per-row boolean, and computes `savedKeys.has(l.listing_key)` per row |
| `MapView.tsx` Popup | Next to the existing "View Listing" button in the popup header row | Same `savedKeys` / `onToggleSave` shape as `SummaryTable` |
| `PropertyDrawer.tsx` | Next to the existing ✕ close button, or next to the availability badge | `saved: boolean`, `onToggleSave: () => void` (single listing, like `ListingCard`) |

Note `tableRowsHtml` / `tableRowsTsv` (the Copy-table / Save-table-PNG export helpers) are
**not** touched — they're plain data exports (HTML/TSV for clipboard, or a cloned DOM node
rasterized to PNG), and a saved/unsaved glyph isn't data worth exporting.

`AssistantMessage.tsx` and `app/map/page.tsx` each own one `useSavedListings()` instance
and pass `isSaved` / `savedKeys` / `toggle` down into `ListingCard`, `SummaryTable`, and
`MapView` — all three read the same underlying state, so a toggle in the Map popup is
immediately reflected if the user switches to Table or Cards view without a page reload.
`app/page.tsx` and `app/chat/page.tsx` need the same instance passed to `PropertyDrawer`
(both already hold `selectedListing` state for the drawer) — since a saved unit must show
as saved *everywhere* it's viewed (§1.1), the drawer is in scope too, not optional.

### 7.1 "Saved on" date — same optional-prop pattern as `walkMinsByUrl`

`AssistantMessage.tsx` already threads a per-listing optional value this way
(`walkMinsByUrl?: Record<string, number | null>` on `MapView`, `walkMins?: number | null`
on `ListingCard`) for data that only exists in some contexts. The saved date follows the
identical pattern, keyed by `listing_key` (not `url` — this feature's identity key, §2):

- `ListingCard.tsx` — new optional prop `savedAt?: string | null`; renders a small muted
  line (e.g. under the company logo) only when present.
- `SummaryTable.tsx` — new optional prop `savedAtByKey?: Record<string, string>`; when
  provided (non-empty), renders one more column ("Saved"), same conditional-column pattern
  already used for `hasWalk`.
- `MapView.tsx` Popup — new optional prop `savedAtByKey?: Record<string, string>`; renders
  one more line in the popup body when the current `popup.listing_key` has an entry.

All three are `undefined` outside the Saved page (search results don't have a save date to
show), so none of this affects the existing Cards/Table/Map views elsewhere in the app.
Format with `toLocaleDateString()` — the same convention `Sidebar.tsx` already uses for
`last_scraped` (`ai-pipeline-implementation-phases/phase-5.1-snapshot-versioning.md` §"Live Sidebar Metadata").

## 8. New "Saved Homes" page — `frontend/app/saved/page.tsx` (new)

### 8.1 Location — next to the account menu, not a nav tab

**Per your clarification:** "Saved" sits immediately to the left of the account
avatar/menu, not grouped with Card Tab / Chat / Map. In `AppHeader.tsx`, that means it
moves out of the `TABS` row and into the right-aligned group that currently only wraps
`UserMenu`:

```tsx
<div className="flex gap-1">{TABS.map(...)}</div>   {/* unchanged: Card Tab / Chat / Map */}
<div className="ml-auto flex items-center gap-3">
  <Link href="/saved" className="px-3 py-1 rounded-full text-xs font-medium text-neutral-500 hover:text-neutral-800 hover:bg-neutral-100 transition-colors">
    Saved
  </Link>
  <UserMenu />
</div>
```

### 8.2 Three view modes — Cards / List / Map

Mirrors `AssistantMessage.tsx`'s existing `view` state (`"cards" | "table" | "map"`) and
its Cards/Table/Map toggle buttons over the same saved-listing set, reusing `ListingCard`,
`SummaryTable`, and `MapView` directly rather than building new view components.

**Extraction:** `AssistantMessage.tsx` already has the three-button pill toggle inline
(the "View toggle" block). Rather than duplicate that markup in `app/saved/page.tsx`,
pull it into `frontend/components/ViewToggle.tsx`:
```tsx
export type View = "cards" | "table" | "map"
export function ViewToggle({ view, onChange }: { view: View; onChange: (v: View) => void }) { ... }
```
`AssistantMessage.tsx` swaps its inline buttons for `<ViewToggle view={view} onChange={setView} />`
— a refactor with no behavior change on the existing page; it only earns its keep because
the Saved page is a second call site that needs the identical toggle.

### 8.3 Sorting — Price, Beds, and Availability

**Confirmed:** all three of `SummaryTable.tsx`'s existing `SortKey` values
(`"price" | "beds" | "availability"`) — Price, Bed count, and Availability status (Now /
Available-by-month / Leased, via `availabilitySortValue()` in `lib/availability.ts`). This
is an exact match to the sort pills already in `AssistantMessage.tsx` ("Unit" / "Price/bed"
/ "Availability"), not a reduced subset — so the Saved page reuses the same three keys
wholesale rather than a partial set.

Since the sort-pill row is now needed unchanged at a second call site, extract it
alongside `ViewToggle` (§8.2) into `frontend/components/SortPills.tsx`:
```tsx
export type SortKey = "price" | "beds" | "availability"
export function SortPills({ sortBy, sortDir, onChange }: {
  sortBy: SortKey; sortDir: "asc" | "desc"; onChange: (key: SortKey) => void
}) { ... }
```
`AssistantMessage.tsx` swaps its inline sort-pill buttons for `<SortPills>` the same way it
adopts `<ViewToggle>` — refactor only, no behavior change there. (Its "Distance" landmark
sort stays as-is, inline in `AssistantMessage.tsx` — that's a separate feature, not part of
`SortKey`, and wasn't requested for the Saved page.)

### 8.4 "Saved on" timestamp

Shown in all three views via the §7.1 props, sourced from each row's `saved_at`:

```tsx
export default function SavedPage() {
  const { savedRows, loading, toggle, isSaved } = useSavedListings()
  const [view, setView]       = useState<View>("cards")
  const [sortBy, setSortBy]   = useState<SortKey>("price")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")

  const listings      = savedRows.map(rowToListing)
  const savedAtByKey  = Object.fromEntries(savedRows.map(r => [r.listing_key, r.saved_at]))
  // sort `listings` by sortBy/sortDir (same comparators as SummaryTable.tsx), then render:
  // AppHeader + ViewToggle + SortPills
  // + (Cards grid | SummaryTable | MapView), each passed savedAtByKey / savedAt
  // + empty state when savedRows is empty
}
```

## 9. What we ruled out (for now)

**Live-refresh saved listings against the current snapshot.** Cross-referencing each saved
`listing_key` against `/api/listings` on page load would show up-to-date price/availability
and detect delisted units. Ruled out for v1 — the snapshot-at-save-time approach (§3) is
simpler, has one data source for the Saved page, and never silently drops a listing a user
explicitly saved just because it left the current scrape. Instead, the save date itself is
surfaced directly in the UI (§7.1, §8.4) so a stale listing at least reads as "saved 3 weeks
ago" rather than looking falsely current. Revisit live-refresh if that's not enough — e.g. a
"Refresh" button that re-queries `/api/listings` by `listing_key` and shows a "price
changed" / "no longer listed" badge.

**Full `Listing` snapshot in `saved_listings`.** Ruled out in §3 — the light subset covers
every surface that currently exists (`ListingCard`, `MapView` popup) at lower row cost.

## 10. Implementation checklist

**Backend (Python):**
1. `backend/main.py` — `/api/search`: add `listing_key` to each listing dict (§2)
2. `backend/main.py` — `_to_listing()` in `/api/listings`: add `listing_key` (§2)
3. `rag/agent.py` — `housing_search` tool: add `listing_key` to each listing dict (§2)

**Supabase (dashboard, like the `waitlist` table setup in `user-authentication.md` §6):**
4. Create `saved_listings` table + RLS policy (§3) via SQL Editor

**Frontend (TypeScript):**
5. `frontend/lib/api.ts` — add `listing_key: string` to `Listing` (§2)
6. `frontend/lib/supabase/savedListings.ts` (new) — `listSaved` / `saveListing` /
   `unsaveListing` / `rowToListing` (§4)
7. `frontend/hooks/useSavedListings.ts` (new) — shared hook (§5)
8. `frontend/components/SaveListingButton.tsx` (new) — heart button (§6)
9. `frontend/components/ListingCard.tsx` — heart in badge stack + `saved`/`onToggleSave`
   props + optional `savedAt` display (§7, §7.1)
10. `frontend/components/SummaryTable.tsx` — new leading heart column + `savedKeys`/
    `onToggleSave` props + optional "Saved" column via `savedAtByKey` (§7, §7.1)
11. `frontend/components/MapView.tsx` — heart in popup + `savedKeys`/`onToggleSave` props +
    optional saved-date line via `savedAtByKey` (§7, §7.1)
12. `frontend/components/PropertyDrawer.tsx` — heart near close button + `saved`/`onToggleSave` props (§7)
13. `frontend/components/ViewToggle.tsx` (new) — extracted Cards/Table/Map pill toggle (§8.2)
14. `frontend/components/SortPills.tsx` (new) — extracted Price/Beds/Availability sort pills (§8.3)
15. `frontend/components/AssistantMessage.tsx` — own a `useSavedListings()` instance, thread
    through all three views; swap inline view-toggle and sort-pill markup for `<ViewToggle>`
    and `<SortPills>` (§7, §8.2, §8.3)
16. `frontend/app/map/page.tsx` — own a `useSavedListings()` instance, thread through
17. `frontend/app/page.tsx`, `frontend/app/chat/page.tsx` — pass save props to `PropertyDrawer`
18. `frontend/app/saved/page.tsx` (new) — the Saved Homes page: `ViewToggle` + `SortPills` +
    Cards/List/Map rendering + saved-on dates + empty state (§8)
19. `frontend/components/AppHeader.tsx` — move `UserMenu` into a right-aligned group and add
    a "Saved" link immediately to its left, outside the `TABS` array (§8.1)

**Manual test:** save a unit from the Map popup, switch to Table view, then Cards view —
heart shows filled in all three without a reload; same check in reverse (save from Table,
confirm Map + Cards + Drawer show it filled); heart state persists across a full page
reload; signed-out click redirects to `/login`; Saved page shows the correct "Saved on"
date per listing, sorts correctly by price, beds, and availability, and unsaving there
removes the filled state everywhere else on next load.
