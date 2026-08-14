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

import {
  BY_PROJECT,
  BY_UID,
  PROJECTS_STORE,
  STEPS_STORE,
  deleteByIndex,
  getByIndex,
  getKeysByIndex,
  getRecord,
  openDb,
  runTx,
} from "./studioDb";

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
  /**
   * THE BOOKMARK — the step /studio opens on. Not a claim about progress.
   *
   * It answers "where was I standing", which is a different question from
   * "how far has this got" (`progress`) and from "when was this worked on"
   * (`updatedAt`). `parkAt` is the only writer, and it deliberately leaves both
   * of the other two alone — see the note there.
   */
  phase: PhaseKey;
  /**
   * What each step says about ITSELF. Written only by `reportPhase`, only by a
   * surface that computed it from its own data. Everything here starts `empty`
   * and stays `empty` until a step has something real to report.
   */
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

// `openStep(p)` used to live here — "the first step that is not `done`" — with
// no consumers, and it is gone rather than wired up. Nothing in this app can
// LOCK a step: `done` is a human act of sign-off and there is no sign-off
// control on any of the five surfaces (see `reportPhase` below, and the note in
// app/_phases/frames/useFrames.ts on why the Frames reporter stops at
// `working`/`review`). So the function was guaranteed to answer "research" for
// every project a user creates, forever. An exported helper that can only ever
// be wrong is worse than no helper — `project.phase` answers "where is this
// project" honestly, and that is what the studio reads.

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

/** The raw write, exactly as given. THROWS when it could not be stored.
 *
 *  Private on purpose: `updatedAt` is what the shelf sorts on, so "write this
 *  record without touching it" is a decision that has to be made deliberately
 *  at each call site rather than fallen into. `parkAt` is the only caller that
 *  makes it. */
async function writeProject(p: Project): Promise<Project> {
  let db: IDBDatabase | null = null;
  try {
    db = await openDb();
    await runTx(db, PROJECTS_STORE, "readwrite", (store) => store.put(p));
    return p;
  } finally {
    db?.close();
  }
}

/** Write one project, marking it as touched. THROWS when it could not be
 *  stored — the caller says so. */
