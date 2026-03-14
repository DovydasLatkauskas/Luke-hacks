# Frontend

React + TypeScript + Tailwind frontend for PaceRoute.

## Run

```bash
cd frontend
npm install
npm run dev
```

Vite dev server runs on `http://localhost:5173` and proxies `/api/*` to `http://localhost:5028`.
It also proxies `/roundtable/*` to `http://localhost:8000`.

Start backend from repo root:

```bash
dotnet run
```

Collaborative planning also requires the Roundtable engine running at `http://localhost:8000` by default.

## Environment

Optional:
- `VITE_API_BASE_URL`: used by auth calls (`/api/auth/*`) in `AuthProvider`.

Notes:
- Manual map routing currently uses Overpass + OSRM client-side.
- Collaborative planning UI uses `/api/collaborative-planning/*`.
- `src/lib/agent.ts` still contains legacy `/api/agent/*` and `/api/google/route` clients.
- If you set `VITE_API_BASE_URL`, auth calls use that base, while most other frontend API calls still use same-origin paths.
