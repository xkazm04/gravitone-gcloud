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

/** The six studio steps, in production order. The ONE source of that order —
 *  the /studio stepper and every /projects surface read it from here.
 *
 *  MOTION IS A STEP AGAIN (operator decision, 2026-10-05; card
 *  video-clip-pipeline-B). It was folded into Frames once, on the argument
 *  that a still and the movement given to it are one art-direction decision.
 *  That held while a clip could only be TYPED: nothing in the app could read a
 *  plate, propose what moves, or render it. Motion now owns the turn that
 *  reads a plate and proposes (or declines) its movement, and the later stages
 *  own the render queue, the graded takes and adoption — enough work, with its
 *  own failure states, to be a step. The motion line itself still lives on the
 *  frame (`FrameClip.motion`), so a still and its movement remain one record. */
export const PHASES = ["research", "script", "frames", "motion", "score", "cut"] as const;
export type PhaseKey = (typeof PHASES)[number];

export const PHASE_TITLE: Record<PhaseKey, string> = {
  research: "Research",
  script: "Script",
  frames: "Frames",
  motion: "Motion",
  score: "Score",
  cut: "Cut",
};

/** Steps that no longer exist, and the step that absorbed each one.
 *
 *  Records written before a step was retired still name it — in `phase`, and
 *  as a key in `progress`. Both are read on every load, so the rename happens
 *  at the read seam (`getProject`/`listProjects`) rather than in each surface:
 *  a stored bookmark naming a retired step would otherwise match no step in
 *  the rail, and the studio would silently open on Research instead of where
 *  the work actually is.
 *
 *  EMPTY TODAY, and kept: `motion → frames` lived here until Motion came back.
 *  A record still carrying a `motion` word from before that retirement was
 *  never re-saved since (every write migrated it away), so the word is the
 *  old Motion step's own claim about itself and is read as exactly that. The
 *  merge into Frames was only right while Motion did not exist. */
const RETIRED_PHASES: Record<string, PhaseKey> = {};

/** Bring a stored record up to the current step list. Cheap and idempotent —
 *  a current record is returned untouched.
 *
 *  Two directions, both at this one seam:
 *   · a RETIRED step's word merges into its heir worst-news-first: if the heir
 *     was locked but the retired step was blocked, the merged step is blocked.
 *     Reporting the survivor as "done" when half of what it now covers had
 *     stopped would be the one lie this migration must not tell.
 *   · a step ADDED after the record was written (Motion, for every record from
 *     a five-step build) reads `empty` — the only honest word for a step that
 *     did not exist when the work was done. Never derived from its neighbours:
 *     a locked Frames says nothing about whether anything was ever directed to
 *     move. */
