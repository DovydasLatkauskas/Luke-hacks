export type LngLat = { lng: number; lat: number }

export type POI = {
  id: string
  lat: number
  lng: number
  name: string
  distance: number
  imageUrl?: string | null
}
