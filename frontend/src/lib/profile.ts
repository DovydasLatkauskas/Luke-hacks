import type { ActivityResponse, CreateActivityRequest, ProfileSummary } from '../types/profile'

const ACCESS_TOKEN_KEY = 'pace_route_access_token'

function apiBase(): string {
  const configured = import.meta.env.VITE_API_BASE_URL?.trim()
  if (configured) return configured.replace(/\/+$/, '')
  return ''
}

function authHeaders(): HeadersInit {
  const token = localStorage.getItem(ACCESS_TOKEN_KEY)
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function getProfileSummary(): Promise<ProfileSummary> {
  const res = await fetch(`${apiBase()}/api/profile/summary`, {
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error(`Profile summary failed (${res.status})`)
  return res.json()
}

export async function getProfileActivities(): Promise<ActivityResponse[]> {
  const res = await fetch(`${apiBase()}/api/profile/activities`, {
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error(`Profile activities failed (${res.status})`)
  return res.json()
}

export async function createActivity(req: CreateActivityRequest): Promise<ActivityResponse> {
  const res = await fetch(`${apiBase()}/api/profile/activities`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error(`Create activity failed (${res.status})`)
  return res.json()
}
