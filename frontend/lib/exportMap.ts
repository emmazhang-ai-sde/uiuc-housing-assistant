import maplibregl from "maplibre-gl"
import type { Listing, Filters } from "@/lib/api"
import { LANDMARKS } from "@/lib/landmarks"
import { availabilityStatus, bedsLabel } from "@/lib/availability"
import { downloadBlob, buildExportSlug } from "@/lib/exportDom"
import { buildMapStyle, GRAIN_DATA_URI, themePins, pinTextColor, type MapTheme } from "@/lib/mapTheme"

const MAPLIBRE_VER = "5.24.0"

function priceLabel(l: Listing): string {
  const v = l.beds <= 1 ? l.price_total_low : l.price_per_bed_low
  return v != null ? `$${v.toLocaleString()}` : "—"
}

function priceSuffix(l: Listing): string {
  return l.beds <= 1 ? "/mo" : "/bed"
}

/**
 * Exports the map as a self-contained interactive HTML file.
 *
 * Clicking a price label opens a MapLibre Popup with listing details
 * (photo, address, price, availability).  The "View Listing" button
 * inside the popup is the only element that navigates to the external URL.
 */
export async function exportMapAsHtml(
  _sourceMap: maplibregl.Map,
  listings: Listing[],
  filters: Filters,
  theme: MapTheme,
) {
  const mapped = listings.filter(l => l.lat != null && l.lng != null)

  // Recolored basemap style + optional paper-grain overlay, matching the live map.
  const mapStyle  = buildMapStyle(theme)
  const grainCss  = theme.grain > 0
    ? `#grain { position: fixed; inset: 0; pointer-events: none; mix-blend-mode: multiply;
        background-image: url("${GRAIN_DATA_URI}"); background-size: 220px 220px;
        opacity: ${theme.grain}; z-index: 5; }`
    : ""
  const grainDiv  = theme.grain > 0 ? `<div id="grain"></div>` : ""

  // Themed availability pin colors (match the live map).
  const pins  = themePins(theme)
  const pinBg = (l: Listing) => pins[availabilityStatus(l.availability ?? "")]

  const lngs = mapped.map(l => l.lng!)
  const lats  = mapped.map(l => l.lat!)

  const markers = mapped.map(l => ({
    lng:          l.lng!,
    lat:          l.lat!,
    url:          l.url,
    label:        priceLabel(l),
    suffix:       priceSuffix(l),
    bg:           pinBg(l),
    text:         pinTextColor(pinBg(l)),
    photo_url:    l.photo_url   ?? "",
    company:      l.company     ?? "",
    address:      l.address     ?? "",
    area:         l.area        ?? "",
    unit_type:    l.unit_type   ?? "",
    beds:         l.beds,
    property_type: l.property_type ?? "",
    availability: l.availability  ?? "",
    is_available: l.is_available,
    beds_label:   bedsLabel(l.beds, l.unit_type),
  }))

  // Unique bed counts present in the data, sorted ascending
  const bedTypes = [...new Set(mapped.map(l => l.beds))].sort((a, b) => a - b)

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>UIUC Housing Map</title>
<link rel="stylesheet" href="https://unpkg.com/maplibre-gl@${MAPLIBRE_VER}/dist/maplibre-gl.css">
<script src="https://unpkg.com/maplibre-gl@${MAPLIBRE_VER}/dist/maplibre-gl.js"><\/script>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: 100%; height: 100%; }
#map { width: 100%; height: 100%; }

/* ── Bed-type filter bar ── */
#filter-bar {
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 10;
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  background: rgba(255,255,255,.88);
  backdrop-filter: blur(6px);
  padding: 6px 8px;
  border-radius: 999px;
  box-shadow: 0 2px 8px rgba(0,0,0,.10);
}
.filter-btn {
  padding: 3px 12px;
  border-radius: 999px;
  border: 1.5px solid #d4d4d4;
  background: transparent;
  font: 600 11px system-ui, sans-serif;
  color: #525252;
  cursor: pointer;
  transition: background .15s, color .15s, border-color .15s;
  outline: none;
}
.filter-btn.active {
  background: #4a7c59;
  color: #fff;
  border-color: #4a7c59;
}
.filter-btn:hover:not(.active) { background: #f5f5f5; }

/* Price pin button */
.pin {
  display: block;
  padding: 2px 8px;
  border-radius: 999px;
  font: bold 11px system-ui, sans-serif;
  white-space: nowrap;
  border: 1px solid rgba(255,255,255,.6);
  box-shadow: 0 1px 4px rgba(0,0,0,.15);
  cursor: pointer;
  transition: opacity .15s, transform .1s;
  user-select: none;
  outline: none;
}
.pin:hover { opacity: .85; transform: scale(1.08); }

/* ── Landmark dot  (w-2.5 h-2.5 rounded-full bg-[#4a7c59] border-2 border-white) ── */
.landmark-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #4a7c59;
  border: 2px solid #fff;
  box-shadow: 0 1px 4px rgba(0,0,0,.2);
  cursor: pointer;
  transition: transform .15s;
}
.landmark-dot:hover { transform: scale(1.25); }

