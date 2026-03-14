import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Mode } from '../App'
import type { POI } from '../types/map'

type Props = {
  mode: Mode
  pois: POI[]
  allSelectedPois: POI[]
  selectedIds: string[]
  poisLoading: boolean
  onSelectWaypoint: (id: string) => void
}

function fmtDist(m: number): string {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`
}

export function ChatDock({
  mode,
  pois,
  allSelectedPois,
  selectedIds,
  poisLoading,
  onSelectWaypoint,
}: Props) {
  const [hover, setHover] = useState(false)
  const isDay = mode === 'day'
  const poiLabel = isDay ? 'Nearby cafes' : 'Nearby pubs'
  const poiIcon = isDay ? '☕' : '🍺'

  return (
    <div className="pointer-events-none absolute bottom-4 left-4 z-10">
      <div
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        className={[
          'glass pointer-events-auto flex h-[80dvh] w-[min(380px,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl border shadow-[0_24px_90px_rgba(0,0,0,0.35)] ring-1 transition-all duration-300',
          isDay
            ? 'border-slate-900/10 bg-white/35 text-slate-900 ring-white/30'
            : 'border-white/10 bg-slate-950/25 text-slate-100 ring-white/5',
        ].join(' ')}
      >
        {/* Floating header – appears on hover */}
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

        {/* Header */}
        <div
          className={[
            'flex items-center justify-between gap-3 border-b px-4 py-3',
            isDay ? 'border-slate-900/10' : 'border-white/10',
          ].join(' ')}
        >
          <div>
            <div className="text-sm font-semibold">Build your route</div>
            <div className="text-xs opacity-70">
              Tap a place to add it — route updates live
            </div>
          </div>
          <div className="text-xs opacity-50">
            {isDay ? 'Day' : 'Night'}
          </div>
        </div>

        {/* Selected waypoints summary */}
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

        {/* Suggestions list */}
        <div className="flex-1 overflow-auto px-3 py-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold opacity-70">{poiLabel}</span>
            {poisLoading && (
              <span className="text-[10px] opacity-50">Loading…</span>
            )}
          </div>

          {pois.length === 0 && !poisLoading && (
            <div className="py-6 text-center text-xs opacity-50">
              No results nearby
            </div>
          )}

          <ul className="space-y-1.5">
            {pois.map((poi) => (
              <li key={poi.id}>
                <button
                  type="button"
                  onClick={() => onSelectWaypoint(poi.id)}
                  className={[
                    'flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition-all duration-200',
                    isDay
                      ? 'bg-white/40 text-slate-700 hover:bg-white/70'
                      : 'bg-white/5 text-slate-300 hover:bg-white/10',
                  ].join(' ')}
                >
                  <span className="text-base">{poiIcon}</span>
                  <div className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{poi.name}</span>
                    <span className="text-[10px] opacity-50">{fmtDist(poi.distance)}</span>
                  </div>
                  <span className="shrink-0 text-[10px] opacity-40">+ add</span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* Footer summary */}
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
