import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { createSession, joinSession, getSession } from '../lib/roundtable'
import type { UserConstraints, Budget } from '../types/roundtable'

const NEIGHBOURHOODS = ['Old Town', 'New Town', 'Leith', 'Stockbridge', 'Grassmarket', 'West End', 'Morningside', 'Haymarket']
const MOODS = ['lively', 'relaxed', 'romantic', 'hipster', 'classic', 'adventurous']
const TIMES = ['early evening (6–8pm)', 'mid evening (8–10pm)', 'late night (10pm+)', 'all night']

function getUserId(): string {
  let id = sessionStorage.getItem('roundtable_user_id')
  if (!id) {
    id = crypto.randomUUID()
    sessionStorage.setItem('roundtable_user_id', id)
  }
  return id
}

export default function RoundTableLobby() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const paramSessionId = searchParams.get('session')

  const [step, setStep] = useState<'form' | 'waiting'>('form')
  const [sessionId, setSessionId] = useState<string | null>(paramSessionId)
  const [expectedCount, setExpectedCount] = useState(3)
  const [waitingFor, setWaitingFor] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [constraints, setConstraints] = useState<UserConstraints>({
    name: '',
    budget: 'mid',
    dietary: '',
    location: 'New Town',
    mood: 'lively',
    time: 'mid evening (8–10pm)',
  })

  const userId = getUserId()

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  function startPolling(sid: string) {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      try {
        const status = await getSession(sid)
        setWaitingFor(status.waiting_for)
        if (status.waiting_for === 0) {
          clearInterval(pollRef.current!)
          navigate(`/roundtable/${sid}?user_id=${encodeURIComponent(userId)}`)
        }
      } catch {
        // ignore transient errors
      }
    }, 2000)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!constraints.name.trim()) return setError('Please enter your name')
    setError(null)
    setSubmitting(true)
    try {
      let sid = sessionId
      if (!sid) {
        const { session_id } = await createSession(expectedCount)
        sid = session_id
        setSessionId(sid)
        window.history.replaceState({}, '', `?session=${sid}`)
      }
      const { waiting_for } = await joinSession(sid, userId, constraints)
      setWaitingFor(waiting_for)
      setStep('waiting')
      if (waiting_for === 0) {
        navigate(`/roundtable/${sid}?user_id=${encodeURIComponent(userId)}`)
      } else {
        startPolling(sid)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  const shareUrl = sessionId
    ? `${window.location.origin}/roundtable?session=${sessionId}`
    : null

  return (
    <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight">RoundTable</h1>
          <p className="text-slate-400 mt-1">Edinburgh night out, negotiated by AI</p>
        </div>

        {step === 'form' ? (
          <form onSubmit={handleSubmit} className="space-y-4 bg-slate-800 rounded-2xl p-6">
            {!paramSessionId && (
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

            <div className="grid grid-cols-2 gap-3">
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
              <div>
                <label className="block text-sm text-slate-300 mb-1">Preferred area</label>
                <select
                  value={constraints.location}
                  onChange={e => setConstraints(c => ({ ...c, location: e.target.value }))}
                  className="w-full bg-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {NEIGHBOURHOODS.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
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
              {submitting ? 'Joining...' : paramSessionId ? 'Join the table' : 'Create & join'}
            </button>
          </form>
        ) : (
          <div className="bg-slate-800 rounded-2xl p-8 text-center space-y-6">
            <div className="text-5xl animate-pulse">🍻</div>
            <div>
              <h2 className="text-xl font-semibold">You're in, {constraints.name}!</h2>
              <p className="text-slate-400 mt-1">
                {waitingFor > 0
                  ? `Waiting for ${waitingFor} more ${waitingFor === 1 ? 'person' : 'people'}...`
                  : 'Everyone is here! Starting...'}
              </p>
            </div>
            {shareUrl && (
              <div className="bg-slate-700 rounded-lg p-3">
                <p className="text-xs text-slate-400 mb-2">Share this link with your group</p>
                <div className="flex gap-2 items-center">
                  <input
                    readOnly
                    value={shareUrl}
                    className="flex-1 bg-slate-600 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none"
                    onFocus={e => e.target.select()}
                  />
                  <button
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
