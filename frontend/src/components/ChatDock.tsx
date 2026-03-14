import type { FormEvent } from 'react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Mode } from '../App'
import type { AgentPlan } from '../types/agent'
import type { POI } from '../types/map'

type Props = {
  mode: Mode
  pois: POI[]
  allSelectedPois: POI[]
  selectedIds: string[]
  poisLoading: boolean
  plannerLoading: boolean
  plannerError: string | null
  agentPlan: AgentPlan | null
  routeMeta: { distanceMeters: number; durationText: string } | null
  isAgentPlanActive: boolean
  onSelectWaypoint: (id: string) => void
  onPlannerSubmit: (prompt: string) => void
  onClearPlanner: () => void
}

function fmtDist(m: number): string {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`
}

function labelForPoi(poi: POI, mode: Mode): string {
  return poi.primaryTypeLabel ?? (mode === 'day' ? 'Cafe' : 'Pub')
}

export function ChatDock({
  mode,
  pois,
  allSelectedPois,
  selectedIds,
  poisLoading,
  plannerLoading,
  plannerError,
  agentPlan,
  routeMeta,
  isAgentPlanActive,
  onSelectWaypoint,
  onPlannerSubmit,
  onClearPlanner,
}: Props) {
  const [hover, setHover] = useState(false)
  const [prompt, setPrompt] = useState('')

  const isDay = mode === 'day'
  const poiLabel = isAgentPlanActive
    ? `Google Maps results for "${agentPlan?.searchQuery ?? 'nearby places'}"`
    : isDay
      ? 'Nearby cafes'
      : 'Nearby pubs'
  const poiIcon = isDay ? '☕' : '🍺'

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = prompt.trim()
    if (!trimmed || plannerLoading) return
    onPlannerSubmit(trimmed)
  }

  return (
    <div className="pointer-events-none absolute bottom-4 left-4 z-10">
      <div
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        className={[
          'glass pointer-events-auto flex h-[82dvh] w-[min(400px,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl border shadow-[0_24px_90px_rgba(0,0,0,0.35)] ring-1 transition-all duration-300',
          isDay
            ? 'border-slate-900/10 bg-white/35 text-slate-900 ring-white/30'
            : 'border-white/10 bg-slate-950/25 text-slate-100 ring-white/5',
        ].join(' ')}
      >
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

        <div
          className={[
            'flex items-center justify-between gap-3 border-b px-4 py-3',
            isDay ? 'border-slate-900/10' : 'border-white/10',
          ].join(' ')}
        >
          <div>
            <div className="text-sm font-semibold">Plan your next stop</div>
            <div className="text-xs opacity-70">
              Ask ChatGPT for cafes, monuments, museums, parks, and more
            </div>
          </div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] opacity-45">
            {isAgentPlanActive ? 'ChatGPT' : isDay ? 'Day' : 'Night'}
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className={[
            'border-b px-4 py-3',
            isDay ? 'border-slate-900/10' : 'border-white/10',
          ].join(' ')}
        >
          <label htmlFor="agent-prompt" className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] opacity-55">
            ChatGPT Planner
          </label>
          <textarea
            id="agent-prompt"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={3}
            placeholder="Try: cafes within 5km with a short walking route"
            className={[
              'w-full resize-none rounded-2xl border px-3 py-2.5 text-sm outline-none transition',
              isDay
                ? 'border-slate-900/10 bg-white/60 text-slate-900 placeholder:text-slate-500 focus:border-emerald-500/40'
                : 'border-white/10 bg-white/5 text-slate-100 placeholder:text-slate-500 focus:border-emerald-400/40',
            ].join(' ')}
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <div className="text-[11px] opacity-55">
              Uses your current location, or the fallback city if GPS is unavailable
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {isAgentPlanActive && (
                <button
                  type="button"
                  onClick={onClearPlanner}
                  className={[
                    'rounded-xl px-3 py-1.5 text-xs font-semibold transition',
                    isDay
                      ? 'bg-slate-900/5 text-slate-700 hover:bg-slate-900/10'
                      : 'bg-white/5 text-slate-200 hover:bg-white/10',
                  ].join(' ')}
                >
                  Clear
                </button>
              )}
              <button
                type="submit"
                disabled={plannerLoading || prompt.trim().length === 0}
                className={[
                  'rounded-xl px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50',
                  isDay
                    ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                    : 'bg-emerald-400 text-slate-950 hover:bg-emerald-300',
                ].join(' ')}
              >
                {plannerLoading ? 'Planning…' : 'Plan route'}
              </button>
            </div>
          </div>
          {plannerError && (
            <div className="mt-2 rounded-2xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-700">
              {plannerError}
            </div>
          )}
        </form>

        {(agentPlan || routeMeta) && (
          <div
            className={[
              'border-b px-4 py-3',
              isDay ? 'border-slate-900/10 bg-white/20' : 'border-white/10 bg-white/[0.03]',
            ].join(' ')}
          >
            {agentPlan && (
              <>
                <div className="text-xs font-semibold opacity-70">{agentPlan.intentSummary}</div>
                <div className="mt-1 text-sm leading-relaxed opacity-90">{agentPlan.planSummary}</div>
                <div className="mt-2 flex flex-wrap gap-2 text-[11px] opacity-60">
                  <span>Search: {agentPlan.searchQuery}</span>
                  <span>Radius: {fmtDist(agentPlan.radiusMeters)}</span>
                </div>
              </>
            )}
            {routeMeta && (
              <div className="mt-2 text-xs font-medium opacity-75">
                Route: {fmtDist(routeMeta.distanceMeters)} · {routeMeta.durationText}
              </div>
            )}
          </div>
        )}

        {selectedIds.length > 0 && (
          <div
            className={[
              'flex items-center gap-2 border-b px-4 py-2',
              isDay ? 'border-slate-900/10' : 'border-white/10',
            ].join(' ')}
          >
            <span className="text-xs font-medium opacity-70">Route:</span>
            <div className="flex flex-1 flex-wrap gap-1">
              {allSelectedPois.map((poi) => (
                <button
                  key={poi.id}
                  type="button"
                  onClick={() => onSelectWaypoint(poi.id)}
                  className={[
                    'rounded-lg px-2 py-0.5 text-[10px] font-semibold transition',
                    isDay
                      ? 'bg-emerald-500/25 text-emerald-800 hover:bg-red-500/20 hover:text-red-700'
                      : 'bg-emerald-400/25 text-emerald-100 hover:bg-red-400/25 hover:text-red-200',
                  ].join(' ')}
                  title="Click to remove"
                >
                  {poi.name.length > 14 ? poi.name.slice(0, 12) + '…' : poi.name} ×
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-auto px-3 py-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold opacity-70">{poiLabel}</span>
            {poisLoading && !isAgentPlanActive && (
              <span className="text-[10px] opacity-50">Loading…</span>
            )}
          </div>

          {pois.length === 0 && !poisLoading && !plannerLoading && (
            <div className="py-6 text-center text-xs opacity-50">
              {isAgentPlanActive ? 'No Google Maps results matched that plan' : 'No results nearby'}
            </div>
          )}

          <ul className="space-y-1.5">
            {pois.map((poi) => (
              <li key={poi.id}>
                <button
                  type="button"
                  onClick={() => onSelectWaypoint(poi.id)}
                  className={[
                    'flex w-full items-start gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition-all duration-200',
                    isDay
                      ? 'bg-white/40 text-slate-700 hover:bg-white/70'
                      : 'bg-white/5 text-slate-300 hover:bg-white/10',
                  ].join(' ')}
                >
                  <span className="mt-0.5 text-base">{poi.source === 'google' ? '📍' : poiIcon}</span>
                  <div className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{poi.name}</span>
                    <span className="mt-0.5 block text-[11px] opacity-55">
                      {labelForPoi(poi, mode)} · {fmtDist(poi.distance)}
                    </span>
                    {poi.address && (
                      <span className="mt-0.5 block truncate text-[10px] opacity-45">{poi.address}</span>
                    )}
                  </div>
                  <span className="shrink-0 pt-0.5 text-[10px] opacity-40">
                    {selectedIds.includes(poi.id) ? '✓ added' : '+ add'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div
          className={[
            'border-t px-4 py-2.5 text-center text-[11px] opacity-60',
            isDay ? 'border-slate-900/10' : 'border-white/10',
          ].join(' ')}
        >
          {selectedIds.length === 0
            ? 'Select places to build your route'
            : `${selectedIds.length} stop${selectedIds.length > 1 ? 's' : ''} on your route`}
        </div>
      </div>
    </div>
  )
}
