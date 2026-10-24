// Picks what to talk about: in-season topics first, highest priority, and
// never a topic used in the last N weeks. Also resolves upcoming deadlines.
import { deadlines, topics } from '../../config/tax-calendar.js';
import { zonedParts, zonedTimeToUtc, DAY } from '../time.js';

const COOLDOWN_WEEKS = 8;

export function pickTopic(now, usedTopics = [], timeZone = 'America/New_York') {
  const { month } = zonedParts(now, timeZone);
  const recent = new Set(
    usedTopics.filter((u) => now - new Date(u.usedAt) < COOLDOWN_WEEKS * 7 * DAY).map((u) => u.topicId),
  );
  const candidates = topics
    .filter((t) => !recent.has(t.id))
    .map((t) => ({ ...t, inSeason: t.months.length === 0 || t.months.includes(month) }))
    .filter((t) => t.inSeason)
    .sort((a, b) => (b.months.length > 0) - (a.months.length > 0) || b.priority - a.priority);
  // Everything on cooldown: fall back to the least recently used topic.
  if (candidates.length === 0) {
    const lastUse = (id) => Math.max(0, ...usedTopics.filter((u) => u.topicId === id).map((u) => +new Date(u.usedAt)));
    return [...topics].sort((a, b) => lastUse(a.id) - lastUse(b.id))[0];
  }
  return candidates[0];
}

// Deadline date for a given year, rolled forward off weekends, at 09:00 local.
export function deadlineDate(deadline, year, timeZone) {
  let d = new Date(Date.UTC(year, deadline.month - 1, deadline.day));
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d = new Date(d.getTime() + DAY);
  // Year-end cutoff is the last trading day: roll backwards instead.
  if (deadline.id === 'year-end') {
    d = new Date(Date.UTC(year, 11, 31));
    while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d = new Date(d.getTime() - DAY);
  }
  return zonedTimeToUtc(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), 9, 0, timeZone);
}

export function upcomingDeadlines(now, withinDays, timeZone) {
  const { year } = zonedParts(now, timeZone);
  const out = [];
  for (const y of [year, year + 1]) {
    for (const dl of deadlines) {
      const date = deadlineDate(dl, y, timeZone);
      const daysAway = Math.ceil((date - now) / DAY);
      if (daysAway >= 0 && daysAway <= withinDays) out.push({ ...dl, date, daysAway, year: y });
    }
  }
  return out.sort((a, b) => a.date - b.date);
}
