# Luke-hacks

# PaceRoute

**AI-powered run route builder with real-time tracking and pace analytics.**

Plan a running route around cafes, pubs, monuments, or any landmark type. An AI agent generates and adapts your route live on the map. As you run, the app tracks your location, distance, pace, and time — like Strava, but your route is built by AI around the things you actually want to see.

---

## Features

### Route planning
- Set a target distance (e.g. 5 km, 10 km, half marathon)
- Choose landmark categories — cafes, pubs, parks, monuments, bookshops, viewpoints, and more
- AI agent queries local POIs and constructs a looped route that hits your landmarks and lands close to your target distance
- Route renders live on an interactive map as the agent builds it
- Regenerate or tweak the route with a prompt (e.g. "avoid the hill on Leith Walk" or "add one more cafe stop")

### Live tracking
- GPS tracking starts when you begin your run
- Your position updates on the map in real time
- Progress indicator shows distance covered vs. total route distance
- Upcoming landmark callouts appear as you approach each stop

### Pace & stats (Strava-style)
| Metric | Description |
|---|---|
| Current pace | min/km updated every 5 seconds |
| Average pace | rolling average for the whole run |
| Distance | GPS-derived, in km |
| Elapsed time | live timer from run start |
| Estimated finish | based on current average pace |
| Split history | per-km breakdown shown post-run |

### AI agent
The route agent is always available mid-run. Ask it to:
- Re-route around a blocked road or bad weather
- Extend or shorten the remaining route
- Find the nearest cafe if you want to stop early
- Explain why it chose a particular path

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React + Tailwind CSS |
| Map rendering | Mapbox GL JS |
| POI data | Google Places API / Overpass API (OpenStreetMap) |
| Route geometry | OSRM (open-source routing engine) |
| AI agent | Claude API (claude-sonnet-4-20250514) with tool use |
| Location tracking | Web Geolocation API |
| Backend | Node.js + Express |
| Auth | Clerk |
| Database | Supabase (run history, user prefs) |

---

## How it works

### 1. Route generation
```
User sets: distance = 8 km, landmarks = [cafes, parks]
         ↓
AI agent calls: search_pois(type="cafe", radius=4km, location=userLocation)
         ↓
Agent filters and scores POIs by rating, detour cost, clustering
         ↓
Agent calls: build_route(waypoints=[...], target_km=8)
         ↓
OSRM returns geometry → rendered on Mapbox map
         ↓
Agent streams commentary: "I've routed you past Artisan Roast on Broughton Street
                           and through Inverleith Park on the way back."
```

### 2. Live tracking loop
```
Browser Geolocation API (1-second updates)
         ↓
position → distance calculation (Haversine) → pace derivation
         ↓
Map marker updates, progress bar updates, stats panel updates
         ↓
Geofence check: within 80m of next waypoint?
   Yes → mark waypoint complete, notify user
   No  → continue tracking
```

### 3. Mid-run rerouting
```
User: "Can we skip the hill and add a pub stop?"
         ↓
Agent receives: current_position, remaining_waypoints, original_route
         ↓
Agent calls: search_pois(type="pub", near=current_position, within_route=true)
         ↓
Agent calls: build_route(from=current_position, waypoints=[new_set])
         ↓
Map updates with new geometry, ETA recalculated
```

---

## Getting started

### Prerequisites

- Node.js 18+
- A Mapbox account and public token
- An Anthropic API key
- A Google Places API key (or Overpass API for fully open-source POI data)
- Supabase project (for run history)

### Installation
```bash
git clone https://github.com/yourname/paceroute.git
cd paceroute
npm install
```

### Environment variables

Create a `.env` file at the project root:
```
MAPBOX_TOKEN=pk.eyJ...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_PLACES_KEY=AIza...
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJ...
```

### Run locally
```bash
npm run dev
```

Open `http://localhost:5173` in your browser.

> GPS tracking requires HTTPS in production. For local dev, Chrome allows `localhost` to use the Geolocation API without SSL.

---

## AI agent tool definitions

The Claude agent has access to the following tools:
```typescript
search_pois(type: string, location: LatLng, radius_km: number): POI[]
build_route(waypoints: LatLng[], target_km: number): RouteGeometry
get_current_conditions(location: LatLng): WeatherAndClosure
adjust_route(from: LatLng, remaining: LatLng[], constraints: string): RouteGeometry
estimate_finish(pace_per_km: number, remaining_km: number): string
```

The agent uses multi-turn tool calling. The backend streams the agent's reasoning and map updates to the frontend via Server-Sent Events so the map animates as the route is built.

---

## Project structure
```
paceroute/
├── src/
│   ├── agent/           # Claude tool definitions and agent loop
│   ├── components/      # React UI components
│   │   ├── Map.tsx      # Mapbox map, route rendering, live marker
│   │   ├── StatsBar.tsx # Pace, distance, time panel
│   │   ├── Chat.tsx     # Agent chat interface
│   │   └── RoutePlanner.tsx
│   ├── hooks/
│   │   ├── useGeolocation.ts  # GPS tracking hook
│   │   ├── usePace.ts         # Pace + split calculations
│   │   └── useWaypoints.ts    # Waypoint proximity detection
│   ├── lib/
│   │   ├── haversine.ts   # Distance between coordinates
│   │   ├── osrm.ts        # Route geometry requests
│   │   └── places.ts      # POI search
│   └── server/
│       ├── routes/
│       │   ├── agent.ts   # SSE endpoint for agent stream
│       │   └── runs.ts    # Save/load run history
│       └── index.ts
├── .env
├── package.json
└── README.md
```

---

## Roadmap

- [ ] Elevation profile on the route preview
- [ ] Heart rate zone integration (Web Bluetooth / Garmin Connect)
- [ ] Social: share routes and compare runs with friends
- [ ] Offline mode: cache route geometry for no-signal areas
- [ ] Apple Watch / Wear OS companion app
- [ ] Route templates: "best coffee loop in Edinburgh", "canal towpath 10k"
- [ ] Export to GPX / import into Garmin, Wahoo

---

## Privacy

Location data is used only for live tracking during an active run and is never sold or shared with third parties. Run history is stored in your personal Supabase instance. You can delete all data from the settings page at any time.

---

## Contributing

Pull requests are welcome. For large changes, open an issue first to discuss what you want to change. Please make sure all new agent tools have unit tests.

---

## License

MIT
