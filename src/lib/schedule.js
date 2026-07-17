// Scheduling: rolls each topic's day allocation forward from the start date.
// Sundays are rest days and are skipped.

const REST_DAY = 0 // Sunday

function isStudyDay(date) {
  return date.getDay() !== REST_DAY
}

function nextStudyDay(date) {
  const d = new Date(date)
  while (!isStudyDay(d)) d.setDate(d.getDate() + 1)
  return d
}

function addStudyDays(date, n) {
  const d = new Date(date)
  let remaining = n
  while (remaining > 0) {
    d.setDate(d.getDate() + 1)
    if (isStudyDay(d)) remaining--
  }
  return d
}

export function parseISODate(iso) {
  const [y, m, day] = iso.split('-').map(Number)
  return new Date(y, m - 1, day)
}

export function toISODate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function todayISO() {
  return toISODate(new Date())
}

/**
 * Returns { [topicId]: { start: Date, end: Date } } for every topic, in
 * roadmap order, starting at startDateISO.
 */
export function computeSchedule(phases, startDateISO) {
  if (!startDateISO) return {}
  const out = {}
  let cursor = nextStudyDay(parseISODate(startDateISO))
  for (const phase of phases) {
    for (const topic of phase.topics) {
      const start = new Date(cursor)
      const end = addStudyDays(start, Math.max(0, topic.days - 1))
      out[topic.id] = { start, end }
      cursor = nextStudyDay(addStudyDays(end, 1))
    }
  }
  return out
}

export function formatDate(date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function formatDateLong(date) {
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/**
 * Pace check: how many topics *should* be finished by today vs how many are.
 * Returns { expected, done, delta } where delta > 0 means ahead of schedule.
 */
export function paceStatus(phases, schedule, completed) {
  const now = new Date()
  now.setHours(23, 59, 59, 999)
  let expected = 0
  let done = 0
  for (const phase of phases) {
    for (const topic of phase.topics) {
      if (schedule[topic.id] && schedule[topic.id].end <= now) expected++
      if (completed[topic.id]) done++
    }
  }
  return { expected, done, delta: done - expected }
}
