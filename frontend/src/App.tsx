import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth/AuthProvider'
import { ChatDock } from './components/ChatDock'
import { MapView } from './components/MapView'
import { useNearbyPOIs } from './hooks/useNearbyPOIs'
import { useUserLocation } from './hooks/useUserLocation'
import { planWithOpenAiAgent, fetchGoogleRoute } from './lib/agent'
import { fetchRoute, type RouteGeometry } from './lib/osrm'
import { AuthPage } from './pages/AuthPage'
import { Dashboard } from './pages/Dashboard'
import type { AgentPlan, PlannedRoute } from './types/agent'
import type { LngLat, POI } from './types/map'

export type Mode = 'day' | 'night'

type RouteProvider = 'osrm' | 'google'

type RouteMeta = Pick<PlannedRoute, 'distanceMeters' | 'durationText'>

const FALLBACK: LngLat = { lng: -3.1883, lat: 55.9533 }

function MapLayout({
  mode,
  toggleMode,
  userLabel,
  onLogout,
}: {
  mode: Mode
  toggleMode: () => void
  userLabel: string
  onLogout: () => void
}) {
  const { loc, heading } = useUserLocation()
  const center = loc ?? FALLBACK

  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [allSelectedPois, setAllSelectedPois] = useState<POI[]>([])
  const [routeGeometry, setRouteGeometry] = useState<RouteGeometry | null>(null)
  const [routeMeta, setRouteMeta] = useState<RouteMeta | null>(null)
  const [activePoi, setActivePoi] = useState<POI | null>(null)
  const [routeProvider, setRouteProvider] = useState<RouteProvider>('osrm')
  const [agentPlan, setAgentPlan] = useState<AgentPlan | null>(null)
  const [plannerLoading, setPlannerLoading] = useState(false)
  const [plannerError, setPlannerError] = useState<string | null>(null)

  const routeAbortRef = useRef<AbortController | null>(null)
  const plannerAbortRef = useRef<AbortController | null>(null)

  const excludeIds = useMemo(() => new Set(selectedIds), [selectedIds])
  const isAgentPlanActive = agentPlan !== null

  const lastSelectedPoi = !isAgentPlanActive && allSelectedPois.length > 0
    ? allSelectedPois[allSelectedPois.length - 1]
    : null
  const queryCenter: LngLat | null = lastSelectedPoi
    ? { lng: lastSelectedPoi.lng, lat: lastSelectedPoi.lat }
    : center

  const { pois: suggestedPois, loading: poisLoading } = useNearbyPOIs(
    isAgentPlanActive ? null : queryCenter,
    mode,
    excludeIds,
  )

  const displayPois = agentPlan?.places ?? suggestedPois
  const routeOrigin = center

  const clearSelections = useCallback(() => {
    setSelectedIds([])
    setAllSelectedPois([])
    setRouteGeometry(null)
    setRouteMeta(null)
    setActivePoi(null)
  }, [])

  const clearAgentPlan = useCallback(() => {
    plannerAbortRef.current?.abort()
    setAgentPlan(null)
    setPlannerError(null)
    setPlannerLoading(false)
    setRouteProvider('osrm')
    clearSelections()
  }, [clearSelections])

  useEffect(() => {
    routeAbortRef.current?.abort()
    plannerAbortRef.current?.abort()
    setRouteProvider('osrm')
    setAgentPlan(null)
    setPlannerError(null)
    setPlannerLoading(false)
    clearSelections()
  }, [mode, clearSelections])

  useEffect(() => {
    routeAbortRef.current?.abort()

    if (allSelectedPois.length === 0) {
      setRouteGeometry(null)
      setRouteMeta(null)
      return
    }

    const ctrl = new AbortController()
    routeAbortRef.current = ctrl

    if (routeProvider === 'google') {
      fetchGoogleRoute(
        {
          origin: routeOrigin,
          waypoints: allSelectedPois.map((poi) => ({
            id: poi.id,
            name: poi.name,
            lat: poi.lat,
            lng: poi.lng,
          })),
        },
        ctrl.signal,
      ).then((route) => {
        if (ctrl.signal.aborted) return
        setRouteGeometry(route?.geometry ?? null)
        setRouteMeta(route ? { distanceMeters: route.distanceMeters, durationText: route.durationText } : null)
      }).catch((err: unknown) => {
        if (ctrl.signal.aborted) return
        console.error('[Google Route]', err)
        setRouteGeometry(null)
        setRouteMeta(null)
      })

      return () => ctrl.abort()
    }

    const waypoints: LngLat[] = [
      routeOrigin,
      ...allSelectedPois.map((p) => ({ lng: p.lng, lat: p.lat })),
    ]

    fetchRoute(waypoints, ctrl.signal).then((geo) => {
      if (!ctrl.signal.aborted) {
        setRouteGeometry(geo)
        setRouteMeta(null)
      }
    })

    return () => ctrl.abort()
  }, [allSelectedPois, routeOrigin, routeProvider])

  const handleSelectWaypoint = useCallback(
    (poiId: string) => {
      const candidatePois = agentPlan?.places ?? suggestedPois

      if (selectedIds.includes(poiId)) {
        setSelectedIds((prev) => prev.filter((id) => id !== poiId))
        setAllSelectedPois((prev) => prev.filter((p) => p.id !== poiId))
      } else {
        const poi = candidatePois.find((p) => p.id === poiId)
        if (!poi) return
        setSelectedIds((prev) => [...prev, poiId])
        setAllSelectedPois((prev) => [...prev, poi])
      }

      setRouteProvider(agentPlan ? 'google' : 'osrm')
      setActivePoi(null)
    },
    [agentPlan, selectedIds, suggestedPois],
  )

  const handlePoiTap = useCallback(
    (poiId: string) => {
      const poi = displayPois.find((p) => p.id === poiId)
        ?? allSelectedPois.find((p) => p.id === poiId)
      setActivePoi((prev) => (prev?.id === poiId ? null : poi ?? null))
    },
    [displayPois, allSelectedPois],
  )

  const handleClosePopup = useCallback(() => setActivePoi(null), [])

  const handlePlannerSubmit = useCallback(async (prompt: string) => {
    plannerAbortRef.current?.abort()
    const ctrl = new AbortController()
    plannerAbortRef.current = ctrl

    setPlannerLoading(true)
    setPlannerError(null)

    try {
      const plan = await planWithOpenAiAgent(
        {
          prompt,
          currentLocation: center,
        },
        ctrl.signal,
      )

      if (ctrl.signal.aborted) return

      const routeStops = plan.routeStopIds
        .map((id) => plan.places.find((poi) => poi.id === id) ?? null)
        .filter((poi): poi is POI => poi !== null)

      setAgentPlan(plan)
      setRouteProvider('google')
      setSelectedIds(routeStops.map((poi) => poi.id))
      setAllSelectedPois(routeStops)
      setRouteGeometry(plan.route?.geometry ?? null)
      setRouteMeta(plan.route ? { distanceMeters: plan.route.distanceMeters, durationText: plan.route.durationText } : null)
      setActivePoi(null)
    } catch (err) {
      if (ctrl.signal.aborted) return
      setPlannerError(err instanceof Error ? err.message : 'Unable to build a plan right now.')
    } finally {
      if (!ctrl.signal.aborted) {
        setPlannerLoading(false)
      }
    }
  }, [center])

  return (
    <div
      className={
        'h-dvh w-screen overflow-hidden transition-colors duration-300 ' +
        (mode === 'day' ? 'bg-slate-50 text-slate-900' : 'bg-slate-950 text-slate-100')
      }
    >
      <div className="relative h-full w-full">
        <MapView
          mode={mode}
          center={center}
          heading={heading}
          hasUserLocation={!!loc}
          suggestedPois={displayPois}
          allSelectedPois={allSelectedPois}
          selectedIds={selectedIds}
          routeGeometry={routeGeometry}
          activePoi={activePoi}
          onPoiTap={handlePoiTap}
          onSelectWaypoint={handleSelectWaypoint}
          onClosePopup={handleClosePopup}
        />
        <ChatDock
          mode={mode}
          pois={displayPois}
          allSelectedPois={allSelectedPois}
          selectedIds={selectedIds}
          poisLoading={poisLoading}
          plannerLoading={plannerLoading}
          plannerError={plannerError}
          agentPlan={agentPlan}
          routeMeta={routeMeta}
          isAgentPlanActive={isAgentPlanActive}
          onSelectWaypoint={handleSelectWaypoint}
          onPlannerSubmit={handlePlannerSubmit}
          onClearPlanner={clearAgentPlan}
        />

        <button
          type="button"
          onClick={toggleMode}
          className="glass absolute right-4 top-4 z-20 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-slate-950/40 text-xs text-slate-100 shadow-[0_12px_40px_rgba(0,0,0,0.45)] ring-1 ring-white/10"
          aria-label="Toggle day/night mode"
        >
          {mode === 'day' ? '☾' : '☼'}
        </button>
        <div className="glass absolute right-16 top-4 z-20 flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/45 px-3 py-1.5 text-xs text-slate-100 shadow-[0_12px_40px_rgba(0,0,0,0.45)] ring-1 ring-white/10">
          <span className="max-w-[14rem] truncate opacity-80">{userLabel}</span>
          <Link
            to="/dashboard"
            className="rounded-lg bg-emerald-400/25 px-2 py-1 font-semibold text-emerald-100 transition hover:bg-emerald-400/40"
          >
            Dashboard
          </Link>
          <button
            type="button"
            onClick={onLogout}
            className="rounded-lg bg-white/10 px-2 py-1 font-semibold transition hover:bg-white/20"
          >
            Log out
          </button>
        </div>
      </div>
    </div>
  )
}

