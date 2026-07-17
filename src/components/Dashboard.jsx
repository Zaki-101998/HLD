import { useRef } from 'react'
import { formatDateLong, paceStatus, todayISO } from '../lib/schedule.js'

function Stat({ label, value, sub, tone = 'default' }) {
  const tones = {
    default: 'text-slate-100',
    good: 'text-emerald-300',
    warn: 'text-amber-300',
    bad: 'text-rose-300',
  }
  return (
    <div className="rounded-2xl border border-ink-700 bg-ink-850 p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${tones[tone]}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-400">{sub}</p>}
    </div>
  )
}

export default function Dashboard({ phases, schedule, progress, onOpenTopic }) {
  const fileRef = useRef(null)
  const flat = phases.flatMap((p) => p.topics)

  const exportData = () => {
    const data = progress.exportSnapshot()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `hld-progress-${todayISO()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file
    if (!file) return
    try {
      const data = JSON.parse(await file.text())
      const isPlainObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v)
      const ok =
        isPlainObject(data) &&
        ['completed', 'challenges', 'notes', 'customResources', 'drafts'].every(
          (k) => data[k] === undefined || isPlainObject(data[k]),
        ) &&
        (data.activity === undefined || Array.isArray(data.activity))
      if (!ok) throw new Error('invalid shape')
      if (confirm('Replace ALL current progress with the imported file? This cannot be undone.'))
        progress.importState(data)
    } catch {
      alert('Could not import: not a valid progress file.')
    }
  }
  const doneCount = flat.filter((t) => progress.completed[t.id]).length
  const pct = Math.round((doneCount / flat.length) * 100)
  const nextTopic = flat.find((t) => !progress.completed[t.id])
  const lastTopic = flat[flat.length - 1]
  const finishDate = schedule[lastTopic?.id]?.end

  const pace = progress.startDate ? paceStatus(phases, schedule, progress.completed) : null
  const paceTone = pace ? (pace.delta >= 0 ? 'good' : pace.delta >= -2 ? 'warn' : 'bad') : 'default'
  const paceText = pace
    ? pace.delta > 0
      ? `${pace.delta} ahead 🚀`
      : pace.delta === 0
        ? 'On track ✅'
        : `${-pace.delta} behind`
    : '—'

  const quizEntries = Object.values(progress.quizScores)
  const quizPct = quizEntries.length
    ? Math.round(
        (quizEntries.reduce((a, s) => a + s.score, 0) /
          quizEntries.reduce((a, s) => a + s.total, 0)) *
          100,
      )
    : null

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-20">
      <div className="rounded-2xl border border-ink-700 bg-ink-850 p-6">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-100">Overall progress</h2>
            <p className="text-sm text-slate-400">
              {doneCount} of {flat.length} topics complete
            </p>
          </div>
          <p className="text-4xl font-extrabold text-accent-300">{pct}%</p>
        </div>
        <div className="mt-4 h-3 overflow-hidden rounded-full bg-ink-800">
          <div
            className="h-full rounded-full bg-gradient-to-r from-accent-600 via-accent-400 to-emerald-500 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        {nextTopic && (
          <button
            onClick={() => onOpenTopic(nextTopic.id)}
            className="mt-5 w-full rounded-xl bg-accent-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-accent-500"
          >
            ▶ Continue: {nextTopic.title}
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat
          label="Streak"
          value={`${progress.streak}🔥`}
          sub={progress.streak > 0 ? 'consecutive days' : 'study today to start one'}
        />
        <Stat label="Pace" value={paceText} tone={paceTone} sub="topics vs schedule" />
        <Stat
          label="Quiz average"
          value={quizPct !== null ? `${quizPct}%` : '—'}
          tone={quizPct === null ? 'default' : quizPct >= 80 ? 'good' : quizPct >= 60 ? 'warn' : 'bad'}
          sub={`${quizEntries.length} quizzes taken`}
        />
        <Stat
          label="Target finish"
          value={finishDate ? formatDateLong(finishDate).replace(/^\w+, /, '') : '—'}
          sub={progress.startDate ? `started ${progress.startDate}` : 'set a start date'}
        />
      </div>

      <div className="rounded-2xl border border-ink-700 bg-ink-850 p-6">
        <h3 className="mb-4 font-bold text-slate-100">Progress by phase</h3>
        <div className="space-y-4">
          {phases.map((phase) => {
            const done = phase.topics.filter((t) => progress.completed[t.id]).length
            const phasePct = Math.round((done / phase.topics.length) * 100)
            return (
              <div key={phase.id}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="text-slate-300">
                    {phase.emoji} {phase.title}
                  </span>
                  <span className="text-slate-500">
                    {done}/{phase.topics.length}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-ink-800">
                  <div
                    className="h-full rounded-full bg-accent-500 transition-all"
                    style={{ width: `${phasePct}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-ink-700 bg-ink-850 p-6">
        <h3 className="mb-3 font-bold text-slate-100">Plan settings</h3>
        <label className="block text-sm text-slate-400">
          Start date
          <input
            type="date"
            value={progress.startDate ?? todayISO()}
            onChange={(e) => progress.setStartDate(e.target.value)}
            className="ml-3 rounded-lg border border-ink-600 bg-ink-900 px-3 py-1.5 text-slate-200 focus:border-accent-500 focus:outline-none"
          />
        </label>
        <p className="mt-2 text-xs text-slate-500">
          The schedule assumes ~1 hour per study day, 6 days a week (Sundays off). Changing the
          start date recomputes every target date.
        </p>
        <button
          onClick={() => {
            if (
              confirm(
                'Reset ALL progress (topics, quiz scores, drafts, notes, your resources)? This cannot be undone.',
              )
            )
              progress.resetAll()
          }}
          className="mt-4 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-300 transition hover:bg-rose-500/20"
        >
          Reset all progress
        </button>
      </div>

      <div className="rounded-2xl border border-ink-700 bg-ink-850 p-6">
        <h3 className="mb-3 font-bold text-slate-100">Backup</h3>
        <p className="text-xs text-slate-500">
          Everything (progress, quiz scores, drafts, notes, your resources) lives in this
          browser only. Export a JSON file to back it up or move it to another device, then
          import it there.
        </p>
        <div className="mt-4 flex gap-2">
          <button
            onClick={exportData}
            className="rounded-lg border border-ink-600 bg-ink-800 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-ink-700"
          >
            ⬇️ Export data
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className="rounded-lg border border-ink-600 bg-ink-800 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-ink-700"
          >
            ⬆️ Import data
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            onChange={handleImport}
            className="hidden"
          />
        </div>
      </div>
    </div>
  )
}
