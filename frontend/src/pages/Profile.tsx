import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import maplibregl from 'maplibre-gl'
import { useAuth } from '../auth/AuthProvider'
import { useProfileSummary } from '../hooks/useProfileSummary'
import { getProfileActivities } from '../lib/profile'
import type { Mode } from '../App'
import type { ActivityResponse } from '../types/profile'

type Props = {
  mode: Mode
  onToggleMode: () => void
  onLogout: () => void
}

function fmtKm(meters: number): string {
  return (meters / 1000).toFixed(1)
}

function fmtDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  if (h === 0) return `${m}m`
  return `${h}h ${m}m`
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function fmtTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return m >= 60
    ? `${Math.floor(m / 60)}h ${m % 60}m`
    : `${m}:${pad(s)}`
}

function InitialsAvatar({ email, isDay }: { email: string | null; isDay: boolean }) {
  const initials = email ? email.slice(0, 2).toUpperCase() : '??'
  return (
    <div
      className={
        'flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-lg font-bold ' +
        (isDay ? 'bg-emerald-500/25 text-emerald-800' : 'bg-emerald-400/25 text-emerald-200')
      }
    >
      {initials}
    </div>
  )
}

function StatBlock({ label, value, sub, isDay }: { label: string; value: string; sub?: string; isDay: boolean }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-2xl font-bold tracking-tight">{value}</span>
      <span className={'text-[11px] font-medium ' + (isDay ? 'text-slate-500' : 'text-slate-400')}>{label}</span>
      {sub && <span className={'text-[10px] ' + (isDay ? 'text-slate-400' : 'text-slate-500')}>{sub}</span>}
    </div>
  )
}

