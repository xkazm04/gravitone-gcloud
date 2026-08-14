"use client";

// The project record and its CRUD — what /projects lists and /studio opens.
//
// This is the app's FIRST real (non-mocked) data: a project is created by the
// user, edited by the user, and survives a refresh because it is written to
// IndexedDB (lib/studioDb). Everything a project CONTAINS — scenes, frames,
// cues, the cut — is still fixture data in app/_studio; the seam is deliberate,
// and this record is which side of it the backend will eventually land on.
//
// Records are scoped to the signed-in uid. That is a data-shape decision, not a
// security boundary: IndexedDB is per-browser and any code on the page can read
// the whole store. It exists so two accounts on one machine do not see each
// other's work, and so the record already has the field a server would key on.

import { getByIndex, getRecord, openDb, PROJECTS_STORE, runTx, BY_UID } from "./studioDb";

/* ── The lifecycle ────────────────────────────────────────────────────────── */

/** The five studio steps, in production order. The ONE source of that order —
 *  the /studio stepper and every /projects surface read it from here.
 *
 *  Motion used to sit between Frames and Score as its own step. It is gone:
 *  a still and the movement given to it are one art-direction decision made
 *  against one source frame, and splitting them put a step boundary through
 *  the middle of a single act. Frames owns both now — the picked still AND
 *  the clip made from it. */
export const PHASES = ["research", "script", "frames", "score", "cut"] as const;
export type PhaseKey = (typeof PHASES)[number];

export const PHASE_TITLE: Record<PhaseKey, string> = {
  research: "Research",
  script: "Script",
  frames: "Frames",
  score: "Score",
  cut: "Cut",
};

/** Steps that no longer exist, and the step that absorbed each one.
 *
 *  Records written before a step was retired still name it — in `phase`, and
 *  as a key in `progress`. Both are read on every load, so the rename happens
 *  at the read seam (`getProject`/`listProjects`) rather than in each surface:
 *  a stored
 *  `phase: "motion"` would otherwise match no step in the rail, and the studio
 *  would silently open on Research instead of where the work actually is. */
const RETIRED_PHASES: Record<string, PhaseKey> = { motion: "frames" };

/** Bring a stored record up to the current step list. Cheap and idempotent —
 *  a record with nothing retired in it is returned untouched.
 *
 *  Progress merges worst-news-first: if Frames was locked but Motion was
 *  blocked, the merged Frames is blocked. Reporting the survivor as "done"
 *  when half of what it now covers had stopped would be the one lie this
 *  migration must not tell. */
export function migrateProject(p: Project): Project {
  const legacy = Object.keys(RETIRED_PHASES).filter((k) => k in p.progress);
  if (legacy.length === 0 && !(p.phase in RETIRED_PHASES)) return p;

  const progress = { ...p.progress };
  for (const old of legacy) {
    const heir = RETIRED_PHASES[old];
    const state = progress[old as PhaseKey];
    delete progress[old as PhaseKey];
    progress[heir] = worseOf(progress[heir], state);
  }
  return {
    ...p,
    phase: RETIRED_PHASES[p.phase] ?? p.phase,
    progress: progress as Record<PhaseKey, PhaseState>,
  };
}

/** Rank used by the merge above — the further left, the more it needs saying. */
const STATE_RANK: PhaseState[] = ["blocked", "review", "working", "done", "empty"];

function worseOf(a: PhaseState | undefined, b: PhaseState | undefined): PhaseState {
  if (!a) return b ?? "empty";
  if (!b) return a;
  return STATE_RANK.indexOf(a) <= STATE_RANK.indexOf(b) ? a : b;
}

/**
 * What a step is, honestly. `blocked` is not decoration — every phase surface
 * in this app already renders refused renders and missing blocks, so a project
 * list that cannot say "stuck" would be flattering the product.
 */
export type PhaseState = "empty" | "working" | "review" | "done" | "blocked";

export const PHASE_STATE_WORD: Record<PhaseState, string> = {
  empty: "not started",
  working: "in progress",
  review: "needs a call",
  done: "locked",
  blocked: "blocked",
};

/* ── Templates (knowledge/templates/*) ────────────────────────────────────── */

export const TEMPLATES = [
  {
    id: "short-form-clip",
    label: "Short-form clip",
    /** Target the brief asks for; `range` is what the craft library measured. */
    defaultS: 30,
    range: [15, 60] as const,
    note: "≤60s, target ≤30s — usually derived from a mid-length video",
  },
  {
    id: "short-educational-video",
    label: "Short educational",
    defaultS: 120,
    range: [60, 180] as const,
    note: "one idea, explained well — a question chain with facts hung on it",
  },
  {
    id: "mid-educational-video",
    label: "Mid-length educational",
    defaultS: 300,
    range: [180, 360] as const,
    note: "3–6 min — the shortest length that holds a full argument",
  },
] as const;

