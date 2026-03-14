import type { ComputeGoogleRouteRequest, PlanAgentRequest, AgentPlan, PlannedRoute } from '../types/agent'
import type { POI } from '../types/map'

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && 'detail' in payload && typeof payload.detail === 'string'
        ? payload.detail
        : 'Request failed.'
    throw new Error(message)
  }

  return payload as T
}

function toPoi(place: {
  id: string
  name: string
  lat: number
  lng: number
  distanceMeters: number
  address?: string | null
  primaryType?: string | null
  primaryTypeLabel?: string | null
  googleMapsUri?: string | null
}): POI {
  return {
    id: place.id,
    name: place.name,
    lat: place.lat,
    lng: place.lng,
    distance: place.distanceMeters,
    address: place.address,
    primaryType: place.primaryType,
    primaryTypeLabel: place.primaryTypeLabel,
    mapsUri: place.googleMapsUri,
    source: 'google',
  }
}

type RawPlannedRoute = {
  geometry: PlannedRoute['geometry']
  distanceMeters: number
  durationText: string
}

type RawAgentPlan = {
  prompt: string
  intentSummary: string
  searchQuery: string
  radiusMeters: number
  planSummary: string
  places: Array<{
    id: string
    name: string
    lat: number
    lng: number
    distanceMeters: number
    address?: string | null
    primaryType?: string | null
    primaryTypeLabel?: string | null
    googleMapsUri?: string | null
  }>
  routeStopIds: string[]
  route: RawPlannedRoute | null
}

export async function planWithOpenAiAgent(
  request: PlanAgentRequest,
  signal?: AbortSignal,
): Promise<AgentPlan> {
  const response = await fetch('/api/agent/plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal,
  })

  const payload = await parseJsonResponse<RawAgentPlan>(response)

  return {
    ...payload,
    places: payload.places.map(toPoi),
  }
}

export async function fetchGoogleRoute(
  request: ComputeGoogleRouteRequest,
  signal?: AbortSignal,
): Promise<PlannedRoute | null> {
  const response = await fetch('/api/google/route', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal,
  })

  return parseJsonResponse<PlannedRoute | null>(response)
}
