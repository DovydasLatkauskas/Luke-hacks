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

export type IterativeSession = {
  intentSummary: string
  searchQuery: string
  radiusMeters: number
  routeStopCount: number
  openNow: boolean
  planSummary: string
  finalDestinationQuery?: string | null
  targetDistanceMeters?: number | null
}

export type IterativeWaypoint = {
  id: string
  name: string
  lat: number
  lng: number
}

export type IterativeRequest = {
  prompt?: string
  currentLocation: LngLat
  session?: IterativeSession
  selectedStops: IterativeWaypoint[]
}

export type IterativeResponse = {
  session: IterativeSession
  nextOptions: POI[]
  selectedStops: IterativeWaypoint[]
  isComplete: boolean
  remainingStops: number
  route: PlannedRoute | null
}
