# PaceRoute

PaceRoute is an ASP.NET Core + React app for local outing planning.  
Current source includes:
- Manual map route building (frontend)
- AI route assistant in the map chat dock
- Collaborative multi-user planning rooms powered by a Roundtable negotiation engine
- AI route-planning endpoints (`/api/agent/*`) in backend

## Current behavior from source

### Authentication
- ASP.NET Core Identity API endpoints under `/api/auth/*`
- Bearer token stored in browser `localStorage`
- Auth-guarded routes: `/`, `/dashboard`, `/roundtable`, `/roundtable/:sessionId`

Password policy:
- Minimum length `8`
- No required digit/uppercase/lowercase/special character

### Manual map routing (active in UI)
- Browser geolocation watch with heading
- Fallback center: Edinburgh (`55.9533, -3.1883`)
- Day mode searches `cafe`, night mode searches `pub`
- POI source: Overpass API
- Overpass failover across multiple mirrors with in-memory cache fallback
- Search radius: `1500m`
- Display limit: `5` nearby POIs
- Route source: OSRM foot routing
- 2D/3D map toggle (MapLibre)
- Multi-segment colored route ribbon

### AI route assistant (active in UI)
- Chat dock submits prompts to `POST /api/agent/plan`
- Backend uses OpenAI + Google Places to return candidate places and route stops
- If the prompt specifies a target distance, the planner biases stop count and search radius toward meeting it
- If the prompt names a specific place or landmark, the planner treats it as a required destination and keeps it in the route
- Distance-based prompts without a named destination are routed as loops back toward the starting area
- Frontend auto-selects returned stops and shows remaining suggestions
- Route line rendering still uses OSRM segments on the frontend
- Assistant message includes plan summary, selected stops, and optional duration text

### Collaborative planning (active in UI + backend)
- Create or join planning room via invite token
- Each participant submits constraints (`name`, `budget`, `dietary`, `location`, `mood`, `time`)
- Chat starts when:
  - expected participants have submitted constraints, or
  - join deadline is reached
- Server streams negotiation events over SSE
- UI displays live phases/messages and final itinerary
- UI supports veto submission after a result is produced

Backend clamps:
- expected participants: `2..12`
- join timeout: `30..1800` seconds

### AI agent planning endpoints (backend)
- `/api/agent/plan`
- `/api/agent/plan/iterative`
- `/api/google/route`

Frontend currently uses `/api/agent/plan`.  
`/api/agent/plan/iterative` and `/api/google/route` remain available for extended flows.

## Tech stack

| Layer | Technology |
|---|---|
| Backend | ASP.NET Core 8 minimal API |
| Auth | ASP.NET Core Identity |
| Database | EF Core + SQLite |
| Frontend | React 18 + TypeScript + Tailwind CSS |
| Map rendering | MapLibre GL |
| Manual POIs | Overpass API |
| Manual routing | OSRM public API |
| Collaborative engine client | Roundtable SSE/HTTP client |
| AI planning | OpenAI Responses API + Google Places/Routes |

## Configuration

Backend settings load in this order:
1. `appsettings.json`
2. `appsettings.{Environment}.json`
3. `appsettings.Local.json` (optional, local-only, git-ignored)
4. Environment variables (highest priority)

| Variable | Purpose | Default |
|---|---|---|
| `OPENAI_API_KEY` | AI planner key | empty |
| `OPENAI_MODEL` | AI planner model | `gpt-5-mini` |
| `GOOGLE_MAPS_API_KEY` | Google Places/Routes key | empty |
| `ROUNDTABLE_BASE_URL` | Roundtable engine base URL | `http://localhost:8000` |

Frontend optional variable:

| Variable | Purpose | Default |
|---|---|---|
| `VITE_API_BASE_URL` | Base URL for auth calls | empty (same-origin) |

### Local API key setup (recommended)

Store secrets in local non-tracked files so you can run everything without exporting env vars each time.

Create `appsettings.Local.json` in repo root:

```json
{
  "OpenAI": {
    "ApiKey": "YOUR_OPENAI_API_KEY"
  },
  "GoogleMaps": {
    "ApiKey": "YOUR_GOOGLE_MAPS_API_KEY"
  }
}
```

Create `roundtable/.env`:

```dotenv
OPENAI_API_KEY=YOUR_OPENAI_API_KEY
GOOGLE_MAPS_API_KEY=YOUR_GOOGLE_MAPS_API_KEY
```

Both files are git-ignored.

If you use AI planning endpoints, your Google key must have:
- `Places API (New)`
- `Routes API`

Database files:
- Development (`ASPNETCORE_ENVIRONMENT=Development`): `luke-hacks.dev.db`
- Fallback/non-development: `luke-hacks.db`

## Local development

### Prerequisites
- .NET 8 SDK
- Node.js 18+

### 1) Run backend

```bash
dotnet restore
dotnet run
```

Backend dev URL: `http://localhost:5028`  
Swagger (development): `http://localhost:5028/swagger`

### 2) Run frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend dev URL: `http://localhost:5173`  
Vite proxy:
- `/api` -> `http://localhost:5028`
- `/roundtable` -> `http://localhost:8000`

### 3) Run Roundtable engine

Collaborative planning requires an engine listening at `ROUNDTABLE_BASE_URL` (default `http://localhost:8000`).

```bash
cd roundtable
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

## Backend API summary

### Auth
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me` (auth required)

### Collaborative planning (`Authorization: Bearer ...` required)
- `POST /api/collaborative-planning/chats`
- `POST /api/collaborative-planning/chats/join/{inviteToken}`
- `POST /api/collaborative-planning/chats/{chatId}/constraints`
- `GET /api/collaborative-planning/chats/{chatId}`
- `POST /api/collaborative-planning/chats/{chatId}/veto`
- `GET /api/collaborative-planning/chats/{chatId}/stream?afterEventId=<id>` (SSE)

### AI planning
- `POST /api/agent/plan`
- `POST /api/agent/plan/iterative`
- `POST /api/google/route`

## Notes

- CORS allows local frontend origins on port `5173`.
- Data protection keys persist in `.keys/`.
- SQLite DB is created automatically at startup (`EnsureCreated`).
- In non-development environments, HTTPS redirection is enabled.
- Dashboard page currently shows mock route/place cards.

## Project structure

```text
luke-hacks/
├── Program.cs
├── Configuration/
├── Data/
├── Models/
├── Services/
├── Properties/
├── frontend/
└── README.md
```
