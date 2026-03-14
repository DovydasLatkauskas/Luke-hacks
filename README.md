# Luke-hacks

# PaceRoute

**AI-powered, day/night-aware route builder with real-time tracking and pace analytics.**

Plan a running or night-out route around cafes, pubs, monuments, or any landmark type. An AI agent keeps suggesting new waypoints that you can selectively add, so you iteratively build the route together — with distinct **Day (dark mode)** and **Night (night mode)** themes that match the activity and time.

---

## Features

### Route planning
- Start with a loose goal (e.g. "easy 5k coffee loop" or "Friday night bar hop")
- Choose landmark categories — cafes, pubs, parks, monuments, bookshops, viewpoints, and more
- AI agent proposes candidate waypoints (POIs) one batch at a time
- You accept or reject suggestions to iteratively build up the route geometry
- Route updates live on the map as you add waypoints
- Keep querying the agent mid-planning (e.g. "add one more park", "avoid big hills", "stay near the river")

### Day & night modes
- Day **dark mode** for runs, walks, and daytime exploration
- Night **night mode** tuned for low-light viewing on evenings out
- Mode influences suggested POI types (e.g. more bars at night, more parks/cafes by day)
- Theme can auto-switch based on local time or be manually toggled

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

### 1. Iterative route generation
```
User: mode = "Day", intent = "easy 5k with 2 coffee stops"
         ↓
AI agent calls: search_pois(types=["cafe", "park"], location=userLocation, radius_km=4)
         ↓
Agent scores POIs by rating, detour cost, clustering, and time-of-day
         ↓
Frontend shows suggested waypoints in a list + on the map
         ↓
User picks a subset of waypoints to add to the route
         ↓
Agent calls: build_route(waypoints=[selected...], soft_target_km≈5)
         ↓
Map updates with new geometry
         ↓
User can keep querying ("add one more cafe", "avoid this hill") to get more candidates
         ↓
Loop continues until the user is happy with the route
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
cd frontend
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
cd frontend
npm run dev
```

Open `http://localhost:5173` in your browser.

> GPS tracking requires HTTPS in production. For local dev, Chrome allows `localhost` to use the Geolocation API without SSL.

---

## AI agent tool definitions

The Claude agent has access to the following tools:
```typescript
search_pois(types: string[], location: LatLng, radius_km: number, time_of_day: 'day' | 'night'): POI[]
build_route(waypoints: LatLng[], soft_target_km?: number): RouteGeometry
get_current_conditions(location: LatLng): WeatherAndClosure
adjust_route(from: LatLng, remaining: LatLng[], constraints: string): RouteGeometry
estimate_finish(pace_per_km: number, remaining_km: number): string
```

The agent uses multi-turn tool calling. The backend streams the agent's reasoning and map updates to the frontend via Server-Sent Events so the map animates as the route is built.

---

## Project structure
```
Luke-hacks/
├── frontend/                # React + Tailwind SPA (PaceRoute UI)
│   ├── index.html
│   ├── src/
│   │   ├── App.tsx          # Day/night modes, layout shell
│   │   ├── main.tsx
│   │   └── index.css        # Tailwind entry + global styles
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── tsconfig*.json
│   └── package.json
├── backend/                 # (planned) Node/Express, agent, routing
│   └── ...                  # OSRM, POI search, SSE endpoints
├── .env
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