function FullScreenLoader() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-slate-950 text-sm text-slate-200">
      Loading account...
    </div>
  )
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth()
  if (status === 'loading') return <FullScreenLoader />
  if (status === 'anonymous') return <Navigate to="/auth" replace />
  return <>{children}</>
}

function AnonymousOnly({ children }: { children: ReactNode }) {
  const { status } = useAuth()
  if (status === 'loading') return <FullScreenLoader />
  if (status === 'authenticated') return <Navigate to="/" replace />
  return <>{children}</>
}

export default function App() {
  const { user, logout } = useAuth()
  const [mode, setMode] = useState<Mode>('day')
  const toggleMode = () => setMode((prev) => (prev === 'day' ? 'night' : 'day'))
  const userLabel = user?.email ?? user?.userName ?? 'Account'

  return (
    <Routes>
      <Route
        path="/auth"
        element={(
          <AnonymousOnly>
            <AuthPage mode={mode} onToggleMode={toggleMode} />
          </AnonymousOnly>
        )}
      />
      <Route
        path="/"
        element={(
          <RequireAuth>
            <MapLayout mode={mode} toggleMode={toggleMode} userLabel={userLabel} onLogout={logout} />
          </RequireAuth>
        )}
      />
      <Route
        path="/dashboard"
        element={(
          <RequireAuth>
            <Dashboard
              mode={mode}
              onToggleMode={toggleMode}
              userLabel={userLabel}
              onLogout={logout}
            />
          </RequireAuth>
        )}
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
