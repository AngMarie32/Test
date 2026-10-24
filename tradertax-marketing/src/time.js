// Timezone helpers built on Intl so schedules run in the business's local time.

export function zonedParts(date, timeZone) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', weekday: 'short',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
  const p = Object.fromEntries(fmt.formatToParts(date).map((x) => [x.type, x.value]));
  const weekdays = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: +p.year, month: +p.month, day: +p.day,
    hour: +p.hour, minute: +p.minute, weekday: weekdays[p.weekday],
  };
}

// Convert a wall-clock time in `timeZone` to a UTC Date.
export function zonedTimeToUtc(year, month, day, hour, minute, timeZone) {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const p = zonedParts(new Date(guess), timeZone);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return new Date(guess - (asIfUtc - guess));
}

// ISO week key in local time, e.g. "2026-W43" - used to make weekly jobs idempotent.
export function weekKey(date, timeZone) {
  const { year, month, day } = zonedParts(date, timeZone);
  const d = new Date(Date.UTC(year, month - 1, day));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

// Date (UTC) of the given weekday/hour within the local week that contains `date`.
export function slotInWeek(date, weekday, hour, timeZone) {
  const p = zonedParts(date, timeZone);
  const mondayOffset = (p.weekday + 6) % 7;
  const target = new Date(Date.UTC(p.year, p.month - 1, p.day - mondayOffset + ((weekday + 6) % 7)));
  return zonedTimeToUtc(target.getUTCFullYear(), target.getUTCMonth() + 1, target.getUTCDate(), hour, 0, timeZone);
}

export const DAY = 86400000;
