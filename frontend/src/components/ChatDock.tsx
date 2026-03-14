import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Mode } from '../App'

type Props = {
  mode: Mode
}

type Message = {
  id: number
  role: 'user' | 'assistant'
  text: string
}

export function ChatDock({ mode }: Props) {
  const [hover, setHover] = useState(false)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 0,
      role: 'assistant',
      text: 'Hey! Tell me what kind of route you want and I\'ll plan it for you. Try "easy 5k coffee loop" or "pub crawl along the river".',
    },
  ])

  const isDay = mode === 'day'
  let nextId = messages.length

  const handleSend = () => {
    const trimmed = input.trim()
    if (!trimmed) return
    const userMsg: Message = { id: nextId++, role: 'user', text: trimmed }
    const botMsg: Message = {
      id: nextId++,
      role: 'assistant',
      text: 'Route generation coming soon! For now, add stops from the map markers.',
    }
    setMessages((prev) => [...prev, userMsg, botMsg])
    setInput('')
  }

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
          <div>
            <div className="text-sm font-semibold">Route assistant</div>
            <div className="text-[10px] opacity-50">Ask me to plan your route</div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-auto px-3 py-3">
          <div className="space-y-3">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={[
                  'max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed',
                  msg.role === 'user'
                    ? 'ml-auto ' + (isDay ? 'bg-emerald-500/20 text-emerald-900' : 'bg-emerald-400/20 text-emerald-100')
                    : isDay ? 'bg-slate-200/50 text-slate-700' : 'bg-white/5 text-slate-300',
                ].join(' ')}
              >
                {msg.text}
              </div>
            ))}
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
              placeholder="Plan my route..."
              className={[
                'flex-1 rounded-xl border-0 bg-transparent px-3 py-2 text-xs outline-none ring-1 transition placeholder:opacity-40',
                isDay
                  ? 'ring-slate-300/50 focus:ring-emerald-500/50'
                  : 'ring-white/10 focus:ring-emerald-400/40',
              ].join(' ')}
            />
            <button
              type="submit"
              className={[
                'shrink-0 rounded-xl px-3 py-2 text-xs font-semibold transition',
                isDay
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

