import maplibregl, { type Map as MapLibreMap } from 'maplibre-gl'
import { useEffect, useRef } from 'react'
import type { Mode } from '../App'
import type { RouteGeometry } from '../lib/osrm'
import type { LngLat, POI } from '../types/map'

type Props = {
  mode: Mode
  center: LngLat
  heading: number | null
  hasUserLocation: boolean
  suggestedPois: POI[]
  allSelectedPois: POI[]
  selectedIds: string[]
  routeGeometry: RouteGeometry | null
  activePoi: POI | null
  onPoiTap: (id: string) => void
  onSelectWaypoint: (id: string) => void
  onClosePopup: () => void
}

function createArrowEl(): HTMLDivElement {
  const el = document.createElement('div')
  el.className = 'user-arrow'
  el.innerHTML = `<svg width="32" height="32" viewBox="0 0 32 32" fill="none">
    <circle cx="16" cy="16" r="14" fill="#34d399" fill-opacity="0.2" stroke="#34d399" stroke-width="2"/>
    <path d="M16 7 L21 21 L16 17.5 L11 21 Z" fill="#059669"/>
  </svg>`
  el.style.transition = 'transform 0.3s ease'
  return el
}

function poiToGeoJSON(pois: POI[], selectedIds: string[]): GeoJSON.FeatureCollection {
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
      },
    })),
  }
}