export function migrateProject(p: Project): Project {
  const legacy = Object.keys(RETIRED_PHASES).filter((k) => k in p.progress);
  const missing = PHASES.filter((k) => !(k in p.progress));
  const needsDiscipline = !p.discipline;
  if (legacy.length === 0 && missing.length === 0 && !(p.phase in RETIRED_PHASES) && !needsDiscipline) return p;

  // A record from before disciplines existed: the template already implies
  // one, so it is filled here rather than left for every surface to derive.
  const discipline = p.discipline ?? disciplineOf(p.template);

  const progress = { ...p.progress } as Record<string, PhaseState>;
  for (const old of legacy) {
    const heir = RETIRED_PHASES[old];
    const state = progress[old];
    delete progress[old];
    progress[heir] = worseOf(progress[heir], state);
  }
  for (const k of missing) progress[k] = "empty";
  return {
    ...p,
    discipline,
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

/* ── Disciplines — the kind of video, above the template ──────────────────── */

/** The discipline is the question asked BEFORE the template: what kind of
 *  video is this at all. Educational and promotional pieces are different
 *  contracts (see the note on the promotional formats below), and `free` is
 *  the honest third answer — a video the craft library has no template for,
 *  where the studio only keeps time. */
export const DISCIPLINES = ["educational", "trailer", "free", "music-video", "ads"] as const;
export type Discipline = (typeof DISCIPLINES)[number];

export const DISCIPLINE_LABEL: Record<Discipline, string> = {
  educational: "Educational video",
  trailer: "Movie · game trailer",
  free: "Any video",
  "music-video": "Music video",
  ads: "Ad",
};

/** The one line the create dialog shows under each discipline pill. */
export const DISCIPLINE_NOTE: Record<Discipline, string> = {
  educational: "an argument explained well — the craft library measured these",
  trailer: "a promotional cut that opens a debt another artifact pays",
  free: "no craft template — your own discipline; the studio only keeps time",
  "music-video": "one track, one poster brought to life — beat-driven, not hand-animated",
  ads: "one idea that sells — picked from options, drawn as stills, then animated and finished",
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

  // ── The promotional formats ───────────────────────────────────────────────
  //
  // THREE IDS, NOT ONE, AND THEY ARE APPENDED RATHER THAN INSERTED.
  //
  // The three above are self-sufficient pieces: each answers the question it
  // raises, and a withheld answer in one of them reads as not having one. A
  // promotional cut inverts that — its product is an UNPAID DEBT, and it
  // succeeds by opening a gap another artifact closes. That is a different
  // contract, not a different length, which is why these are not a `range` on
  // an existing entry.
  //
  // And it is three contracts, not one. The craft library's own source
  // separates them (`.vault/Research/2026-08-23-trailer-cinematic-grammar.md`
  // C7, "Teaser vs trailer vs cinematic are different contracts"), and the
  // registry's length-ladder gives the mechanism: shortening a promotional cut
  // REMOVES whole parts in a known order rather than scaling every part, so the
  // rungs "are not versions of each other". A single `trailer` id with a wide
  // range would encode exactly the uniform-trimming model that technique exists
  // to prevent.
  //
  // APPENDED, because `templateOf`'s fallback is POSITIONAL (`TEMPLATES[1]`).
  // Inserting anything ahead of `short-educational-video` silently re-points
  // every unrecognised id at a different format.
  //
  // Every figure below is sourced in `knowledge/templates/<id>/TEMPLATE.md`,
  // and none of it was measured in this repo — the corpus for all three is
  // n=0. The `note` is the one line the create dialog shows.
  {
    id: "teaser",
    label: "Teaser",
    /** ~1 min, one hook. C7 · S30. Nothing below 60s is measured anywhere the
     *  library can reach — see the template's evidence gap. */
    defaultS: 60,
    range: [15, 60] as const,
    note: "≤60s, one hook — imagery and tone, light on story",
  },
  {
    id: "trailer",
    label: "Trailer",
    /** 90–150s (C7); the registry's measured centre of gravity sits just above
     *  two minutes, which is why the default is 120 rather than the midpoint. */
    defaultS: 120,
    range: [90, 150] as const,
    note: "90–150s — the full spine, and it may spell out plot",
  },
  {
    id: "cinematic",
    label: "Cinematic",
    /** NOT distinguished by length — see the template. The band is the vault's
     *  own beat sheet ("90–120 s cinematic trailer; scale durations
     *  proportionally for 60 s"), and it overlaps `trailer` on purpose. */
    defaultS: 120,
    range: [60, 120] as const,
    note: "imagery when the footage does not exist yet — a stage, not a length",
  },

  // ── The free discipline ───────────────────────────────────────────────────
  //
  // ONE ID, APPENDED LAST, AND IT CLAIMS NO CRAFT. The `range` is not a
  // measurement — nothing in knowledge/ measured "any video" — it is the
  // widest band the runtime input accepts, and lib/formatBrief.ts renders this
  // template as NOT STATED rather than as a format with rules.
  {
    id: "free-form",
    label: "Free form",
    defaultS: 90,
    range: [15, 600] as const,
    note: "no craft template — your own discipline; the studio only keeps time",
  },

  // ── The music-video discipline ────────────────────────────────────────────
  //
  // ONE ID, APPENDED LAST. The runtime is the attached track's real decoded
  // duration (lib/audioEnvelope.ts, WP2), never a user-typed target — `range`
  // is the band a single-poster piece stays watchable in, not a measurement
  // from knowledge/, which this template does not have one of either.
  {
    id: "music-video",
    label: "Music video",
    defaultS: 120,
    range: [60, 240] as const,
    note: "one track, one poster animated to it — length follows the mp3",
  },

  // ── The ads discipline ────────────────────────────────────────────────────
  //
  // TWO IDS, APPENDED LAST (positional fallback, see `templateOf`). An ad pays
  // its own debt — unlike the promotional family above, whose product is a gap
  // another artifact closes — so these are their own family, not trailer rungs.
  // Both are n=0: the figures are doctrine quoted in
  // knowledge/templates/<id>/TEMPLATE.md, never measured in this repo.
  {
    id: "ad-social-15",
    label: "Social ad · 15s",
    defaultS: 15,
    range: [6, 20] as const,
    note: "9:16, hook in the first second, sound-off first",
  },
  {
    id: "ad-spot-30",
    label: "Spot · 30s",
    defaultS: 30,
    range: [20, 45] as const,
    note: "16:9 or 1:1 — room for a small arc and an end-card",
  },
] as const;

export type TemplateId = (typeof TEMPLATES)[number]["id"];

/** Which discipline each template belongs to. Exhaustive on purpose: a template
 *  appended without a family here is a typecheck failure, not an orphan pill. */
export const TEMPLATE_FAMILY: Record<TemplateId, Discipline> = {
  "short-form-clip": "educational",
  "short-educational-video": "educational",
  "mid-educational-video": "educational",
  teaser: "trailer",
  trailer: "trailer",
  cinematic: "trailer",
  "free-form": "free",
  "music-video": "music-video",
  "ad-social-15": "ads",
  "ad-spot-30": "ads",
};

/** The templates a discipline offers, in catalogue order. Never empty — every
 *  discipline owns at least one template, which is what lets the dialog take
 *  `templatesFor(d)[0]` as the default without a guard. */
export function templatesFor(d: Discipline) {
  return TEMPLATES.filter((t) => TEMPLATE_FAMILY[t.id] === d);
}

/** The discipline a template implies — how a record written before
 *  `discipline` existed gets one (see `migrateProject`). */
export function disciplineOf(template: TemplateId): Discipline {
  return TEMPLATE_FAMILY[template] ?? TEMPLATE_FAMILY[templateOf(template).id];
}

/** The catalogue entry for an id, with a fallback for one that is not in it.
 *
 *  THE FALLBACK IS POSITIONAL AND THAT IS LOAD-BEARING. `TEMPLATES[1]` is
 *  `short-educational-video` — the middle of the three self-sufficient formats,
 *  which is the right answer for a dropdown that must render something. It is
 *  only correct while the self-sufficient formats stay first, so the later
 *  entries (promotional, then free-form) are APPENDED and never inserted ahead of it;
 *  an insert at the front would silently re-point every unrecognised id at a
 *  different format, and nothing would fail.
 *
 *  It is also right ONLY for a dropdown. `formatBriefFor` in lib/formatBrief.ts
 *  deliberately refuses to fall back, because a default in a prompt is a format
 *  the user never chose, stated to a model as fact. */
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
   * The kind of video — the question above `template`. See DISCIPLINES.
   *
   * Optional on the TYPE, required by the create path, for the same reason as
   * `themeId`: records written before the discipline existed have none, and
   * the read seam (`migrateProject`) derives it from the template rather than
   * treating those records as invalid.
   */
  discipline?: Discipline;
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
  /**
   * Human sign-off timestamps per step.
   *
   * Distinct from automated progress: a human explicitly locks a step.
   * When present, `stateOf(p, phase)` reads 'done' unless the step reports
   * 'blocked' (blocked beats lock).
   */
  signedOff?: Partial<Record<PhaseKey, number>>;
}

/** What the create/edit dialog collects. Everything else is derived. */
export type ProjectDraft = Pick<
  Project,
  "title" | "logline" | "discipline" | "template" | "targetS" | "themeId"
>;

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
    discipline: draft.discipline ?? disciplineOf(draft.template),
    themeId: draft.themeId,
    targetS: draft.targetS,
    createdAt: now,
    updatedAt: now,
    phase: "research",
    progress: emptyProgress(),
  };
}

