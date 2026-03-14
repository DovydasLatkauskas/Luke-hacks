import type { SessionStatus, UserConstraints } from '../types/roundtable'

const BASE = '/api/collaborative-planning'
const ACCESS_TOKEN_STORAGE_KEY = 'pace_route_access_token'

function getAccessToken(): string {
  const token = localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY)
  if (!token) {
    throw new Error('You must be logged in to access collaborative planning.')
  }
  return token
}

function authHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${getAccessToken()}`,
    'Content-Type': 'application/json',
  }
}

async function parseJsonResponse<T>(res: Response): Promise<T> {
  const payload = await res.json().catch(() => null)
  if (!res.ok) {
    const message =
      payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
        ? payload.error
        : payload && typeof payload === 'object' && 'detail' in payload && typeof payload.detail === 'string'
          ? payload.detail
          : 'Roundtable request failed.'
    throw new Error(message)
  }

  return payload as T
}

export async function createSession(
  expectedCount: number,
  joinTimeoutSeconds = 300,
): Promise<SessionStatus> {
  const res = await fetch(`${BASE}/chats`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      expectedParticipantCount: expectedCount,
      joinTimeoutSeconds,
    }),
  })
  return parseJsonResponse<SessionStatus>(res)
}

export async function joinByInvite(inviteToken: string): Promise<SessionStatus> {
  const res = await fetch(`${BASE}/chats/join/${encodeURIComponent(inviteToken)}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getAccessToken()}`,
    },
  })
  return parseJsonResponse<SessionStatus>(res)
}

export async function submitConstraints(
  chatId: string,
  constraints: UserConstraints,
): Promise<SessionStatus> {
  const res = await fetch(`${BASE}/chats/${chatId}/constraints`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      name: constraints.name,
      budget: constraints.budget,
      dietary: constraints.dietary,
      location: constraints.lat !== null && constraints.lng !== null
        ? `near ${constraints.lat.toFixed(5)}, ${constraints.lng.toFixed(5)}`
        : 'Edinburgh city centre',
      mood: constraints.mood,
      time: constraints.time,
    }),
  })
  return parseJsonResponse<SessionStatus>(res)
}

export async function getSession(chatId: string): Promise<SessionStatus> {
  const res = await fetch(`${BASE}/chats/${chatId}`, {
    headers: {
      Authorization: `Bearer ${getAccessToken()}`,
    },
  })
  return parseJsonResponse<SessionStatus>(res)
}

export async function submitFeedback(chatId: string, text: string): Promise<void> {
  const res = await fetch(`${BASE}/chats/${chatId}/feedback`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ text }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(body || 'Failed to submit feedback.')
  }
}

export async function submitVeto(chatId: string, reason: string): Promise<void> {
  const res = await fetch(`${BASE}/chats/${chatId}/veto`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ reason }),
  })
  await parseJsonResponse<{ ok: boolean }>(res)
}

export async function streamSession(
  chatId: string,
  onEvent: (eventType: string, payload: string) => void,
  signal: AbortSignal,
  afterEventId?: number,
): Promise<void> {
  const url = new URL(`${BASE}/chats/${chatId}/stream`, window.location.origin)
  if (afterEventId && afterEventId > 0) {
    url.searchParams.set('afterEventId', String(afterEventId))
  }

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${getAccessToken()}`,
      Accept: 'text/event-stream',
    },
    signal,
  })

  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => '')
    throw new Error(text || 'Unable to stream collaborative planning events.')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let currentEvent = 'message'
  let currentData: string[] = []

  while (!signal.aborted) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    let boundary = buffer.indexOf('\n')
    while (boundary >= 0) {
      const rawLine = buffer.slice(0, boundary)
      buffer = buffer.slice(boundary + 1)
      const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine

      if (line.length === 0) {
        if (currentData.length > 0) {
          onEvent(currentEvent, currentData.join('\n'))
        }
        currentEvent = 'message'
        currentData = []
      } else if (line.startsWith('event:')) {
        currentEvent = line.slice('event:'.length).trim()
      } else if (line.startsWith('data:')) {
        currentData.push(line.slice('data:'.length).trimStart())
      }

      boundary = buffer.indexOf('\n')
    }
  }
}
