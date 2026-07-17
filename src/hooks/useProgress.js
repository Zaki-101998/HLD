import { useCallback, useEffect, useState } from 'react'
import { todayISO } from '../lib/schedule.js'

const STORAGE_KEY = 'hld-roadmap-progress-v1'

const DEFAULTS = {
  startDate: null, // ISO date the plan starts
  completed: {}, // topicId -> ISO date completed
  challenges: {}, // `${topicId}:${challengeId}` -> true
  quizScores: {}, // `${topicId}:${challengeId}` -> { score, total, date }
  drafts: {}, // `${topicId}:${challengeId}` -> saved text for design/estimation answers
  activity: [], // ISO dates the app was used (for streaks)
  notes: {}, // topicId -> markdown text
  customResources: {}, // topicId -> [{ id, title, url, type }]
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULTS }
    return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULTS }
  }
}

/** Consecutive-day streak ending today or yesterday. */
export function computeStreak(activity) {
  if (!activity?.length) return 0
  const days = new Set(activity)
  const cursor = new Date()
  // Streak survives if the last activity was yesterday
  if (!days.has(todayISO())) cursor.setDate(cursor.getDate() - 1)
  let streak = 0
  for (;;) {
    const iso = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`
    if (!days.has(iso)) break
    streak++
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

export function useProgress() {
  const [state, setState] = useState(load)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      // storage full or unavailable — progress just won't persist
    }
  }, [state])

  // Record today as an active day once per session
  useEffect(() => {
    const today = todayISO()
    setState((s) =>
      s.activity.includes(today) ? s : { ...s, activity: [...s.activity, today] },
    )
  }, [])

  const setStartDate = useCallback((iso) => {
    setState((s) => ({ ...s, startDate: iso }))
  }, [])

  const toggleTopicComplete = useCallback((topicId) => {
    setState((s) => {
      const completed = { ...s.completed }
      if (completed[topicId]) delete completed[topicId]
      else completed[topicId] = todayISO()
      return { ...s, completed }
    })
  }, [])

  const markChallengeDone = useCallback((topicId, challengeId, done = true) => {
    const key = `${topicId}:${challengeId}`
    setState((s) => {
      const challenges = { ...s.challenges }
      if (done) challenges[key] = true
      else delete challenges[key]
      return { ...s, challenges }
    })
  }, [])

  const saveQuizScore = useCallback((topicId, challengeId, score, total) => {
    const key = `${topicId}:${challengeId}`
    setState((s) => ({
      ...s,
      quizScores: { ...s.quizScores, [key]: { score, total, date: todayISO() } },
      challenges: { ...s.challenges, [key]: true },
    }))
  }, [])

  const saveDraft = useCallback((topicId, challengeId, text) => {
    const key = `${topicId}:${challengeId}`
    setState((s) => ({ ...s, drafts: { ...s.drafts, [key]: text } }))
  }, [])

  const saveNote = useCallback((topicId, text) => {
    setState((s) => ({ ...s, notes: { ...s.notes, [topicId]: text } }))
  }, [])

  const addCustomResource = useCallback((topicId, { title, url, type }) => {
    setState((s) => ({
      ...s,
      customResources: {
        ...s.customResources,
        [topicId]: [
          ...(s.customResources[topicId] ?? []),
          { id: crypto.randomUUID(), title, url, type },
        ],
      },
    }))
  }, [])

  const removeCustomResource = useCallback((topicId, resourceId) => {
    setState((s) => ({
      ...s,
      customResources: {
        ...s.customResources,
        [topicId]: (s.customResources[topicId] ?? []).filter((r) => r.id !== resourceId),
      },
    }))
  }, [])

  const resetAll = useCallback(() => {
    setState({ ...DEFAULTS, activity: [todayISO()] })
  }, [])

  const exportSnapshot = () => ({ ...state })

  const importState = useCallback((data) => {
    setState({ ...DEFAULTS, ...data })
  }, [])

  return {
    ...state,
    streak: computeStreak(state.activity),
    setStartDate,
    toggleTopicComplete,
    markChallengeDone,
    saveQuizScore,
    saveDraft,
    saveNote,
    addCustomResource,
    removeCustomResource,
    resetAll,
    exportSnapshot,
    importState,
  }
}
