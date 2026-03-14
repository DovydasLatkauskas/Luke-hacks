import { Link } from 'react-router-dom'
import type { Mode } from '../App'

type Props = { mode: Mode; onToggleMode?: () => void }

const MOCK_ROUTES = [
  { id: '1', name: 'Morning 5k coffee loop', date: '2 days ago', distance: '5.2 km', duration: '28 min', elevation: '42 m' },
  { id: '2', name: 'Riverside long run', date: '5 days ago', distance: '12.1 km', duration: '1h 04', elevation: '89 m' },
  { id: '3', name: 'Old town bar hop', date: '1 week ago', distance: '3.8 km', duration: '—', elevation: '18 m' },
]

const MOCK_TOP_PLACES = [
  { name: 'The Grind Coffee', visits: 12, type: 'cafe' },
  { name: 'Riverside Park', visits: 9, type: 'park' },
  { name: 'Old Town Square', visits: 7, type: 'landmark' },
  { name: 'Harbour View', visits: 6, type: 'viewpoint' },
]

export function Dashboard({ mode, onToggleMode }: Props) {
  const isDay = mode === 'day'

  return (
    <div
      className={
        'min-h-dvh transition-colors duration-300 ' +
        (isDay ? 'bg-slate-50 text-slate-900' : 'bg-slate-950 text-slate-100')
      }
    >
      <header
        className={
          'glass sticky top-0 z-10 border-b ' +
          (isDay ? 'border-slate-900/10 bg-white/60' : 'border-white/10 bg-slate-950/60')
        }
      >
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-4">
          <h1 className="text-xl font-bold tracking-tight">PaceRoute</h1>
          <div className="flex items-center gap-2">
            {onToggleMode && (
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
            )}
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

      <main className="mx-auto max-w-4xl px-4 py-8">
        <section className="mb-10">
          <h2
            className={
              'mb-4 text-sm font-semibold uppercase tracking-wider ' +
              (isDay ? 'text-slate-500' : 'text-slate-400')
            }
          >
            Past routes
          </h2>
          <ul className="space-y-3">
            {MOCK_ROUTES.map((route) => (
              <li
                key={route.id}
                className={
                  'glass rounded-2xl border p-4 transition ' +
                  (isDay
                    ? 'border-slate-900/10 bg-white/50 hover:bg-white/70'
                    : 'border-white/10 bg-slate-900/40 hover:bg-slate-900/60')
                }
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">{route.name}</div>
                    <div className={`mt-1 text-xs ${isDay ? 'text-slate-500' : 'text-slate-400'}`}>
                      {route.date} · {route.distance} · {route.duration}
                      {route.elevation && ` · ${route.elevation} elev`}
                    </div>
                  </div>
                  <button
                    type="button"
                    className={
                      'rounded-lg px-3 py-1.5 text-xs font-medium ' +
                      (isDay
                        ? 'bg-slate-900/10 text-slate-700 hover:bg-slate-900/20'
                        : 'bg-white/10 text-slate-300 hover:bg-white/20')
                    }
                  >
                    View
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2
            className={
              'mb-4 text-sm font-semibold uppercase tracking-wider ' +
              (isDay ? 'text-slate-500' : 'text-slate-400')
            }
          >
            Top visited places
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {MOCK_TOP_PLACES.map((place, i) => (
              <li
                key={place.name}
                className={
                  'glass flex items-center gap-4 rounded-2xl border p-4 ' +
                  (isDay
                    ? 'border-slate-900/10 bg-white/50'
                    : 'border-white/10 bg-slate-900/40')
                }
              >
                <span
                  className={
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg font-bold ' +
                    (isDay ? 'bg-emerald-500/20 text-emerald-700' : 'bg-emerald-400/20 text-emerald-200')
                  }
                >
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{place.name}</div>
                  <div className={`text-xs ${isDay ? 'text-slate-500' : 'text-slate-400'}`}>
                    {place.visits} visits · {place.type}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  )
}
