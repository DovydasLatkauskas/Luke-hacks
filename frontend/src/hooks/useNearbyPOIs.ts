import { useEffect, useRef, useState } from 'react'
import type { Mode } from '../App'
import type { LngLat, POI } from '../types/map'

// Try a small pool of Overpass mirrors so we don't die
// completely when one returns 429 (rate limit) or is down.
const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.nchc.org.tw/api/interpreter',
]
const RADIUS_M = 1500
const DISPLAY_LIMIT = 5

// Simple in‑memory cache of raw POI results keyed by a
// quantised center + mode so we can reuse data when
// Overpass is temporarily unavailable or rate‑limited.
const POI_CACHE = new Map<string, POI[]>()

function cacheKey(center: LngLat, mode: Mode): string {
  // Quantise to ~100m to avoid thrashing the cache as the
  // user pans slightly.
  const lat = center.lat.toFixed(3)
  const lng = center.lng.toFixed(3)
  return `${mode}:${lat},${lng}`
}

function applyFilterAndLimit(all: POI[], exclude?: Set<string>): POI[] {
  const base = exclude ? all.filter((p) => !exclude.has(p.id)) : [...all]
  base.sort((a, b) => a.distance - b.distance)
  return base.slice(0, DISPLAY_LIMIT)
}

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
    const key = cacheKey(center, mode)

    ;(async () => {
      let lastErr: unknown = null
      for (const url of OVERPASS_URLS) {
        try {
          const r = await fetch(url, { method: 'POST', body, signal: ctrl.signal })
          if (!r.ok) {
            const text = await r.text().catch(() => '')
            // If this mirror is rate‑limited, immediately try next one.
            if (r.status === 429) {
              console.warn('[Overpass] 429 from', url)
              continue
            }
            throw new Error(`Overpass ${r.status}: ${text.slice(0, 200)}`)
          }

          const json = await r.json()
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

          // Cache raw results for this center+mode so we can
          // reuse them if Overpass is temporarily unavailable.
          POI_CACHE.set(key, all)

          const exclude = excludeRef.current
          const filtered = applyFilterAndLimit(all, exclude)
          setPois(filtered)
          setLoading(false)
          return
        } catch (err: any) {
          if (err?.name === 'AbortError') return
          lastErr = err
          // Try next mirror.
        }
      }

      if (lastErr) {
        console.error('[Overpass] all mirrors failed', lastErr)
      }

      // Fallback: if we have cached POIs for this area, reuse
      // them so the UI doesn't go blank when the API is unhappy.
      const cached = POI_CACHE.get(key)
      const exclude = excludeRef.current
      if (cached && cached.length > 0) {
        setPois(applyFilterAndLimit(cached, exclude))
      } else {
        setPois([])
      }

      setLoading(false)
    })()

    return () => ctrl.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center?.lat, center?.lng, mode, excludeKey])

  return { pois, loading }
}
