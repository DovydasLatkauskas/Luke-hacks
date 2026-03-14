import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './auth/AuthProvider'
import { ChatDock } from './components/ChatDock'
import { MapView } from './components/MapView'
import { RouteRibbon } from './components/RouteRibbon'
import { createActivity } from './lib/profile'
import { useNearbyPOIs } from './hooks/useNearbyPOIs'
import { useUserLocation } from './hooks/useUserLocation'
import { fetchRouteSegments, type RouteSegment } from './lib/osrm'
import { AuthPage } from './pages/AuthPage'
import { Dashboard } from './pages/Dashboard'
import { Profile } from './pages/Profile'
import type { PlannedRoute } from './types/agent'
import NegotiationRoom from './pages/NegotiationRoom'
import RoundTableLobby from './pages/RoundTableLobby'
import type { LngLat, POI } from './types/map'

export type Mode = 'day' | 'night'
type MapDimension = '2d' | '3d'

const FALLBACK: LngLat = { lng: -3.1883, lat: 55.9533 }

function MapLayout({
  mode,
  toggleMode,
  mapMode,
  toggleMapMode,
}: {
  mode: Mode
  toggleMode: () => void
  mapMode: MapDimension
  toggleMapMode: () => void
}) {
  const { loc, heading } = useUserLocation()
  const location = useLocation()
  const center = loc ?? FALLBACK

  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [allSelectedPois, setAllSelectedPois] = useState<POI[]>([])
  const [routeSegments, setRouteSegments] = useState<RouteSegment[]>([])
  const [activePoi, setActivePoi] = useState<POI | null>(null)
  const [ignoredIds, setIgnoredIds] = useState<string[]>([])
  const [aiSuggestedPois, setAiSuggestedPois] = useState<POI[]>([])
  const [aiSessionActive, setAiSessionActive] = useState(false)
  const [mapPickedAiPoi, setMapPickedAiPoi] = useState<POI | null>(null)
  const [flyToTarget, setFlyToTarget] = useState<LngLat | null>(null)
  const [trackingActive, setTrackingActive] = useState(false)
  const [trackingIndex, setTrackingIndex] = useState(-1)
  const [trackingStartedAt, setTrackingStartedAt] = useState<number | null>(null)
  const [savingActivity, setSavingActivity] = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [lastLegSeconds, setLastLegSeconds] = useState<number | null>(null)
  const lastCheckpointRef = useRef<number | null>(null)
  const timerRef = useRef<number | null>(null)

  const routeAbortRef = useRef<AbortController | null>(null)

  const excludeIds = useMemo(
    () => new Set([...selectedIds, ...ignoredIds]),
    [selectedIds, ignoredIds],
  )

  const lastSelectedPoi = allSelectedPois.length > 0
    ? allSelectedPois[allSelectedPois.length - 1]
    : null

  const queryCenter: LngLat | null = lastSelectedPoi
    ? { lng: lastSelectedPoi.lng, lat: lastSelectedPoi.lat }
    : center

  const { pois: manualSuggestedPois } = useNearbyPOIs(queryCenter, mode, excludeIds)
  const suggestedPois = aiSessionActive ? aiSuggestedPois : manualSuggestedPois

  const routeDistanceMeters = useMemo(() => {
    let total = 0
    for (const seg of routeSegments) {
      const coords = seg.geometry?.coordinates as [number, number][] | undefined
      if (!coords || coords.length < 2) continue
      for (let i = 1; i < coords.length; i++) {
        const [lng1, lat1] = coords[i - 1]
        const [lng2, lat2] = coords[i]
        const R = 6_371_000
        const toRad = (d: number) => (d * Math.PI) / 180
        const dLat = toRad(lat2 - lat1)
        const dLng = toRad(lng2 - lng1)
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
        total += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
      }
    }
    return total
  }, [routeSegments])

  const clearSelections = useCallback(() => {
    setSelectedIds([])
    setAllSelectedPois([])
    setRouteSegments([])
    setActivePoi(null)
    setIgnoredIds([])
    setAiSuggestedPois([])
    setAiSessionActive(false)
    setTrackingActive(false)
    setTrackingIndex(-1)
    setTrackingStartedAt(null)
    setElapsedSeconds(0)
    setLastLegSeconds(null)
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  useEffect(() => {
    const state = location.state as unknown as { rerunRoute?: { pois: { id: string; name: string; lat: number; lng: number }[] } } | null
    if (state?.rerunRoute?.pois && state.rerunRoute.pois.length > 0) {
      const pois = state.rerunRoute.pois.map((p) => ({
        id: p.id,
        name: p.name,
        lat: p.lat,
        lng: p.lng,
        distance: 0,
        source: 'google' as const,
      }))
      setAllSelectedPois(pois)
      setSelectedIds(pois.map((p) => p.id))
      setIgnoredIds([])
      setActivePoi(null)
      setAiSuggestedPois([])
      setAiSessionActive(false)
      if (pois.length > 0) {
        setFlyToTarget({ lng: pois[0].lng, lat: pois[0].lat })
      }
      window.history.replaceState(null, '', '/')
    }
  }, [location.state])

  useEffect(() => {
    routeAbortRef.current?.abort()

    if (!loc || allSelectedPois.length === 0) {
      setRouteSegments([])
      return
    }

    const ctrl = new AbortController()
    routeAbortRef.current = ctrl

    const waypoints: LngLat[] = [
      center,
      ...allSelectedPois.map((p) => ({ lng: p.lng, lat: p.lat })),
    ]

    fetchRouteSegments(waypoints, ctrl.signal).then((segs) => {
      if (!ctrl.signal.aborted) setRouteSegments(segs)
    }).catch((err) => {
      if (!ctrl.signal.aborted) {
        console.error('[OSRM]', err)
        setRouteSegments([])
      }
    })

    return () => ctrl.abort()
  }, [center, loc, allSelectedPois])

  const handleSelectWaypoint = useCallback(
    (poiId: string) => {
      if (aiSessionActive) {
        const aiPoi = aiSuggestedPois.find((p) => p.id === poiId)
        if (aiPoi) {
          setMapPickedAiPoi(aiPoi)
          setActivePoi(null)
          return
        }
      }

      if (selectedIds.includes(poiId)) {
        setSelectedIds((prev) => prev.filter((id) => id !== poiId))
        setAllSelectedPois((prev) => prev.filter((p) => p.id !== poiId))
      } else {
        const poi = suggestedPois.find((p) => p.id === poiId)
        if (!poi) return
        setSelectedIds((prev) => [...prev, poiId])
        setAllSelectedPois((prev) => [...prev, poi])
      }

      setActivePoi(null)
    },
    [selectedIds, suggestedPois, aiSessionActive, aiSuggestedPois],
  )

  const handleIgnoreWaypoint = useCallback(
    (poiId: string) => {
      setIgnoredIds((prev) => (prev.includes(poiId) ? prev : [...prev, poiId]))
      setActivePoi((prev) => (prev?.id === poiId ? null : prev))
    },
    [],
  )

  const handlePoiTap = useCallback(
    (poiId: string) => {
      const poi = suggestedPois.find((p) => p.id === poiId)
        ?? allSelectedPois.find((p) => p.id === poiId)
      setActivePoi((prev) => (prev?.id === poiId ? null : poi ?? null))
    },
    [suggestedPois, allSelectedPois],
  )

  const handleClosePopup = useCallback(() => setActivePoi(null), [])

  const handleRouteReady = useCallback(
    (pois: POI[], route: PlannedRoute) => {
      setAllSelectedPois(pois)
      setSelectedIds(pois.map((p) => p.id))
      setIgnoredIds([])
      setActivePoi(null)
      setAiSuggestedPois([])
      setAiSessionActive(false)
      setTrackingActive(false)
      setTrackingIndex(-1)
      setTrackingStartedAt(null)
      setElapsedSeconds(0)
      setLastLegSeconds(null)
      if (timerRef.current != null) {
        window.clearInterval(timerRef.current)
        timerRef.current = null
      }

      const coords = route.geometry.coordinates as [number, number][]
      if (coords.length > 0) {
        setRouteSegments([
          { geometry: { type: 'LineString', coordinates: coords }, index: 0 },
        ])
      }
    },
    [],
  )

  const handleAiOptionsChange = useCallback((options: POI[]) => {
    setAiSuggestedPois(options)
  }, [])

  const handleAiSessionChange = useCallback((active: boolean) => {
    setAiSessionActive(active)
    if (!active) setAiSuggestedPois([])
  }, [])

  const handleGoClick = useCallback(async () => {
    if (allSelectedPois.length === 0 || routeDistanceMeters <= 0) return

    if (!trackingActive) {
      const now = Date.now()
      setTrackingActive(true)
      setTrackingIndex(0)
      setTrackingStartedAt(now)
      setElapsedSeconds(0)
      setLastLegSeconds(null)
      lastCheckpointRef.current = now
      if (timerRef.current != null) {
        window.clearInterval(timerRef.current)
      }
      timerRef.current = window.setInterval(() => {
        setElapsedSeconds((prev) => prev + 1)
      }, 1000)
      const first = allSelectedPois[0]
      setFlyToTarget({ lng: first.lng, lat: first.lat })
      return
    }

    const lastIndex = allSelectedPois.length - 1
    if (trackingIndex < lastIndex) {
      const now = Date.now()
      if (lastCheckpointRef.current != null) {
        const leg = Math.floor((now - lastCheckpointRef.current) / 1000)
        setLastLegSeconds(leg)
      }
      lastCheckpointRef.current = now
      const next = trackingIndex + 1
      setTrackingIndex(next)
      const poi = allSelectedPois[next]
      setFlyToTarget({ lng: poi.lng, lat: poi.lat })
      return
    }

    if (savingActivity || !trackingStartedAt) return

    setSavingActivity(true)
    try {
      const durationSeconds = Math.max(1, elapsedSeconds || Math.floor((Date.now() - trackingStartedAt) / 1000))
      await createActivity({
        title: `Route: ${allSelectedPois.map((p) => p.name).join(' → ')}`,
        distanceMeters: routeDistanceMeters,
        durationSeconds,
        routeSummaryJson: JSON.stringify({
          pois: allSelectedPois.map((p) => ({
            id: p.id,
            name: p.name,
            lat: p.lat,
            lng: p.lng,
          })),
        }),
        source: 'ai',
      })
      setTrackingActive(false)
      if (timerRef.current != null) {
        window.clearInterval(timerRef.current)
        timerRef.current = null
      }
    } catch (err) {
      console.error('Failed to save activity', err)
    } finally {
      setSavingActivity(false)
    }
  }, [allSelectedPois, routeDistanceMeters, trackingActive, trackingIndex, savingActivity, trackingStartedAt, elapsedSeconds])

  const handleFocusChat = useCallback(() => {
    const el = document.getElementById('chat-panel')
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [])

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
          mapMode={mapMode}
          suggestedPois={suggestedPois}
          allSelectedPois={allSelectedPois}
          selectedIds={selectedIds}
          routeSegments={routeSegments}
          activePoi={activePoi}
          flyToTarget={flyToTarget}
          onPoiTap={handlePoiTap}
          onSelectWaypoint={handleSelectWaypoint}
          onIgnorePoi={handleIgnoreWaypoint}
          onClosePopup={handleClosePopup}
        />

        <RouteRibbon
          mode={mode}
          allSelectedPois={allSelectedPois}
          routeSegments={routeSegments}
          onRemove={handleSelectWaypoint}
          onClearRoute={clearSelections}
          onGoClick={handleGoClick}
          trackingActive={trackingActive}
          trackingIndex={trackingIndex}
          savingActivity={savingActivity}
          elapsedSeconds={elapsedSeconds}
          lastLegSeconds={lastLegSeconds}
        />

        <ChatDock
          mode={mode}
          userLocation={loc}
          onRouteReady={handleRouteReady}
          onAiOptionsChange={handleAiOptionsChange}
          onAiSessionChange={handleAiSessionChange}
          onClearRoute={clearSelections}
          mapPickedAiPoi={mapPickedAiPoi}
          onMapPickHandled={() => setMapPickedAiPoi(null)}
        />

        <div className="pointer-events-none absolute right-4 top-4 z-20 flex flex-col items-end gap-2">
          <div
            className={
              'glass pointer-events-auto flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-medium shadow-[0_12px_40px_rgba(0,0,0,0.45)] ring-1 ' +
              (mode === 'day'
                ? 'border-white/40 bg-white/60 text-slate-800 ring-white/60'
                : 'border-white/10 bg-slate-950/60 text-slate-100 ring-white/10')
            }
          >
            <Link
              to="/"
              className="rounded-full px-2 py-0.5 hover:bg-white/20"
            >
              Dashboard
            </Link>
            <Link
              to="/profile"
              className="rounded-full px-2 py-0.5 hover:bg-white/20"
            >
              Profile
            </Link>
            <button
              type="button"
              onClick={handleFocusChat}
              className="rounded-full px-2 py-0.5 hover:bg-white/20"
            >
              Chat
            </button>
          </div>
          <button
            type="button"
            onClick={toggleMode}
            className="glass pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-slate-950/40 text-xs text-slate-100 shadow-[0_12px_40px_rgba(0,0,0,0.45)] ring-1 ring-white/10"
            aria-label="Toggle day/night mode"
          >
            {mode === 'day' ? '☾' : '☼'}
          </button>
          <button
            type="button"
            onClick={toggleMapMode}
            className="glass pointer-events-auto flex h-8 items-center justify-center rounded-full border border-white/10 bg-slate-950/40 px-2 text-[10px] text-slate-100 shadow-[0_10px_32px_rgba(0,0,0,0.45)] ring-1 ring-white/10"
            aria-label="Toggle 2D/3D map"
          >
            {mapMode === '2d' ? '3D' : '2D'}
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
  const { logout } = useAuth()
  const [mode, setMode] = useState<Mode>('day')
  const [mapMode, setMapMode] = useState<MapDimension>('2d')

  const toggleMode = () => setMode((prev) => (prev === 'day' ? 'night' : 'day'))
  const toggleMapMode = () => setMapMode((prev) => (prev === '2d' ? '3d' : '2d'))

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
            <MapLayout mode={mode} toggleMode={toggleMode} mapMode={mapMode} toggleMapMode={toggleMapMode} />
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
              onLogout={logout}
            />
          </RequireAuth>
        )}
      />
      <Route
        path="/profile"
        element={(
          <RequireAuth>
            <Profile
              mode={mode}
              onToggleMode={toggleMode}
              onLogout={logout}
            />
          </RequireAuth>
        )}
      />
      <Route
        path="/roundtable"
        element={(
          <RequireAuth>
            <RoundTableLobby />
          </RequireAuth>
        )}
      />
      <Route
        path="/roundtable/:sessionId"
        element={(
          <RequireAuth>
            <NegotiationRoom />
          </RequireAuth>
        )}
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
