import type { RouteGeometry } from '../lib/osrm'
import type { LngLat, POI } from './map'

export type AgentPlan = {
  prompt: string
  intentSummary: string
  searchQuery: string
  radiusMeters: number
  planSummary: string
  places: POI[]
  routeStopIds: string[]
  route: PlannedRoute | null
}

export type PlannedRoute = {
  geometry: RouteGeometry
  distanceMeters: number
  durationText: string
}

export type PlanAgentRequest = {
  prompt: string
  currentLocation: LngLat
}

export type ComputeGoogleRouteRequest = {
  origin: LngLat
  waypoints: Array<Pick<POI, 'id' | 'name' | 'lat' | 'lng'>>
}
