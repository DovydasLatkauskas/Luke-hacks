export default function App() {
  return (
    <div className="min-h-dvh bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-4xl px-6 py-14">
        <div className="inline-flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900/40 px-3 py-1 text-xs text-slate-300">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Tailwind is working
        </div>

        <h1 className="mt-6 text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
          PaceRoute
        </h1>
        <p className="mt-4 max-w-2xl text-pretty text-base leading-7 text-slate-300">
          React + Tailwind frontend scaffolded in <code>frontend/</code>.
        </p>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-5">
            <div className="text-sm font-medium text-slate-200">Next step</div>
            <div className="mt-1 text-sm text-slate-300">
              Start building your map + route planner UI in <code>src/</code>.
            </div>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-5">
            <div className="text-sm font-medium text-slate-200">Dev server</div>
            <div className="mt-1 text-sm text-slate-300">
              Run <code>npm run dev</code> inside <code>frontend/</code>.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

