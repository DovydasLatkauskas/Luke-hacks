# Frontend

React + TypeScript + Tailwind frontend for PaceRoute.

## Run

```bash
cd frontend
npm install
npm run dev
```

Vite dev server runs on `http://localhost:5173` and proxies `/api/*` to `http://localhost:5028`.

Start backend from repo root:

```bash
dotnet run
```

## Environment

Optional:
- `VITE_API_BASE_URL`: used by auth calls (`/api/auth/*`) in `AuthProvider`.

Notes:
- Planner and route client calls in `src/lib/agent.ts` use same-origin `/api/...`.
- If you configure `VITE_API_BASE_URL`, keep proxy/backend routing aligned for non-auth API calls.
