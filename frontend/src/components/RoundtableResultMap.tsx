import maplibregl, { type Map as MapLibreMap } from 'maplibre-gl'
import { useEffect, useRef } from 'react'
import { fetchRouteSegments } from '../lib/osrm'
import type { VenueSlot } from '../types/roundtable'

const SLOT_COLORS: Record<string, string> = {
  pre_drinks: '#818cf8', // indigo
  dinner: '#34d399',    // emerald
  bar: '#f472b6',       // pink
}

const SLOT_LABELS: Record<string, string> = {
  pre_drinks: '🍸',
  dinner: '🍽️',
  bar: '🎶',
}

type Props = {
  venues: VenueSlot[]
}

export function RoundtableResultMap({ venues }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)

  useEffect(() => {
    if (!containerRef.current || venues.length === 0) return

    // Compute bounding box center
    const lngs = venues.map(v => v.lng)
    const lats = venues.map(v => v.lat)
    const centerLng = (Math.min(...lngs) + Math.max(...lngs)) / 2
    const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
        sources: {
          basemap: {
            type: 'raster',
            tiles: [
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
            id: 'basemap-layer',
            type: 'raster',
            source: 'basemap',
            paint: {
              'raster-brightness-min': 0.0,
              'raster-brightness-max': 0.85,
            },
          },
        ],
      },
      center: [centerLng, centerLat],
      zoom: 14,
      attributionControl: false,
    })

    mapRef.current = map

    map.on('load', async () => {
      // Fit to venue bounds with padding
      if (venues.length > 1) {
        const bounds = new maplibregl.LngLatBounds()
        venues.forEach(v => bounds.extend([v.lng, v.lat]))
        map.fitBounds(bounds, { padding: 48, maxZoom: 16, duration: 0 })
      }

      // Route line (ordered: pre_drinks → dinner → bar)
      const ordered = ['pre_drinks', 'dinner', 'bar']
        .map(slot => venues.find(v => v.slot === slot))
        .filter(Boolean) as VenueSlot[]

      const waypoints = ordered.map(v => ({ lng: v.lng, lat: v.lat }))
      const segments = await fetchRouteSegments(waypoints)

      const segmentColors = ['#818cf8', '#34d399'] // pre→dinner, dinner→bar

      segments.forEach((seg, i) => {
        const sourceId = `route-seg-${i}`
        map.addSource(sourceId, {
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry: seg.geometry,
            properties: {},
          },
        })
        // Glow / halo
        map.addLayer({
          id: `${sourceId}-glow`,
          type: 'line',
          source: sourceId,
          paint: {
            'line-color': segmentColors[i % segmentColors.length],
            'line-width': 6,
            'line-opacity': 0.25,
          },
        })
        // Main line
        map.addLayer({
          id: `${sourceId}-line`,
          type: 'line',
          source: sourceId,
          paint: {
            'line-color': segmentColors[i % segmentColors.length],
            'line-width': 3,
            'line-opacity': 0.9,
          },
        })
      })

      // Venue markers with emoji labels
      ordered.forEach((venue) => {
        const el = document.createElement('div')
        el.style.cssText = `
          display: flex;
          flex-direction: column;
          align-items: center;
          cursor: default;
        `

        const bubble = document.createElement('div')
        bubble.style.cssText = `
          background: ${SLOT_COLORS[venue.slot]};
          border-radius: 50%;
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.5);
          border: 2px solid rgba(255,255,255,0.3);
        `
        bubble.textContent = SLOT_LABELS[venue.slot]

        const label = document.createElement('div')
        label.style.cssText = `
          background: rgba(15,23,42,0.85);
          color: white;
          font-size: 11px;
          font-weight: 600;
          padding: 2px 6px;
          border-radius: 4px;
          margin-top: 3px;
          white-space: nowrap;
          max-width: 120px;
          overflow: hidden;
          text-overflow: ellipsis;
        `
        label.textContent = venue.venue_name

        el.appendChild(bubble)
        el.appendChild(label)

        new maplibregl.Marker({ element: el })
          .setLngLat([venue.lng, venue.lat])
          .addTo(map)
      })
    })

    return () => {
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [venues])

  if (venues.length === 0) return null

  return (
    <div
      ref={containerRef}
      className="w-full rounded-xl overflow-hidden"
      style={{ height: '200px' }}
    />
  )
}
