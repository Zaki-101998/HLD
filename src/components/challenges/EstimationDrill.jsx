import { useState } from 'react'
import MarkdownContent from '../MarkdownContent.jsx'

function humanize(n) {
  if (!isFinite(n)) return ''
  const abs = Math.abs(n)
  const units = [
    [1e12, 'trillion'],
    [1e9, 'billion'],
    [1e6, 'million'],
    [1e3, 'thousand'],
  ]
  for (const [size, name] of units) {
    if (abs >= size) return `≈ ${(n / size).toPrecision(3)} ${name}`
  }
  return ''
}

function safeEval(expr) {
  // Numbers-and-operators calculator: digits, ., e/E notation, + - * / % ( ) ^ and spaces
  if (!/^[\d.\seE+\-*/%()^]*$/.test(expr) || !expr.trim()) return null
  try {
    // eslint-disable-next-line no-new-func
    const val = Function(`"use strict"; return (${expr.replace(/\^/g, '**')})`)()
    return typeof val === 'number' && isFinite(val) ? val : null
  } catch {
    return null
  }
}

export default function EstimationDrill({ topicId, challenge, progress }) {
  const key = `${topicId}:${challenge.id}`
  const [revealed, setRevealed] = useState(false)
  const [calc, setCalc] = useState('')
  const done = !!progress.challenges[key]
  const draft = progress.drafts[key] ?? ''
  const result = safeEval(calc)

  return (
    <div className="space-y-4">
      <MarkdownContent>{challenge.problem}</MarkdownContent>

      {challenge.hints?.length > 0 && (
        <div className="space-y-2">
          {challenge.hints.map((hint, i) => (
            <details key={i} className="rounded-lg border border-ink-700 bg-ink-900 px-4 py-2">
              <summary className="cursor-pointer select-none text-sm font-medium text-amber-300/90">
                💡 Hint {i + 1}
              </summary>
              <div className="pt-1 text-sm text-slate-300">{hint}</div>
            </details>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-ink-700 bg-ink-900 p-4">
        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
          🧮 Scratch calculator (e.g. <code className="text-sky-300">500e6 * 20 / 86400</code>)
        </label>
        <input
          value={calc}
          onChange={(e) => setCalc(e.target.value)}
          placeholder="Type an expression…"
          className="w-full rounded-lg border border-ink-700 bg-[#0a0f1c] px-3 py-2 font-mono text-sm text-slate-200 placeholder:text-slate-600 focus:border-accent-500 focus:outline-none"
        />
        {result !== null && (
          <p className="mt-2 font-mono text-sm text-emerald-300">
            = {result.toLocaleString('en-US', { maximumFractionDigits: 4 })}
            <span className="ml-2 text-slate-400">{humanize(result)}</span>
          </p>
        )}
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
          Your working (saved automatically)
        </label>
        <textarea
          value={draft}
          onChange={(e) => progress.saveDraft(topicId, challenge.id, e.target.value)}
          rows={5}
          placeholder="Write down assumptions and steps like you would on a whiteboard…"
          className="w-full rounded-xl border border-ink-700 bg-ink-900 p-3 font-mono text-sm text-slate-200 placeholder:text-slate-600 focus:border-accent-500 focus:outline-none"
        />
      </div>

      {!revealed ? (
        <button
          onClick={() => setRevealed(true)}
          className="rounded-lg border border-accent-500/60 bg-accent-600/10 px-4 py-2 text-sm font-medium text-accent-300 hover:bg-accent-600/20"
        >
          🔍 Reveal worked solution
        </button>
      ) : (
        <div className="rounded-xl border border-accent-500/40 bg-ink-900 p-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-accent-400">
            Worked solution
          </p>
          <MarkdownContent>{challenge.solution}</MarkdownContent>
        </div>
      )}

      <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
        <input
          type="checkbox"
          checked={done}
          onChange={(e) => progress.markChallengeDone(topicId, challenge.id, e.target.checked)}
          className="h-4 w-4 accent-emerald-500"
        />
        I worked through this and checked the solution
      </label>
    </div>
  )
}
