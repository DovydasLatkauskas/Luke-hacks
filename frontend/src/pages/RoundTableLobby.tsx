import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { createSession, getSession, joinByInvite, submitConstraints } from '../lib/roundtable'
import type { Budget, SessionStatus, UserConstraints } from '../types/roundtable'

const MOODS = ['lively', 'relaxed', 'romantic', 'hipster', 'classic', 'adventurous']
const TIMES = ['early evening (6-8pm)', 'mid evening (8-10pm)', 'late night (10pm+)', 'all night']

function secondsUntil(deadlineIso: string): number {
  const diffMs = new Date(deadlineIso).getTime() - Date.now()
  return Math.max(0, Math.floor(diffMs / 1000))
}

export default function RoundTableLobby() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const inviteTokenFromUrl = searchParams.get('invite')

  const [step, setStep] = useState<'form' | 'waiting'>('form')
  const [session, setSession] = useState<SessionStatus | null>(null)
  const [expectedCount, setExpectedCount] = useState(3)
  const [joinTimeoutSeconds, setJoinTimeoutSeconds] = useState(300)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [constraints, setConstraints] = useState<UserConstraints>({
    name: '',
    budget: 'mid',
    dietary: '',
    mood: 'lively',
    time: 'mid evening (8–10pm)',
    lat: null,
    lng: null,
  })
  const [locating, setLocating] = useState(false)
  const [locError, setLocError] = useState<string | null>(null)

  function getLocation() {
    if (!navigator.geolocation) return setLocError('Geolocation not supported')
    setLocating(true)
    setLocError(null)
    navigator.geolocation.getCurrentPosition(
      pos => {
        setConstraints(c => ({ ...c, lat: pos.coords.latitude, lng: pos.coords.longitude }))
        setLocating(false)
      },
      () => {
        setLocError('Could not get location — venues will be based on Edinburgh city centre')
        setLocating(false)
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  const waitingFor = session?.waitingForConstraintsCount ?? 0
  const countdownSeconds = useMemo(
    () => (session ? secondsUntil(session.joinDeadlineUtc) : 0),
    [session],
  )

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  function startPolling(chatId: string) {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      try {
        const latest = await getSession(chatId)
        setSession(latest)

        if (latest.status === 'negotiating' || latest.status === 'completed') {
          clearInterval(pollRef.current!)
          navigate(`/roundtable/${latest.chatId}`)
          return
        }

        if (latest.status === 'failed') {
          clearInterval(pollRef.current!)
        }
      } catch {
        // Ignore transient polling errors.
      }
    }, 2000)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!constraints.name.trim()) return setError('Please enter your name')

    setSubmitting(true)
    setError(null)

    try {
      let activeSession = session
      if (!activeSession) {
        if (inviteTokenFromUrl) {
          activeSession = await joinByInvite(inviteTokenFromUrl)
        } else {
          activeSession = await createSession(expectedCount, joinTimeoutSeconds)
          setSearchParams({ invite: activeSession.inviteToken })
        }
      }

      const updated = await submitConstraints(activeSession.chatId, constraints)
      setSession(updated)
      setStep('waiting')

      if (updated.status === 'negotiating' || updated.status === 'completed') {
        navigate(`/roundtable/${updated.chatId}`)
      } else {
        startPolling(updated.chatId)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  const shareUrl = session
    ? `${window.location.origin}${session.invitePath}`
    : inviteTokenFromUrl
      ? `${window.location.origin}/roundtable?invite=${encodeURIComponent(inviteTokenFromUrl)}`
      : null

  return (
    <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-4">
      <div className="w-full max-w-xl">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight">RoundTable</h1>
          <p className="text-slate-400 mt-1">Collaborative plans negotiated by AI agents</p>
        </div>

        {step === 'form' ? (
          <form onSubmit={handleSubmit} className="space-y-4 bg-slate-800 rounded-2xl p-6">
            {!inviteTokenFromUrl && (
              <>
                <div>
                  <label className="block text-sm text-slate-300 mb-1">Group size</label>
                  <select
                    value={expectedCount}
                    onChange={e => setExpectedCount(Number(e.target.value))}
                    className="w-full bg-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {[2, 3, 4, 5, 6].map(n => (
                      <option key={n} value={n}>{n} people</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-slate-300 mb-1">Auto-start timeout</label>
                  <select
                    value={joinTimeoutSeconds}
                    onChange={e => setJoinTimeoutSeconds(Number(e.target.value))}
                    className="w-full bg-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value={120}>2 minutes</option>
                    <option value={300}>5 minutes</option>
                    <option value={600}>10 minutes</option>
                  </select>
                  <p className="mt-1 text-xs text-slate-400">
                    If someone forgets to submit, negotiation starts at timeout with submitted constraints.
                  </p>
                </div>
              </>
            )}

            <div>
              <label className="block text-sm text-slate-300 mb-1">Your name</label>
              <input
                type="text"
                value={constraints.name}
                onChange={e => setConstraints(c => ({ ...c, name: e.target.value }))}
                placeholder="e.g. Alice"
                className="w-full bg-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm text-slate-300 mb-1">Your location</label>
              <button
                type="button"
                onClick={getLocation}
                disabled={locating}
                className={`w-full rounded-lg px-3 py-2 text-sm text-left transition-colors ${
                  constraints.lat
                    ? 'bg-emerald-900/50 border border-emerald-700 text-emerald-300'
                    : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                }`}
              >
                {locating
                  ? 'Getting location...'
                  : constraints.lat
                    ? `Got it (${constraints.lat.toFixed(4)}, ${constraints.lng?.toFixed(4)})`
                    : 'Share my location (recommended)'}
              </button>
              {locError && <p className="text-amber-400 text-xs mt-1">{locError}</p>}
            </div>

            <div>
              <label className="block text-sm text-slate-300 mb-1">Budget</label>
              <select
                value={constraints.budget}
                onChange={e => setConstraints(c => ({ ...c, budget: e.target.value as Budget }))}
                className="w-full bg-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="budget">Budget (£)</option>
                <option value="mid">Mid-range (££)</option>
                <option value="splurge">Splurge (£££)</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-slate-300 mb-1">Mood</label>
                <select
                  value={constraints.mood}
                  onChange={e => setConstraints(c => ({ ...c, mood: e.target.value }))}
                  className="w-full bg-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {MOODS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm text-slate-300 mb-1">Time</label>
                <select
                  value={constraints.time}
                  onChange={e => setConstraints(c => ({ ...c, time: e.target.value }))}
                  className="w-full bg-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {TIMES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm text-slate-300 mb-1">Dietary needs <span className="text-slate-500">(optional)</span></label>
              <input
                type="text"
                value={constraints.dietary}
                onChange={e => setConstraints(c => ({ ...c, dietary: e.target.value }))}
                placeholder="e.g. vegetarian, no nuts, halal"
                className="w-full bg-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-lg px-4 py-3 font-semibold transition-colors"
            >
              {submitting ? 'Submitting...' : inviteTokenFromUrl ? 'Join this planning room' : 'Create room & submit constraints'}
            </button>
          </form>
        ) : (
          <div className="bg-slate-800 rounded-2xl p-8 text-center space-y-6">
            <div className="text-5xl animate-pulse">🤝</div>
            <div>
              <h2 className="text-xl font-semibold">Constraints submitted</h2>
              {session?.status === 'failed' ? (
                <p className="text-red-300 mt-1">{session.failureReason ?? 'This room could not be started.'}</p>
              ) : (
                <p className="text-slate-400 mt-1">
                  {waitingFor > 0
                    ? `Waiting for ${waitingFor} more ${waitingFor === 1 ? 'person' : 'people'} or timeout.`
                    : 'Starting negotiation...'}
                </p>
              )}
            </div>

            {session && session.status === 'waiting_for_constraints' && (
              <div className="text-sm text-slate-300">
                Auto-start in <span className="font-semibold text-emerald-300">{countdownSeconds}s</span>
              </div>
            )}

            {shareUrl && (
              <div className="bg-slate-700 rounded-lg p-3">
                <p className="text-xs text-slate-400 mb-2">Share this single link with everyone</p>
                <div className="flex gap-2 items-center">
                  <input
                    readOnly
                    value={shareUrl}
                    className="flex-1 bg-slate-600 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none"
                    onFocus={e => e.target.select()}
                  />
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(shareUrl)}
                    className="text-xs bg-slate-500 hover:bg-slate-400 rounded px-2 py-1 transition-colors"
                  >
                    Copy
                  </button>
                </div>
              </div>
            )}

            <div className="flex justify-center gap-1">
              {[...Array(3)].map((_, i) => (
                <span
                  key={i}
                  className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
