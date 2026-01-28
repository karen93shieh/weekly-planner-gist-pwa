import {
  startOfDay, endOfDay, isWithinInterval, addDays, eachDayOfInterval,
  startOfWeek, endOfWeek, getDay, setHours, setMinutes, format
} from 'date-fns';
import { differenceInCalendarDays, startOfDay as sod } from 'date-fns';
import type { Task, CompletionMap } from '../gistSync';

// ── Instance key helpers ──────────────────────────────────────────────────────
// We key completion by the specific rendered "occurrence".
export function instanceKey(when: Date, repeatType: Task['repeat'] extends infer R ? R : any): string {
  const yyyy = when.getFullYear();
  const mm = String(when.getMonth() + 1).padStart(2, '0');
  const dd = String(when.getDate()).padStart(2, '0');
  const hh = String(when.getHours()).padStart(2, '0');
  const mi = String(when.getMinutes()).padStart(2, '0');

  const base = `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
  const t = (repeatType as any)?.type ?? 'none';
  return `${t}:${base}`;
}

export function isCompletedAt(task: Task, when: Date): boolean {
  const key = instanceKey(when, task.repeat);
  return !!task.completion?.[key];
}

export function setCompletedAt(task: Task, when: Date, done: boolean): Task {
  const key = instanceKey(when, task.repeat);
  const map: CompletionMap = { ...(task.completion ?? {}) };
  if (done) map[key] = true;
  else delete map[key];
  return { ...task, completion: map };
}

// ── Recurrence expansion (kept from your structure) ───────────────────────────
export function expandOccurrences(
  tasks: Task[],
  rangeStart: Date,
  rangeEnd: Date
) {
  const out: Array<{ task: Task; when: Date }> = [];

  for (const t of tasks) {
    const base = t.startAt ? new Date(t.startAt) : undefined;
    const rep = t.repeat?.type ?? 'none';
    const untilTs = t.repeatUntil ?? undefined;
    const excluded = new Set(t.excludeDates ?? []);

    // NEW: cutoff so recurring tasks do not appear in the past
    // We only apply this to repeating tasks (daily/weekly/biweekly).
    const createdCutoff = startOfDay(new Date(t.createdAt ?? Date.now()));
    const isAllowed = (when: Date) => {
      if (rep === 'none') return true;                 // one-time: show as usual
      return when.getTime() >= createdCutoff.getTime(); // recurring: only today/future
    };

    if (!base) {
      // (legacy/no startAt) — keep your existing behavior for non-recurring items
      if (t.day) {
        const map = {Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6} as const;
        const want = map[t.day];
        for (const d of eachDayOfInterval({ start: rangeStart, end: rangeEnd })) {
          if (getDay(d) === want) {
            const when = startOfDay(d);
            const ymd = format(when, 'yyyy-MM-dd');
            if (isAllowed(when) && !excluded.has(ymd)) out.push({ task: t, when });
          }
        }
      }
      continue;
    }

    if (rep === 'none') {
      if (isWithinInterval(base, { start: rangeStart, end: rangeEnd })) {
        // one-time task: no cutoff needed, but still respect excludeDates (edge)
        const ymd = format(base, 'yyyy-MM-dd');
        if (!excluded.has(ymd)) out.push({ task: t, when: base });
      }
      continue;
    }

    if (rep === 'daily') {
      for (const d of eachDayOfInterval({ start: rangeStart, end: rangeEnd })) {
        const when = setMinutes(setHours(d, base.getHours()), base.getMinutes());
        if (untilTs && when.getTime() > untilTs) break;
        const ymd = format(when, 'yyyy-MM-dd');
        if (isAllowed(when) && !excluded.has(ymd)) out.push({ task: t, when });
      }
      continue;
    }

    if (rep === 'bidaily') {
      const baseDay = startOfDay(base);
      for (const d of eachDayOfInterval({ start: rangeStart, end: rangeEnd })) {
        const diffDays = Math.round((startOfDay(d).getTime() - baseDay.getTime()) / 86400000);
        if (diffDays < 0 || diffDays % 2 !== 0) continue;
        const when = setMinutes(setHours(d, base.getHours()), base.getMinutes());
        if (untilTs && when.getTime() > untilTs) break;
        const ymd = format(when, 'yyyy-MM-dd');
        if (isAllowed(when) && !excluded.has(ymd)) out.push({ task: t, when });
      }
      continue;
    }

    if (rep === 'weekly') {
      const weekday = getDay(base);
      for (const d of eachDayOfInterval({ start: rangeStart, end: rangeEnd })) {
        if (getDay(d) === weekday) {
          const when = setMinutes(setHours(d, base.getHours()), base.getMinutes());
          if (untilTs && when.getTime() > untilTs) break;
          const ymd = format(when, 'yyyy-MM-dd');
          if (isAllowed(when) && !excluded.has(ymd)) out.push({ task: t, when });
        }
      }
      continue;
    }

    if (rep === 'biweekly') {
      const weekday = getDay(base);
      const baseDay = startOfDay(base);
      for (const d of eachDayOfInterval({ start: rangeStart, end: rangeEnd })) {
        if (getDay(d) !== weekday) continue;
        const diffDays = Math.round((startOfDay(d).getTime() - baseDay.getTime()) / 86400000);
        if (diffDays >= 0 && diffDays % 14 === 0) {
          const when = setMinutes(setHours(d, base.getHours()), base.getMinutes());
          if (untilTs && when.getTime() > untilTs) break;
          const ymd = format(when, 'yyyy-MM-dd');
          if (isAllowed(when) && !excluded.has(ymd)) out.push({ task: t, when });
        }
      }
      continue;
    }
  }

  return out.sort((a, b) => a.when.getTime() - b.when.getTime());
}


export function weekWindow(anchor: Date) {
  // Start the week on Sunday instead of Monday (as in your file)
  const start = startOfWeek(anchor, { weekStartsOn: 0 });
  const end = endOfWeek(anchor,   { weekStartsOn: 0 });
  return { start, end };
}

export function formatTime(ts?: number) {
  if (!ts) return '';
  return format(new Date(ts), 'HH:mm');
}

export function formatDuration(min?: number) {
  if (!min || min <= 0) return '';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

// Accepts "90", "1:30", "01:30", or "45"
export function parseDuration(input: string): number | undefined {
  const s = input.trim();
  if (!s) return undefined;
  if (s.includes(':')) {
    const [hh, mm] = s.split(':').map(n => Number(n));
    if (Number.isFinite(hh) && Number.isFinite(mm)) return hh * 60 + mm;
    return undefined;
  }
  const mins = Number(s);
  return Number.isFinite(mins) ? mins : undefined;
}
