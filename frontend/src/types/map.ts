export type LngLat = { lng: number; lat: number }

export type POI = {
  id: string
  lat: number
  lng: number
  name: string
  distance: number
  address?: string | null
  primaryType?: string | null
  primaryTypeLabel?: string | null
  mapsUri?: string | null
  source?: 'osm' | 'google'
}
