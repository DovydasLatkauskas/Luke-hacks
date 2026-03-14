import type { LngLat } from '../types/map'

const OSRM_BASE = 'https://router.project-osrm.org/route/v1/foot'

export type RouteGeometry = GeoJSON.LineString

export type RouteSegment = {
  geometry: RouteGeometry
  index: number
}

export async function fetchRouteSegments(
  waypoints: LngLat[],
  signal?: AbortSignal,
): Promise<RouteSegment[]> {
  if (waypoints.length < 2) return []

  const coords = waypoints.map((w) => `${w.lng},${w.lat}`).join(';')
  const url = `${OSRM_BASE}/${coords}?overview=full&geometries=geojson&steps=false`

  try {
    const res = await fetch(url, { signal })
    if (!res.ok) return []
    const json = await res.json()
    const route = json.routes?.[0]
    if (!route?.geometry) return []

    const fullCoords: [number, number][] = route.geometry.coordinates
    if (waypoints.length === 2) {
      return [{ geometry: route.geometry, index: 0 }]
    }

    const segments = splitByWaypoints(fullCoords, waypoints)
    return segments.map((coords, i) => ({
      geometry: { type: 'LineString' as const, coordinates: coords },
      index: i,
    }))
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') return []
    console.error('[OSRM]', err)
    return []
  }
}

function splitByWaypoints(
  coords: [number, number][],
  waypoints: LngLat[],
): [number, number][][] {
  const wpIndices: number[] = [0]

  for (let w = 1; w < waypoints.length - 1; w++) {
    const wp = waypoints[w]
    let bestIdx = wpIndices[wpIndices.length - 1]
    let bestDist = Infinity
    for (let i = wpIndices[wpIndices.length - 1]; i < coords.length; i++) {
      const d = sqDist(coords[i][0], coords[i][1], wp.lng, wp.lat)
      if (d < bestDist) {
        bestDist = d
        bestIdx = i
      }
    }
    wpIndices.push(bestIdx)
  }
  wpIndices.push(coords.length - 1)

  const segments: [number, number][][] = []
  for (let i = 0; i < wpIndices.length - 1; i++) {
    const start = wpIndices[i]
    const end = wpIndices[i + 1]
    segments.push(coords.slice(start, end + 1))
  }
  return segments
}

function sqDist(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x1 - x2
  const dy = y1 - y2
  return dx * dx + dy * dy
}
