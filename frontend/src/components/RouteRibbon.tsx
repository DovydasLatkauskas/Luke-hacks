import type { Mode } from '../App'
import type { RouteSegment } from '../lib/osrm'
import type { POI } from '../types/map'

const SEGMENT_COLORS = [
  '#2563eb', '#0891b2', '#059669', '#65a30d', '#ca8a04',
  '#dc2626', '#9333ea', '#e11d48',
]

type Props = {
  mode: Mode
  allSelectedPois: POI[]
  routeSegments: RouteSegment[]
  onRemove: (id: string) => void
  onClearRoute?: () => void
  onGoClick?: () => void
  trackingActive?: boolean
  trackingIndex?: number
  savingActivity?: boolean
  elapsedSeconds?: number
  lastLegSeconds?: number | null
}

function haversineM(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 6_371_000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function lineStringLength(coords: [number, number][]): number {
  let total = 0
  for (let i = 1; i < coords.length; i++) {
    total += haversineM(coords[i - 1][1], coords[i - 1][0], coords[i][1], coords[i][0])
  }
  return total
}

function fmtDist(m: number): string {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`
}

export function RouteRibbon({
  mode,
  allSelectedPois,
  routeSegments,
  onRemove,
  onClearRoute,
  onGoClick,
  trackingActive,
  trackingIndex,
  savingActivity,
  elapsedSeconds,
  lastLegSeconds,
}: Props) {
  const isDay = mode === 'day'
  if (allSelectedPois.length === 0) return null

  // Compute per-segment and cumulative distances
  const legDistances: number[] = []
  for (let i = 0; i < allSelectedPois.length; i++) {
    if (routeSegments[i]?.geometry?.coordinates?.length > 1) {
      legDistances.push(lineStringLength(routeSegments[i].geometry.coordinates as [number, number][]))
    } else if (i === 0) {
      legDistances.push(allSelectedPois[0].distance)
    } else {
      legDistances.push(
        haversineM(
          allSelectedPois[i - 1].lat, allSelectedPois[i - 1].lng,
          allSelectedPois[i].lat, allSelectedPois[i].lng,
        ),
      )
    }
  }

  let cumulative = 0
  const cumulativeDistances: number[] = legDistances.map((d) => {
    cumulative += d
    return cumulative
  })

  const totalDist = cumulative

  const fmtTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    const pad = (n: number) => String(n).padStart(2, '0')
    return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}:${pad(s)}`
  }

  return (
    <div className="pointer-events-none absolute left-0 right-0 top-0 z-20 flex justify-center px-16 pt-4">
      <div
        className={[
          'glass pointer-events-auto flex max-w-[calc(100vw-8rem)] items-center gap-1 overflow-x-auto rounded-2xl border px-3 py-2 shadow-[0_12px_40px_rgba(0,0,0,0.25)]',
          isDay
            ? 'border-slate-900/10 bg-white/50 text-slate-900'
            : 'border-white/10 bg-slate-950/50 text-slate-100',
        ].join(' ')}
      >
        {/* Start / Go marker */}
        {onGoClick ? (
          <button
            type="button"
            onClick={onGoClick}
            disabled={savingActivity}
            className={[
              'mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold transition',
              savingActivity
                ? 'cursor-wait opacity-60 ' + (isDay ? 'bg-emerald-500/40 text-emerald-950' : 'bg-emerald-400/40 text-emerald-50')
                : isDay
                  ? 'bg-emerald-500/30 text-emerald-900 hover:bg-emerald-500/50'
                  : 'bg-emerald-400/30 text-emerald-100 hover:bg-emerald-400/50',
            ].join(' ')}
          >
            {!trackingActive && 'GO'}
            {trackingActive && typeof trackingIndex === 'number' && trackingIndex < allSelectedPois.length - 1 && 'Next'}
            {trackingActive && typeof trackingIndex === 'number' && trackingIndex >= allSelectedPois.length - 1 && 'Save'}
          </button>
        ) : (
          <div
            className={[
              'mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold',
              isDay ? 'bg-slate-200/60 text-slate-500' : 'bg-slate-800/60 text-slate-400',
            ].join(' ')}
          >
            GO
          </div>
        )}

        {trackingActive && typeof elapsedSeconds === 'number' && elapsedSeconds > 0 && (
          <div className="mr-2 flex shrink-0 flex-col text-[9px] opacity-70">
            <span>Total {fmtTime(elapsedSeconds)}</span>
            {typeof lastLegSeconds === 'number' && lastLegSeconds > 0 && (
              <span>Last {fmtTime(lastLegSeconds)}</span>
            )}
          </div>
        )}

        {allSelectedPois.map((poi, i) => {
          const color = SEGMENT_COLORS[i % SEGMENT_COLORS.length]
          const legDist = legDistances[i]
          return (
            <div key={poi.id} className="flex shrink-0 items-center gap-1">
              {/* Connector line with leg distance */}
              <div className="flex flex-col items-center gap-0.5">
                <div className="h-0.5 w-6" style={{ backgroundColor: color }} />
                <span className="text-[8px] font-medium opacity-40">{fmtDist(legDist)}</span>
              </div>

              {/* Stop card */}
              <div
                className={[
                  'group relative flex items-center gap-2 rounded-xl border px-2 py-1.5',
                  trackingActive && typeof trackingIndex === 'number' && i <= trackingIndex
                    ? isDay
                      ? 'border-emerald-500/70 bg-emerald-500/20'
                      : 'border-emerald-400/70 bg-emerald-400/20'
                    : isDay
                      ? 'border-slate-200/80 bg-white/60'
                      : 'border-white/10 bg-slate-800/60',
                ].join(' ')}
              >
                <div
                  className="h-8 w-8 shrink-0 overflow-hidden rounded-lg"
                  style={{ backgroundColor: color + '30' }}
                >
                  {poi.imageUrl ? (
                    <img
                      src={poi.imageUrl}
                      alt={poi.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-sm font-bold" style={{ color }}>
                      {i + 1}
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="max-w-[90px] truncate text-[11px] font-semibold leading-tight">{poi.name}</div>
                  <div className="text-[9px] opacity-50">
                    {fmtDist(cumulativeDistances[i])} total
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onRemove(poi.id)}
                  className="ml-0.5 shrink-0 rounded-md px-1 text-[10px] opacity-0 transition hover:bg-red-500/20 hover:text-red-600 group-hover:opacity-100"
                >
                  ×
                </button>
              </div>
            </div>
          )
        })}

        {/* Total distance badge */}
        {allSelectedPois.length > 0 && (
          <div
            className={[
              'ml-2 shrink-0 rounded-lg px-2 py-1 text-[10px] font-bold',
              isDay ? 'bg-emerald-500/15 text-emerald-700' : 'bg-emerald-400/15 text-emerald-300',
            ].join(' ')}
          >
            {fmtDist(totalDist)}
          </div>
        )}

        {onClearRoute && (
          <button
            type="button"
            onClick={onClearRoute}
            className={[
              'ml-1 shrink-0 rounded-lg px-2 py-1 text-[10px] font-semibold transition',
              isDay
                ? 'bg-red-500/15 text-red-700 hover:bg-red-500/25'
                : 'bg-red-400/15 text-red-300 hover:bg-red-400/25',
            ].join(' ')}
          >
            Clear
          </button>
        )}
      </div>
    </div>
  )
}

export { SEGMENT_COLORS }
