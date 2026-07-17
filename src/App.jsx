import { useMemo, useState } from 'react'
import { phases, allTopics } from './data/roadmap.js'
import { computeSchedule, todayISO } from './lib/schedule.js'
import { useProgress } from './hooks/useProgress.js'
import RoadmapView from './components/RoadmapView.jsx'
import TopicPage from './components/TopicPage.jsx'
import Dashboard from './components/Dashboard.jsx'

function WelcomeModal({ onStart }) {
  const [date, setDate] = useState(todayISO())
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-ink-600 bg-ink-850 p-7 shadow-2xl">
        <p className="text-3xl">🗺️</p>
        <h1 className="mt-3 text-xl font-bold text-slate-50">
          Welcome to your HLD interview roadmap
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          A ~4 month journey from networking &amp; OS fundamentals to acing system design
          interviews — built for ~1 hour a day, 6 days a week (Sundays off). Every topic has
          teaching content, curated resources, and practical challenges.
        </p>
        <label className="mt-5 block text-sm font-medium text-slate-300">
          When do you want to start?
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-2 w-full rounded-lg border border-ink-600 bg-ink-900 px-3 py-2 text-slate-200 focus:border-accent-500 focus:outline-none"
          />
        </label>
        <button
          onClick={() => onStart(date)}
          className="mt-5 w-full rounded-xl bg-accent-600 px-4 py-3 font-semibold text-white transition hover:bg-accent-500"
        >
          🚀 Start the journey
        </button>
      </div>
    </div>
  )
}

export default function App() {
  const progress = useProgress()
  const [view, setView] = useState({ name: 'roadmap' })

  const schedule = useMemo(
    () => computeSchedule(phases, progress.startDate),
    [progress.startDate],
  )

  const openTopic = (topicId) => setView({ name: 'topic', topicId })

  const topicIndex = view.name === 'topic' ? allTopics.findIndex((t) => t.id === view.topicId) : -1
  const topic = topicIndex >= 0 ? allTopics[topicIndex] : null
  const topicPhase = topic ? phases.find((p) => p.topics.some((t) => t.id === topic.id)) : null

  const doneCount = allTopics.filter((t) => progress.completed[t.id]).length

  return (
    <div className="min-h-screen">
      {!progress.startDate && <WelcomeModal onStart={progress.setStartDate} />}

      <header className="sticky top-0 z-20 border-b border-ink-700 bg-ink-950/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-4 px-4">
          <button
            onClick={() => setView({ name: 'roadmap' })}
            className="flex items-center gap-2 font-bold text-slate-100"
          >
            🗺️ <span className="hidden sm:inline">HLD Roadmap</span>
          </button>
          <nav className="flex gap-1">
            {[
              { id: 'roadmap', label: 'Roadmap' },
              { id: 'dashboard', label: 'Dashboard' },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setView({ name: t.id })}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  view.name === t.id
                    ? 'bg-accent-600 text-white'
                    : 'text-slate-400 hover:bg-ink-800 hover:text-slate-200'
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm text-slate-400">
            {progress.streak > 0 && <span title="Day streak">🔥 {progress.streak}</span>}
            <span className="rounded-full bg-ink-800 px-3 py-1 text-xs">
              {doneCount}/{allTopics.length}
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 pt-8">
        {view.name === 'roadmap' && (
          <RoadmapView
            phases={phases}
            schedule={schedule}
            progress={progress}
            onOpenTopic={openTopic}
          />
        )}
        {view.name === 'dashboard' && (
          <Dashboard
            phases={phases}
            schedule={schedule}
            progress={progress}
            onOpenTopic={openTopic}
          />
        )}
        {view.name === 'topic' && topic && (
          <TopicPage
            topic={topic}
            phase={topicPhase}
            dates={schedule[topic.id]}
            progress={progress}
            onBack={() => setView({ name: 'roadmap' })}
            prevTopic={allTopics[topicIndex - 1]}
            nextTopic={allTopics[topicIndex + 1]}
            onOpenTopic={openTopic}
          />
        )}
      </main>
    </div>
  )
}
