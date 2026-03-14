import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getSession, streamSession, submitFeedback, submitVeto } from '../lib/roundtable'
import { RoundtableResultMap } from '../components/RoundtableResultMap'
import type {
  AgentColumn,
  AgentMessage,
  ItineraryResult,
  PhaseEvent,
  ThinkingEvent,
  VenueSlot,
} from '../types/roundtable'

const PHASES = ['research', 'proposals', 'voting', 'feedback', 'verdict'] as const
const PHASE_LABELS: Record<string, string> = {
  research: 'Research',
  proposals: 'Proposals',
  voting: 'Voting',
  feedback: 'Your Turn',
  verdict: 'Verdict',
}
const MESSAGE_COLORS: Record<string, string> = {
  proposal: 'bg-blue-900/60 border-blue-700',
  vote: 'bg-amber-900/60 border-amber-700',
  objection: 'bg-red-900/60 border-red-700',
  summary: 'bg-emerald-900/60 border-emerald-700',
  feedback: 'bg-purple-900/60 border-purple-700',
}
const SLOT_LABELS: Record<string, string> = {
  pre_drinks: 'Pre-drinks',
  dinner: 'Dinner',
  bar: 'Late bar',
}
const SLOT_ICONS: Record<string, string> = {
  pre_drinks: '🍸',
  dinner: '🍽️',
  bar: '🎶',
}

function TypingDots() {
  return (
    <div className="flex gap-1 items-center px-3 py-2">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  )
}

function VenueCard({ venue }: { venue: VenueSlot }) {
  return (
    <div className="bg-slate-700/60 rounded-xl p-3 space-y-1">
      <div className="flex items-start gap-2">
        <span className="text-lg">{SLOT_ICONS[venue.slot]}</span>
        <div className="min-w-0">
          <div className="text-xs text-slate-400 uppercase tracking-wide">{SLOT_LABELS[venue.slot]}</div>
          <div className="font-semibold text-sm leading-tight">{venue.venue_name}</div>
          <div className="text-xs text-slate-400">{venue.address}</div>
        </div>
      </div>
      {venue.reason && (
        <p className="text-xs text-slate-300 italic pl-7 leading-relaxed">{venue.reason}</p>
      )}
    </div>
  )
}

