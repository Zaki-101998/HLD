import { formatDate } from '../lib/schedule.js'

function TopicNode({ topic, phase, status, dates, quizAvg, onOpen }) {
  const statusStyles = {
    done: 'border-emerald-500/50 bg-emerald-500/5',
    current: 'border-accent-500 bg-accent-600/10 shadow-lg shadow-accent-600/10',
    upcoming: 'border-ink-700 bg-ink-900 opacity-75 hover:opacity-100',
  }
  const icon = status === 'done' ? '✅' : status === 'current' ? '▶️' : '🔒'

  return (
    <button
      onClick={() => onOpen(topic.id)}
      className={`group w-full rounded-xl border p-4 text-left transition hover:border-accent-400 ${statusStyles[status]}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-semibold text-slate-100">
            <span className="text-sm">{icon}</span>
            {topic.title}
            {status === 'current' && (
              <span className="rounded-full bg-accent-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                You are here
              </span>
            )}
          </p>
          <p className="mt-0.5 truncate text-sm text-slate-400">{topic.subtitle}</p>
        </div>
        <div className="shrink-0 text-right text-xs text-slate-400">
          <p className="rounded-full bg-ink-800 px-2.5 py-1 font-medium">
            {topic.days} day{topic.days > 1 ? 's' : ''}
          </p>
          {dates && (
            <p className="mt-1.5 text-slate-500">
              {formatDate(dates.start)}
              {topic.days > 1 ? ` – ${formatDate(dates.end)}` : ''}
            </p>
          )}
        </div>
      </div>
      <div className="mt-2 flex items-center gap-3 text-xs text-slate-500">
        <span>
          {topic.challenges.length} challenge{topic.challenges.length !== 1 ? 's' : ''}
        </span>
        {quizAvg !== null && <span className="text-accent-300">quiz {quizAvg}</span>}
        {status === 'upcoming' && (
          <span className="ml-auto opacity-0 transition group-hover:opacity-100">
            skip ahead →
          </span>
        )}
      </div>
    </button>
  )
}

export default function RoadmapView({ phases, schedule, progress, onOpenTopic }) {
  // Current topic = first not-completed in roadmap order
  const flat = phases.flatMap((p) => p.topics)
  const currentId = flat.find((t) => !progress.completed[t.id])?.id

  let reachedCurrent = false
  return (
    <div className="mx-auto max-w-3xl space-y-10 pb-20">
      {phases.map((phase) => {
        const doneCount = phase.topics.filter((t) => progress.completed[t.id]).length
        return (
          <section key={phase.id}>
            <div className="mb-4 flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-ink-800 text-xl">
                {phase.emoji}
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-bold text-slate-100">
                  Phase {phase.number} · {phase.title}
                </h2>
                <p className="text-sm text-slate-400">
                  {phase.tagline} · {phase.weeks}
                </p>
              </div>
              <span className="shrink-0 text-sm text-slate-400">
                {doneCount}/{phase.topics.length}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-ink-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-accent-600 to-emerald-500 transition-all"
                style={{ width: `${(doneCount / phase.topics.length) * 100}%` }}
              />
            </div>
            <div className="mt-4 space-y-3 border-l-2 border-ink-700 pl-4 sm:pl-6">
              {phase.topics.map((topic) => {
                let status
                if (progress.completed[topic.id]) status = 'done'
                else if (!reachedCurrent && topic.id === currentId) {
                  status = 'current'
                  reachedCurrent = true
                } else status = 'upcoming'

                const quizKeys = topic.challenges
                  .filter((c) => c.type === 'quiz')
                  .map((c) => `${topic.id}:${c.id}`)
                const scores = quizKeys
                  .map((k) => progress.quizScores[k])
                  .filter(Boolean)
                const quizAvg = scores.length
                  ? `${scores.reduce((a, s) => a + s.score, 0)}/${scores.reduce((a, s) => a + s.total, 0)}`
                  : null

                return (
                  <TopicNode
                    key={topic.id}
                    topic={topic}
                    phase={phase}
                    status={status}
                    dates={schedule[topic.id]}
                    quizAvg={quizAvg}
                    onOpen={onOpenTopic}
                  />
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}
