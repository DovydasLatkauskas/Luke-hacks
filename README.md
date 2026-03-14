# PaceRoute

**Location-aware route planner with two modes:**
- **Iterative builder** for quick day/night routes from nearby cafes or pubs
- **ChatGPT planner** for prompts like `cafes within 5km` or `historic monuments nearby`

The app uses the browser Geolocation API to anchor searches around the user, shows matched places on the map, and can stitch the closest results into a starter route.

---

## Features

### ChatGPT planner
- Natural-language prompt box in the dock
- Sends the prompt plus current coordinates to an OpenAI planner endpoint
- ChatGPT converts the request into a structured Google Maps search
- Google Places Text Search returns nearby results for categories like cafes, monuments, parks, museums, and similar local activities
- Google Routes builds a starter walking route through the closest suggested stops
- Google Maps deep links are available from the place popup

### Iterative manual builder
- Suggests the **5 closest** cafes (day) or pubs (night)
- Tap a suggestion in the sidebar or on the map to add it to your route
- Route geometry updates live
- After each selection, the next 5 suggestions load from the latest waypoint
- Unselected suggestions stay visible and tappable
- Remove stops by tapping them in the route summary bar

### Map experience
- User position shown as a directional arrow
- Hover cards and click popups for places
- Route line drawn directly on the map
- Day/night theme toggle
- Dashboard route view at `/dashboard`

### Geolocation
- Uses `watchPosition` for live location updates
- Falls back to Edinburgh city centre when location is unavailable
- ChatGPT and manual search both use the same live-or-fallback origin

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Tailwind CSS 3 |
| Bundler | Vite 6 |
| Map rendering | MapLibre GL JS 4.7 |
| AI planner | OpenAI Responses API |
| Google search | Google Places API Text Search (New) |
| Google routing | Google Routes API |
| Manual POI data | Overpass API (OpenStreetMap) |
| Manual route geometry | OSRM public API |
| Backend | ASP.NET Core 8 minimal API |

---

## How it works

### ChatGPT planner flow
```text
User prompt + current location
  -> ASP.NET backend
  -> ChatGPT converts prompt into:
     - Google Maps query
     - radius
     - result count
     - starter route stop count
  -> Google Places returns nearby matches
  -> Google Routes computes a starter walking route
  -> Frontend renders places, summary, and route
```

### Manual builder flow
```text
App loads -> geolocation watches user position
         -> Overpass fetches nearby cafes or pubs
         -> user selects places
         -> OSRM draws the route
         -> query center moves to the last selected waypoint
```

---

## Project structure
```text
luke-hacks/
├── Program.cs
├── Configuration/
│   ├── OpenAiOptions.cs
│   └── GoogleMapsOptions.cs
├── Models/
│   └── DiscoveryModels.cs
├── Services/
│   ├── OpenAiPlanningService.cs
│   └── GoogleMapsService.cs
├── Properties/
│   └── launchSettings.json
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── ChatDock.tsx
│   │   │   └── MapView.tsx
│   │   ├── hooks/
│   │   │   ├── useNearbyPOIs.ts
│   │   │   └── useUserLocation.ts
│   │   ├── lib/
│   │   │   ├── agent.ts
│   │   │   └── osrm.ts
│   │   └── types/
│   │       ├── agent.ts
│   │       └── map.ts
│   └── vite.config.ts
└── README.md
```

---

## Getting started

### Prerequisites
- Node.js 18+
- .NET 8 SDK
- An OpenAI API key
- A Google Maps API key with **Places API (New)** and **Routes API** enabled

### Install
```bash
cd frontend
npm install
```

### Configure keys

Environment variables are the easiest option:

```bash
export OPENAI_API_KEY=your_openai_api_key
export OPENAI_MODEL=gpt-5-mini
export GOOGLE_MAPS_API_KEY=your_google_maps_key
```

You can also set the same values in `appsettings.Development.json`.

### Run the backend
```bash
dotnet run
```

The backend uses `http://localhost:5028` in local development.

### Run the frontend
```bash
cd frontend
npm run dev
```

Vite proxies `/api/*` requests to the backend on `http://localhost:5028`.

Open `http://localhost:5173`.

### Notes
- If location access is denied, the app falls back to Edinburgh.
- The manual day/night builder still works without API keys.
- The ChatGPT planner requires both OpenAI and Google Maps keys.
- GPS comes from the browser Geolocation API, so there is no separate GPS key to provide.
- On macOS, make sure Location Services are enabled for your browser if you want the route to start from your actual laptop location.

---

## External APIs used

| API | Purpose | Auth required |
|---|---|---|
| OpenAI Responses API | Convert natural-language prompts into structured local plans | Yes |
| Google Places API Text Search (New) | Find nearby places from the ChatGPT-generated query | Yes |
| Google Routes API | Build starter walking routes for ChatGPT plans | Yes |
| Overpass API | Manual nearby cafe/pub search | No |
| OSRM | Manual route geometry | No |
| OpenStreetMap tiles | Basemap | No |
| MapLibre demo glyphs | Map label glyphs | No |

---

## Roadmap

- [x] ChatGPT planner for prompts like `cafes within 5km`
- [ ] Persist routes to Supabase
- [ ] Elevation profile on route preview
- [ ] Export to GPX
- [ ] Social sharing
- [ ] Heart rate zone integration
- [ ] Offline route cache
- [ ] Auto day/night switching based on local time

---

## License

MIT