export default function NegotiationRoom() {
  const { sessionId } = useParams<{ sessionId: string }>()

  const [streamKey, setStreamKey] = useState(0)
  const [currentPhase, setCurrentPhase] = useState<string>('research')
  const [currentRound, setCurrentRound] = useState(1)
  const [agents, setAgents] = useState<Map<string, AgentColumn>>(new Map())
  const [expectedCount, setExpectedCount] = useState(0)
  const [result, setResult] = useState<ItineraryResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [vetoCountdown, setVetoCountdown] = useState<number | null>(null)
  const [vetoSubmitted, setVetoSubmitted] = useState(false)
  const [vetoInput, setVetoInput] = useState('')
  const [showVetoInput, setShowVetoInput] = useState(false)

  // Feedback state
  const [feedbackInput, setFeedbackInput] = useState('')
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false)
  const [feedbackCountdown, setFeedbackCountdown] = useState<number | null>(null)

  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const feedbackCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const bottomRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const streamAbortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!sessionId) return
    getSession(sessionId)
      .then(s => setExpectedCount(s.expectedParticipantCount))
      .catch(() => {})
  }, [sessionId])

  useEffect(() => {
    if (!sessionId) return

    // Clear lingering thinking state from previous round
    setAgents(prev => {
      const next = new Map(prev)
      for (const [id, agent] of next) next.set(id, { ...agent, thinking: false })
      return next
    })

    const ctrl = new AbortController()
    streamAbortRef.current = ctrl

    const handleEvent = (eventType: string, payload: string) => {
      try {
        if (eventType === 'phase') {
          const data = JSON.parse(payload) as PhaseEvent
          setCurrentPhase(data.phase)
          setCurrentRound(data.round)
          // Reset feedback state when entering a new phase
          if (data.phase !== 'feedback') {
            setFeedbackSubmitted(false)
            setFeedbackInput('')
            setFeedbackCountdown(null)
            if (feedbackCountdownRef.current) clearInterval(feedbackCountdownRef.current)
          }
          return
        }

        if (eventType === 'awaiting_feedback') {
          const data = JSON.parse(payload) as { round: number; timeout: number }
          setCurrentPhase('feedback')
          setFeedbackSubmitted(false)
          setFeedbackInput('')
          // Start feedback countdown
          let t = data.timeout
          setFeedbackCountdown(t)
          if (feedbackCountdownRef.current) clearInterval(feedbackCountdownRef.current)
          feedbackCountdownRef.current = setInterval(() => {
            t -= 1
            setFeedbackCountdown(t)
            if (t <= 0 && feedbackCountdownRef.current) {
              clearInterval(feedbackCountdownRef.current)
              setFeedbackCountdown(null)
            }
          }, 1000)
          return
        }

        if (eventType === 'thinking') {
          const data = JSON.parse(payload) as ThinkingEvent
          setAgents(prev => {
            const next = new Map(prev)
            const existing = next.get(data.agent_id) ?? {
              agent_id: data.agent_id,
              name: data.agent_id,
              thinking: false,
              messages: [],
            }
            next.set(data.agent_id, { ...existing, thinking: data.thinking })
            return next
          })
          return
        }

        if (eventType === 'message') {
          const data = JSON.parse(payload) as AgentMessage
          setAgents(prev => {
            const next = new Map(prev)
            const existing = next.get(data.agent_id) ?? {
              agent_id: data.agent_id,
              name: data.agent_name,
              thinking: false,
              messages: [],
            }
            next.set(data.agent_id, {
              ...existing,
              name: data.agent_name,
              thinking: false,
              messages: [...existing.messages, data],
            })
            return next
          })
          setTimeout(() => {
            bottomRefs.current.get(data.agent_id)?.scrollIntoView({ behavior: 'smooth' })
          }, 50)
          return
        }

        if (eventType === 'result') {
          const data = JSON.parse(payload) as { itinerary: ItineraryResult }
          setResult(data.itinerary)
          setCurrentPhase('done')
          setVetoSubmitted(false)
          setShowVetoInput(false)
          setVetoInput('')

          let t = 20
          setVetoCountdown(t)
          if (countdownRef.current) clearInterval(countdownRef.current)
          countdownRef.current = setInterval(() => {
            t -= 1
            setVetoCountdown(t)
            if (t <= 0 && countdownRef.current) {
              clearInterval(countdownRef.current)
              setVetoCountdown(null)
            }
          }, 1000)
          return
        }

        if (eventType === 'error') {
          const data = JSON.parse(payload) as { message?: string }
          setError(data.message ?? 'An error occurred during collaborative planning.')
        }
      } catch {
        // Ignore malformed events.
      }
    }

    streamSession(sessionId, handleEvent, ctrl.signal).catch(err => {
      if (!ctrl.signal.aborted) {
        setError(err instanceof Error ? err.message : 'Stream disconnected.')
      }
    })

    return () => {
      ctrl.abort()
      if (countdownRef.current) clearInterval(countdownRef.current)
      if (feedbackCountdownRef.current) clearInterval(feedbackCountdownRef.current)
    }
  }, [sessionId, streamKey])

  async function handleFeedback() {
    if (!sessionId || feedbackSubmitted || !feedbackInput.trim()) return
    try {
      await submitFeedback(sessionId, feedbackInput)
      setFeedbackSubmitted(true)
      setFeedbackCountdown(null)
      if (feedbackCountdownRef.current) clearInterval(feedbackCountdownRef.current)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Feedback submission failed')
    }
  }

  async function handleSkipFeedback() {
    if (!sessionId || feedbackSubmitted) return
    try {
      await submitFeedback(sessionId, '(no feedback)')
      setFeedbackSubmitted(true)
      setFeedbackCountdown(null)
      if (feedbackCountdownRef.current) clearInterval(feedbackCountdownRef.current)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Skip failed')
    }
  }

  async function handleVeto() {
    if (!sessionId || vetoSubmitted || !vetoInput.trim()) return
    try {
      await submitVeto(sessionId, vetoInput)
      setVetoSubmitted(true)
      setShowVetoInput(false)
      setResult(null)
      setVetoCountdown(null)
      if (countdownRef.current) clearInterval(countdownRef.current)
      setCurrentPhase('research')
      setStreamKey(k => k + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Veto failed')
    }
  }

  const agentList = Array.from(agents.values())
  const columnCount = Math.max(agentList.length, expectedCount)
  const isDone = currentPhase === 'done'
  const isFeedback = currentPhase === 'feedback'
  const phaseIndex = isDone ? PHASES.length : PHASES.indexOf(currentPhase as typeof PHASES[number])

  return (
    <div className="h-screen bg-slate-900 text-white flex flex-col overflow-hidden">
      <div className="flex-none border-b border-slate-700 px-4 py-3">
        <div className="flex items-center gap-2 flex-wrap">
          {PHASES.map((p, i) => {
            const isActive = p === currentPhase
            const isPast = phaseIndex > i
            return (
              <div key={p} className="flex items-center gap-2">
                {i > 0 && <span className="text-slate-600">{'->'}</span>}
                <span
                  className={`text-sm px-3 py-1 rounded-full font-medium transition-colors ${
                    isActive
                      ? p === 'feedback'
                        ? 'bg-purple-600 text-white animate-pulse'
                        : 'bg-emerald-600 text-white'
                      : isPast
                        ? 'text-emerald-400'
                        : 'text-slate-500'
                  }`}
                >
                  {PHASE_LABELS[p]}
                </span>
              </div>
            )
          })}
          <span className="ml-auto text-xs text-slate-500">Round {currentRound}</span>
        </div>
        {error && (
          <p className="text-red-400 text-xs mt-1">{error}</p>
        )}
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Feedback banner — shown when it's the user's turn */}
        {isFeedback && (
          <div className="flex-none border-b border-purple-700/50 bg-purple-900/30 px-4 py-3">
            {!feedbackSubmitted ? (
              <div className="flex items-start gap-3">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-purple-300">Your turn!</span>
                    <span className="text-xs text-slate-400">
                      Share feedback or suggest venues for the next round
                    </span>
                    {feedbackCountdown !== null && feedbackCountdown > 0 && (
                      <span className="text-xs text-slate-500 ml-auto">{feedbackCountdown}s</span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={feedbackInput}
                      onChange={e => setFeedbackInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleFeedback() }}
                      placeholder="e.g. I'd prefer somewhere with outdoor seating for dinner..."
                      className="flex-1 bg-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-purple-500"
                    />
                    <button
                      onClick={handleFeedback}
                      disabled={!feedbackInput.trim()}
                      className="text-sm bg-purple-700 hover:bg-purple-600 disabled:opacity-50 rounded-lg px-4 py-2 transition-colors font-medium"
                    >
                      Send
                    </button>
                    <button
                      onClick={handleSkipFeedback}
                      className="text-sm text-slate-400 hover:text-slate-300 px-3 py-2"
                    >
                      Skip
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-sm text-purple-300 text-center py-1">
                Feedback submitted — agents are working on the next round...
              </div>
            )}
          </div>
        )}

        <div className="flex-1 flex overflow-hidden">
          <div
            className="flex-1 flex overflow-x-auto overflow-y-hidden divide-x divide-slate-700/50"
            style={{ minWidth: 0 }}
          >
            {Array.from({ length: columnCount }).map((_, colIdx) => {
              const agent = agentList[colIdx]
              const agentId = agent?.agent_id ?? `placeholder-${colIdx}`
              const name = agent?.name ?? `Agent ${colIdx + 1}`
              const thinking = agent?.thinking ?? false
              const messages = agent?.messages ?? []

              return (
                <div key={agentId} className="flex-1 min-w-[200px] flex flex-col">
                  <div className="flex-none px-3 py-2 bg-slate-800/50 border-b border-slate-700/50">
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-2 h-2 rounded-full transition-colors ${
                          thinking ? 'bg-emerald-400 animate-pulse' : agent ? 'bg-slate-500' : 'bg-slate-700'
                        }`}
                      />
                      <span className="text-sm font-medium truncate">{name}</span>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-3 space-y-2">
                    {messages.map((msg, i) => (
                      <div
                        key={i}
                        className={`rounded-lg border p-2 text-xs leading-relaxed ${MESSAGE_COLORS[msg.type] ?? 'bg-slate-800 border-slate-700'}`}
                      >
                        {msg.round > 1 && (
                          <div className="text-slate-500 text-[10px] mb-1">Round {msg.round}</div>
                        )}
                        {msg.content}
                      </div>
                    ))}
                    {thinking && <TypingDots />}
                    <div ref={el => { if (el) bottomRefs.current.set(agentId, el) }} />
                  </div>
                </div>
              )
            })}
          </div>

          {result && (
            <div className="flex-none w-72 border-l border-slate-700 flex flex-col bg-slate-800/30 overflow-y-auto">
              <div className="p-4 space-y-4">
                <h2 className="font-bold text-lg">Tonight's Plan</h2>

                <RoundtableResultMap venues={result.venues} />

                <div className="space-y-3">
                  {result.venues.map(venue => (
                    <VenueCard key={venue.slot} venue={venue} />
                  ))}
                </div>

                <p className="text-sm text-slate-300 leading-relaxed">{result.summary}</p>

                {!vetoSubmitted && vetoCountdown !== null && vetoCountdown > 0 && (
                  <div className="border border-slate-600 rounded-xl p-3 space-y-2">
                    {!showVetoInput ? (
                      <button
                        onClick={() => setShowVetoInput(true)}
                        className="w-full text-sm text-red-400 hover:text-red-300 flex items-center justify-between"
                      >
                        <span>I object!</span>
                        <span className="text-slate-500 text-xs">{vetoCountdown}s</span>
                      </button>
                    ) : (
                      <div className="space-y-2">
                        <textarea
                          value={vetoInput}
                          onChange={e => setVetoInput(e.target.value)}
                          placeholder="What's your objection?"
                          rows={2}
                          className="w-full bg-slate-700 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-red-500 resize-none"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={handleVeto}
                            disabled={!vetoInput.trim()}
                            className="flex-1 text-xs bg-red-700 hover:bg-red-600 disabled:opacity-50 rounded-lg py-1.5 transition-colors"
                          >
                            Submit veto
                          </button>
                          <button
                            onClick={() => setShowVetoInput(false)}
                            className="text-xs text-slate-400 hover:text-slate-300 px-2"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {vetoSubmitted && (
                  <div className="text-xs text-amber-400 text-center py-2">
                    Veto submitted, agents are re-negotiating...
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
