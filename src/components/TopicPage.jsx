import { useEffect, useState } from 'react'
import MarkdownContent from './MarkdownContent.jsx'
import Quiz from './challenges/Quiz.jsx'
import DesignExercise from './challenges/DesignExercise.jsx'
import Lab from './challenges/Lab.jsx'
import EstimationDrill from './challenges/EstimationDrill.jsx'
import { formatDateLong } from '../lib/schedule.js'

const CHALLENGE_META = {
  quiz: { label: 'Quiz', icon: '❓' },
  design: { label: 'Design exercise', icon: '📐' },
  lab: { label: 'Hands-on lab', icon: '🧪' },
  estimation: { label: 'Estimation drill', icon: '🧮' },
}

const RESOURCE_ICONS = { video: '▶️', article: '📄', doc: '📚', interactive: '🕹️' }

function AddResourceForm({ onAdd }) {
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [type, setType] = useState('article')

  const submit = (e) => {
    e.preventDefault()
    const t = title.trim()
    let u = url.trim()
    if (!t || !u) return
    if (!/^https?:\/\//i.test(u)) u = `https://${u}`
    onAdd({ title: t, url: u, type })
    setTitle('')
    setUrl('')
    setType('article')
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl border border-dashed border-ink-600 bg-ink-850 p-4"
    >
      <p className="mb-3 text-sm font-medium text-slate-300">➕ Add your own resource</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          className="flex-1 rounded-lg border border-ink-600 bg-ink-900 px-3 py-1.5 text-sm text-slate-200 placeholder:text-slate-600 focus:border-accent-500 focus:outline-none"
        />
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="URL"
          className="flex-1 rounded-lg border border-ink-600 bg-ink-900 px-3 py-1.5 text-sm text-slate-200 placeholder:text-slate-600 focus:border-accent-500 focus:outline-none"
        />
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="rounded-lg border border-ink-600 bg-ink-900 px-3 py-1.5 text-sm text-slate-200 focus:border-accent-500 focus:outline-none"
        >
          {Object.keys(RESOURCE_ICONS).map((k) => (
            <option key={k} value={k}>
              {RESOURCE_ICONS[k]} {k}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={!title.trim() || !url.trim()}
          className="rounded-lg bg-accent-600 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-accent-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Add
        </button>
      </div>
    </form>
  )
}

function ChallengeCard({ topicId, challenge, progress }) {
  const meta = CHALLENGE_META[challenge.type]
  const done = !!progress.challenges[`${topicId}:${challenge.id}`]
  const Body = { quiz: Quiz, design: DesignExercise, lab: Lab, estimation: EstimationDrill }[
    challenge.type
  ]
  return (
    <details className="group rounded-2xl border border-ink-700 bg-ink-850 open:border-ink-600">
      <summary className="flex cursor-pointer select-none items-center gap-3 p-4">
        <span className="text-xl">{meta.icon}</span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-100">{challenge.title}</p>
          <p className="text-xs uppercase tracking-wide text-slate-500">{meta.label}</p>
        </div>
        {done && (
          <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-300">
            ✓ done
          </span>
        )}
        <span className="text-slate-500 transition group-open:rotate-180">▾</span>
      </summary>
      <div className="border-t border-ink-700 p-4 sm:p-5">
        <Body topicId={topicId} challenge={challenge} progress={progress} />
      </div>
    </details>
  )
}

export default function TopicPage({
  topic,
  phase,
  dates,
  progress,
  onBack,
  prevTopic,
  nextTopic,
  onOpenTopic,
}) {
  const [tab, setTab] = useState('learn')
  const [notePreview, setNotePreview] = useState(false)
  const isDone = !!progress.completed[topic.id]
  const customResources = progress.customResources[topic.id] ?? []
  const note = progress.notes[topic.id] ?? ''

  useEffect(() => {
    setTab('learn')
    setNotePreview(false)
    window.scrollTo(0, 0)
  }, [topic.id])

  const tabs = [
    { id: 'learn', label: '📖 Learn' },
    { id: 'resources', label: `🔗 Resources (${topic.resources.length + customResources.length})` },
    { id: 'challenges', label: `🎯 Challenges (${topic.challenges.length})` },
    { id: 'notes', label: `📝 Notes${note.trim() ? ' •' : ''}` },
  ]

  return (
    <div className="mx-auto max-w-3xl pb-20">
      <button
        onClick={onBack}
        className="mb-4 text-sm text-slate-400 transition hover:text-accent-300"
      >
        ← Back to roadmap
      </button>

      <div className="rounded-2xl border border-ink-700 bg-ink-850 p-5 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-accent-400">
          {phase.emoji} Phase {phase.number} · {phase.title}
        </p>
        <h1 className="mt-1 text-2xl font-bold text-slate-50">{topic.title}</h1>
        <p className="mt-1 text-slate-400">{topic.subtitle}</p>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-400">
          <span className="rounded-full bg-ink-800 px-3 py-1">
            ⏱️ {topic.days} day{topic.days > 1 ? 's' : ''} (~{topic.days} hr total)
          </span>
          {dates && (
            <span className="rounded-full bg-ink-800 px-3 py-1">
              🗓️ {formatDateLong(dates.start)}
              {topic.days > 1 ? ` → ${formatDateLong(dates.end)}` : ''}
            </span>
          )}
          {isDone && (
            <span className="rounded-full bg-emerald-500/15 px-3 py-1 font-medium text-emerald-300">
              ✓ completed {progress.completed[topic.id]}
            </span>
          )}
        </div>
        <button
          onClick={() => progress.toggleTopicComplete(topic.id)}
          className={`mt-4 rounded-lg px-4 py-2 text-sm font-semibold transition ${
            isDone
              ? 'border border-ink-600 bg-ink-800 text-slate-300 hover:bg-ink-700'
              : 'bg-emerald-600 text-white hover:bg-emerald-500'
          }`}
        >
          {isDone ? 'Mark as not done' : '✓ Mark topic complete'}
        </button>
      </div>

      <div className="sticky top-14 z-10 -mx-1 mt-5 flex gap-1 rounded-xl border border-ink-700 bg-ink-900/95 p-1 backdrop-blur">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
              tab === t.id
                ? 'bg-accent-600 text-white'
                : 'text-slate-400 hover:bg-ink-800 hover:text-slate-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === 'learn' && (
          <div className="rounded-2xl border border-ink-700 bg-ink-850 p-5 sm:p-7">
            <MarkdownContent>{topic.content}</MarkdownContent>
          </div>
        )}

        {tab === 'resources' && (
          <div className="space-y-3">
            <p className="text-sm text-slate-400">
              Curated from well-known sources — titles/URLs are from my training knowledge, so
              if a link has moved, search the title on YouTube/Google.
            </p>
            {topic.resources.map((r, i) => (
              <a
                key={i}
                href={r.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-3 rounded-xl border border-ink-700 bg-ink-850 p-4 transition hover:border-accent-500"
              >
                <span className="text-xl">{RESOURCE_ICONS[r.type] ?? '🔗'}</span>
                <div className="min-w-0">
                  <p className="font-medium text-slate-100">{r.title}</p>
                  <p className="truncate text-xs text-slate-500">
                    {r.source ? `${r.source} · ` : ''}
                    {r.url}
                  </p>
                </div>
                <span className="ml-auto text-slate-500">↗</span>
              </a>
            ))}

            {customResources.map((r) => (
              <div
                key={r.id}
                className="flex items-center gap-3 rounded-xl border border-ink-700 bg-ink-850 p-4 transition hover:border-accent-500"
              >
                <span className="text-xl">{RESOURCE_ICONS[r.type] ?? '🔗'}</span>
                <a
                  href={r.url}
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0 flex-1"
                >
                  <p className="font-medium text-slate-100">{r.title}</p>
                  <p className="truncate text-xs text-slate-500">{r.url}</p>
                </a>
                <span className="rounded-full bg-accent-500/15 px-2 py-0.5 text-xs font-medium text-accent-300">
                  yours
                </span>
                <button
                  onClick={() => progress.removeCustomResource(topic.id, r.id)}
                  title="Remove this resource"
                  className="text-slate-500 transition hover:text-rose-300"
                >
                  ✕
                </button>
              </div>
            ))}

            <AddResourceForm onAdd={(r) => progress.addCustomResource(topic.id, r)} />
          </div>
        )}

        {tab === 'notes' && (
          <div className="rounded-2xl border border-ink-700 bg-ink-850 p-5 sm:p-7">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Your notes — saved automatically, markdown supported
              </p>
              <div className="flex gap-1 rounded-lg border border-ink-700 bg-ink-900 p-0.5">
                {[
                  { id: false, label: '✏️ Write' },
                  { id: true, label: '👁️ Preview' },
                ].map((m) => (
                  <button
                    key={m.label}
                    onClick={() => setNotePreview(m.id)}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                      notePreview === m.id
                        ? 'bg-accent-600 text-white'
                        : 'text-slate-400 hover:bg-ink-800 hover:text-slate-200'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
            {notePreview ? (
              note.trim() ? (
                <MarkdownContent>{note}</MarkdownContent>
              ) : (
                <p className="text-sm text-slate-500">Nothing to preview yet — write some notes first.</p>
              )
            ) : (
              <textarea
                value={note}
                onChange={(e) => progress.saveNote(topic.id, e.target.value)}
                rows={14}
                placeholder={`Jot down key takeaways, gotchas, or your own explanation of ${topic.title}…`}
                className="w-full rounded-xl border border-ink-700 bg-ink-900 p-3 font-mono text-sm text-slate-200 placeholder:text-slate-600 focus:border-accent-500 focus:outline-none"
              />
            )}
          </div>
        )}

        {tab === 'challenges' && (
          <div className="space-y-4">
            {topic.challenges.map((c) => (
              <ChallengeCard key={c.id} topicId={topic.id} challenge={c} progress={progress} />
            ))}
          </div>
        )}
      </div>

      <div className="mt-8 flex justify-between gap-3">
        {prevTopic ? (
          <button
            onClick={() => onOpenTopic(prevTopic.id)}
            className="max-w-[45%] truncate rounded-xl border border-ink-700 bg-ink-850 px-4 py-3 text-left text-sm text-slate-300 transition hover:border-accent-500"
          >
            ← {prevTopic.title}
          </button>
        ) : (
          <span />
        )}
        {nextTopic ? (
          <button
            onClick={() => onOpenTopic(nextTopic.id)}
            className="max-w-[45%] truncate rounded-xl border border-ink-700 bg-ink-850 px-4 py-3 text-right text-sm text-slate-300 transition hover:border-accent-500"
          >
            {nextTopic.title} →
          </button>
        ) : (
          <span />
        )}
      </div>
    </div>
  )
}
