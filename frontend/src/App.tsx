import { useState } from 'react'
import { ChatDock } from './components/ChatDock'
import { MapView } from './components/MapView'

export type Mode = 'day' | 'night'

export default function App() {
  const [mode, setMode] = useState<Mode>('day')

  const toggleMode = () => {
    setMode((prev) => (prev === 'day' ? 'night' : 'day'))
  }

  return (
    <div
      className={
        'h-dvh w-screen overflow-hidden transition-colors duration-300 ' +
        (mode === 'day' ? 'bg-slate-50 text-slate-900' : 'bg-slate-950 text-slate-100')
      }
    >
      <div className="relative h-full w-full">
        <MapView mode={mode} />
        <ChatDock mode={mode} />

        <button
          type="button"
          onClick={toggleMode}
          className="glass absolute right-4 top-4 z-20 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-slate-950/40 text-xs text-slate-100 shadow-[0_12px_40px_rgba(0,0,0,0.45)] ring-1 ring-white/10"
          aria-label="Toggle day/night mode"
        >
          {mode === 'day' ? '☾' : '☼'}
        </button>
      </div>
    </div>
  )
}

