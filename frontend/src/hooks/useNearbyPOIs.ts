import { useEffect, useRef, useState } from 'react'
import type { Mode } from '../App'
import type { LngLat, POI } from '../types/map'

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'
const RADIUS_M = 1500
const DISPLAY_LIMIT = 5

function haversineM(a: LngLat, b: { lat: number; lng: number }): number {
  const R = 6_371_000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const sinLat = Math.sin(dLat / 2)
  const sinLng = Math.sin(dLng / 2)
  const h = sinLat * sinLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

function buildQuery(center: LngLat, mode: Mode): string {
  const amenity = mode === 'day' ? 'cafe' : 'pub'
  return `[out:json][timeout:10];
node(around:${RADIUS_M},${center.lat},${center.lng})["amenity"="${amenity}"];
out body 30;`
}

export function useNearbyPOIs(
  center: LngLat | null,
  mode: Mode,
  excludeIds?: Set<string>,
) {
  const [pois, setPois] = useState<POI[]>([])
  const [loading, setLoading] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const excludeRef = useRef(excludeIds)
  excludeRef.current = excludeIds

  const excludeKey = excludeIds ? Array.from(excludeIds).sort().join(',') : ''

  useEffect(() => {
    if (!center) {
      setPois([])
      return
    }

    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    setLoading(true)

    const body = new URLSearchParams({ data: buildQuery(center, mode) })

    fetch(OVERPASS_URL, { method: 'POST', body, signal: ctrl.signal })
      .then((r) => r.json())
      .then((json) => {
        const exclude = excludeRef.current
        const fallbackName = mode === 'day' ? 'Cafe' : 'Pub'
        const all: POI[] = (json.elements ?? [])
          .filter((el: { lat?: number; lon?: number }) => el.lat != null && el.lon != null)
          .map((el: { id: number; lat: number; lon: number; tags?: Record<string, string> }) => ({
            id: String(el.id),
            lat: el.lat,
            lng: el.lon,
            name: el.tags?.name ?? fallbackName,
            distance: haversineM(center, { lat: el.lat, lng: el.lon }),
          }))

        const filtered = exclude
          ? all.filter((p) => !exclude.has(p.id))
          : all

        filtered.sort((a, b) => a.distance - b.distance)
        setPois(filtered.slice(0, DISPLAY_LIMIT))
      })
      .catch((err) => {
        if (err.name !== 'AbortError') console.error('[Overpass]', err)
      })
      .finally(() => setLoading(false))

    return () => ctrl.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center?.lat, center?.lng, mode, excludeKey])

  return { pois, loading }
}