/* ── MapLibre popup shell — matches MapView.tsx maxWidth="240px" ── */
.maplibregl-popup-content {
  padding: 0 !important;
  border-radius: 8px !important;
  overflow: hidden;
  box-shadow: 0 2px 12px -2px rgba(0,0,0,.15) !important;
  width: 240px;
  font-family: system-ui, -apple-system, sans-serif;
}
/* Keep the default MapLibre close button but position it over the photo */
.maplibregl-popup-close-button {
  font-size: 14px;
  color: #171717;
  right: 6px;
  top: 6px;
  width: 20px;
  height: 20px;
  border-radius: 999px;
  background: rgba(255,255,255,.82);
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  z-index: 10;
}
.maplibregl-popup-close-button:hover { background: rgba(255,255,255,1); }

/* ── Photo strip  (h-28 = 112px, bg-neutral-100 = #f5f5f5) ── */
.popup-photo {
  width: 100%;
  height: 112px;
  background: #f5f5f5;
}
.popup-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }

/* ── Body  (text-xs p-3 space-y-1.5) ── */
.popup-body {
  font-size: 12px;          /* text-xs */
  color: #404040;           /* text-neutral-700 */
  padding: 12px;            /* p-3 */
  display: flex;
  flex-direction: column;
  gap: 6px;                 /* space-y-1.5 */
}

/* company + button row */
.popup-row-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}
.popup-company {
  font-size: 10px;          /* text-[10px] */
  font-weight: 700;         /* font-bold */
  color: #a3a3a3;           /* text-neutral-400 */
  text-transform: uppercase;
  letter-spacing: .04em;   /* tracking-wide */
}
/* View Listing — shrink-0 text-[11px] font-bold text-neutral-900
                  bg-neutral-100 hover:bg-neutral-900 hover:text-white
                  px-2.5 py-1 rounded-full */
