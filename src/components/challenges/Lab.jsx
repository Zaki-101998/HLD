import MarkdownContent from '../MarkdownContent.jsx'

export default function Lab({ topicId, challenge, progress }) {
  const key = `${topicId}:${challenge.id}`
  const stepsKey = `${key}:steps`
  let checked = []
  try {
    checked = JSON.parse(progress.drafts[stepsKey] || '[]')
  } catch {
    checked = []
  }

  const toggleStep = (i) => {
    const next = checked.includes(i) ? checked.filter((x) => x !== i) : [...checked, i]
    progress.saveDraft(topicId, `${challenge.id}:steps`, JSON.stringify(next))
    progress.markChallengeDone(topicId, challenge.id, next.length === challenge.steps.length)
  }

  return (
    <div className="space-y-4">
      {challenge.intro && <MarkdownContent>{challenge.intro}</MarkdownContent>}

      <ol className="space-y-3">
        {challenge.steps.map((step, i) => {
          const isDone = checked.includes(i)
          return (
            <li
              key={i}
              className={`rounded-xl border p-4 transition ${
                isDone ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-ink-700 bg-ink-900'
              }`}
            >
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={isDone}
                  onChange={() => toggleStep(i)}
                  className="mt-1 h-4 w-4 shrink-0 accent-emerald-500"
                />
                <div className="min-w-0 flex-1">
                  <span className={`text-sm ${isDone ? 'text-slate-400' : 'text-slate-200'}`}>
                    <span className="mr-1 font-semibold text-accent-400">Step {i + 1}.</span>
                    {step.instruction}
                  </span>
                  {step.command && (
                    <pre className="mt-2 overflow-x-auto rounded-lg border border-ink-700 bg-[#0a0f1c] px-3 py-2 text-xs text-sky-200">
                      <code>{step.command}</code>
                    </pre>
                  )}
                  {step.expected && (
                    <p className="mt-2 text-xs text-slate-500">
                      <span className="font-semibold text-slate-400">What to look for: </span>
                      {step.expected}
                    </p>
                  )}
                </div>
              </label>
            </li>
          )
        })}
      </ol>

      <p className="text-sm text-slate-400">
        {checked.length === challenge.steps.length
          ? '✅ Lab complete!'
          : `${checked.length}/${challenge.steps.length} steps done`}
      </p>
    </div>
  )
}
