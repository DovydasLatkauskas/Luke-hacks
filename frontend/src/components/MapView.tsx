import maplibregl, { type Map as MapLibreMap } from 'maplibre-gl'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Mode } from '../App'
import type { RouteSegment } from '../lib/osrm'
import type { LngLat, POI } from '../types/map'

const SEGMENT_COLORS = [
  '#2563eb', '#0891b2', '#059669', '#65a30d', '#ca8a04',
  '#dc2626', '#9333ea', '#e11d48',
]

const TERRAIN_SOURCE = 'terrain-dem'
const TERRAIN_TILES = 'https://demotiles.maplibre.org/terrain-tiles/{z}/{x}/{y}.png'
const BUILDINGS_SOURCE = 'openmaptiles'
const BUILDINGS_URL = 'https://api.maptiler.com/tiles/v3/{z}/{x}/{y}.pbf?key=get_your_own_OpIi9ZULNHzrESv6T2vL'

type Props = {
  mode: Mode
  center: LngLat
  heading: number | null
  hasUserLocation: boolean
  mapMode: '2d' | '3d'
  suggestedPois: POI[]
  allSelectedPois: POI[]
  selectedIds: string[]
  routeSegments: RouteSegment[]
  activePoi: POI | null
  onPoiTap: (id: string) => void
  onSelectWaypoint: (id: string) => void
  onIgnorePoi: (id: string) => void
  onClosePopup: () => void
}

type HoverCard = { poi: POI; x: number; y: number }

function createArrowImage(): ImageData {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!

  // Outer glow circle
  ctx.beginPath()
  ctx.arc(size / 2, size / 2, 28, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(52, 211, 153, 0.2)'
  ctx.fill()
  ctx.strokeStyle = '#34d399'
  ctx.lineWidth = 2
  ctx.stroke()

  // Arrow
  ctx.beginPath()
  ctx.moveTo(size / 2, 14)
  ctx.lineTo(size / 2 + 10, 42)
  ctx.lineTo(size / 2, 35)
  ctx.lineTo(size / 2 - 10, 42)
  ctx.closePath()
  ctx.fillStyle = '#059669'
  ctx.fill()

  return ctx.getImageData(0, 0, size, size)
}

function poiToGeoJSON(
  pois: POI[],
  selectedIds: string[],
  maxDist: number,
): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: pois.map((p) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] },
      properties: {
        id: p.id,
        name: p.name,
        distance: p.distance,
        selected: selectedIds.includes(p.id) ? 1 : 0,
        distRatio: maxDist > 0 ? Math.min(p.distance / maxDist, 1) : 0,
      },
    })),
  }
}

function segmentsToGeoJSON(segments: RouteSegment[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: segments.map((seg) => ({
      type: 'Feature' as const,
      geometry: seg.geometry,
      properties: { segmentIndex: seg.index },
    })),
  }
}

