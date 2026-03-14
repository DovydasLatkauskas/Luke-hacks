# PaceRoute

PaceRoute is a full-stack local route planner:
- ASP.NET Core 8 minimal API backend with Identity + SQLite
- React + TypeScript + MapLibre frontend
- Manual routing mode (nearby cafes/pubs + OSRM)
- AI planning mode (OpenAI Responses API + Google Places + Google Routes)

## Current capabilities

### Authentication
- Register/login via ASP.NET Core Identity API endpoints (`/api/auth/*`)
- Bearer token session stored in browser `localStorage`
- Protected frontend routes:
  - `/` map page
  - `/dashboard` dashboard page

Password rules from backend config:
- Minimum length `8`
- No required digit, uppercase, lowercase, or special character

### Map and routing
- Live geolocation watch with heading (when available)
- Fallback location if geolocation is unavailable: `55.9533, -3.1883` (Edinburgh)
- Day mode pulls nearby `cafe` POIs from Overpass
- Night mode pulls nearby `pub` POIs from Overpass
- Manual routing uses OSRM foot routing in the browser
- Route updates when stops are added/removed

### AI planner
- Prompt sent to `POST /api/agent/plan`
- Backend asks OpenAI Responses API for a structured local intent
- Backend searches Google Places Text Search and filters by distance
- Backend computes a walking route using Google Routes API
- Frontend shows returned places, route summary, and Google Maps deep links

### Dashboard
- `/dashboard` exists and is authenticated
- Route/place cards are currently static mock data

## Tech stack

| Layer | Technology |
|---|---|
| Backend | ASP.NET Core 8 minimal API |
| Auth | ASP.NET Core Identity API endpoints |
| Database | EF Core + SQLite |
| Frontend | React 18 + TypeScript + Tailwind CSS |
| Map | MapLibre GL |
| Manual POI source | Overpass API |
| Manual route source | OSRM public API |
| AI planner | OpenAI Responses API |
| AI place search | Google Places API (New) |
| AI route | Google Routes API |

## Configuration

Backend options come from `appsettings*.json` and can be overridden by environment variables:

| Variable | Purpose | Default |
|---|---|---|
| `OPENAI_API_KEY` | OpenAI API key for planner | empty |
| `OPENAI_MODEL` | OpenAI model used by planner | `gpt-5-mini` |
| `GOOGLE_MAPS_API_KEY` | Google key for Places + Routes | empty |

Frontend optional variable:

| Variable | Purpose | Default |
|---|---|---|
| `VITE_API_BASE_URL` | Base URL for auth requests | empty (same-origin) |

Google key requirements:
- Enable `Places API (New)`
- Enable `Routes API`

## Local development

### Prerequisites
- .NET 8 SDK
- Node.js 18+

### 1) Start backend

```bash
dotnet restore
dotnet run
```

Default development URL from launch profile:
- `http://localhost:5028`

Swagger UI is enabled in development at:
- `http://localhost:5028/swagger`

The app creates the SQLite database automatically on startup (`EnsureCreated`).

### 2) Start frontend

```bash
cd frontend
npm install
npm run dev
```

Vite dev server:
- `http://localhost:5173`
- Proxies `/api/*` to `http://localhost:5028`

### 3) Use the app

1. Open `http://localhost:5173`
2. Register an account or sign in
3. Allow browser location permission
4. Build a manual route or submit an AI prompt

## API endpoints used by the frontend

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/auth/register` | `POST` | Create account |
| `/api/auth/login` | `POST` | Return bearer tokens |
| `/api/auth/me` | `GET` | Return current user (auth required) |
| `/api/agent/plan` | `POST` | Prompt + location -> planned places + optional route |
| `/api/google/route` | `POST` | Compute route from origin + waypoints |

## Notes

- Manual mode works without OpenAI/Google keys.
- AI mode requires both `OPENAI_API_KEY` and `GOOGLE_MAPS_API_KEY`.
- CORS currently allows local frontend origins on port `5173`.
- Dockerfile builds and runs the backend service only.

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
