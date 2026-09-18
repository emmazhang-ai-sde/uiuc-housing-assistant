# UIUC Housing Frontend

Next.js 16 frontend for the UIUC Housing Assistant. The active app is now focused on search, comparison, and map browsing rather than chat or account-management pages.

## Active Routes

- `/about` — editorial landing page with the current warm campus visual system
- `/card` — card-based listing browse with shared filters and listing detail panel
- `/map` — map-first browse with shared filters, listing pins, and map color controls
- `/login` — Supabase auth
- `/admin/activity` — admin-only activity view, exposed from the header for admins
- `/admin/feedback` — admin-only historical feedback review

There is no active `/account` page. Signed-in user controls live in the shared header:

- unauthenticated users see `Log In`
- signed-in users see their email prefix and avatar
- the dropdown shows the full email and `Log out`
- admin users get the `Admin Activity` tab from `/api/admin/status`

The former user-facing `Rate & Report` page has been retired from navigation and archived at `../archive/retired-feedback-page/`.

## Design System Notes

- App-wide body font: `Inter`
- Display/brand font: `Lilita One`, used for hero text, prominent stats, brand marks, prices, and select headings
- Warm palette tokens live in `app/globals.css`:
  - `warm-ivory`
  - `espresso-brown`
  - `forest-green`
  - `blush-pink`
- About hero image asset: `public/about/uiuc-housing-hero.png`
- Experimental static About preview: `public/about-editorial-preview.html`

## Local Development

The repo intentionally uses the `310x` port range:

- FastAPI backend: `http://localhost:3101`
- Next.js frontend: `http://localhost:3102`

Start the frontend:

```bash
npm run dev
```

Useful checks:

```bash
npx tsc --noEmit
npm run lint
```

`npm run lint` may report existing React hook lint issues in `app/card/page.tsx` and `app/map/page.tsx` around synchronous loading-state updates inside effects. Those are pre-existing app-page issues, separate from component-level UI changes.

## Key Components

- `components/AppHeader.tsx` — shared navigation and admin tab
- `components/UserMenu.tsx` — signed-in user dropdown and logout
- `components/FilterChips.tsx` — shared Card/Map filter row
- `components/ListingCardV2.tsx` — active listing card skin
- `components/ListingGrid.tsx` — card grid column layout
- `components/PropertyPanel.tsx` — docked detail panel on Card view
- `components/PropertyDrawer.tsx` — drawer/detail content shared with Map
- `components/MapColorPicker.tsx` — default/custom map color editor
- `components/ListingPhoto.tsx` — image loader with fallback on broken listing photos

## Map Theme

Map theme defaults live in `lib/mapTheme.ts`; persisted theme state lives in `hooks/useMapTheme.ts`.

The active map color UI supports:

- `default` palette
- user-edited custom colors based on the default palette

Named alternate presets were removed from the product UI.
