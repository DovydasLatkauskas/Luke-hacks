import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Route, Routes } from 'react-router-dom'
import { ChatDock } from './components/ChatDock'
import { MapView } from './components/MapView'
import { RouteRibbon } from './components/RouteRibbon'
import { useNearbyPOIs } from './hooks/useNearbyPOIs'
import { useUserLocation } from './hooks/useUserLocation'
import { fetchRouteSegments, type RouteSegment } from './lib/osrm'
import { Dashboard } from './pages/Dashboard'
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
  const center = loc ?? FALLBACK

  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [allSelectedPois, setAllSelectedPois] = useState<POI[]>([])
  const [routeSegments, setRouteSegments] = useState<RouteSegment[]>([])
  const [activePoi, setActivePoi] = useState<POI | null>(null)
  const [ignoredIds, setIgnoredIds] = useState<string[]>([])
  const routeAbortRef = useRef<AbortController | null>(null)

  const excludeIds = useMemo(
    () => new Set([...selectedIds, ...ignoredIds]),
    [selectedIds, ignoredIds],
  )

  const lastSelectedPoi = allSelectedPois.length > 0
    ? allSelectedPois[allSelectedPois.length - 1]
    : null
  const queryCenter: LngLat = lastSelectedPoi
    ? { lng: lastSelectedPoi.lng, lat: lastSelectedPoi.lat }
    : center

  const { pois: suggestedPois } = useNearbyPOIs(queryCenter, mode, excludeIds)

  useEffect(() => {
    setSelectedIds([])
    setAllSelectedPois([])
    setRouteSegments([])
    setActivePoi(null)
    setIgnoredIds([])
  }, [mode])

  useEffect(() => {
    if (!loc || allSelectedPois.length === 0) {
      setRouteSegments([])
      return
    }

    routeAbortRef.current?.abort()
    const ctrl = new AbortController()
    routeAbortRef.current = ctrl

    const waypoints: LngLat[] = [
      loc,
      ...allSelectedPois.map((p) => ({ lng: p.lng, lat: p.lat })),
    ]
    fetchRouteSegments(waypoints, ctrl.signal).then((segs) => {
      if (!ctrl.signal.aborted) setRouteSegments(segs)
    })

    return () => ctrl.abort()
  }, [loc, allSelectedPois])

  const handleSelectWaypoint = useCallback(
    (poiId: string) => {
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
    [selectedIds, suggestedPois],
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
        />

        <ChatDock mode={mode} />

        <button
          type="button"
          onClick={toggleMode}
          className="glass absolute right-4 top-4 z-20 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-slate-950/40 text-xs text-slate-100 shadow-[0_12px_40px_rgba(0,0,0,0.45)] ring-1 ring-white/10"
          aria-label="Toggle day/night mode"
        >
          {mode === 'day' ? '☾' : '☼'}
        </button>
        <button
          type="button"
          onClick={toggleMapMode}
          className="glass absolute right-4 top-16 z-20 flex h-8 px-2 items-center justify-center rounded-full border border-white/10 bg-slate-950/40 text-[10px] text-slate-100 shadow-[0_10px_32px_rgba(0,0,0,0.45)] ring-1 ring-white/10"
          aria-label="Toggle 2D/3D map"
        >
          {mapMode === '2d' ? '3D' : '2D'}
        </button>
      </div>
    </div>
  )
}

export default function App() {
  const [mode, setMode] = useState<Mode>('day')
  const toggleMode = () => setMode((prev) => (prev === 'day' ? 'night' : 'day'))
  const [mapMode, setMapMode] = useState<MapDimension>('2d')
  const toggleMapMode = () => setMapMode((prev) => (prev === '2d' ? '3d' : '2d'))

  return (
    <Routes>
      <Route
        path="/"
        element={<MapLayout mode={mode} toggleMode={toggleMode} mapMode={mapMode} toggleMapMode={toggleMapMode} />}
      />
      <Route path="/dashboard" element={<Dashboard mode={mode} onToggleMode={toggleMode} />} />
    </Routes>
  )
}
