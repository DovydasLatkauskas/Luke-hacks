import { useCallback, useEffect, useRef, useState } from 'react'
import { createActivity } from '../lib/profile'
import type { RouteSegment } from '../lib/osrm'
import type { Mode } from '../App'
import type { POI } from '../types/map'
import type { LngLat } from '../types/map'

type Props = {
  mode: Mode
  allSelectedPois: POI[]
  routeSegments: RouteSegment[]
  routeDistanceMeters: number
  onFlyTo: (target: LngLat) => void
  onTrackingDone: () => void
}

function fmtTimer(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

export function TrackingPanel({
  mode,
  allSelectedPois,
  routeSegments,
  routeDistanceMeters,
  onFlyTo,
  onTrackingDone,
}: Props) {
  const isDay = mode === 'day'
  const [active, setActive] = useState(false)
  const [checkpointIndex, setCheckpointIndex] = useState(-1)
  const [elapsed, setElapsed] = useState(0)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const startedRef = useRef<number>(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const totalCheckpoints = allSelectedPois.length
  const isComplete = checkpointIndex >= totalCheckpoints - 1 && active

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [])

  const startTracking = useCallback(() => {
    setActive(true)
    setCheckpointIndex(-1)
    setElapsed(0)
    setSaved(false)
    startedRef.current = Date.now()
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedRef.current) / 1000))
    }, 1000)
  }, [])

  const nextCheckpoint = useCallback(() => {
    const next = checkpointIndex + 1
    if (next >= totalCheckpoints) return
    setCheckpointIndex(next)
    const poi = allSelectedPois[next]
    onFlyTo({ lng: poi.lng, lat: poi.lat })
  }, [checkpointIndex, totalCheckpoints, allSelectedPois, onFlyTo])

  const finishRoute = useCallback(async () => {
    if (timerRef.current) clearInterval(timerRef.current)
    const duration = Math.floor((Date.now() - startedRef.current) / 1000)
    setSaving(true)
    try {
      await createActivity({
        title: `Route: ${allSelectedPois.map((p) => p.name).join(' → ')}`,
        distanceMeters: routeDistanceMeters,
        durationSeconds: duration,
        source: 'ai',
      })
      setSaved(true)
    } catch (err) {
      console.error('Failed to save activity', err)
    } finally {
      setSaving(false)
    }
  }, [allSelectedPois, routeDistanceMeters])

  const dismiss = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    setActive(false)
    setCheckpointIndex(-1)
    setElapsed(0)
    setSaved(false)
    onTrackingDone()
  }, [onTrackingDone])

  if (allSelectedPois.length === 0 || routeSegments.length === 0) return null

  if (!active) {
    return (
      <div className="pointer-events-none absolute bottom-4 left-4 z-20">
        <div className="pointer-events-none relative h-[70dvh] w-[min(360px,calc(100vw-2rem))]">
          <button
            type="button"
            onClick={startTracking}
            className={
              'glass pointer-events-auto absolute -top-4 left-1/2 z-10 -translate-x-1/2 rounded-full border px-4 py-1.5 text-[11px] font-semibold shadow-[0_10px_30px_rgba(0,0,0,0.45)] transition ' +
              (isDay
                ? 'border-emerald-500/40 bg-emerald-500/30 text-emerald-900 hover:bg-emerald-500/40'
                : 'border-emerald-400/40 bg-emerald-400/30 text-emerald-50 hover:bg-emerald-400/40')
            }
          >
            Start route
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="pointer-events-none absolute bottom-4 right-4 z-20">
      <div
        className={
          'glass pointer-events-auto w-64 rounded-2xl border p-4 shadow-[0_16px_50px_rgba(0,0,0,0.4)] ' +
          (isDay
            ? 'border-white/40 bg-white/50 text-slate-900'
            : 'border-white/10 bg-slate-950/60 text-slate-100')
        }
      >
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider opacity-60">Tracking</span>
          <span className="font-mono text-sm font-bold tabular-nums">{fmtTimer(elapsed)}</span>
        </div>

        <div className="mb-3 flex items-center gap-2">
          {allSelectedPois.map((_, i) => (
            <div
              key={allSelectedPois[i].id}
              className={
                'h-2 flex-1 rounded-full transition-colors ' +
                (i <= checkpointIndex
                  ? isDay ? 'bg-emerald-500' : 'bg-emerald-400'
                  : isDay ? 'bg-slate-300' : 'bg-slate-700')
              }
            />
          ))}
        </div>

        <div className="mb-3 text-center text-xs">
          {checkpointIndex < 0
            ? `Ready — ${totalCheckpoints} checkpoints`
            : isComplete
              ? 'Route complete!'
              : `Checkpoint ${checkpointIndex + 1} / ${totalCheckpoints}: ${allSelectedPois[checkpointIndex].name}`}
        </div>

        <div className="flex gap-2">
          {!isComplete ? (
            <button
              type="button"
              onClick={nextCheckpoint}
              className={
                'flex-1 rounded-xl px-3 py-2 text-xs font-semibold transition ' +
                (isDay
                  ? 'bg-emerald-500/25 text-emerald-800 hover:bg-emerald-500/40'
                  : 'bg-emerald-400/25 text-emerald-200 hover:bg-emerald-400/40')
              }
            >
              {checkpointIndex < 0 ? 'Go to first' : 'Next'}
            </button>
          ) : saved ? (
            <button
              type="button"
              onClick={dismiss}
              className={
                'flex-1 rounded-xl px-3 py-2 text-xs font-semibold transition ' +
                (isDay
                  ? 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700')
              }
            >
              Done
            </button>
          ) : (
            <button
              type="button"
              onClick={finishRoute}
              disabled={saving}
              className={
                'flex-1 rounded-xl px-3 py-2 text-xs font-semibold transition ' +
                (saving
                  ? 'opacity-50 cursor-not-allowed'
                  : isDay
                    ? 'bg-emerald-500/30 text-emerald-800 hover:bg-emerald-500/50'
                    : 'bg-emerald-400/30 text-emerald-200 hover:bg-emerald-400/50')
              }
            >
              {saving ? 'Saving...' : 'Save to profile'}
            </button>
          )}

          {!saved && (
            <button
              type="button"
              onClick={dismiss}
              className={
                'shrink-0 rounded-xl px-3 py-2 text-xs font-semibold transition ' +
                (isDay
                  ? 'bg-red-500/15 text-red-700 hover:bg-red-500/25'
                  : 'bg-red-400/15 text-red-300 hover:bg-red-400/25')
              }
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
