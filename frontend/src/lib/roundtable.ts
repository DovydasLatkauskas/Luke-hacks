import type { UserConstraints, SessionStatus } from '../types/roundtable'

const BASE = '/roundtable'

export async function createSession(expectedCount: number): Promise<{ session_id: string }> {
  const res = await fetch(`${BASE}/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expected_count: expectedCount }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function joinSession(
  sessionId: string,
  userId: string,
  constraints: UserConstraints,
): Promise<{ position: number; waiting_for: number }> {
  const res = await fetch(`${BASE}/session/${sessionId}/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, constraints }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function getSession(sessionId: string): Promise<SessionStatus> {
  const res = await fetch(`${BASE}/session/${sessionId}`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export function openStream(sessionId: string, userId: string): EventSource {
  return new EventSource(`${BASE}/session/${sessionId}/stream?user_id=${encodeURIComponent(userId)}`)
}

export async function submitVeto(sessionId: string, userId: string, reason: string): Promise<void> {
  const res = await fetch(`${BASE}/session/${sessionId}/veto`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, reason }),
  })
  if (!res.ok) throw new Error(await res.text())
}
