import { useState, useEffect } from 'react';
import { addDays, format, startOfDay, endOfDay } from 'date-fns';
import { usePlanner } from '../usePlanner';
import type { Task } from '../gistSync';
import {
  expandOccurrences,
  weekWindow,
  formatTime,
  formatDuration,
  parseDuration,
} from '../lib/schedule';




export default function App() {
  const { tasks, addTask, updateTask, removeTask, loading, error } = usePlanner();
  const [view, setView] = useState<'day' | 'week'>(() => {
    const v = localStorage.getItem('planner_view');
    return v === 'day' ? 'day' : 'week';
  });
  const [anchor, setAnchor] = useState<Date>(startOfDay(new Date()));
  const [confirmTask, setConfirmTask] = useState<{ task: Task; when?: number } | null>(null);
  const [detailTask, setDetailTask] = useState<Task | null>(null);
  const [editDate, setEditDate] = useState<string>('');
  const [editTime, setEditTime] = useState<string>('00:00');
  const [editAllDay, setEditAllDay] = useState<boolean>(false);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [tokenInput, setTokenInput] = useState<string>(() => localStorage.getItem('gh_token') || '');
  const [gistIdInput, setGistIdInput] = useState<string>(() => localStorage.getItem('gh_gist') || '');
  const [fileNameInput, setFileNameInput] = useState<string>(() => localStorage.getItem('gh_file') || 'planner.json');

  useEffect(() => {
    localStorage.setItem('planner_view', view);
  }, [view]);

  // Sync editors when detail task opens
  if (detailTask && editDate === '') {
    const d = detailTask.startAt ? new Date(detailTask.startAt) : new Date();
    const yyyy = String(d.getFullYear());
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    setEditDate(`${yyyy}-${mm}-${dd}`);
    setEditTime(`${hh}:${mi}`);
    setEditAllDay(!detailTask.durationMin || detailTask.durationMin <= 0);
  }

  if (loading) return <div className="p-6">Loading…</div>;

  return (
    <div className="app-shell mx-auto w-full max-w-[1280px] px-3 sm:px-4 lg:px-5 pt-6 pb-6">
      <header className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-2xl font-bold">Weekly Planner</h1>
        <button
          onClick={() => setShowSettings(true)}
          className="px-3 py-2 rounded bg-zinc-700 hover:bg-zinc-600 text-sm"
        >
          Settings
        </button>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <button
              className={`px-3 py-1 rounded ${view === 'day' ? 'bg-zinc-800' : ''}`}
              onClick={() => setView('day')}
            >
              Day
            </button>
            <button
              className={`px-3 py-1 rounded ${view === 'week' ? 'bg-zinc-800' : ''}`}
              onClick={() => setView('week')}
            >
              Week
            </button>
          </div>

          <div className="ms-3 flex items-center gap-2">
            <button
              className="px-2 py-1 rounded border border-zinc-700"
              onClick={() => setAnchor(addDays(anchor, view === 'day' ? -1 : -7))}
              aria-label="Previous"
            >
              ‹
            </button>
            <div className="text-sm opacity-80">
              {view === 'day'
                ? format(anchor, 'EEE, MMM d')
                : `${format(weekWindow(anchor).start, 'MMM d')} – ${format(
                    weekWindow(anchor).end,
                    'MMM d'
                  )}`}
            </div>
            <button
              className="px-2 py-1 rounded border border-zinc-700"
              onClick={() => setAnchor(addDays(anchor, view === 'day' ? 1 : 7))}
              aria-label="Next"
            >
              ›
            </button>
          </div>
        </div>
      </header>

      {error && <div className="text-red-400 mb-3">{error}</div>}
      {(!localStorage.getItem('gh_token') || !localStorage.getItem('gh_gist')) && (
        <div className="mb-3 p-3 border border-yellow-700 bg-yellow-900/20 rounded text-sm">
          Missing configuration: { !localStorage.getItem('gh_token') ? 'GitHub token' : '' }{ (!localStorage.getItem('gh_token') && !localStorage.getItem('gh_gist')) ? ' and ' : '' }{ !localStorage.getItem('gh_gist') ? 'Gist ID' : '' }.
          <button className="ml-2 underline" onClick={() => setShowSettings(true)}>Open Settings</button>
        </div>
      )}

      <AddForm onAdd={addTask} />

      {view === 'week' ? (
        <WeekView
          tasks={tasks}
          anchor={anchor}
          onUpdate={updateTask}
          onDelete={removeTask}
          setConfirmTask={(t, when) => setConfirmTask({ task: t, when })}
          onOpenDetails={(t) => {
            if (!t.repeat || t.repeat.type === 'none') {
              setDetailTask(t);
              setEditDate(''); // trigger sync
            }
          }}
        />
      ) : (
        <DayView
          tasks={tasks}
          anchor={anchor}
          onUpdate={updateTask}
          onDelete={removeTask}
          setConfirmTask={(t, when) => setConfirmTask({ task: t, when })}
          onOpenDetails={(t) => {
            if (!t.repeat || t.repeat.type === 'none') {
              setDetailTask(t);
              setEditDate(''); // trigger sync
            }
          }}
        />
      )}

      {confirmTask && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/70 z-50">
          <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-6 max-w-sm w-full">
            <h2 className="text-lg font-semibold mb-2">Delete Task</h2>
            <p className="mb-4">
              {confirmTask.task.repeat?.type && confirmTask.task.repeat.type !== 'none'
                ? 'This is a repeating task. Delete only this occurrence or all future ones?'
                : <>Are you sure you want to delete <span className="font-medium">"{confirmTask.task.title}"</span>?</>}
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                className="px-3 py-2 rounded bg-zinc-700 hover:bg-zinc-600"
                onClick={() => setConfirmTask(null)}
              >
                Cancel
              </button>
              {confirmTask.task.repeat?.type && confirmTask.task.repeat.type !== 'none' && confirmTask.when ? (
                <>
                  <button
                    className="px-3 py-2 rounded bg-red-600 hover:bg-red-500"
                    onClick={() => {
                      const ymd = format(new Date(confirmTask.when!), 'yyyy-MM-dd');
                      const set = new Set(confirmTask.task.excludeDates ?? []);
                      set.add(ymd);
                      updateTask(confirmTask.task.id, { excludeDates: Array.from(set) });
                      setConfirmTask(null);
                    }}
                  >
                    Delete this occurrence
                  </button>
                  <button
                    className="px-3 py-2 rounded bg-red-600 hover:bg-red-500"
                    onClick={() => {
                      const ymd = format(new Date(confirmTask.when!), 'yyyy-MM-dd');
                      const set = new Set(confirmTask.task.excludeDates ?? []);
                      set.add(ymd);
                      updateTask(confirmTask.task.id, { excludeDates: Array.from(set), repeatUntil: confirmTask.when });
                      setConfirmTask(null);
                    }}
                  >
                    Delete this and future occurrences
                  </button>
                </>
              ) : (
                <button
                  className="px-3 py-2 rounded bg-red-600 hover:bg-red-500"
                  onClick={() => {
                    removeTask(confirmTask.task.id);
                    setConfirmTask(null);
                  }}
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {detailTask && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/70 z-50">
          <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-3">Edit Task</h2>
            <div className="space-y-3">
              <div>
                <div className="text-xs opacity-70 mb-1">Title</div>
                <div className="text-sm">{detailTask.title}</div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <div className="text-xs opacity-70 mb-1">Date</div>
                  <input
                    type="date"
                    className="w-full border border-zinc-800 bg-zinc-900 rounded px-2 py-1"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                  />
                </label>
                <label className="block">
                  <div className="text-xs opacity-70 mb-1">Time</div>
                  <input
                    type="time"
                    className="w-full border border-zinc-800 bg-zinc-900 rounded px-2 py-1"
                    value={editTime}
                    onChange={(e) => setEditTime(e.target.value)}
                    disabled={editAllDay}
                  />
                </label>
              </div>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={editAllDay}
                  onChange={(e) => setEditAllDay(e.target.checked)}
                />
                <span className="text-sm">All-day</span>
              </label>
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button
                className="px-3 py-2 rounded bg-zinc-700 hover:bg-zinc-600"
                onClick={() => {
                  setDetailTask(null);
                  setEditDate('');
                }}
              >
                Cancel
              </button>
              <button
                className="px-3 py-2 rounded bg-emerald-600 hover:bg-emerald-500"
                onClick={() => {
                  if (!detailTask) return;
                  if (!editDate) return;
                  const [y, m, d] = editDate.split('-').map(Number);
                  const dt = new Date(y, (m || 1) - 1, d || 1);
                  if (!editAllDay) {
                    const [hh, mi] = editTime.split(':').map(Number);
                    dt.setHours(hh || 0, mi || 0, 0, 0);
                  } else {
                    dt.setHours(0, 0, 0, 0);
                  }
                  const patch: Partial<Task> = {
                    startAt: dt.getTime(),
                  };
                  if (editAllDay) {
                    patch.durationMin = undefined;
                  } else if (!detailTask.durationMin || detailTask.durationMin <= 0) {
                    // default duration for non all-day that previously had none
                    patch.durationMin = 60;
                  }
                  updateTask(detailTask.id, patch);
                  setDetailTask(null);
                  setEditDate('');
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {showSettings && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/70 z-50">
          <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-3">Settings</h2>
            <div className="space-y-3">
              <label className="block">
                <div className="text-xs opacity-70 mb-1">GitHub Token (gist scope)</div>
                <input
                  type="password"
                  className="w-full border border-zinc-800 bg-zinc-900 rounded px-2 py-2"
                  placeholder="ghp_..."
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                />
              </label>
              <label className="block">
                <div className="text-xs opacity-70 mb-1">Gist ID</div>
                <input
                  type="text"
                  className="w-full border border-zinc-800 bg-zinc-900 rounded px-2 py-2"
                  placeholder="e.g. a1b2c3d4e5f6..."
                  value={gistIdInput}
                  onChange={(e) => setGistIdInput(e.target.value.trim())}
                />
              </label>
              <label className="block">
                <div className="text-xs opacity-70 mb-1">File name in gist</div>
                <input
                  type="text"
                  className="w-full border border-zinc-800 bg-zinc-900 rounded px-2 py-2"
                  placeholder="planner.json"
                  value={fileNameInput}
                  onChange={(e) => setFileNameInput(e.target.value.trim() || 'planner.json')}
                />
              </label>
              <div className="text-xs opacity-70">Stored locally in your browser only.</div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button
                className="px-3 py-2 rounded bg-zinc-700 hover:bg-zinc-600"
                onClick={() => setShowSettings(false)}
              >
                Cancel
              </button>
              <button
                className="px-3 py-2 rounded bg-emerald-600 hover:bg-emerald-500"
                onClick={() => {
                  localStorage.setItem('gh_token', tokenInput.trim());
                  localStorage.setItem('gh_gist', gistIdInput.trim());
                  localStorage.setItem('gh_file', (fileNameInput.trim() || 'planner.json'));
                  // Reload so the planner picks up the new token (cfg is module-scoped)
                  window.location.reload();
                }}
                disabled={!tokenInput.trim() || !gistIdInput.trim()}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── Add Form ───────────────────────── */

import { format as dfFormat } from 'date-fns';

const dateKey = (d: Date) => dfFormat(d, 'yyyy-MM-dd');

function AddForm({
  onAdd,
}: {
  onAdd: (t: Omit<Task, 'id' | 'done' | 'createdAt' | 'updatedAt'>) => void | Promise<void>;
}) {
  const todayStr = dfFormat(new Date(), 'yyyy-MM-dd');

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget as HTMLFormElement);
        const title = String(fd.get('title') || '').trim();
        const date = String(fd.get('date') || '');
        const time = String(fd.get('time') || '');
        const duration = String(fd.get('duration') || '');
        const repeat = String(fd.get('repeat') || 'none') as
          | 'none'
          | 'daily'
          | 'bidaily'
          | 'weekly'
          | 'biweekly';
        if (!title) return;

        let startAt: number | undefined = undefined;
        if (date) {
          const [y, m, d] = date.split('-').map(Number);
          const dt = new Date(y, m - 1, d);
          if (time) {
            const [hh, mm] = time.split(':').map(Number);
            dt.setHours(hh || 0, mm || 0, 0, 0);
          } else {
            dt.setHours(0, 0, 0, 0);
          }
          startAt = dt.getTime();
        }

        const durationMin = parseDuration(duration);

        onAdd({
          title,
          startAt,
          durationMin,
          repeat: repeat === 'none' ? { type: 'none' } : { type: repeat },
        });

        (e.currentTarget as HTMLFormElement).reset();
        const dateEl = (e.currentTarget as HTMLFormElement).elements.namedItem('date') as HTMLInputElement | null;
        const timeEl = (e.currentTarget as HTMLFormElement).elements.namedItem('time') as HTMLInputElement | null;
        if (dateEl) dateEl.value = todayStr;
        if (timeEl) timeEl.value = '00:00';
      }}
      className="grid grid-cols-2 md:grid-cols-6 gap-2 mb-5"
    >
      <input name="title" placeholder="Add an activity…" className="border border-zinc-800 bg-zinc-900 rounded px-3 py-2 col-span-2 md:col-span-2" />
      <input name="date" type="date" defaultValue={todayStr} className="border border-zinc-800 bg-zinc-900 rounded px-3 py-2" />
      <input name="time" type="time" defaultValue="00:00" className="border border-zinc-800 bg-zinc-900 rounded px-3 py-2" />
      <input name="duration" placeholder="Duration (min or HH:MM)" className="border border-zinc-800 bg-zinc-900 rounded px-3 py-2" />
      <select name="repeat" className="border border-zinc-800 bg-zinc-900 rounded px-3 py-2">
        <option value="none">One-time</option>
      <option value="daily">Day</option>
      <option value="bidaily">Bidaily</option>
      <option value="weekly">Weekly</option>
      <option value="biweekly">Biweekly</option>
      </select>
      <button className="rounded bg-zinc-800 px-3 py-2">Add</button>
    </form>
  );
}


/* ───────────────────────── Day View ───────────────────────── */

function DayView({
  tasks,
  anchor,
  onUpdate,
  onDelete,
  setConfirmTask,
  onOpenDetails,
}: {
  tasks: Task[];
  anchor: Date;
  onUpdate: (id: string, patch: Partial<Task>) => void;
  onDelete: (id: string) => void;
  setConfirmTask: (t: Task, when: number) => void;
  onOpenDetails: (t: Task) => void;
}) {
  const occ = expandOccurrences(tasks, startOfDay(anchor), endOfDay(anchor)).sort((a, b) => {
    const at = a.task.startAt ? a.when.getTime() : -1;
    const bt = b.task.startAt ? b.when.getTime() : -1;
    return at - bt || a.task.title.localeCompare(b.task.title);
  });

  return (
    <section className="space-y-2">
      {occ.length === 0 && <div className="opacity-70 text-sm">No activities today.</div>}
      {occ.map(({ task, when }) => {
        const noDuration = !task.durationMin || task.durationMin <= 0;
        const timeLabel = noDuration ? 'All day' : format(when, 'MM/dd/yyyy HH:mm');

        const isRepeating = task.repeat?.type && task.repeat.type !== 'none';
        const dk = format(when, 'yyyy-MM-dd');
        const checked = isRepeating ? (task.doneDates?.includes(dk) ?? false) : !!task.done;

        return (
          <article
            key={task.id + when.getTime()}
            className={`border rounded p-3 ${isRepeating ? 'border-white/20 bg-white/5' : 'border-zinc-800'}`}
          >
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => {
                  const next = e.target.checked;
                  if (isRepeating) {
                    const set = new Set(task.doneDates ?? []);
                    next ? set.add(dk) : set.delete(dk);
                    onUpdate(task.id, { doneDates: Array.from(set) });
                  } else {
                    onUpdate(task.id, { done: next });
                  }
                }}
              />
              <div className="flex-1 cursor-pointer" onClick={() => { if (!isRepeating) onOpenDetails(task); }}>
                <div className={`font-medium ${checked ? 'line-through opacity-50' : ''}`}>
                  {task.title}
                </div>
                <div className="text-xs opacity-70">
                  {timeLabel}
                  {formatDuration(task.durationMin) ? ` (${formatDuration(task.durationMin)})` : ''}
                </div>
              </div>
              <button className="text-xs underline opacity-80" onClick={() => setConfirmTask(task, when.getTime())}>
                delete
              </button>
            </div>
          </article>
        );
      })}
    </section>
  );
}

/* ───────────────────────── Week View ───────────────────────── */

export function WeekView({
  tasks,
  anchor,
  onUpdate,
  onDelete,
  setConfirmTask,
  onOpenDetails,
}: {
  tasks: Task[];
  anchor: Date;
  onUpdate: (id: string, patch: Partial<Task>) => void;
  onDelete: (id: string) => void;
  setConfirmTask: (t: Task, when: number) => void;
  onOpenDetails: (t: Task) => void;
}) {
  const { start, end } = weekWindow(anchor);
  const occ = expandOccurrences(tasks, start, end);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));

  return (
    <section className="grid grid-cols-1 md:grid-cols-7 gap-3">
      {days.map((d) => {
        const dayItems = occ
          .filter((o) => o.when.toDateString() === d.toDateString())
          .sort((a, b) => {
            const at = a.task.startAt ? a.when.getTime() : -1;
            const bt = b.task.startAt ? b.when.getTime() : -1;
            return at - bt || a.task.title.localeCompare(b.task.title);
          });

        return (
          <div key={d.toDateString()} className="border border-zinc-800 rounded p-2">
            <div className="text-sm font-semibold mb-2">{format(d, 'EEE d')}</div>
            <div className="space-y-2">
              {dayItems.map(({ task, when }) => {
                const noDuration = !task.durationMin || task.durationMin <= 0;
                const timeLabel = noDuration ? 'All day' : formatTime(when.getTime());

                const isRepeating = task.repeat?.type && task.repeat.type !== 'none';
                const dk = format(when, 'yyyy-MM-dd');
                const checked = isRepeating ? (task.doneDates?.includes(dk) ?? false) : !!task.done;

                return (
                  <div
                    key={task.id + when.getTime()}
                    className={`border rounded p-2 ${isRepeating ? 'border-white/20 bg-white/5' : 'border-zinc-800'}`}
                  >
                    <div className="text-xs opacity-70">
                      {timeLabel}
                      {formatDuration(task.durationMin) ? ` (${formatDuration(task.durationMin)})` : ''}
                    </div>
                    <div className="flex items-start gap-2 mt-1">
                      <input
                        type="checkbox"
                        className="h-4 w-4 mt-0.5 shrink-0"
                        checked={checked}
                        onChange={(e) => {
                          const next = e.target.checked;
                          if (isRepeating) {
                            const set = new Set(task.doneDates ?? []);
                            next ? set.add(dk) : set.delete(dk);
                            onUpdate(task.id, { doneDates: Array.from(set) });
                          } else {
                            onUpdate(task.id, { done: next });
                          }
                        }}
                      />
                      <div className="flex-1 leading-5 cursor-pointer" onClick={() => { if (!isRepeating) onOpenDetails(task); }}>
                        <div className={`text-sm ${checked ? 'line-through opacity-50' : ''}`}>
                          {task.title}
                        </div>
                        {task.notes && (
                          <div className={`text-xs mt-0.5 ${checked ? 'line-through opacity-50' : 'opacity-70'}`}>
                            {task.notes}
                          </div>
                        )}
                      </div>
                      <button className="text-[11px] underline opacity-80" onClick={() => setConfirmTask(task, when.getTime())}>
                        del
                      </button>
                    </div>
                  </div>
                );
              })}
              {dayItems.length === 0 && <div className="text-xs opacity-50">—</div>}
            </div>
          </div>
        );
      })}
    </section>
  );
}
