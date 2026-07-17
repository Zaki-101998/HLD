import { useState } from 'react'
import MarkdownContent from '../MarkdownContent.jsx'

export default function Quiz({ topicId, challenge, progress }) {
  const key = `${topicId}:${challenge.id}`
  const saved = progress.quizScores[key]
  const [answers, setAnswers] = useState({}) // qIdx -> chosen option idx (locked once set)
  const [finished, setFinished] = useState(false)

  const total = challenge.questions.length
  const answeredCount = Object.keys(answers).length
  const score = challenge.questions.reduce(
    (acc, q, i) => acc + (answers[i] === q.answer ? 1 : 0),
    0,
  )

  const choose = (qIdx, optIdx) => {
    if (answers[qIdx] !== undefined) return
    const next = { ...answers, [qIdx]: optIdx }
    setAnswers(next)
    if (Object.keys(next).length === total) {
      const finalScore = challenge.questions.reduce(
        (acc, q, i) => acc + (next[i] === q.answer ? 1 : 0),
        0,
      )
      progress.saveQuizScore(topicId, challenge.id, finalScore, total)
      setFinished(true)
    }
  }

  const retake = () => {
    setAnswers({})
    setFinished(false)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between text-sm text-slate-400">
        <span>
          {answeredCount}/{total} answered
        </span>
        {saved && (
          <span className="rounded-full bg-ink-800 px-3 py-1 text-xs">
            Last score: <span className="font-semibold text-accent-300">{saved.score}/{saved.total}</span>
          </span>
        )}
      </div>

      {challenge.questions.map((q, qIdx) => {
        const chosen = answers[qIdx]
        const isAnswered = chosen !== undefined
        return (
          <div key={qIdx} className="rounded-xl border border-ink-700 bg-ink-900 p-4">
            <p className="mb-3 font-medium text-slate-100">
              <span className="mr-2 text-accent-400">Q{qIdx + 1}.</span>
              {q.q}
            </p>
            <div className="space-y-2">
              {q.options.map((opt, optIdx) => {
                let style =
                  'border-ink-700 bg-ink-850 hover:border-accent-500 hover:bg-ink-800 cursor-pointer'
                if (isAnswered) {
                  if (optIdx === q.answer)
                    style = 'border-emerald-500/70 bg-emerald-500/10 text-emerald-200'
                  else if (optIdx === chosen)
                    style = 'border-rose-500/70 bg-rose-500/10 text-rose-200'
                  else style = 'border-ink-700 bg-ink-850 opacity-50'
                }
                return (
                  <button
                    key={optIdx}
                    onClick={() => choose(qIdx, optIdx)}
                    disabled={isAnswered}
                    className={`block w-full rounded-lg border px-3 py-2 text-left text-sm transition ${style}`}
                  >
                    <span className="mr-2 font-mono text-xs text-slate-500">
                      {String.fromCharCode(65 + optIdx)}
                    </span>
                    {opt}
                  </button>
                )
              })}
            </div>
            {isAnswered && (
              <div
                className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
                  chosen === q.answer
                    ? 'border-emerald-500/40 bg-emerald-500/5 text-emerald-200'
                    : 'border-amber-500/40 bg-amber-500/5 text-amber-100'
                }`}
              >
                <span className="mr-1 font-semibold">
                  {chosen === q.answer ? '✓ Correct.' : '✗ Not quite.'}
                </span>
                <MarkdownContent className="!inline-block [&_p]:!my-0 [&_p]:inline">
                  {q.explanation}
                </MarkdownContent>
              </div>
            )}
          </div>
        )
      })}

      {finished && (
        <div className="rounded-xl border border-accent-500/50 bg-accent-600/10 p-5 text-center">
          <p className="text-2xl font-bold text-slate-100">
            {score}/{total}
          </p>
          <p className="mt-1 text-sm text-slate-300">
            {score === total
              ? 'Perfect! You own this concept. 🏆'
              : score >= total * 0.7
                ? 'Solid — review the ones you missed before moving on.'
                : 'Worth re-reading the Learn tab, then retake this quiz.'}
          </p>
          <button
            onClick={retake}
            className="mt-3 rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-500"
          >
            Retake quiz
          </button>
        </div>
      )}
    </div>
  )
}
