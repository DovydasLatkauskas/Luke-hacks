import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthProvider'
import type { Mode } from '../App'

type AuthMode = 'login' | 'register'

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

export function AuthPage({ mode, onToggleMode }: { mode: Mode; onToggleMode: () => void }) {
  const { login, register } = useAuth()
  const [authMode, setAuthMode] = useState<AuthMode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isDay = mode === 'day'
  const heading = authMode === 'login' ? 'Welcome back' : 'Create your account'
  const cta = authMode === 'login' ? 'Sign in' : 'Create account'

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (!isEmail(email)) {
      setError('Enter a valid email address.')
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.')
      return
    }

    if (authMode === 'register' && password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setSubmitting(true)
    try {
      if (authMode === 'login') {
        await login(email, password)
      } else {
        await register(email, password)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-8 text-slate-100"
    >
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div
          className="h-full w-full bg-cover bg-center"
          style={{
            backgroundImage: 'url(\"https://tile.openstreetmap.org/5/15/10.png\")',
          }}
        />
        <div
          className={
            'absolute inset-0 ' +
            (isDay ? 'bg-sky-500/25 mix-blend-multiply' : 'bg-slate-950/70')
          }
        />
      </div>
      <div
        className={
          'glass w-full max-w-md rounded-3xl border p-6 shadow-[0_24px_90px_rgba(0,0,0,0.55)] sm:p-8 ' +
          (isDay ? 'border-white/40 bg-white/15 text-slate-900' : 'border-white/20 bg-slate-900/35')
        }
      >
        <div className="mb-6 flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] opacity-60">PaceRoute</div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">{heading}</h1>
          </div>
          <button
            type="button"
            onClick={onToggleMode}
            className={
              'rounded-xl border p-2 text-sm transition ' +
              (isDay
                ? 'border-slate-900/20 bg-slate-900/10 text-slate-700 hover:bg-slate-900/20'
                : 'border-white/10 bg-slate-950/40 text-slate-100 hover:bg-slate-950/60')
            }
            aria-label="Toggle day/night mode"
          >
            {isDay ? '☾' : '☼'}
          </button>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={
                'w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition ' +
                (isDay
                  ? 'border-slate-900/15 bg-white/85 focus:border-emerald-500/70'
                  : 'border-white/15 bg-slate-950/60 focus:border-emerald-400/70')
              }
              placeholder="you@example.com"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Password</span>
            <input
              type="password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={
                'w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition ' +
                (isDay
                  ? 'border-slate-900/15 bg-white/85 focus:border-emerald-500/70'
                  : 'border-white/15 bg-slate-950/60 focus:border-emerald-400/70')
              }
              placeholder="At least 8 characters"
            />
          </label>

          {authMode === 'register' && (
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Confirm password</span>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className={
                  'w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition ' +
                  (isDay
                    ? 'border-slate-900/15 bg-white/85 focus:border-emerald-500/70'
                    : 'border-white/15 bg-slate-950/60 focus:border-emerald-400/70')
                }
                placeholder="Repeat password"
              />
            </label>
          )}

          {error && (
            <div
              className={
                'rounded-xl border px-3 py-2 text-sm ' +
                (isDay
                  ? 'border-red-500/30 bg-red-500/10 text-red-700'
                  : 'border-red-400/30 bg-red-500/15 text-red-200')
              }
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className={
              'w-full rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-70 ' +
              (isDay
                ? 'bg-emerald-500/90 text-white hover:bg-emerald-500'
                : 'bg-emerald-400/90 text-slate-950 hover:bg-emerald-400')
            }
          >
            {submitting ? 'Please wait...' : cta}
          </button>
        </form>

        <div className="mt-4 text-sm opacity-80">
          {authMode === 'login' ? 'No account yet?' : 'Already have an account?'}{' '}
          <button
            type="button"
            onClick={() => {
              setAuthMode((prev) => (prev === 'login' ? 'register' : 'login'))
              setError(null)
            }}
            className={
              'font-semibold underline-offset-4 hover:underline ' +
              (isDay ? 'text-emerald-700' : 'text-emerald-300')
            }
          >
            {authMode === 'login' ? 'Create one' : 'Sign in'}
          </button>
        </div>
      </div>
    </div>
  )
}