/* ── Derived facts the list surfaces read ─────────────────────────────────── */

/**
 * Effective state of a step, reconciling automated progress with human sign-off.
 *
 * Rules:
 * 1. If automated progress is 'blocked', return 'blocked' (worst news beats lock).
 * 2. Else if the step was signed off, return 'done' (human lock holds).
 * 3. Else return the step's own automated progress.
 */
export function stateOf(p: Project, phase: PhaseKey): PhaseState {
  if (p.progress[phase] === "blocked") return "blocked";
  if (p.signedOff?.[phase]) return "done";
  // `?? "empty"` for a record that reached a reader without passing the read
  // seam (a fixture, a synthetic row): a step it never heard of has not started.
  return p.progress[phase] ?? "empty";
}

/** Effective states across every phase — derived from PHASES, so a step added
 *  there cannot be missing here. */
export function phaseStates(p: Project): Record<PhaseKey, PhaseState> {
  return Object.fromEntries(PHASES.map((k) => [k, stateOf(p, k)])) as Record<PhaseKey, PhaseState>;
}

/** Steps locked, out of `PHASES.length`. The one number every variant shows. */
export function doneCount(p: Project): number {
  return PHASES.filter((k) => stateOf(p, k) === "done").length;
}

/** A project is blocked if any step is. Sorting and grouping both read this. */
export function isBlocked(p: Project): boolean {
  return PHASES.some((k) => stateOf(p, k) === "blocked");
}

