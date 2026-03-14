import type { LngLat } from '../types/map'

const OSRM_BASE = 'https://router.project-osrm.org/route/v1/foot'

export type RouteGeometry = GeoJSON.LineString

export async function fetchRoute(
  waypoints: LngLat[],
  signal?: AbortSignal,
): Promise<RouteGeometry | null> {
  if (waypoints.length < 2) return null

  const coords = waypoints.map((w) => `${w.lng},${w.lat}`).join(';')
  const url = `${OSRM_BASE}/${coords}?overview=full&geometries=geojson`

  try {
    const res = await fetch(url, { signal })
    if (!res.ok) return null
    const json = await res.json()
    return json.routes?.[0]?.geometry ?? null
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') return null
    console.error('[OSRM]', err)
    return null
  }
}
