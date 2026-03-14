import { useMemo, useState } from 'react'
import type { Mode } from '../App'

type Msg = { role: 'user' | 'assistant'; text: string }

type Props = {
  mode: Mode
}

export function ChatDock({ mode }: Props) {
  const [text, setText] = useState('')
  const [msgs, setMsgs] = useState<Msg[]>([
    {
      role: 'assistant',
      text: 'Tell me what you want to do: “easy 5k coffee loop” or “night bar hop near old town”.',
    },
  ])

  const canSend = useMemo(() => text.trim().length > 0, [text])

  return (
    <div className="pointer-events-none absolute bottom-4 left-4 z-10">
      <div
        className={[
          'glass pointer-events-auto flex h-[80dvh] w-[min(440px,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl border shadow-[0_24px_90px_rgba(0,0,0,0.55)] ring-1',
          mode === 'day'
            ? 'border-slate-900/10 bg-white/80 text-slate-900 ring-white/40'
            : 'border-white/10 bg-slate-950/35 text-slate-100 ring-white/5',
        ].join(' ')}
      >
        <div
          className={[
            'flex items-center justify-between gap-3 border-b px-4 py-3',
            mode === 'day' ? 'border-slate-900/10' : 'border-white/10',
          ].join(' ')}
        >
          <div>
            <div className="text-sm font-semibold">Route chat</div>
            <div className="text-xs opacity-80">
              Iteratively suggest waypoints → you pick → route updates
            </div>
          </div>
          <div className="text-xs opacity-70">
            {mode === 'day' ? 'Day' : 'Night'}
          </div>
        </div>

        <div className="flex-1 space-y-3 overflow-auto px-4 py-4">
          {msgs.map((m, idx) => (
            <div
              key={idx}
              className={[
                'max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-6',
                m.role === 'user'
                  ? mode === 'day'
                    ? 'ml-auto bg-emerald-500/10 text-emerald-900 ring-1 ring-emerald-400/40'
                    : 'ml-auto bg-emerald-400/15 text-emerald-50 ring-1 ring-emerald-300/15'
                  : mode === 'day'
                    ? 'bg-slate-900/5 text-slate-900 ring-1 ring-slate-900/10'
                    : 'bg-white/10 text-slate-100 ring-1 ring-white/10',
              ].join(' ')}
            >
              {m.text}
            </div>
          ))}
        </div>

        <form
          className={['border-t p-3', mode === 'day' ? 'border-slate-900/10' : 'border-white/10'].join(
            ' ',
          )}
          onSubmit={(e) => {
            e.preventDefault()
            const trimmed = text.trim()
            if (!trimmed) return

            setMsgs((prev) => [
              ...prev,
              { role: 'user', text: trimmed },
              {
                role: 'assistant',
                text: 'Nice — next I’ll suggest a few candidate waypoints near you (stub).',
              },
            ])
            setText('')
          }}
        >
          <div className="flex items-end gap-2">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={2}
              placeholder='Try: "Add 2 cafes and avoid hills"'
              className={[
                'max-h-28 flex-1 resize-none rounded-2xl border px-3 py-2 text-sm outline-none placeholder:opacity-60 focus:border-emerald-300/50 focus:ring-2 focus:ring-emerald-300/15',
                mode === 'day'
                  ? 'border-slate-900/15 bg-white/80 text-slate-900'
                  : 'border-white/10 bg-slate-950/30 text-slate-100',
              ].join(' ')}
            />
            <button
              type="submit"
              disabled={!canSend}
              className="rounded-2xl bg-emerald-400/90 px-4 py-2 text-sm font-semibold text-slate-950 shadow-sm transition enabled:hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Send
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