.popup-view-btn {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 700;
  color: #171717;
  background: #f5f5f5;
  padding: 4px 10px;
  border-radius: 999px;
  text-decoration: none;
  white-space: nowrap;
  transition: background .15s, color .15s;
}
.popup-view-btn:hover { background: #171717; color: #fff; }

/* font-semibold text-neutral-900 leading-snug */
.popup-address { font-weight: 600; color: #171717; line-height: 1.375; }

/* text-neutral-400 text-[11px] capitalize */
.popup-area { font-size: 11px; color: #a3a3a3; text-transform: capitalize; }

/* text-neutral-500 */
.popup-meta { color: #737373; }

/* font-bold text-neutral-900 text-sm */
.popup-price { font-weight: 700; color: #171717; font-size: 14px; }
/* font-normal text-neutral-400 text-xs */
.popup-price-suffix { font-weight: 400; color: #a3a3a3; font-size: 12px; }

/* text-green-700 font-medium  /  text-neutral-400 */
.popup-avail-yes { color: #15803d; font-weight: 500; }
.popup-avail-no  { color: #a3a3a3; }
${grainCss}
</style>
</head>
<body>
<div id="map"></div>
${grainDiv}
<div id="filter-bar"></div>
<script>
const MARKERS   = ${JSON.stringify(markers)};
const LANDMARKS = ${JSON.stringify(LANDMARKS.map(lm => ({ name: lm.name, lat: lm.lat, lng: lm.lng })))};
const BED_TYPES = ${JSON.stringify(bedTypes)};

const MAIN_QUAD = {
  type: "Feature",
  properties: {},
  geometry: {
    type: "Polygon",
    coordinates: [[
      [-88.2276394, 40.1088443], [-88.2269468, 40.1088492], [-88.2267993, 40.1088497],
      [-88.2267988, 40.1087509], [-88.2267987, 40.1087378], [-88.2267984, 40.1086771],
      [-88.2268027, 40.1082303], [-88.2268030, 40.1081968], [-88.2268054, 40.1078911],
      [-88.2268063, 40.1077776], [-88.2268065, 40.1077527], [-88.2268084, 40.1075054],
      [-88.2268091, 40.1074146], [-88.2268103, 40.1072329], [-88.2268109, 40.1071679],
      [-88.2268121, 40.1070321], [-88.2268132, 40.1069110], [-88.2268191, 40.1064358],
      [-88.2268191, 40.1062461], [-88.2268784, 40.1062460], [-88.2275150, 40.1062474],
      [-88.2275699, 40.1062482], [-88.2275737, 40.1063880], [-88.2275804, 40.1066311],
      [-88.2275821, 40.1066940], [-88.2275857, 40.1068253], [-88.2275883, 40.1069199],
      [-88.2275904, 40.1069970], [-88.2275909, 40.1070163], [-88.2275974, 40.1072531],
      [-88.2276191, 40.1080493], [-88.2276394, 40.1088443],
    ]],
  },
};

const map = new maplibregl.Map({
  container: "map",
  style: ${JSON.stringify(mapStyle)},
  bounds: [[${Math.min(...lngs)}, ${Math.min(...lats)}], [${Math.max(...lngs)}, ${Math.max(...lats)}]],
  fitBoundsOptions: { padding: 60 },
});

function esc(s) {
  return String(s ?? "")
    .replace(/&/g,"&amp;").replace(/"/g,"&quot;")
    .replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

function buildPopupHtml(m) {
  const meta = [m.unit_type, m.beds_label, m.property_type].filter(Boolean).join(" · ");
  return \`
    <div class="popup-photo">
      \${m.photo_url ? \`<img src="\${esc(m.photo_url)}" alt="" loading="lazy">\` : ""}
    </div>
    <div class="popup-body">
      <div class="popup-row-top">
        <div class="popup-company">\${esc(m.company)}</div>
        <a class="popup-view-btn" href="\${esc(m.url)}" target="_blank" rel="noopener noreferrer">View Listing</a>
      </div>
      <div class="popup-address">\${esc(m.address)}</div>
      \${m.area ? \`<div class="popup-area">\${esc(m.area)}</div>\` : ""}
      \${meta ? \`<div class="popup-meta">\${esc(meta)}</div>\` : ""}
      <div class="popup-price">\${esc(m.label)}<span>\${esc(m.suffix)}</span></div>
      <div class="\${m.is_available ? "popup-avail-yes" : "popup-avail-no"}">\${esc(m.availability)}</div>
    </div>
  \`;
}

function bedLabel(beds) {
  return beds === 0 ? "Studio" : beds + " Bed";
}

map.on("load", () => {
  map.addSource("main-quad", { type: "geojson", data: MAIN_QUAD });
  map.addLayer({ id: "main-quad-fill", type: "fill", source: "main-quad",
    paint: { "fill-color": "#4a7c59", "fill-opacity": 0.22 } });
  map.addLayer({ id: "main-quad-outline", type: "line", source: "main-quad",
    paint: { "line-color": "#4a7c59", "line-width": 1.5, "line-opacity": 0.7 } });

  let activePopup = null;

  // Build listing markers, track instances for filter toggling
  const markerItems = MARKERS.map(m => {
    const btn = document.createElement("button");
    btn.className = "pin";
    btn.textContent = m.label;
    btn.style.background = m.bg;
    btn.style.color = m.text;

    btn.addEventListener("click", e => {
      e.stopPropagation();
      if (activePopup) { activePopup.remove(); activePopup = null; }
      activePopup = new maplibregl.Popup({ closeButton: true, maxWidth: "none", anchor: "top" })
        .setLngLat([m.lng, m.lat])
        .setHTML(buildPopupHtml(m))
        .addTo(map);
      activePopup.on("close", () => { activePopup = null; });
    });

    const marker = new maplibregl.Marker({ element: btn, anchor: "bottom" })
      .setLngLat([m.lng, m.lat])
      .addTo(map);
    return { marker, beds: m.beds, on: true };
  });

  // ── Bed-type filter bar ──────────────────────────────────────────
  const selectedBeds = new Set(BED_TYPES);
  const filterBar = document.getElementById("filter-bar");

  function applyFilter() {
    markerItems.forEach(item => {
      const show = selectedBeds.has(item.beds);
      if (show && !item.on)  { item.marker.addTo(map); item.on = true; }
      if (!show && item.on)  { item.marker.remove();   item.on = false; }
    });
    if (activePopup) { activePopup.remove(); activePopup = null; }
  }

  BED_TYPES.forEach(beds => {
    const btn = document.createElement("button");
    btn.className = "filter-btn active";
    btn.textContent = bedLabel(beds);
    btn.addEventListener("click", () => {
      if (selectedBeds.has(beds)) {
        if (selectedBeds.size === 1) return;   // keep at least one active
        selectedBeds.delete(beds);
        btn.classList.remove("active");
      } else {
        selectedBeds.add(beds);
        btn.classList.add("active");
      }
      applyFilter();
    });
    filterBar.appendChild(btn);
  });

  // Landmark dots
  LANDMARKS.forEach(lm => {
    const dot = document.createElement("div");
    dot.className = "landmark-dot";
    dot.title = lm.name;
    dot.addEventListener("click", e => {
      e.stopPropagation();
      if (activePopup) { activePopup.remove(); activePopup = null; }
      activePopup = new maplibregl.Popup({ closeButton: false, maxWidth: "180px", anchor: "top" })
        .setLngLat([lm.lng, lm.lat])
        .setHTML(\`<div style="font:600 12px system-ui,sans-serif;color:#2d4f39;padding:2px 4px">\${esc(lm.name)}</div>\`)
        .addTo(map);
      activePopup.on("close", () => { activePopup = null; });
    });
    new maplibregl.Marker({ element: dot, anchor: "center" })
      .setLngLat([lm.lng, lm.lat])
      .addTo(map);
  });

  map.on("click", () => {
    if (activePopup) { activePopup.remove(); activePopup = null; }
  });
});
<\/script>
</body>
</html>`

  const slug = buildExportSlug(filters)
  const blob = new Blob([html], { type: "text/html;charset=utf-8" })
  downloadBlob(blob, `uiuc-housing-map-${slug}.html`)
}