export async function putProject(p: Project): Promise<Project> {
  return writeProject({ ...p, updatedAt: Date.now() });
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

/* ── What the studio writes back ──────────────────────────────────────────── */

// TWO WRITERS, AND THEY ARE NOT THE SAME KIND OF FACT. This is the whole design
// of this section, so it is stated once here rather than half-argued twice
// below.
//
// StudioView's rail used to write nothing at all, defended by a comment that is
// still right as far as it goes: *browsing is not progress*, and a shelf sorted
// by "last touched" starts lying the moment looking at something counts as
// working on it. But that is an argument against writing PROGRESS and
// `updatedAt` on a browse. It was never an argument against remembering where
// somebody was standing. Frozen at `"research"`, `project.phase` made the user
// re-walk the rail on every single re-entry to say something the app already
// knew.
//
// So the two facts are separated:
//
//   parkAt      · a BOOKMARK. Moves `phase`, touches nothing else — not
//                 `progress`, not `updatedAt`. Costs the shelf nothing: the
//                 matrix does not draw `phase`, and its sort order does not
//                 move. Cheap enough to fire on every rail click.
//   reportPhase · a CLAIM, and the only door `progress` opens through. A step
//                 states what it computed about ITSELF, and that IS work, so it
//                 stamps `updatedAt` and the shelf re-sorts. `ProjectDraft` is
//                 deliberately not this door: progress is not a form field, and
//                 no dialog should be able to type a project into `done`.
//
// Both read-modify-write, and both are no-ops when nothing changed — which is
// what lets callers fire them from a render-driven effect without churning the
// store. Neither rejects to its caller by contract; both THROW like every other
// write here, and both call sites catch, because a ledger entry that did not
// land must not take a working step down with it.
//
// Single-tab prototype: read-modify-write can race a concurrent writer in
// another tab. It cannot corrupt anything (last write wins on whole records),
// and the day this record is server-backed the seam is one PATCH per function.

/** Remember where the user is standing. See the note above: this is a bookmark,
 *  so `updatedAt` and `progress` are left exactly where they were. */
export async function parkAt(id: string, phase: PhaseKey): Promise<void> {
  const current = await getProject(id);
  if (!current || current.phase === phase) return;
  await writeProject({ ...current, phase });
}

/**
 * A step says what it has got to. The ONE mechanism — five surfaces do not each
 * invent a write.
 *
 * `empty` is not sayable, and that is the honest shape rather than a missing
 * case: `empty` means "nothing has been reported here", which is what the
 * record already holds until something is. A reporter with nothing to say says
 * NOTHING and leaves the cell alone — so a step that has no reporter at all and
 * a step whose reporter found nothing read identically, which is true, and
 * neither one can quietly wipe a state it did not write.
 */
export async function reportPhase(
  id: string,
  phase: PhaseKey,
  state: Exclude<PhaseState, "empty">,
): Promise<Project | undefined> {
  const current = await getProject(id);
  if (!current) return undefined;
  if (current.progress[phase] === state) return current;
  return putProject({ ...current, progress: { ...current.progress, [phase]: state } });
}

/* ── Deleting, and saying first what that takes ───────────────────────────── */

/** What a project is holding, WITHOUT reading a byte of it.
 *
 *  Derived from the step store's primary keys alone (`${projectId}:${phase}`),
 *  which is why it is cheap enough to run while a confirmation dialog opens: a
 *  project with a composed cut in it is several megabytes of base64, and asking
 *  "how much would I destroy" must not be the thing that loads it. */
export interface ProjectContents {
  /** How many step records this project owns. */
  steps: number;
  /** Which ones, by phase key — `["research", "script", "frames"]`. Ordered as
   *  PHASES orders them, with anything unrecognised (a retired step, a future
   *  one) kept at the end rather than dropped: the confirmation must not
   *  under-count what it is about to take. */
  phases: string[];
}

export const EMPTY_CONTENTS: ProjectContents = { steps: 0, phases: [] };

/** Split `${projectId}:${phase}` back into its phase half.
 *
 *  Coupled to app/_phases/_shared/stepStore.ts#key, which is the only writer of
 *  these keys. Sliced by the id's own length rather than split on ":" because a
 *  project id is user-adjacent and a colon in one must not shift the answer. */
function phaseOfStepKey(id: string, key: IDBValidKey): string {
  const s = String(key);
  return s.startsWith(`${id}:`) ? s.slice(id.length + 1) : s;
}

function orderPhases(raw: string[]): string[] {
  const known = PHASES.filter((p) => raw.includes(p)) as string[];
  const rest = raw.filter((p) => !(PHASES as readonly string[]).includes(p)).sort();
  return [...known, ...rest];
}

/** What `deleteProject(id)` would destroy. Never rejects: a confirmation that
 *  cannot count is still a confirmation, and refusing to open the dialog because
 *  the store hiccuped would be the worse failure. An unreadable store answers
 *  `{ steps: 0 }`, and the delete itself still reports what it actually took. */
export async function projectContents(id: string): Promise<ProjectContents> {
  let db: IDBDatabase | null = null;
  try {
    db = await openDb();
    if (!db.objectStoreNames.contains(STEPS_STORE)) return EMPTY_CONTENTS;
    const keys = await getKeysByIndex(db, STEPS_STORE, BY_PROJECT, id);
    return { steps: keys.length, phases: orderPhases(keys.map((k) => phaseOfStepKey(id, k))) };
  } catch {
    return EMPTY_CONTENTS;
  } finally {
    db?.close();
  }
}

/**
 * Delete a project AND everything it owns, in one transaction.
 *
 * This used to remove the project row alone. Every step record it owned — the
 * research scope, the script versions, the frames with their base64 plates at
 * roughly 5MB per composed cut — stayed behind, orphaned and unreachable: no
 * surface could list it, no count included it, and nothing would ever delete it,
 * while it went on consuming the same quota the storage-trouble banner exists to
 * warn about. `studioDb`'s `by-project` index was created for exactly this and
 * had never been queried.
 *
 * ONE TRANSACTION over both stores, so a partial delete cannot commit — the
 * guarantee `putProjects` already gives the seed. Half-deleting is the one
 * outcome worse than not deleting: a project row without its steps is a project
 * that opens empty, and steps without their row are the leak this fixes.
 *
 * Returns what it took, so the caller can say so afterwards rather than assume.
 */
export async function deleteProject(id: string): Promise<ProjectContents> {
  let db: IDBDatabase | null = null;
  try {
    db = await openDb();
    // The steps store is created in the upgrade path, but a database that
    // predates it would make `db.transaction([...])` throw NotFoundError and
    // take the project row down with it. Name only what is there.
    const hasSteps = db.objectStoreNames.contains(STEPS_STORE);
    let took: ProjectContents = EMPTY_CONTENTS;
    await runTx(db, hasSteps ? [PROJECTS_STORE, STEPS_STORE] : PROJECTS_STORE, "readwrite", (projects, tx) => {
      projects.delete(id);
      if (!hasSteps) return;
      // Scoped by the INDEX on the `projectId` field — an equality match on the
      // owning id, never a prefix scan over the composite key. `p-abc` and
      // `p-abcd` are different values and cannot select each other.
      deleteByIndex(tx.objectStore(STEPS_STORE), BY_PROJECT, id, (keys) => {
        took = { steps: keys.length, phases: orderPhases(keys.map((k) => phaseOfStepKey(id, k))) };
      });
    });
    return took;
  } finally {
    db?.close();
  }
}
