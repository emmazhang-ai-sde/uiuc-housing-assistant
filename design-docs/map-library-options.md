# Map Library Options — Feature 1 (Map View)

## How web maps work (two independent decisions)

1. **The mapping library** — renders the map, handles pins, click events, pan/zoom
2. **The tile provider** — serves the actual map image tiles (streets, labels, terrain)

Most polished-looking maps use a JS library with a premium tile provider swapped in for visual quality. These two choices are decoupled — you can mix and match.

---

## Library options

### react-leaflet (Leaflet wrapped in React)
- Oldest and most battle-tested. Pure JS, MIT licensed.
- **Next.js caveat**: Leaflet accesses `window` on import — must use `dynamic(() => import(...), { ssr: false })`. Well-documented pattern.
- Default tiles: OpenStreetMap (free, no API key).
- Tile provider is swappable without changing the library.
- Bundle: ~142KB minified.
- Style customization: limited to tile layer swaps + custom HTML/SVG markers.

### react-map-gl + MapLibre GL ← recommended for aesthetics
- `react-map-gl` is a React wrapper supporting both Mapbox and MapLibre backends.
- **MapLibre** is the open-source BSD fork of Mapbox GL JS (Mapbox went proprietary in 2021; MapLibre preserves the old open license).
- WebGL-rendered — smooth pan/zoom, tilted views, 3D buildings possible.
- Supports the full **Mapbox GL style spec**: every road, water body, building, label, and font is independently colorable via a JSON style document.
- Free style editors: **Maputnik** (web-based, open source), **MapTiler Studio** (free tier).
- Tiles: MapTiler free tier (100k tile requests/month); also OpenFreeMap (fully free, no key).
- This is what most "premium-looking" vibe-coded maps use.

### @vis.gl/react-google-maps
- Official Google Maps React wrapper from the deck.gl team.
- Requires Google Maps API key. Pricing: $7/1000 map loads, $200 free credit/month (~28k loads).
- Styling via JSON style arrays — less granular than MapLibre's style spec.
- Familiar look; satellite and Street View available.

### Pigeon Maps
- Tiny (~3KB), zero-dependency, pure React.
- OpenStreetMap tiles only, no WebGL.
- Very simple pin use cases only; limited customization.

---

## Tile provider options (independent of library)

| Provider | Cost | Notes |
|---|---|---|
| OpenStreetMap | Free | Default Leaflet tiles; utilitarian look |
| OpenFreeMap | Free, no key | Clean styles; works with MapLibre |
| Stadia Maps | Free up to 200k/month | Includes Stamen Watercolor, Toner — distinctive artistic styles |
| MapTiler | Free up to 100k/month | Multiple polished styles; works with MapLibre |
| Mapbox | Free up to 50k/month | Premium styles; requires Mapbox account |

---

## Aesthetic customization

If visual style matters, **react-map-gl + MapLibre** is the clear winner:

- Full Mapbox GL style spec means every map element (roads, water, buildings, parks, labels, fonts) has an individually configurable color, opacity, and width.
- Can match the app's existing Morandi palette (muted, desaturated) across the entire map surface — not just marker colors.
- MapTiler's "Backdrop" and "Dataviz" preset styles are already aesthetically refined and work out of the box.
- Stadia Maps "Stamen Watercolor" via Leaflet is a quick win if you want a painterly/artistic look without custom styling work.

---

## Geocoding (separate from map library)

Addresses need lat/lng coordinates pre-computed at ingest time. Options:

| Service | Cost | Notes |
|---|---|---|
| Nominatim (OSM) | Free, no key | Rate-limited to 1 req/sec; fine for one-time batch of ~400 addresses |
| Positionstack | Free up to 25k/month | Slightly faster batch processing |
| Google Geocoding API | $5/1000, $200 free/month | Most accurate; overkill for this use case |
| Mapbox Geocoding | Pay per request | Only worth it if already using Mapbox tiles |

**Recommendation**: Nominatim for the one-time ingest batch. ~400 addresses at 1 req/sec = under 10 minutes. No API key, no cost.

---

## Recommendation summary

| Goal | Choice |
|---|---|
| Fastest to ship, zero cost, basic look | react-leaflet + OpenStreetMap |
| Best aesthetic customization, still free | react-map-gl + MapLibre + MapTiler/OpenFreeMap |
| Familiar Google look, low traffic | @vis.gl/react-google-maps |

For this project: **react-map-gl + MapLibre** — matches the visual quality of slick "vibe coded" sites, fully free at this scale, and gives full control over color/style to match the existing Morandi UI palette.