function ActivityCard({ activity, isDay, onRerun }: { activity: ActivityResponse; isDay: boolean; onRerun?: () => void }) {
  return (
    <div
      className={
        'glass flex items-center gap-4 rounded-2xl border p-4 transition ' +
        (isDay
          ? 'border-white/40 bg-white/20 hover:bg-white/30'
          : 'border-white/15 bg-slate-900/30 hover:bg-slate-900/45')
      }
    >
      <div
        className={
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold ' +
          (isDay ? 'bg-emerald-500/20 text-emerald-700' : 'bg-emerald-400/20 text-emerald-200')
        }
      >
        {fmtKm(activity.distanceMeters)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-medium truncate">{activity.title || 'Untitled route'}</div>
        <div className={'mt-0.5 text-xs ' + (isDay ? 'text-slate-500' : 'text-slate-400')}>
          {fmtDate(activity.completedAtUtc)} · {fmtKm(activity.distanceMeters)} km · {fmtDuration(activity.durationSeconds)} · {activity.estimatedCalories} kcal
        </div>
      </div>
      {onRerun && activity.routeSummaryJson && (
        <button
          type="button"
          onClick={onRerun}
          className={
            'shrink-0 rounded-xl px-3 py-1.5 text-[11px] font-semibold transition ' +
            (isDay
              ? 'bg-emerald-500/20 text-emerald-800 hover:bg-emerald-500/30'
              : 'bg-emerald-400/20 text-emerald-100 hover:bg-emerald-400/30')
          }
        >
          Rerun
        </button>
      )}
    </div>
  )
}

export function Profile({ mode, onToggleMode, onLogout }: Props) {
  const isDay = mode === 'day'
  const { user } = useAuth()
  const navigate = useNavigate()
  const { data, loading, error } = useProfileSummary()
  const [activities, setActivities] = useState<ActivityResponse[] | null>(null)
  const [activityError, setActivityError] = useState<string | null>(null)
  const [metric, setMetric] = useState<'pois' | 'calories' | 'distance' | 'pace'>('distance')

  useEffect(() => {
    getProfileActivities()
      .then(setActivities)
      .catch((err) => setActivityError(err instanceof Error ? err.message : 'Failed to load activities'))
  }, [])

  const mapRef = useRef<HTMLDivElement | null>(null)
  const mapInstance = useRef<maplibregl.Map | null>(null)

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return
    const center = { lng: -3.1883, lat: 55.9510 }
    const map = new maplibregl.Map({
      container: mapRef.current,
      style: 'https://demotiles.maplibre.org/style.json',
      center: [center.lng, center.lat],
      zoom: 7,
      interactive: false,
    })
    mapInstance.current = map
    return () => {
      map.remove()
      mapInstance.current = null
    }
  }, [])

  const weeklyBuckets = useMemo(() => {
    if (!activities || activities.length === 0) return []
    const byWeek = new Map<string, ActivityResponse[]>()
    for (const a of activities) {
      const d = new Date(a.completedAtUtc)
      const day = d.getDay()
      const diff = (day + 6) % 7
      const monday = new Date(d)
      monday.setDate(d.getDate() - diff)
      monday.setHours(0, 0, 0, 0)
      const key = monday.toISOString().slice(0, 10)
      const arr = byWeek.get(key) ?? []
      arr.push(a)
      byWeek.set(key, arr)
    }
    const entries = Array.from(byWeek.entries()).sort(([a], [b]) => (a < b ? -1 : 1))
    return entries.slice(-8).map(([weekStart, acts]) => {
      const totalDist = acts.reduce((sum, a) => sum + a.distanceMeters, 0)
      const totalDur = acts.reduce((sum, a) => sum + a.durationSeconds, 0)
      const totalCal = acts.reduce((sum, a) => sum + a.estimatedCalories, 0)
      const totalPois = acts.length
      const pace = totalDist > 0 ? totalDur / (totalDist / 1000) : 0
      return { weekStart, totalDist, totalDur, totalCal, totalPois, pace }
    })
  }, [activities])

  return (
    <div className="relative min-h-dvh overflow-hidden text-slate-100">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div ref={mapRef} className="h-full w-full scale-110 blur-[1px]" />
        <div
          className={
            'absolute inset-0 ' +
            (isDay ? 'bg-slate-200/60' : 'bg-slate-950/75')
          }
        />
      </div>

      <header
        className={
          'glass sticky top-0 z-10 border-b ' +
          (isDay ? 'border-white/30 bg-white/40' : 'border-white/10 bg-slate-950/50')
        }
      >
        <div className={'mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4 ' + (isDay ? 'text-slate-900' : 'text-slate-100')}>
          <h1 className="text-xl font-bold tracking-tight">PaceRoute</h1>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onLogout}
              className={
                'rounded-xl border px-3 py-2 text-sm transition ' +
                (isDay
                  ? 'border-slate-900/20 bg-slate-900/10 text-slate-700 hover:bg-slate-900/20'
                  : 'border-white/10 bg-slate-950/40 text-slate-100 hover:bg-slate-950/60')
              }
            >
              Log out
            </button>
            <button
              type="button"
              onClick={onToggleMode}
              className={
                'rounded-xl border p-2 text-sm shadow-sm transition ' +
                (isDay
                  ? 'border-slate-900/20 bg-slate-900/10 text-slate-700 hover:bg-slate-900/20'
                  : 'border-white/10 bg-slate-950/40 text-slate-100 hover:bg-slate-950/60')
              }
              aria-label="Toggle day/night mode"
            >
              {isDay ? '☾' : '☼'}
            </button>
            <Link
              to="/"
              className={
                'rounded-xl px-4 py-2 text-sm font-medium transition ' +
                (isDay
                  ? 'bg-emerald-500/20 text-emerald-800 hover:bg-emerald-500/30'
                  : 'bg-emerald-400/20 text-emerald-200 hover:bg-emerald-400/30')
              }
            >
              Open map
            </Link>
          </div>
        </div>
      </header>

      <main className={'mx-auto max-w-3xl px-4 py-8 ' + (isDay ? 'text-slate-900' : 'text-slate-100')}>
        {loading && (
          <div className="flex items-center justify-center py-20 text-sm opacity-60">
            Loading profile...
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-red-400/30 bg-red-500/15 p-4 text-sm text-red-200">
            {error}
          </div>
        )}

        {!loading && !error && (
          <>
            <section
              className={
                'glass mb-8 rounded-3xl border p-6 ' +
                (isDay ? 'border-white/40 bg-white/20' : 'border-white/15 bg-slate-900/30')
              }
            >
              <div className="mb-6 flex items-center gap-4">
                <InitialsAvatar email={user?.email ?? null} isDay={isDay} />
                <div>
                  <div className="text-lg font-bold">{user?.email ?? 'Athlete'}</div>
                  <div className={'text-xs ' + (isDay ? 'text-slate-500' : 'text-slate-400')}>
                    {data?.activityCount ?? 0} activities logged
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
                <StatBlock
                  label="Distance"
                  value={`${fmtKm(data?.totalDistanceMeters ?? 0)} km`}
                  isDay={isDay}
                />
                <StatBlock
                  label="Time"
                  value={fmtDuration(data?.totalDurationSeconds ?? 0)}
                  isDay={isDay}
                />
                <StatBlock
                  label="Calories"
                  value={`${(data?.totalEstimatedCalories ?? 0).toLocaleString()}`}
                  sub="kcal"
                  isDay={isDay}
                />
                <StatBlock
                  label="Longest"
                  value={`${fmtKm(data?.longestDistanceMeters ?? 0)} km`}
                  isDay={isDay}
                />
              </div>
            </section>

            <section className="mb-8">
              <h2
                className={
                  'mb-3 text-sm font-semibold uppercase tracking-wider ' +
                  (isDay ? 'text-slate-600' : 'text-slate-400')
                }
              >
                Activity trends
              </h2>

              {activityError && (
                <div className="mb-3 rounded-2xl border border-red-400/30 bg-red-500/15 p-3 text-xs text-red-100">
                  {activityError}
                </div>
              )}

              {weeklyBuckets.length === 0 ? (
                <div
                  className={
                    'glass rounded-2xl border p-6 text-center text-sm ' +
                    (isDay ? 'border-white/40 bg-white/15 text-slate-500' : 'border-white/15 bg-slate-900/30 text-slate-400')
                  }
                >
                  Not enough data yet to show weekly trends.
                </div>
              ) : (
                <div
                  className={
                    'glass rounded-2xl border p-4 text-xs ' +
                    (isDay ? 'border-white/40 bg-white/15' : 'border-white/15 bg-slate-900/30')
                  }
                >
                  <div className="mb-3 flex flex-wrap gap-2 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setMetric('distance')}
                      className={
                        'rounded-full px-3 py-1 transition ' +
                        (metric === 'distance'
                          ? isDay
                            ? 'bg-emerald-500/30 text-emerald-900'
                            : 'bg-emerald-400/30 text-emerald-50'
                          : isDay
                            ? 'bg-slate-200/60 text-slate-600 hover:bg-slate-300/70'
                            : 'bg-slate-800/60 text-slate-300 hover:bg-slate-700/70')
                      }
                    >
                      Distance
                    </button>
                    <button
                      type="button"
                      onClick={() => setMetric('calories')}
                      className={
                        'rounded-full px-3 py-1 transition ' +
                        (metric === 'calories'
                          ? isDay
                            ? 'bg-emerald-500/30 text-emerald-900'
                            : 'bg-emerald-400/30 text-emerald-50'
                          : isDay
                            ? 'bg-slate-200/60 text-slate-600 hover:bg-slate-300/70'
                            : 'bg-slate-800/60 text-slate-300 hover:bg-slate-700/70')
                      }
                    >
                      Calories
                    </button>
                    <button
                      type="button"
                      onClick={() => setMetric('pois')}
                      className={
                        'rounded-full px-3 py-1 transition ' +
                        (metric === 'pois'
                          ? isDay
                            ? 'bg-emerald-500/30 text-emerald-900'
                            : 'bg-emerald-400/30 text-emerald-50'
                          : isDay
                            ? 'bg-slate-200/60 text-slate-600 hover:bg-slate-300/70'
                            : 'bg-slate-800/60 text-slate-300 hover:bg-slate-700/70')
                      }
                    >
                      # Routes
                    </button>
                    <button
                      type="button"
                      onClick={() => setMetric('pace')}
                      className={
                        'rounded-full px-3 py-1 transition ' +
                        (metric === 'pace'
                          ? isDay
                            ? 'bg-emerald-500/30 text-emerald-900'
                            : 'bg-emerald-400/30 text-emerald-50'
                          : isDay
                            ? 'bg-slate-200/60 text-slate-600 hover:bg-slate-300/70'
                            : 'bg-slate-800/60 text-slate-300 hover:bg-slate-700/70')
                      }
                    >
                      Pace
                    </button>
                  </div>

                  <div className="flex gap-2">
                    {weeklyBuckets.map((w) => {
                      const label = w.weekStart.slice(5)
                      let value = 0
                      let unit = ''
                      if (metric === 'distance') {
                        value = w.totalDist / 1000
                        unit = 'km'
                      } else if (metric === 'calories') {
                        value = w.totalCal
                        unit = 'kcal'
                      } else if (metric === 'pois') {
                        value = w.totalPois
                        unit = 'routes'
                      } else if (metric === 'pace') {
                        value = w.pace > 0 ? w.pace : 0
                        unit = 'min/km'
                      }
                      return (
                        <div key={w.weekStart} className="flex flex-1 flex-col items-center gap-1">
                          <div className="flex h-20 w-6 items-end justify-center">
                            <div
                              className={
                                'w-4 rounded-full ' +
                                (isDay ? 'bg-emerald-500/70' : 'bg-emerald-400/80')
                              }
                              style={{
                                height: `${Math.min(100, (value || 0) / (metric === 'distance' ? 2 : metric === 'calories' ? 500 : metric === 'pace' ? 8 : 3) * 100)}%`,
                              }}
                            />
                          </div>
                          <div className="text-[9px] opacity-60">{label}</div>
                          <div className="text-[9px]">
                            {metric === 'pace' && value > 0 ? fmtTime(Math.round(value)) : value.toFixed ? value.toFixed(metric === 'distance' ? 1 : 0) : String(value)}{' '}
                            {metric !== 'pois' && metric !== 'pace' && unit}
                            {metric === 'pois' && value > 0 && ''}
                            {metric === 'pace' && value > 0 && ''}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </section>

            <section>
              <h2
                className={
                  'mb-4 text-sm font-semibold uppercase tracking-wider ' +
                  (isDay ? 'text-slate-600' : 'text-slate-400')
                }
              >
                Recent activities
              </h2>

              {(!data?.recentActivities || data.recentActivities.length === 0) ? (
                <div
                  className={
                    'glass rounded-2xl border p-8 text-center text-sm ' +
                    (isDay ? 'border-white/40 bg-white/20 text-slate-500' : 'border-white/15 bg-slate-900/30 text-slate-400')
                  }
                >
                  No activities yet. Plan a route on the map and track it to see your stats here.
                </div>
              ) : (
                <ul className="space-y-3">
                  {data.recentActivities.map((a) => {
                    let pois: { id: string; name: string; lat: number; lng: number }[] | null = null
                    if (a.routeSummaryJson) {
                      try {
                        const parsed = JSON.parse(a.routeSummaryJson) as { pois?: typeof pois }
                        if (parsed && Array.isArray(parsed.pois)) {
                          pois = parsed.pois
                        }
                      } catch {
                        pois = null
                      }
                    }
                    return (
                      <li key={a.id}>
                        <ActivityCard
                          activity={a}
                          isDay={isDay}
                          onRerun={() => {
                            navigate('/', {
                              state: pois ? { rerunRoute: { pois } } : undefined,
                            })
                          }}
                        />
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  )
}
