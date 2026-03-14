import { useEffect, useState } from 'react'
import type { LngLat } from '../types/map'

export type UserLocation = {
  loc: LngLat | null
  heading: number | null
  error: string | null
}

export function useUserLocation(): UserLocation {
  const [loc, setLoc] = useState<LngLat | null>(null)
  const [heading, setHeading] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setError('Geolocation is not available in this browser.')
      return
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setLoc({ lng: pos.coords.longitude, lat: pos.coords.latitude })
        if (pos.coords.heading != null && pos.coords.speed && pos.coords.speed > 0.5) {
          setHeading(pos.coords.heading)
        }
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

  return { loc, heading, error }
}
