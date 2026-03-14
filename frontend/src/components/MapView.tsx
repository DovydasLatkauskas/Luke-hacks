import maplibregl, { type Map as MapLibreMap } from 'maplibre-gl'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Mode } from '../App'

type LngLat = { lng: number; lat: number }

function useUserLocation() {
  const [loc, setLoc] = useState<LngLat | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setError('Geolocation is not available in this browser.')
      return
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setLoc({ lng: pos.coords.longitude, lat: pos.coords.latitude })
        setError(null)
      },
      (err) => {
        setError(err.message || 'Unable to access location.')
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5_000,
        timeout: 15_000,
      },
    )

    return () => navigator.geolocation.clearWatch(watchId)
  }, [])

  return { loc, error }
}

type Props = {
  mode: Mode
}

export function MapView({ mode }: Props) {
  const { loc, error } = useUserLocation()
  const fallback = useMemo<LngLat>(() => ({ lng: -3.1883, lat: 55.9533 }), [])
  const center = loc ?? fallback

  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const markerRef = useRef<maplibregl.Marker | null>(null)
  const skipCleanupRef = useRef(false)

  useEffect(() => {
    if (!containerRef.current) return

    if (mapRef.current) {
      mapRef.current.resize()
      return () => {
        markerRef.current?.remove()
        mapRef.current?.remove()
        mapRef.current = null
        markerRef.current = null
      }
    }

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            maxzoom: 19,
          },
        },
        layers: [
          {
            id: 'osm',
            type: 'raster',
            source: 'osm',
          },
        ],
      },
      center: [center.lng, center.lat],
      zoom: loc ? 14 : 12,
      attributionControl: true,
    })

    map.on('load', () => {
      map.resize()
    })

    map.on('error', (e) => {
      console.error('[MapView] Map error', e?.error || e)
    })

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right')

    const marker = new maplibregl.Marker({ color: '#34d399' })
      .setLngLat([center.lng, center.lat])
      .addTo(map)

    mapRef.current = map
    markerRef.current = marker
    skipCleanupRef.current = true

    return () => {
      if (skipCleanupRef.current) {
        skipCleanupRef.current = false
        return
      }
      marker.remove()
      map.remove()
      mapRef.current = null
      markerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const map = mapRef.current
    const marker = markerRef.current
    if (!map || !marker) return

    marker.setLngLat([center.lng, center.lat])
    map.easeTo({ center: [center.lng, center.lat], duration: loc ? 600 : 0 })
  }, [center.lat, center.lng, loc])

  return (
    <div className="relative h-dvh w-screen">
      <div ref={containerRef} className="absolute inset-0 h-full w-full" />

      <div className="pointer-events-none absolute left-4 top-4">
        <div
          className={[
            'glass pointer-events-auto rounded-2xl border px-4 py-3 shadow-[0_20px_60px_rgba(0,0,0,0.45)]',
            mode === 'day'
              ? 'border-slate-900/10 bg-white/70 text-slate-900'
              : 'border-white/10 bg-slate-950/40 text-slate-100',
          ].join(' ')}
        >
          <div className="text-xs font-medium">Map</div>
          <div className="mt-0.5 text-xs text-slate-700/80 dark:text-slate-200/80">
            {loc ? (
              <>
                Centered on you · {center.lat.toFixed(5)}, {center.lng.toFixed(5)}
              </>
            ) : error ? (
              <>Using fallback · {error}</>
            ) : (
              <>Requesting location…</>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

