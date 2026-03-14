# PaceRoute

**Day/night-aware iterative route builder — pick cafes by day, pubs by night, and watch your route grow on the map.**

Plan a walking route around real nearby places. The app suggests the 5 closest POIs, you tap to add them to your route, and it immediately plots the walking path. Each time you add a stop, the next batch of suggestions appears near your latest waypoint so you can keep building outward. Toggle between **Day mode** (cafes) and **Night mode** (pubs) — the theme, POI type, and map style all switch together.

---

## Features

### Iterative route building
- Suggests the **5 closest** cafes (day) or pubs (night) from your current position or last waypoint
- Tap a suggestion in the sidebar or on the map to add it to your route
- Route geometry updates live via OSRM (walking profile)
- After each selection, the next 5 suggestions load from the **last waypoint's location**, so the route extends naturally
- Unselected suggestions stay visible and tappable — backtrack at any time
- Remove stops by tapping them in the route summary bar

### Clean map experience
- Desaturated OSM raster tiles for reduced visual noise
- User position shown as a **directional arrow** (rotates with device heading when moving)
- POI markers rendered as **native MapLibre symbol layers** — zero lag during pan/zoom
- White circle markers with text labels and halo for readability
- Compact attribution, no extra controls or overlays

### Map interactions
- **Hover** a POI on the map to see a Google Maps-style info card (name, distance, type)
- **Click** a POI to open a detailed popup with an "Add to route" / "Remove from route" button
- Route line drawn as a smooth emerald path under the markers

### Day & night modes
- **Day mode**: light theme, suggests cafes, warm map tones
- **Night mode**: dark theme, suggests pubs, cooler map tones
- Mode toggle in the top-right corner
- Switching modes clears the current route and fetches fresh suggestions

### Translucent glass UI
- Sidebar and popups use `backdrop-filter: blur()` for a frosted glass effect
- Sidebar is semi-transparent so the map shows through
- Floating header with Dashboard link appears on hover over the sidebar

### Dashboard (Strava-style)
- Accessible via the floating header's "Dashboard" button or `/dashboard`
- Shows past routes (mock data) with distance, duration, elevation
- Top visited places grid with visit counts
- Day/night theme toggle
- "Open map" button to return to the route builder

### Geolocation
- Uses the browser Geolocation API with `watchPosition` for real-time updates
- Tracks heading and speed for arrow rotation
- Falls back to Edinburgh city center (55.9533°N, 3.1883°W) when location is unavailable
- POIs load immediately using either real location or fallback

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Tailwind CSS 3 |
| Bundler | Vite 6 |
| Map rendering | MapLibre GL JS 4.7 |
| POI data | Overpass API (OpenStreetMap) |
| Route geometry | OSRM public API (walking profile) |
| Location tracking | Web Geolocation API |
| Routing | React Router DOM 6 |
| Backend | ASP.NET Core 8.0 (C#) — stub, not yet wired |

---

## How it works

### Iterative route flow
```
App loads → useUserLocation() watches GPS (or falls back to Edinburgh)
         ↓
useNearbyPOIs(center, mode) queries Overpass API
  → "amenity=cafe" (day) or "amenity=pub" (night)
  → within 1500m radius, sorted by Haversine distance, top 5
         ↓
MapView renders POI circles + labels via native MapLibre layers
ChatDock lists the 5 suggestions with distance
         ↓
User taps a POI (on map or sidebar)
  → selectedIds updated, allSelectedPois grows
  → fetchRoute([userLocation, ...selectedPois]) via OSRM
  → routeGeometry drawn as GeoJSON line layer
         ↓
queryCenter moves to last selected POI
  → useNearbyPOIs re-fires from that new center
  → next 5 suggestions appear (excluding already-selected)
         ↓
Loop continues — route grows outward from stop to stop
```

### Data flow
```
MapLayout (lifted state)
  ├── center (user loc or fallback)
  ├── suggestedPois (from Overpass, 5 closest)
  ├── selectedIds + allSelectedPois (user picks)
  ├── routeGeometry (from OSRM)
  └── activePoi / hoverInfo (UI state)
       │
       ├──→ MapView (map, markers, route line, hover cards, click popup)
       └──→ ChatDock (suggestion list, route summary, selection controls)
```

---

## Project structure
```
luke-hacks/
├── Program.cs                        # ASP.NET Core entry point (stub)
├── frontend/
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── tsconfig.json
│   └── src/
│       ├── main.tsx                   # React entry, BrowserRouter
│       ├── App.tsx                    # Routes, MapLayout (lifted state)
│       ├── index.css                  # Tailwind + glass utility
│       ├── types/
│       │   └── map.ts                # LngLat, POI types
│       ├── hooks/
│       │   ├── useUserLocation.ts    # Geolocation watch + heading
│       │   └── useNearbyPOIs.ts      # Overpass query, distance sort
│       ├── lib/
│       │   └── osrm.ts              # OSRM route fetch
│       ├── components/
│       │   ├── MapView.tsx           # MapLibre map, layers, popups
│       │   └── ChatDock.tsx          # Sidebar with suggestions
│       └── pages/
│           └── Dashboard.tsx         # Strava-style dashboard
└── README.md
```

---

## Getting started

### Prerequisites
- Node.js 18+
- .NET 8.0 SDK (for backend stub)

### Installation
```bash
git clone https://github.com/DovydasLatkauskas/Luke-hacks.git
cd Luke-hacks/frontend
npm install
```

### Run locally
```bash
cd frontend
npm run dev
```

Open `http://localhost:5173` in your browser. Allow location access when prompted — or it will fall back to Edinburgh.

> GPS tracking requires HTTPS in production. Chrome allows `localhost` to use the Geolocation API without SSL.

---

## External APIs used

| API | Purpose | Auth required |
|---|---|---|
| [Overpass API](https://overpass-api.de/) | Query nearby cafes/pubs from OpenStreetMap | No |
| [OSRM](https://router.project-osrm.org/) | Walking route geometry (public demo server) | No |
| [OpenStreetMap tiles](https://tile.openstreetmap.org/) | Raster map basemap | No |
| [MapLibre demo glyphs](https://demotiles.maplibre.org/) | Font glyphs for map labels | No |

All APIs are free and require no keys for the current implementation.

---

## Roadmap

- [ ] AI agent (Claude) for natural-language route requests ("easy 5k with 2 coffee stops")
- [ ] Live GPS tracking with pace/distance stats
- [ ] Persist routes to Supabase
- [ ] Elevation profile on route preview
- [ ] Export to GPX
- [ ] Social: share routes and compare with friends
- [ ] Heart rate zone integration (Web Bluetooth)
- [ ] Offline mode: cache route geometry
- [ ] Auto day/night switch based on local time

---

## License

MIT