export type ProjectState = "blocked" | "review" | "working" | "delivered" | "draft";

/** One word for the whole project, worst-news-first. */
export function projectState(p: Project): ProjectState {
  if (isBlocked(p)) return "blocked";
  if (doneCount(p) === PHASES.length) return "delivered";
  const states = phaseStates(p);
  if (PHASES.some((k) => states[k] === "review")) return "review";
  if (PHASES.some((k) => states[k] === "working" || states[k] === "done")) return "working";
  return "draft";
}

/* ── CRUD ─────────────────────────────────────────────────────────────────── */

/** Every project this account owns, most recently touched first. */
export async function listProjects(uid: string): Promise<Project[]> {
  let db: IDBDatabase | null = null;
  try {
    db = await openDb();
    const rows = await getByIndex<Project>(db, PROJECTS_STORE, BY_UID, uid);
    return rows.map(migrateProject).sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
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

/**
 * Write several at once, ONLY if none of them is there yet — the seed's writer.
 *
 * One transaction, so a partial seed cannot commit. And `add` rather than `put`,
 * so a CONCURRENT seed cannot double-write: two tabs opening a fresh account
 * both read an empty shelf and both see "not seeded", because `alreadySeeded` is
 * a localStorage flag read outside any transaction and localStorage has no
 * compare-and-swap to give it. `add` moves the guard to the one place that can
 * actually keep it. The second transaction raises `ConstraintError` on the first
 * id that already exists, aborts as a whole, and writes NOTHING; the loser
 * re-lists and finds the winner's rows.
 *
 * Losing that race is not an error and does not reject — `seedProjects` mints
 * stable, content-addressed ids for exactly this reason, so the winner's rows
 * are the rows this call was going to write. Anything else (quota, a blocked
 * upgrade) still throws, because that IS an error and the shelf has a banner.
 */
export async function addProjects(rows: Project[]): Promise<void> {
  let db: IDBDatabase | null = null;
  try {
    db = await openDb();
    await runTx(db, PROJECTS_STORE, "readwrite", (store) => rows.forEach((r) => store.add(r)));
  } catch (e) {
    // Duck-typed on `name`, like stepStore's classifier and for the same reason:
    // `DOMException` is not a global in every runtime this module is imported
    // into, and a check that throws while checking is worse than what it reads.
    //
    // This depends on `runTx` rejecting with the REQUEST's error rather than the
    // transaction's — see the note there. It did not, until this was measured:
    // `tx.error` is null when `tx.onerror` fires, so a lost seed race arrived
    // here as a nameless "write failed" and would have been rethrown, putting a
    // storage banner over a shelf that is perfectly fine.
    const name = typeof e === "object" && e !== null ? (e as { name?: string }).name : undefined;
    if (name !== "ConstraintError") throw e;
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

/**
 * Mutate a project record in place inside a single read-write transaction.
 *
 * Prevents concurrent writers from clobbering each other's fields.
 * Returns the updated record (migrated), or null if the record was not found.
 */
export async function patchProject(
  id: string,
  mutate: (p: Project) => void | boolean,
  opts?: { touch?: boolean },
): Promise<Project | null> {
  let db: IDBDatabase | null = null;
  try {
    db = await openDb();
    let updated: Project | null = null;
    await runTx(db, PROJECTS_STORE, "readwrite", (store) => {
      const req = store.get(id);
      req.onsuccess = () => {
        const row = req.result as Project | undefined;
        if (!row) return;
        const migrated = migrateProject(row);
        const p: Project = {
          ...migrated,
          progress: { ...migrated.progress },
          signedOff: migrated.signedOff ? { ...migrated.signedOff } : undefined,
        };
        const result = mutate(p);
        if (result === false) {
          updated = migrated;
          return;
        }
        if (opts?.touch) p.updatedAt = Date.now();
        store.put(p);
        updated = p;
      };
    });
    return updated;
  } finally {
    db?.close();
  }
}

/** Remember where the user is standing. See the note above: this is a bookmark,
 *  so `updatedAt` and `progress` are left exactly where they were. */
export async function parkAt(id: string, phase: PhaseKey): Promise<void> {
  await patchProject(
    id,
    (p) => {
      p.phase = phase;
    },
    { touch: false },
  );
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
  const updated = await patchProject(
    id,
    (p) => {
      p.progress[phase] = state;
    },
    { touch: true },
  );
  return updated ?? undefined;
}

/**
 * Patch an existing project record with allowed draft fields.
 *
 * Only ProjectDraft fields cross the edit door — phase, progress, uid,
 * id, and timestamps can NEVER be overwritten via this function.
 * Stamps updatedAt to mark the project as touched.
 */
export async function editProject(
  id: string,
  draft: Partial<ProjectDraft>,
): Promise<Project | null> {
  return patchProject(
    id,
    (p) => {
      const d = draft as Record<string, unknown>;
      if (typeof d.title === "string") p.title = d.title.trim();
      if (typeof d.logline === "string") p.logline = d.logline.trim();
      if (d.discipline !== undefined) p.discipline = d.discipline as Discipline;
      if (d.template !== undefined) p.template = d.template as TemplateId;
      if (typeof d.targetS === "number") p.targetS = d.targetS;
      if (d.themeId !== undefined) p.themeId = d.themeId as string | undefined;
      if (d.description !== undefined) (p as unknown as Record<string, unknown>).description = d.description;
      if (d.theme !== undefined) (p as unknown as Record<string, unknown>).theme = d.theme;
      if (d.outputCount !== undefined) (p as unknown as Record<string, unknown>).outputCount = d.outputCount;
    },
    { touch: true },
  );
}

/**
 * Why a step cannot be signed off, or null if sign-off is permitted.
 *
 * A step cannot be signed off if it is blocked, or if nothing has been started on it.
 */
export function signOffBlocker(p: Project, phase: PhaseKey): string | null {
  if (p.progress[phase] === "blocked") return "Step is blocked and cannot be signed off";
  if (p.progress[phase] === "empty") return "Nothing has been started on this step yet";
  return null;
}

/**
 * Sign off (lock) a step.
 *
 * Explicit human milestone. Refuses if signOffBlocker returns a reason.
 * Sets p.signedOff[phase] = Date.now().
 * Stamps updatedAt to mark the project as touched.
 */
export async function signOff(id: string, phase: PhaseKey): Promise<Project | null> {
  return patchProject(
    id,
    (p) => {
      if (signOffBlocker(p, phase)) return false;
      p.signedOff = { ...p.signedOff, [phase]: Date.now() };
    },
    { touch: true },
  );
}

/**
 * Reopen a signed-off step.
 *
 * Removes human sign-off lock for this phase.
 * If nothing was signed off, does not touch updatedAt or write to store.
 */
export async function reopen(id: string, phase: PhaseKey): Promise<Project | null> {
  return patchProject(
    id,
    (p) => {
      if (!p.signedOff?.[phase]) return false;
      delete p.signedOff[phase];
    },
    { touch: true },
  );
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

/** What `deleteProject(id)` would destroy, or a REJECTION when the store cannot
 *  be read. An unreadable count is not a zero: the delete confirmation that
 *  called this used to print "No saved steps." for a store it could not open,
 *  and the cascade that followed removed the steps it had just denied. The
 *  caller decides how to say "could not count"; the delete itself still
 *  reports what it actually took. */
export async function readProjectContents(id: string): Promise<ProjectContents> {
  let db: IDBDatabase | null = null;
  try {
    db = await openDb();
    if (!db.objectStoreNames.contains(STEPS_STORE)) return EMPTY_CONTENTS;
    const keys = await getKeysByIndex(db, STEPS_STORE, BY_PROJECT, id);
    return { steps: keys.length, phases: orderPhases(keys.map((k) => phaseOfStepKey(id, k))) };
  } finally {
    db?.close();
  }
}

/** The never-rejecting readback for callers that report a count rather than
 *  gate a destructive act on it (the test harness's project readback). An
 *  unreadable store answers `{ steps: 0 }`; a confirmation must use
 *  `readProjectContents` instead. */
export async function projectContents(id: string): Promise<ProjectContents> {
  try {
    return await readProjectContents(id);
  } catch {
    return EMPTY_CONTENTS;
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
