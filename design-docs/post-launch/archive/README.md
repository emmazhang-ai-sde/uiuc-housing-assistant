# Archive: Pre-Jobright UI Versions

**Created: 2026-07-15**

This folder holds the last pre-jobright version of every UI file that was restyled during the sitewide jobright redesign (2026-07-13 to 2026-07-15). The live app now uses the jobright design language everywhere: Inter as the global font (set on `<body>` in `frontend/app/layout.tsx`), mint `#00F0A0` / `#28C86E` accents, the `266deg #ACFFE1 → #CFFFC4` gradient (stats panel variant: `#B5FFE4 → #D2FFC8`), ink `#232424` text, mist `#F7F8F9` / `#F3F4F5` surfaces, white cards with `mist-100` borders, pill CTAs, and the `border-radius: 0 80px 80px 80px` signature panel shape. Design tokens live in `frontend/app/globals.css` under `@theme` (`mint-*`, `ink-900`, `mist-*`).

To restore any file, copy it back over its live path (listed below) and remove the jobright token classes as needed. Everything here is also recoverable from git history.

## Archived files → live counterparts

| Archived file | Live path it came from | Notes |
|---|---|---|
| `about-page-jobright-v1.tsx` | `frontend/app/about/page.tsx` | First jobright reskin of About (2026-07-13, kept original section order). The live About was later rebuilt twice: full landing structure, then user-directed tweaks (grey Always-On panel, pain wall removed, typewriter Two Ways). `/about-v2` is a separate alternate layout, still live. |
| `listing-card-v1.tsx` | `frontend/components/ListingCard.tsx` (deleted) | Original card skin. Replaced by `ListingCardV2.tsx`, which `ListingGrid` now renders unconditionally. |
| `layout-v1.tsx` | `frontend/app/layout.tsx` | Root layout when the global font was still Nunito Sans. |
| `login-page-v1.tsx` | `frontend/app/login/page.tsx` | Login page wrapper with its page-scoped Nunito Sans. |
| `login-card-v1.tsx` | `frontend/components/auth/LoginCard.tsx` | Pre-jobright login card: Illini orange waitlist notice, Morandi `#7B90A0` focus rings, dark rectangular buttons. |
| `map-page-v1.tsx` | `frontend/app/map/page.tsx` | Map page chrome before mist borders on the toast cards. |
| `table-page-v1.tsx` | `frontend/app/table/page.tsx` | Table page with the old `neutral-100` shell. |
| `summary-table-v1.tsx` | `frontend/components/SummaryTable.tsx` | Old table skin: Morandi availability badges (`now-100` / `#C7DDB5`), peach `#F5BBA0` over-budget chip. |
| `filter-bar-v1.tsx` | `frontend/components/FilterBar.tsx` | Shared filter panel before mint focus rings and jobright green/red coverage labels (`#6E8B63` / `#B0716A` Morandi originals). |
| `map-filter-bar-v1.tsx` | `frontend/components/MapFilterBar.tsx` | Thin wrapper, archived for completeness (unchanged in the restyle). |
| `property-panel-v1.tsx` | `frontend/components/PropertyPanel.tsx` | Docked detail column before mist borders. |
| `property-drawer-v1.tsx` | `frontend/components/PropertyDrawer.tsx` | Drawer with Morandi badges, sage `#8A9E7E` tagline, dark View Listing button (now mint). |
| `save-button-v1.tsx` | `frontend/components/SaveButton.tsx` | Save pill before the ink-900/hover-black treatment. |
| `admin-activity-page-v1.tsx` | `frontend/app/admin/activity/page.tsx` | Dashboard with Illini orange/navy stat accents (now mint/ink). |
| `admin-feedback-page-v1.tsx` | `frontend/app/admin/feedback/page.tsx` | Feedback list with Illini orange stars (now jobright amber `#FDA700`). |
| `filter-panel-orphaned.tsx` | `frontend/components/FilterPanel.tsx` (deleted) | Orphaned since 2026-07-02 (nothing imported it); moved here during the archive sweep rather than restyled. |
| `coming-soon-page-v1.tsx` | `frontend/app/coming-soon/page.tsx` | Pre-existing archive from the 2026-07-05 waitlist pass (lives in `design-docs/product-launch/archive/`, listed here for the full picture). |

## Deliberately not restyled

`frontend/components/MapView.tsx` keeps its semantic availability colors (`#D2F55E` now, `#C7DDB5` Aug, grey leased) because the map pins are a legend that `FilterBar`'s availability dots reference; only the page chrome around the map changed. `frontend/public/logos/user-avatar.jpeg` is unused since the account page dropped its avatar photo.
