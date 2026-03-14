# PaceRoute

PaceRoute is a location-aware route planner with account login, a live map, and two route-building modes:
- Manual day/night route building from nearby cafes or pubs
- A ChatGPT planner that turns prompts like `cafes within 5km` or `historic monuments nearby` into Google Maps place searches and a starter walking route

The app uses browser geolocation for the user origin, MapLibre for rendering, ASP.NET Core Identity + SQLite for account storage, and a backend OpenAI + Google Maps integration for AI route planning.

## Features

### Auth and persistence
- Email/password signup and login via ASP.NET Core Identity
- Local SQLite database created automatically in development
- Protected app routes for the map and dashboard

### ChatGPT planner
- Prompt box in the dock for natural-language local discovery requests
- OpenAI Responses API converts the prompt into a structured nearby-search plan
- Google Places API (New) finds nearby places like cafes, monuments, parks, and museums
- Google Routes API builds a starter walking route through selected stops
- Google Maps deep links are exposed from place popups

### Manual route builder
- Suggests the 5 closest cafes in day mode or pubs in night mode
- Add and remove stops directly from the dock or map
- Route updates live as stops change
- Suggestions can keep moving outward from the latest selected waypoint

### Map experience
- Live user location and heading when available
- Hover cards and click popups for places
- Day/night mode toggle
- Dashboard route view at `/dashboard`

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Tailwind CSS 3 |
| Bundler | Vite 6 |
| Map rendering | MapLibre GL JS |
| Auth | ASP.NET Core Identity |
| Database | SQLite + EF Core |
| AI planner | OpenAI Responses API |
| Places search | Google Places API (New) |
| Routing | Google Routes API + OSRM |
| Manual POI source | Overpass API |
| Backend | ASP.NET Core 8 minimal API |

## Project structure

```text
luke-hacks/
├── Program.cs
├── Data/
│   └── AppDbContext.cs
├── Models/
│   ├── ApplicationUser.cs
│   ├── CurrentUserResponse.cs
│   └── DiscoveryModels.cs
├── Configuration/
│   ├── GoogleMapsOptions.cs
│   └── OpenAiOptions.cs
├── Services/
│   ├── GoogleMapsService.cs
│   └── OpenAiPlanningService.cs
├── Properties/
│   └── launchSettings.json
├── frontend/
│   └── src/
│       ├── auth/
│       ├── components/
│       ├── hooks/
│       ├── lib/
│       ├── pages/
│       └── types/
└── README.md
```

## Required keys

You need:
- `OPENAI_API_KEY`
- `GOOGLE_MAPS_API_KEY`

Your Google Maps Platform key must have these APIs enabled:
- `Places API (New)`
- `Routes API`

You do not need:
- `Maps JavaScript API`
- `Directions API`
- any separate GPS key

GPS/location comes from the browser Geolocation API. On a laptop, make sure browser location permission and OS location services are enabled if you want the route to start from your actual current location.

## Local setup

### Prerequisites
- Node.js 18+
- .NET 8 SDK

### Configure environment variables

```bash
export OPENAI_API_KEY=your_openai_api_key
export OPENAI_MODEL=gpt-5-mini
export GOOGLE_MAPS_API_KEY=your_google_maps_api_key
```

You can also place the same values in `appsettings.Development.json`.

### Run the backend

```bash
dotnet run
```

The local backend uses `http://localhost:5028` for development.

### Run the frontend

```bash
cd frontend
npm install
npm run dev
```

The Vite dev server proxies `/api/*` to the ASP.NET backend.

### Use the app

1. Open `http://localhost:5173`
2. Register or sign in
3. Allow location access in the browser
4. Enter a prompt like `cafes within 5km` or `historic monuments nearby`
5. Review the AI-generated route on the map

If location is unavailable, the app falls back to Edinburgh.

## API summary

| Endpoint | Purpose |
|---|---|
| `POST /api/auth/register` | Create an account |
| `POST /api/auth/login` | Sign in |
| `GET /api/auth/me` | Get the authenticated user |
| `POST /api/agent/plan` | Turn a prompt + location into a local discovery plan |
| `POST /api/google/route` | Build a walking route from selected stops |

## Notes

- The manual day/night route builder still works without OpenAI or Google Maps keys.
- The ChatGPT planner requires both OpenAI and Google Maps keys.
- In production, geolocation generally requires HTTPS.

## License

MIT