export function MapView({
  mode,
  center,
  heading,
  hasUserLocation,
  suggestedPois,
  allSelectedPois,
  selectedIds,
  routeGeometry,
  activePoi,
  onPoiTap,
  onSelectWaypoint,
  onClosePopup,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const userMarkerRef = useRef<maplibregl.Marker | null>(null)
  const arrowElRef = useRef<HTMLDivElement | null>(null)
  const popupRef = useRef<HTMLDivElement | null>(null)
  const skipCleanupRef = useRef(false)
  const isDay = mode === 'day'

  // ---------- init map once ----------
  useEffect(() => {
    if (!containerRef.current) return
    if (mapRef.current) {
      mapRef.current.resize()
      return () => {
        userMarkerRef.current?.remove()
        mapRef.current?.remove()
        mapRef.current = null
      }
    }

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
        sources: {
          osm: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            maxzoom: 19,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
          },
        },
        layers: [
          {
            id: 'osm',
            type: 'raster',
            source: 'osm',
            paint: { 'raster-saturation': -0.35, 'raster-brightness-max': 0.92 },
          },
        ],
      },
      center: [center.lng, center.lat],
      zoom: hasUserLocation ? 15 : 12,
      attributionControl: false,
    })

    map.addControl(
      new maplibregl.AttributionControl({ compact: true, customAttribution: '' }),
      'bottom-right',
    )

    map.on('load', () => {
      map.resize()

      // Route line source + layer
      map.addSource('route-line', {
        type: 'geojson',
        data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: {} },
      })
      map.addLayer({
        id: 'route-line-layer',
        type: 'line',
        source: 'route-line',
        paint: { 'line-color': '#059669', 'line-width': 4, 'line-opacity': 0.85 },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      })

      // POI source (suggested + selected combined)
      map.addSource('pois', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })

      // POI circles
      map.addLayer({
        id: 'poi-circles',
        type: 'circle',
        source: 'pois',
        paint: {
          'circle-radius': 6,
          'circle-color': ['case', ['==', ['get', 'selected'], 1], '#059669', '#ffffff'],
          'circle-stroke-width': 2,
          'circle-stroke-color': ['case', ['==', ['get', 'selected'], 1], '#059669', '#94a3b8'],
          'circle-opacity': ['case', ['==', ['get', 'selected'], 1], 1, 0.7],
        },
      })

      // POI text labels — white pill
      map.addLayer({
        id: 'poi-labels',
        type: 'symbol',
        source: 'pois',
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Open Sans Semibold'],
          'text-size': 11,
          'text-offset': [0, 1.6],
          'text-anchor': 'top',
          'text-max-width': 12,
          'text-allow-overlap': false,
        },
        paint: {
          'text-color': '#1e293b',
          'text-halo-color': '#ffffff',
          'text-halo-width': 2,
          'text-opacity': ['case', ['==', ['get', 'selected'], 1], 1, 0.6],
        },
      })

      // Click on POI circles
      map.on('click', 'poi-circles', (e) => {
        const feat = e.features?.[0]
        if (feat?.properties?.id) {
          onPoiTap(feat.properties.id)
        }
      })

      // Cursor pointer on POI hover
      map.on('mouseenter', 'poi-circles', () => {
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', 'poi-circles', () => {
        map.getCanvas().style.cursor = ''
      })
    })

    map.on('error', (e) => console.error('[MapView]', e?.error || e))

    // User arrow marker
    const arrowEl = createArrowEl()
    arrowElRef.current = arrowEl
    const userMarker = new maplibregl.Marker({ element: arrowEl, anchor: 'center' })
      .setLngLat([center.lng, center.lat])
      .addTo(map)

    mapRef.current = map
    userMarkerRef.current = userMarker
    skipCleanupRef.current = true

    return () => {
      if (skipCleanupRef.current) {
        skipCleanupRef.current = false
        return
      }
      userMarker.remove()
      map.remove()
      mapRef.current = null
      userMarkerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---------- update user position + heading ----------
  useEffect(() => {
    const map = mapRef.current
    const marker = userMarkerRef.current
    if (!map || !marker) return

    marker.setLngLat([center.lng, center.lat])
    if (hasUserLocation) {
      map.easeTo({ center: [center.lng, center.lat], duration: 600 })
    }
    if (arrowElRef.current) {
      arrowElRef.current.style.transform = `rotate(${heading ?? 0}deg)`
    }
  }, [center.lng, center.lat, heading, hasUserLocation])

  // ---------- update route line ----------
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const src = map.getSource('route-line') as maplibregl.GeoJSONSource | undefined
    if (!src) return
    if (routeGeometry) {
      src.setData({ type: 'Feature', geometry: routeGeometry, properties: {} })
    } else {
      src.setData({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [] },
        properties: {},
      })
    }
  }, [routeGeometry])

  // ---------- update POI source ----------
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const src = map.getSource('pois') as maplibregl.GeoJSONSource | undefined
    if (!src) return

    const combinedPois = [
      ...allSelectedPois,
      ...suggestedPois.filter((p) => !selectedIds.includes(p.id)),
    ]
    src.setData(poiToGeoJSON(combinedPois, selectedIds))
  }, [suggestedPois, allSelectedPois, selectedIds])

  // ---------- position popup near active POI ----------
  useEffect(() => {
    if (!activePoi || !mapRef.current || !popupRef.current) return
    const map = mapRef.current
    const updatePos = () => {
      if (!popupRef.current) return
      const pt = map.project([activePoi.lng, activePoi.lat])
      popupRef.current.style.transform = `translate(${pt.x}px, ${pt.y - 16}px)`
    }
    updatePos()
    map.on('move', updatePos)
    return () => { map.off('move', updatePos) }
  }, [activePoi])

  return (
    <div className="relative h-dvh w-screen">
      <div ref={containerRef} className="absolute inset-0 h-full w-full" />

      {/* Glassy popup on POI click */}
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
                ? 'border-slate-900/10 bg-white/60 text-slate-900'
                : 'border-white/10 bg-slate-900/60 text-slate-100',
            ].join(' ')}
            style={{ minWidth: 180, maxWidth: 260 }}
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
            <div className="mb-2 text-[11px] opacity-60">
              {activePoi.distance < 1000
                ? `${Math.round(activePoi.distance)} m away`
                : `${(activePoi.distance / 1000).toFixed(1)} km away`}
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
