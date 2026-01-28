const GH_API = "https://api.github.com";

export type Repeat =
  | { type: 'none' }
  | { type: 'daily' }
  | { type: 'bidaily' }
  | { type: 'weekly' }
  | { type: 'biweekly' };

export type CompletionMap = Record<string, true>;

export type Task = {
  id: string;
  title: string;
  notes?: string;

  startAt?: number;       // when it starts (ms since epoch)
  endAt?: number;         // optional explicit end time later
  durationMin?: number;   // duration in minutes
  repeat?: Repeat;

  // Recurrence controls for deletion behavior
  // Dates in 'yyyy-MM-dd' that should be skipped for repeating tasks
  excludeDates?: string[];
  // If set, do not generate occurrences after this timestamp (ms since epoch)
  repeatUntil?: number;

  // LEGACY (kept only for migration): day/done/recurring
  day?: 'Mon'|'Tue'|'Wed'|'Thu'|'Fri'|'Sat'|'Sun';
  done?: boolean;         // <- legacy global flag
  doneDates?: string[];

  // NEW: per-occurrence completion; keys are instance IDs
  completion?: CompletionMap;

  createdAt: number;
  dueAt?: number;
  updatedAt: number;
};

export type PlannerDoc = {
  version: 2;            // bumped to v2 for per-occurrence completion
  tasks: Task[];
  updatedAt: number;
};

export type GistConfig = {
  token: string;
  gistId: string;
  fileName: string;
};

function headers(token?: string, extra: Record<string,string> = {}) {
  const base: Record<string,string> = {
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28"
  };
  if (token) base["Authorization"] = `Bearer ${token}`;
  return { ...base, ...extra };
}

/** Simple v1→v2 migration: drop legacy done flag; keep completion as-is or empty */
function migrateDoc(doc: any): PlannerDoc {
  const version = Number(doc?.version ?? 1);
  const tasks = Array.isArray(doc?.tasks) ? doc.tasks : [];
  if (version >= 2) {
    return { version: 2, tasks, updatedAt: Number(doc?.updatedAt ?? Date.now()) };
  }
  // v1 → v2
  const migrated: Task[] = tasks.map((t: Task) => ({
    ...t,
    // Keep old shape but ensure completion exists and legacy flags don't break anything
    completion: t.completion ?? {},
    done: undefined, // drop global flag
  }));
  return { version: 2, tasks: migrated, updatedAt: Date.now() };
}

export async function loadPlanner(cfg: GistConfig, cachedEtag?: string): Promise<{
  doc: PlannerDoc,
  etag: string,
  commit?: string,
  notModified?: boolean
}> {
  const res = await fetch(`${GH_API}/gists/${cfg.gistId}`, {
    headers: headers(cfg.token, cachedEtag ? { "If-None-Match": cachedEtag } : {})
  });

  if (res.status === 304) {
    const cached = JSON.parse(localStorage.getItem("planner_cache") || '{"version":2,"tasks":[],"updatedAt":0}');
    return {
      doc: migrateDoc(cached),
      etag: cachedEtag!,
      notModified: true
    };
  }
  if (!res.ok) throw new Error(`Gist load failed: ${res.status}`);

  const etag = res.headers.get("ETag") || "";
  const json = await res.json();
  const file = json.files?.[cfg.fileName] || json.files?.['planner.json'] || json.files?.['PLANNER.JSON'] || json.files?.['Planner.json'];
  if (!file || !file.content) throw new Error(`File ${cfg.fileName} not found in gist`);
  const rawDoc = JSON.parse(file.content);

  const doc = migrateDoc(rawDoc);

  localStorage.setItem("planner_cache", JSON.stringify(doc));
  if (etag) localStorage.setItem("planner_etag", etag);
  if (json.history?.[0]?.version) localStorage.setItem("planner_commit", json.history[0].version);

  return { doc, etag, commit: json.history?.[0]?.version };
}

/** Merge that preserves local IDs, prefers newer updatedAt for conflicts */
export function mergeTasks(local: Task[], remote: Task[]): Task[] {
  const localMap = new Map<string, Task>();
  for (const t of local) localMap.set(t.id, t);

  const out: Task[] = [];
  const remoteMap = new Map(remote.map(t => [t.id, t]));
  for (const [id, r] of remoteMap) {
    const l = localMap.get(id);
    if (l) {
      out.push((l.updatedAt ?? 0) >= (r.updatedAt ?? 0) ? l : r);
      localMap.delete(id);
    }
    // else: remote-only → treat as deleted locally
  }
  for (const t of localMap.values()) out.push(t);
  return out.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
}

export async function savePlanner(cfg: GistConfig, next: PlannerDoc): Promise<{commit: string}> {
  const cachedEtag = localStorage.getItem("planner_etag") || undefined;
  let base: PlannerDoc | undefined;
  try {
    const { doc } = await loadPlanner(cfg, cachedEtag);
    base = doc;
  } catch {
    const cached = localStorage.getItem("planner_cache");
    base = cached ? migrateDoc(JSON.parse(cached)) : { version:2, tasks:[], updatedAt:0 };
  }

  const merged: PlannerDoc = {
    version: 2,
    tasks: mergeTasks(next.tasks, base!.tasks),
    updatedAt: Date.now()
  };

  const body = {
    files: {
      [cfg.fileName]: {
        content: JSON.stringify(merged, null, 2)
      }
    }
  };

  const res = await fetch(`${GH_API}/gists/${cfg.gistId}`, {
    method: "PATCH",
    headers: headers(cfg.token, { "Content-Type": "application/json" }),
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`Gist save failed: ${res.status} ${await res.text()}`);

  const js = await res.json();
  const commit = js.history?.[0]?.version || "";
  localStorage.setItem("planner_cache", JSON.stringify(merged));
  if (commit) localStorage.setItem("planner_commit", commit);
  const etag = res.headers.get("ETag");
  if (etag) localStorage.setItem("planner_etag", etag);

  return { commit };
}