function fmtDist(m: number): string {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`
}

export function MapView({
  mode,
  center,
  heading,
  hasUserLocation,
  mapMode,
  suggestedPois,
  allSelectedPois,
  selectedIds,
  routeSegments,
  activePoi,
  onPoiTap,
  onSelectWaypoint,
  onIgnorePoi,
  onClosePopup,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const popupRef = useRef<HTMLDivElement | null>(null)
  const skipCleanupRef = useRef(false)
  const isDay = mode === 'day'

  const [hoverCard, setHoverCard] = useState<HoverCard | null>(null)
  const hoverPoiRef = useRef<POI | null>(null)

  const allPoisRef = useRef<POI[]>([])
  useEffect(() => {
    allPoisRef.current = [
      ...allSelectedPois,
      ...suggestedPois.filter((p) => !selectedIds.includes(p.id)),
    ]
  }, [suggestedPois, allSelectedPois, selectedIds])

  const projectPoi = useCallback((poi: POI): { x: number; y: number } | null => {
    const map = mapRef.current
    if (!map) return null
    try {
      const pt = map.project([poi.lng, poi.lat])
      if (!isFinite(pt.x) || !isFinite(pt.y)) return null
      return { x: pt.x, y: pt.y }
    } catch {
      return null
    }
  }, [])

  const showCardForPoi = useCallback((poi: POI) => {
    const pt = projectPoi(poi)
    if (pt) {
      hoverPoiRef.current = poi
      setHoverCard({ poi, x: pt.x, y: pt.y })
    }
  }, [projectPoi])

  // ---------- init map once ----------
  useEffect(() => {
    if (!containerRef.current) return
    if (mapRef.current) {
      mapRef.current.resize()
      return
    }

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
        sources: {
          'basemap-light': {
            type: 'raster',
            tiles: [
              'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png',
              'https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png',
              'https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png',
            ],
            tileSize: 256,
            maxzoom: 20,
            attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
          },
          'basemap-dark': {
            type: 'raster',
            tiles: [
              // Carto dark theme for a proper night‑mode look
              'https://a.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}@2x.png',
              'https://b.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}@2x.png',
              'https://c.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}@2x.png',
            ],
            tileSize: 256,
            maxzoom: 20,
            attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
          },
        },
        layers: [
          {
            id: 'basemap-light-layer',
            type: 'raster',
            source: 'basemap-light',
            paint: {},
            layout: { visibility: mode === 'day' ? 'visible' : 'none' },
          },
          {
            id: 'basemap-dark-layer',
            type: 'raster',
            source: 'basemap-dark',
            paint: {
              // Use dark_all mostly as-is; just lift
              // brightness slightly so features are visible.
              'raster-brightness-min': 0.0,
              'raster-brightness-max': 0.9,
              'raster-contrast': 0.1,
            },
            layout: { visibility: mode === 'day' ? 'none' : 'visible' },
          },
        ],
      },
      center: [center.lng, center.lat],
      zoom: hasUserLocation ? 15 : 14,
      attributionControl: false,
      maxPitch: 85,
    })

    map.addControl(
      new maplibregl.AttributionControl({ compact: true, customAttribution: '' }),
      'bottom-right',
    )

    map.on('load', () => {
      map.resize()

      map.addSource(TERRAIN_SOURCE, {
        type: 'raster-dem',
        tiles: [TERRAIN_TILES],
        tileSize: 256,
        maxzoom: 12,
        encoding: 'terrarium',
      })

      map.addSource(BUILDINGS_SOURCE, {
        type: 'vector',
        tiles: [BUILDINGS_URL],
        maxzoom: 14,
      })

      map.addSource('route-segments', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })

      for (let i = 0; i < SEGMENT_COLORS.length; i++) {
        map.addLayer({
          id: `route-seg-${i}`,
          type: 'line',
          source: 'route-segments',
          filter: ['==', ['%', ['get', 'segmentIndex'], SEGMENT_COLORS.length], i],
          paint: {
            'line-color': SEGMENT_COLORS[i],
            'line-width': 5,
            'line-opacity': 0.85,
          },
          layout: { 'line-cap': 'round', 'line-join': 'round' },
        })
      }

      // User location — native GeoJSON source + layers
      map.addSource('user-location', {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [center.lng, center.lat] },
          properties: { heading: heading ?? 0 },
        },
      })

      map.addImage('user-arrow', createArrowImage(), { sdf: false })

      map.addLayer({
        id: 'user-glow',
        type: 'circle',
        source: 'user-location',
        paint: {
          'circle-radius': 18,
          'circle-color': '#34d399',
          'circle-opacity': 0.15,
        },
      })

      map.addLayer({
        id: 'user-dot',
        type: 'circle',
        source: 'user-location',
        paint: {
          'circle-radius': 6,
          'circle-color': '#059669',
          'circle-stroke-width': 2.5,
          'circle-stroke-color': '#ffffff',
        },
      })

      map.addLayer({
        id: 'user-arrow-layer',
        type: 'symbol',
        source: 'user-location',
        layout: {
          'icon-image': 'user-arrow',
          'icon-size': 0.55,
          'icon-allow-overlap': true,
          'icon-rotate': ['get', 'heading'],
          'icon-rotation-alignment': 'map',
        },
      })

      map.addSource('pois', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })

      // Unselected POI circles: green→red based on distance ratio
      map.addLayer({
        id: 'poi-circles',
        type: 'circle',
        source: 'pois',
        paint: {
          'circle-radius': ['case', ['==', ['get', 'selected'], 1], 8, 7],
          'circle-color': [
            'case',
            ['==', ['get', 'selected'], 1],
            '#059669',
            [
              'interpolate', ['linear'], ['get', 'distRatio'],
              0, '#22c55e',
              0.5, '#eab308',
              1, '#ef4444',
            ],
          ],
          'circle-stroke-width': 2,
          'circle-stroke-color': [
            'case',
            ['==', ['get', 'selected'], 1],
            '#047857',
            [
              'interpolate', ['linear'], ['get', 'distRatio'],
              0, '#16a34a',
              0.5, '#ca8a04',
              1, '#dc2626',
            ],
          ],
          'circle-opacity': ['case', ['==', ['get', 'selected'], 1], 1, 0.9],
        },
      })

      map.addLayer({
        id: 'poi-labels',
        type: 'symbol',
        source: 'pois',
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Open Sans Semibold'],
          'text-size': 11,
          'text-offset': [0, 1.8],
          'text-anchor': 'top',
          'text-max-width': 12,
          'text-allow-overlap': false,
        },
        paint: {
          // White labels so they remain legible on both
          // light and dark basemaps.
          'text-color': '#ffffff',
          'text-halo-color': '#020617',
          'text-halo-width': 1.5,
          'text-opacity': ['case', ['==', ['get', 'selected'], 1], 1, 0.65],
        },
      })

      map.on('click', 'poi-circles', (e) => {
        const feat = e.features?.[0]
        if (feat?.properties?.id) {
          onPoiTap(feat.properties.id)
          hoverPoiRef.current = null
          setHoverCard(null)
        }
      })

      map.on('mouseenter', 'poi-circles', (e) => {
        map.getCanvas().style.cursor = 'pointer'
        const feat = e.features?.[0]
        if (!feat?.properties?.id) return
        const poi = allPoisRef.current.find((p) => p.id === feat.properties!.id)
        if (poi) {
          hoverPoiRef.current = poi
          const pt = map.project([poi.lng, poi.lat])
          setHoverCard({ poi, x: pt.x, y: pt.y })
        }
      })

      map.on('mouseleave', 'poi-circles', () => {
        map.getCanvas().style.cursor = ''
      })

      // Reproject the hover card on every map move
      map.on('move', () => {
        const poi = hoverPoiRef.current
        if (!poi) return
        try {
          const pt = map.project([poi.lng, poi.lat])
          if (isFinite(pt.x) && isFinite(pt.y)) {
            setHoverCard({ poi, x: pt.x, y: pt.y })
          }
        } catch { /* ignore */ }
      })
    })

    map.on('error', (e) => console.error('[MapView]', e?.error || e))

    mapRef.current = map
    skipCleanupRef.current = true

    return () => {
      if (skipCleanupRef.current) {
        skipCleanupRef.current = false
        return
      }
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---------- toggle light/dark basemap when mode changes ----------
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    try {
      if (map.getLayer('basemap-light-layer')) {
        map.setLayoutProperty(
          'basemap-light-layer',
          'visibility',
          mode === 'day' ? 'visible' : 'none',
        )
      }
      if (map.getLayer('basemap-dark-layer')) {
        map.setLayoutProperty(
          'basemap-dark-layer',
          'visibility',
          mode === 'day' ? 'none' : 'visible',
        )
      }
    } catch {
      // ignore style errors
    }
  }, [mode])

  // ---------- auto-focus a hover card when suggestions change ----------
  useEffect(() => {
    if (!mapRef.current) return
    // If the currently-shown POI was just selected/ignored, clear it and pick next
    const currentId = hoverPoiRef.current?.id
    const unselected = suggestedPois.filter((p) => !selectedIds.includes(p.id))

    if (currentId && (selectedIds.includes(currentId) || !unselected.find((p) => p.id === currentId))) {
      const next = unselected[0]
      if (next) {
        showCardForPoi(next)
      } else {
        hoverPoiRef.current = null
        setHoverCard(null)
      }
      return
    }

    // If no card is showing, pick the first unselected
    if (!hoverPoiRef.current && unselected.length > 0) {
      showCardForPoi(unselected[0])
    }
  }, [suggestedPois, selectedIds, showCardForPoi])

  // ---------- update user position + heading via native source ----------
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const src = map.getSource('user-location') as maplibregl.GeoJSONSource | undefined
    if (src) {
      src.setData({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [center.lng, center.lat] },
        properties: { heading: heading ?? 0 },
      })
    }
    if (hasUserLocation) {
      map.easeTo({ center: [center.lng, center.lat], duration: 600 })
    }
  }, [center.lng, center.lat, heading, hasUserLocation])

  // ---------- update route segments ----------
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const src = map.getSource('route-segments') as maplibregl.GeoJSONSource | undefined
    if (!src) return
    if (routeSegments.length > 0) {
      src.setData(segmentsToGeoJSON(routeSegments))
    } else {
      src.setData({ type: 'FeatureCollection', features: [] })
    }
  }, [routeSegments])

  // ---------- 2D / 3D map mode ----------
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (mapMode === '3d') {
      try { map.setTerrain({ source: TERRAIN_SOURCE, exaggeration: 1.5 }) } catch { /* not ready */ }

      if (!map.getLayer('3d-buildings')) {
        try {
          map.addLayer({
            id: '3d-buildings',
            source: BUILDINGS_SOURCE,
            'source-layer': 'building',
            type: 'fill-extrusion',
            minzoom: 13,
            paint: {
              'fill-extrusion-color': [
                'interpolate', ['linear'], ['get', 'render_height'],
                0, '#e2e8f0',
                50, '#94a3b8',
                200, '#64748b',
              ],
              'fill-extrusion-height': ['get', 'render_height'],
              'fill-extrusion-base': ['get', 'render_min_height'],
              'fill-extrusion-opacity': 0.7,
            },
          })
        } catch { /* may 403 */ }
      } else {
        map.setLayoutProperty('3d-buildings', 'visibility', 'visible')
      }

      map.easeTo({ pitch: 60, bearing: -20, duration: 600 })
    } else {
      try { map.setTerrain(null) } catch { /* ignore */ }

      if (map.getLayer('3d-buildings')) {
        map.setLayoutProperty('3d-buildings', 'visibility', 'none')
      }

      map.easeTo({ pitch: 0, bearing: 0, duration: 600 })
    }
  }, [mapMode])

  // ---------- update POI source ----------
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const src = map.getSource('pois') as maplibregl.GeoJSONSource | undefined
    if (!src) return

    const unselected = suggestedPois.filter((p) => !selectedIds.includes(p.id))
    const combinedPois = [...allSelectedPois, ...unselected]
    const maxDist = unselected.length > 0
      ? Math.max(...unselected.map((p) => p.distance))
      : 1
    src.setData(poiToGeoJSON(combinedPois, selectedIds, maxDist))
  }, [suggestedPois, allSelectedPois, selectedIds])

  // ---------- position click popup near active POI ----------
  useEffect(() => {
    if (!activePoi || !mapRef.current || !popupRef.current) return
    const map = mapRef.current
    const updatePos = () => {
      if (!popupRef.current) return
      try {
        const pt = map.project([activePoi.lng, activePoi.lat])
        if (isFinite(pt.x) && isFinite(pt.y)) {
          popupRef.current.style.transform = `translate(${pt.x}px, ${pt.y - 16}px)`
        }
      } catch { /* ignore */ }
    }
    updatePos()
    map.on('move', updatePos)
    return () => { map.off('move', updatePos) }
  }, [activePoi])

  const handleAdd = useCallback((id: string) => {
    onSelectWaypoint(id)
    hoverPoiRef.current = null
    setHoverCard(null)
  }, [onSelectWaypoint])

  const handleIgnore = useCallback((id: string) => {
    onIgnorePoi(id)
    hoverPoiRef.current = null
    setHoverCard(null)
  }, [onIgnorePoi])

  return (
    <div className="relative h-dvh w-screen">
      <div ref={containerRef} className="absolute inset-0 h-full w-full" />

      {/* Always-visible hover info card — tracks map movement */}
      {hoverCard && !activePoi && (
        <div
          className="pointer-events-auto absolute left-0 top-0 z-20"
          style={{
            transform: `translate(${hoverCard.x}px, ${hoverCard.y - 12}px)`,
            willChange: 'transform',
          }}
        >
          <div
            className={[
              'glass -translate-x-1/2 -translate-y-full rounded-xl border px-3 py-2 shadow-[0_8px_30px_rgba(0,0,0,0.25)]',
              isDay
                ? 'border-slate-200 bg-white/80 text-slate-900'
                : 'border-white/15 bg-slate-900/80 text-slate-100',
            ].join(' ')}
            style={{ minWidth: 150, maxWidth: 230 }}
          >
            <div className="text-xs font-semibold leading-snug">{hoverCard.poi.name}</div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[10px] opacity-60">
              <span>{fmtDist(hoverCard.poi.distance)}</span>
              <span>·</span>
              <span>{isDay ? 'Cafe' : 'Pub'}</span>
            </div>
            {selectedIds.includes(hoverCard.poi.id) ? (
              <div className="mt-1 text-[10px] font-semibold text-emerald-600">On your route</div>
            ) : (
              <div className="mt-1.5 flex gap-1.5 text-[10px]">
                <button
                  type="button"
                  onClick={() => handleAdd(hoverCard.poi.id)}
                  className={
                    'flex-1 rounded-lg border px-2 py-1 font-semibold transition ' +
                    (isDay
                      ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-800 hover:bg-emerald-500/25'
                      : 'border-emerald-400/40 bg-emerald-400/15 text-emerald-100 hover:bg-emerald-400/25')
                  }
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => handleIgnore(hoverCard.poi.id)}
                  className={
                    'flex-1 rounded-lg border px-2 py-1 font-medium transition ' +
                    (isDay
                      ? 'border-slate-400/50 bg-slate-200/40 text-slate-700 hover:bg-slate-200/70'
                      : 'border-slate-500/60 bg-slate-800/70 text-slate-100 hover:bg-slate-800/90')
                  }
                >
                  Ignore
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Click popup — detailed card */}
      {activePoi && (
        <div
          ref={popupRef}
          className="pointer-events-auto absolute left-0 top-0 z-30"
          style={{ willChange: 'transform' }}
        >
          <div
            className={[
              'glass -translate-x-1/2 -translate-y-full rounded-2xl border p-3 shadow-[0_12px_40px_rgba(0,0,0,0.3)]',
              isDay
                ? 'border-slate-200 bg-white/70 text-slate-900'
                : 'border-white/10 bg-slate-900/70 text-slate-100',
            ].join(' ')}
            style={{ minWidth: 190, maxWidth: 270 }}
          >
            <div className="mb-1 flex items-start justify-between gap-2">
              <span className="text-sm font-semibold leading-tight">{activePoi.name}</span>
              <button
                type="button"
                onClick={onClosePopup}
                className="shrink-0 text-xs opacity-50 hover:opacity-100"
              >
                ✕
              </button>
            </div>
            <div className="mb-2.5 text-[11px] opacity-60">
              {fmtDist(activePoi.distance)}
              {' · '}{isDay ? 'Cafe' : 'Pub'}
            </div>
            <button
              type="button"
              onClick={() => onSelectWaypoint(activePoi.id)}
              className={[
                'w-full rounded-xl px-3 py-1.5 text-xs font-semibold transition',
                selectedIds.includes(activePoi.id)
                  ? 'bg-red-500/20 text-red-700 hover:bg-red-500/30'
                  : isDay
                    ? 'bg-emerald-500/25 text-emerald-800 hover:bg-emerald-500/40'
                    : 'bg-emerald-400/25 text-emerald-100 hover:bg-emerald-400/40',
              ].join(' ')}
            >
              {selectedIds.includes(activePoi.id) ? 'Remove from route' : 'Add to route'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
