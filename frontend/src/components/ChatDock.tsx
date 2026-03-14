import { useCallback, useRef, useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { planIterative } from '../lib/agent'
import type { IterativeSession, IterativeWaypoint, PlannedRoute } from '../types/agent'
import type { LngLat, POI } from '../types/map'
import type { Mode } from '../App'

type Props = {
  mode: Mode
  userLocation: LngLat | null
  onRouteReady: (pois: POI[], route: PlannedRoute) => void
  onAiOptionsChange: (options: POI[]) => void
  onAiSessionChange: (active: boolean) => void
  onClearRoute: () => void
  mapPickedAiPoi: POI | null
  onMapPickHandled: () => void
}

type TextMessage = {
  id: number
  role: 'user' | 'assistant'
  kind: 'text'
  text: string
}

type OptionsMessage = {
  id: number
  role: 'assistant'
  kind: 'options'
  options: POI[]
  selectedId?: string
}

type Message = TextMessage | OptionsMessage

let nextId = 1

export function ChatDock({ mode, userLocation, onRouteReady, onAiOptionsChange, onAiSessionChange, onClearRoute, mapPickedAiPoi, onMapPickHandled }: Props) {
  const [hover, setHover] = useState(false)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 0,
      role: 'assistant',
      kind: 'text',
      text: 'Hey! Tell me what kind of route you want and I\'ll plan it for you. Try "easy 5k coffee loop" or "pub crawl along the river".',
    },
  ])
  const [loading, setLoading] = useState(false)
  const [session, setSession] = useState<IterativeSession | null>(null)
  const [selectedStops, setSelectedStops] = useState<IterativeWaypoint[]>([])
  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const isDay = mode === 'day'
  const handleSelectRef = useRef<(poi: POI) => void>(() => {})

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, loading])

  const addMessage = useCallback((msg: Message) => {
    setMessages((prev) => [...prev, msg])
  }, [])

  const handleSend = useCallback(async () => {
    const trimmed = input.trim()
    if (!trimmed || loading) return
    if (!userLocation) {
      addMessage({ id: nextId++, role: 'assistant', kind: 'text', text: 'Waiting for your location... Please allow location access.' })
      return
    }

    setInput('')
    addMessage({ id: nextId++, role: 'user', kind: 'text', text: trimmed })

    setSession(null)
    setSelectedStops([])
    onClearRoute()
    onAiSessionChange(true)
    setLoading(true)

    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    try {
      const res = await planIterative(
        { prompt: trimmed, currentLocation: userLocation, selectedStops: [] },
        ctrl.signal,
      )

      setSession(res.session)

      addMessage({
        id: nextId++,
        role: 'assistant',
        kind: 'text',
        text: `${res.session.planSummary}\n\nPick a stop (${res.remainingStops} remaining):`,
      })

      if (res.nextOptions.length > 0) {
        addMessage({ id: nextId++, role: 'assistant', kind: 'options', options: res.nextOptions })
        onAiOptionsChange(res.nextOptions)
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      const msg = err instanceof Error ? err.message : 'Something went wrong.'
      addMessage({ id: nextId++, role: 'assistant', kind: 'text', text: `Error: ${msg}` })
      onAiSessionChange(false)
    } finally {
      setLoading(false)
    }
  }, [input, loading, userLocation, addMessage, onClearRoute, onAiSessionChange, onAiOptionsChange])

  const handleSelectOption = useCallback(async (poi: POI) => {
    if (loading || !session || !userLocation) return

    setMessages((prev) =>
      prev.map((m) =>
        m.kind === 'options' && m.options.some((o) => o.id === poi.id) && !m.selectedId
          ? { ...m, selectedId: poi.id }
          : m,
      ),
    )
    addMessage({ id: nextId++, role: 'user', kind: 'text', text: `Selected: ${poi.name}` })

    const newStops: IterativeWaypoint[] = [
      ...selectedStops,
      { id: poi.id, name: poi.name, lat: poi.lat, lng: poi.lng },
    ]
    setSelectedStops(newStops)
    setLoading(true)

    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    try {
      const res = await planIterative(
        { currentLocation: userLocation, session, selectedStops: newStops },
        ctrl.signal,
      )

      setSession(res.session)

      if (res.isComplete && res.route) {
        const pois: POI[] = newStops.map((s) => ({
          id: s.id,
          name: s.name,
          lat: s.lat,
          lng: s.lng,
          distance: 0,
          source: 'google' as const,
        }))
        onAiOptionsChange([])
        onAiSessionChange(false)
        onRouteReady(pois, res.route)
        addMessage({
          id: nextId++,
          role: 'assistant',
          kind: 'text',
          text: `Route ready! ${res.route.distanceMeters}m, ${res.route.durationText}. Showing on map now.`,
        })
        setSession(null)
        setSelectedStops([])
      } else {
        addMessage({
          id: nextId++,
          role: 'assistant',
          kind: 'text',
          text: `Pick your next stop (${res.remainingStops} remaining):`,
        })
        if (res.nextOptions.length > 0) {
          addMessage({ id: nextId++, role: 'assistant', kind: 'options', options: res.nextOptions })
          onAiOptionsChange(res.nextOptions)
        }
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      const msg = err instanceof Error ? err.message : 'Something went wrong.'
      addMessage({ id: nextId++, role: 'assistant', kind: 'text', text: `Error: ${msg}` })
    } finally {
      setLoading(false)
    }
  }, [loading, session, userLocation, selectedStops, addMessage, onRouteReady, onAiOptionsChange, onAiSessionChange])

  handleSelectRef.current = handleSelectOption

  useEffect(() => {
    if (mapPickedAiPoi) {
      handleSelectRef.current(mapPickedAiPoi)
      onMapPickHandled()
    }
  }, [mapPickedAiPoi, onMapPickHandled])

  return (
    <div className="pointer-events-none absolute bottom-4 left-4 z-10">
      <div
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        className={[
          'glass pointer-events-auto flex h-[70dvh] w-[min(360px,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl border shadow-[0_24px_90px_rgba(0,0,0,0.35)] ring-1 transition-all duration-300',
          isDay
            ? 'border-slate-900/10 bg-white/35 text-slate-900 ring-white/30'
            : 'border-white/10 bg-slate-950/25 text-slate-100 ring-white/5',
        ].join(' ')}
      >
        {/* Floating header */}
        <div
          className={[
            'absolute left-0 right-0 top-0 z-10 flex items-center justify-between rounded-t-3xl border-b px-4 py-2.5 transition-all duration-200',
            isDay ? 'border-slate-900/10 bg-white/60' : 'border-white/10 bg-slate-950/50',
            hover ? 'opacity-100' : 'pointer-events-none opacity-0',
          ].join(' ')}
        >
          <span className="text-xs font-medium opacity-90">PaceRoute</span>
          <Link
            to="/dashboard"
            className={[
              'rounded-xl px-3 py-1.5 text-xs font-semibold transition',
              isDay
                ? 'bg-emerald-500/25 text-emerald-800 hover:bg-emerald-500/40'
                : 'bg-emerald-400/25 text-emerald-100 hover:bg-emerald-400/40',
            ].join(' ')}
          >
            Dashboard
          </Link>
        </div>

        {/* Chat header */}
        <div
          className={[
            'flex items-center gap-3 border-b px-4 py-3',
            isDay ? 'border-slate-900/10' : 'border-white/10',
          ].join(' ')}
        >
          <div
            className={[
              'flex h-8 w-8 items-center justify-center rounded-xl text-sm',
              isDay ? 'bg-emerald-500/20 text-emerald-700' : 'bg-emerald-400/20 text-emerald-300',
            ].join(' ')}
          >
            AI
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold">Route assistant</div>
            <div className="text-[10px] opacity-50">Ask me to plan your route</div>
          </div>
          {(session || selectedStops.length > 0) && (
            <button
              type="button"
              onClick={() => {
                abortRef.current?.abort()
                setSession(null)
                setSelectedStops([])
                setLoading(false)
                onAiOptionsChange([])
                onAiSessionChange(false)
                onClearRoute()
                addMessage({ id: nextId++, role: 'assistant', kind: 'text', text: 'Route cleared. Describe your next route idea.' })
              }}
              className={[
                'shrink-0 rounded-lg px-2 py-1 text-[10px] font-semibold transition',
                isDay
                  ? 'bg-red-500/15 text-red-700 hover:bg-red-500/25'
                  : 'bg-red-400/15 text-red-300 hover:bg-red-400/25',
              ].join(' ')}
            >
              Clear
            </button>
          )}
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-auto px-3 py-3">
          <div className="space-y-3">
            {messages.map((msg) =>
              msg.kind === 'text' ? (
                <div
                  key={msg.id}
                  className={[
                    'max-w-[85%] whitespace-pre-line rounded-2xl px-3 py-2 text-xs leading-relaxed',
                    msg.role === 'user'
                      ? 'ml-auto ' + (isDay ? 'bg-emerald-500/20 text-emerald-900' : 'bg-emerald-400/20 text-emerald-100')
                      : isDay ? 'bg-slate-200/50 text-slate-700' : 'bg-white/5 text-slate-300',
                  ].join(' ')}
                >
                  {msg.text}
                </div>
              ) : (
                <div key={msg.id} className="space-y-1.5">
                  {msg.options.map((poi) => {
                    const isSelected = msg.selectedId === poi.id
                    const isDisabled = !!msg.selectedId
                    return (
                      <button
                        key={poi.id}
                        type="button"
                        disabled={isDisabled}
                        onClick={() => handleSelectOption(poi)}
                        className={[
                          'flex w-full items-start gap-2 rounded-xl px-3 py-2 text-left text-xs transition',
                          isSelected
                            ? isDay
                              ? 'bg-emerald-500/30 ring-1 ring-emerald-500/50'
                              : 'bg-emerald-400/30 ring-1 ring-emerald-400/50'
                            : isDisabled
                              ? 'opacity-40 cursor-default'
                              : isDay
                                ? 'bg-slate-200/50 hover:bg-emerald-500/15 cursor-pointer'
                                : 'bg-white/5 hover:bg-emerald-400/15 cursor-pointer',
                        ].join(' ')}
                      >
                        <div className="flex-1">
                          <div className="font-semibold">{poi.name}</div>
                          {poi.primaryTypeLabel && (
                            <div className="opacity-60">{poi.primaryTypeLabel}</div>
                          )}
                          {poi.address && (
                            <div className="mt-0.5 opacity-40 truncate">{poi.address}</div>
                          )}
                        </div>
                        {poi.distance > 0 && (
                          <span className="shrink-0 opacity-50">
                            {poi.distance < 1000 ? `${Math.round(poi.distance)}m` : `${(poi.distance / 1000).toFixed(1)}km`}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              ),
            )}
            {loading && (
              <div
                className={[
                  'inline-flex gap-1 rounded-2xl px-3 py-2',
                  isDay ? 'bg-slate-200/50' : 'bg-white/5',
                ].join(' ')}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-current opacity-40 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="h-1.5 w-1.5 rounded-full bg-current opacity-40 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="h-1.5 w-1.5 rounded-full bg-current opacity-40 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            )}
          </div>
        </div>

        {/* Input */}
        <div
          className={[
            'border-t px-3 py-2.5',
            isDay ? 'border-slate-900/10' : 'border-white/10',
          ].join(' ')}
        >
          <form
            onSubmit={(e) => { e.preventDefault(); handleSend() }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={session ? 'Or type a new route idea...' : 'Plan my route...'}
              className={[
                'flex-1 rounded-xl border-0 bg-transparent px-3 py-2 text-xs outline-none ring-1 transition placeholder:opacity-40',
                isDay
                  ? 'ring-slate-300/50 focus:ring-emerald-500/50'
                  : 'ring-white/10 focus:ring-emerald-400/40',
              ].join(' ')}
            />
            <button
              type="submit"
              disabled={loading}
              className={[
                'shrink-0 rounded-xl px-3 py-2 text-xs font-semibold transition',
                loading
                  ? 'opacity-40 cursor-not-allowed'
                  : isDay
                    ? 'bg-emerald-500/25 text-emerald-800 hover:bg-emerald-500/40'
                    : 'bg-emerald-400/25 text-emerald-100 hover:bg-emerald-400/40',
              ].join(' ')}
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