export type TemplateId = (typeof TEMPLATES)[number]["id"];

export function templateOf(id: TemplateId) {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[1];
}

/* ── The record ───────────────────────────────────────────────────────────── */

export interface Project {
  id: string;
  /** Owning account. Firebase uid — see the scoping note at the top. */
  uid: string;
  title: string;
  /** One line about what it is. Optional: a project can exist before it has one. */
  logline: string;
  template: TemplateId;
  /**
   * The locked visual identity this project is built on — see lib/themes.ts.
   *
   * Optional on the TYPE, required by the create path. That split is
   * deliberate: projects created before /library existed have no theme, and
   * treating them as invalid would break the shelf for the sake of a field
   * they never had the chance to fill.
   */
  themeId?: string;
  /** Target runtime in seconds. Seeded from the template, then user-owned. */
  targetS: number;
  createdAt: number;
  updatedAt: number;
  /** Where the work is now — the step /studio opens on. */
  phase: PhaseKey;
  progress: Record<PhaseKey, PhaseState>;
}

/** What the create/edit dialog collects. Everything else is derived. */
export type ProjectDraft = Pick<Project, "title" | "logline" | "template" | "targetS" | "themeId">;

export const emptyProgress = (): Record<PhaseKey, PhaseState> =>
  Object.fromEntries(PHASES.map((p) => [p, "empty"])) as Record<PhaseKey, PhaseState>;

/** A brand-new project: nothing done, parked on the first step. */
export function newProject(uid: string, draft: ProjectDraft): Project {
  const now = Date.now();
  return {
    id: `p-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    uid,
    title: draft.title.trim(),
    logline: draft.logline.trim(),
    template: draft.template,
    themeId: draft.themeId,
    targetS: draft.targetS,
    createdAt: now,
    updatedAt: now,
    phase: "research",
    progress: emptyProgress(),
  };
}

/* ── Derived facts the list surfaces read ─────────────────────────────────── */

/** Steps locked, out of five. The one number every variant shows. */
export function doneCount(p: Project): number {
  return PHASES.filter((k) => p.progress[k] === "done").length;
}

/** The first step that is not finished — what the project is actually waiting on. */
export function openStep(p: Project): PhaseKey | null {
  return PHASES.find((k) => p.progress[k] !== "done") ?? null;
}

/** A project is blocked if any step is. Sorting and grouping both read this. */
export function isBlocked(p: Project): boolean {
  return PHASES.some((k) => p.progress[k] === "blocked");
}

export type ProjectState = "blocked" | "review" | "working" | "delivered" | "draft";

/** One word for the whole project, worst-news-first. */
export function projectState(p: Project): ProjectState {
  if (isBlocked(p)) return "blocked";
  if (doneCount(p) === PHASES.length) return "delivered";
  if (PHASES.some((k) => p.progress[k] === "review")) return "review";
  if (PHASES.some((k) => p.progress[k] === "working" || p.progress[k] === "done")) return "working";
  return "draft";
}

/* ── CRUD ─────────────────────────────────────────────────────────────────── */

/** Every project this account owns, most recently touched first. */
export async function listProjects(uid: string): Promise<Project[]> {
  let db: IDBDatabase | null = null;
  try {
    db = await openDb();
    const rows = await getByIndex<Project>(db, PROJECTS_STORE, BY_UID, uid);
    return rows.map(migrateProject).sort((a, b) => b.updatedAt - a.updatedAt);
  } finally {
    db?.close();
  }
}

export async function getProject(id: string): Promise<Project | undefined> {
  let db: IDBDatabase | null = null;
  try {
    db = await openDb();
    const row = await getRecord<Project>(db, PROJECTS_STORE, id);
    return row && migrateProject(row);
  } finally {
    db?.close();
  }
}

/** Write one project. THROWS when it could not be stored — the caller says so. */
export async function putProject(p: Project): Promise<Project> {
  const stamped = { ...p, updatedAt: Date.now() };
  let db: IDBDatabase | null = null;
  try {
    db = await openDb();
    await runTx(db, PROJECTS_STORE, "readwrite", (store) => store.put(stamped));
    return stamped;
  } finally {
    db?.close();
  }
}

/** Write several at once — one transaction, so a partial seed cannot commit. */
export async function putProjects(rows: Project[]): Promise<void> {
  let db: IDBDatabase | null = null;
  try {
    db = await openDb();
    await runTx(db, PROJECTS_STORE, "readwrite", (store) => rows.forEach((r) => store.put(r)));
  } finally {
    db?.close();
  }
}

export async function deleteProject(id: string): Promise<void> {
  let db: IDBDatabase | null = null;
  try {
    db = await openDb();
    await runTx(db, PROJECTS_STORE, "readwrite", (store) => store.delete(id));
  } finally {
    db?.close();
  }
}
