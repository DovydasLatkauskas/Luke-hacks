import { useCallback, useEffect, useState } from 'react'
import { getProfileSummary } from '../lib/profile'
import type { ProfileSummary } from '../types/profile'

export function useProfileSummary() {
  const [data, setData] = useState<ProfileSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(() => {
    setLoading(true)
    setError(null)
    getProfileSummary()
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Unknown error'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { refresh() }, [refresh])

  return { data, loading, error, refresh }
}
