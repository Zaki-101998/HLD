import { useState } from 'react'
import MarkdownContent from '../MarkdownContent.jsx'

export default function DesignExercise({ topicId, challenge, progress }) {
  const key = `${topicId}:${challenge.id}`
  const [revealed, setRevealed] = useState(false)
  const done = !!progress.challenges[key]
  const draft = progress.drafts[key] ?? ''

  return (
    <div className="space-y-4">
      <MarkdownContent>{challenge.prompt}</MarkdownContent>

      {challenge.hints?.length > 0 && (
        <div className="space-y-2">
          {challenge.hints.map((hint, i) => (
            <details
              key={i}
              className="group rounded-lg border border-ink-700 bg-ink-900 px-4 py-2"
            >
              <summary className="cursor-pointer select-none text-sm font-medium text-amber-300/90">
                💡 Hint {i + 1}
              </summary>
              <div className="pt-1 text-sm text-slate-300">{hint}</div>
            </details>
          ))}
        </div>
      )}

      <div>
        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
          Your design (sketch it in words before peeking — saved automatically)
        </label>
        <textarea
          value={draft}
          onChange={(e) => progress.saveDraft(topicId, challenge.id, e.target.value)}
          rows={8}
          placeholder={'1. Requirements & scale...\n2. API...\n3. Data model...\n4. High-level components...\n5. Bottlenecks & deep dives...'}
          className="w-full rounded-xl border border-ink-700 bg-ink-900 p-3 font-mono text-sm text-slate-200 placeholder:text-slate-600 focus:border-accent-500 focus:outline-none"
        />
      </div>

      {!revealed ? (
        <button
          onClick={() => setRevealed(true)}
          className="rounded-lg border border-accent-500/60 bg-accent-600/10 px-4 py-2 text-sm font-medium text-accent-300 hover:bg-accent-600/20"
        >
          🔍 Reveal model answer
        </button>
      ) : (
        <div className="rounded-xl border border-accent-500/40 bg-ink-900 p-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-accent-400">
            Model answer
          </p>
          <MarkdownContent>{challenge.modelAnswer}</MarkdownContent>
        </div>
      )}

      <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
        <input
          type="checkbox"
          checked={done}
          onChange={(e) => progress.markChallengeDone(topicId, challenge.id, e.target.checked)}
          className="h-4 w-4 accent-emerald-500"
        />
        I attempted this and compared with the model answer
      </label>
    </div>
  )
}
