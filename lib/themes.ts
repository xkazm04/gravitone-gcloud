"use client";

// THE THEME RECORD — a visual identity, and its CRUD.
//
// A theme is what /library produces and every project consumes: the four-slot
// style block, the element vocabulary it covers, and a sheet of PROOFS the user
// approved. It is the second real (non-mocked) record in this app, after
// Project, and it lives in the same IndexedDB for the same reason.
//
// The lifecycle is deliberately a one-way ratchet with one gate in it:
//
//    draft ──generate proofs──> proofing ──approve them all──> locked
//
// `locked` is the state a project may be created against. That gate is the
// point of the whole surface: the research this product is built on found that
// style consistency comes from an APPROVED ARTIFACT, not from a prompt suffix,
// and that skipping the approval step is the single reliable way to get forty
// frames that do not match.

import type { Discipline } from "./projects";
import { getByIndex, getRecord, openDb, runTx, BY_UID, THEMES_STORE } from "./studioDb";

/* ── The style block ──────────────────────────────────────────────────────── */

/** Which job a colour does. An unassigned palette drifts: the model re-casts
 *  which colour carries meaning on every frame. */
export type ColorRole = "ground" | "objects" | "accent";

export interface PaletteColor {
  name: string;
  hex: string;
  role: ColorRole;
}

/** The four slots. Plain language on purpose — this is what the user edits,
 *  and it is compiled to model syntax only at generation time. */
export interface StyleBlock {
  technique: string;
  subject: string;
  /** Exactly three, one per role. */
  palette: PaletteColor[];
  finish: string;
}

/* ── Proofs ───────────────────────────────────────────────────────────────── */

export type ProofState = "pending" | "approved" | "rejected";

/** One rendered reference. `base64` is the real image — these are what get sent
 *  back as style references once the theme is locked. */
export interface Proof {
  id: string;
  label: string;
  base64: string;
  mime: string;
  state: ProofState;
  note?: string;
  /** What produced it, kept so a sheet can be audited later — and so a proof
   *  promoted to the shelf can carry its lineage there (lib/assets.ts).
   *  `provider` is absent on proofs kept before it was recorded; that is
   *  absence, and the surfaces reading it show absence rather than a guess. */
  model?: string;
  provider?: string;
  costUsd?: number;
  createdAt: number;
}

/** The production model's reference-image window.
 *
 *  It caps the APPROVED proofs on a sheet, not the sheet: an approved proof is
 *  a reference on the next generation, a rejected one is a record of what the
 *  style is not and is never sent anywhere. Counting rejections against the
 *  window is what turned a sheet of fourteen into a dead end — the playground
 *  switched off permanently and told the user to "reject one to make room",
 *  which did nothing at all. */
export const PROOF_CAP = 14;

/* ── The record ───────────────────────────────────────────────────────────── */

export type ThemeStatus = "draft" | "proofing" | "locked";
export type ThemeOrigin = "scratch" | "preset" | "screenshot";

export const STATUS_WORD: Record<ThemeStatus, string> = {
  draft: "still words",
  proofing: "proofing",
  locked: "locked",
};

export const ORIGIN_WORD: Record<ThemeOrigin, string> = {
  scratch: "from a brief",
  preset: "from a preset",
  screenshot: "from a screenshot",
};

export interface Theme {
  id: string;
  uid: string;
  name: string;
  origin: ThemeOrigin;
  /** Set when origin is "preset" — which one it started from. */
  presetId?: string;
  /** The kind of video this style was made for. UNTAGGED MEANS EVERY
   *  DISCIPLINE: a style from a brief, or one made before disciplines existed,
   *  is offered to every project, and `styleFits` is the one place that rule is
   *  read. A theme started from a preset inherits the preset's tag. */
  discipline?: Discipline;
  block: StyleBlock;
  elements: string[];
  proofs: Proof[];
  createdAt: number;
  updatedAt: number;
  lockedAt?: number;
}

export type ThemeDraft = Pick<Theme, "name" | "block" | "elements"> & {
  origin: ThemeOrigin;
  presetId?: string;
  discipline?: Discipline;
};

/** Which disciplines a style list can be filtered by — the three, or none. */
export type DisciplineFilter = Discipline | "all";

/** THE one predicate for "may this style serve this discipline". The create
 *  dialog, the atelier's style pills and the preset rail all filter with it,
 *  because three copies of `!t.discipline || t.discipline === d` is how they
 *  start disagreeing. Untagged fits everything; `"all"` matches everything. */
export function styleFits(theme: { discipline?: Discipline }, discipline: DisciplineFilter): boolean {
  return discipline === "all" || !theme.discipline || theme.discipline === discipline;
}

export function newTheme(uid: string, draft: ThemeDraft): Theme {
  const now = Date.now();
  return {
    id: `th-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    uid,
    name: draft.name.trim() || "Untitled style",
    origin: draft.origin,
    presetId: draft.presetId,
    discipline: draft.discipline,
    block: draft.block,
    elements: draft.elements,
    proofs: [],
    createdAt: now,
    updatedAt: now,
  };
}

/* ── Derived state — one definition, read everywhere ──────────────────────── */

/** Status is DERIVED, never stored. A stored status is a second source of
 *  truth that drifts the moment a proof is approved somewhere that forgot to
 *  update it. */
export function statusOf(t: Theme): ThemeStatus {
  if (t.lockedAt) return "locked";
  return t.proofs.length ? "proofing" : "draft";
}

export const approvedProofs = (t: Theme): Proof[] => t.proofs.filter((p) => p.state === "approved");

/** Whether the sheet already holds the model's whole reference window. The one
 *  thing that makes room is rejecting an approved proof — which is exactly what
 *  the surface tells the user to do, and now the only thing it needs to be. */
export const sheetFull = (t: Theme): boolean => approvedProofs(t).length >= PROOF_CAP;

/** What a sheet cost, as far as the vendor said. `unpriced` is counted rather
 *  than assumed free — it is what makes the total a floor, and anything asking
 *  a user to throw this away has to say so honestly. */
export function sheetSpend(t: Theme): { usd: number; unpriced: number } {
  return {
    usd: t.proofs.reduce((sum, p) => sum + (p.costUsd ?? 0), 0),
    unpriced: t.proofs.filter((p) => p.costUsd === undefined).length,
  };
}

/**
 * The lock gate. A theme locks when it has at least one approved proof and
 * nothing still undecided — a rejected proof is a decision, a pending one is
 * not. Rejections are kept on the sheet on purpose: they are the record of what
 * this style is NOT, and re-generating one is how a sheet gets fixed.
 */
export function canLock(t: Theme): boolean {
  if (t.lockedAt) return false;
  return approvedProofs(t).length > 0 && t.proofs.every((p) => p.state !== "pending");
}

/** The locked styles in a list — the only ones a project may be built on.
 *
 *  One definition because "is this style locked" is asked by the create gate,
 *  the dialog's picker and the library's chip, and three copies of
 *  `statusOf(t) === "locked"` is how they start disagreeing. */
export const lockedOnly = (ts: Theme[]): Theme[] => ts.filter((t) => statusOf(t) === "locked");

/** Why the lock button is disabled, in the user's words. */
export function lockBlocker(t: Theme): string | null {
  if (t.lockedAt) return null;
  if (!t.proofs.length) return "generate at least one proof first";
  const pending = t.proofs.filter((p) => p.state === "pending").length;
  if (pending) return `${pending} proof${pending > 1 ? "s" : ""} still undecided`;
  if (!approvedProofs(t).length) return "every proof was rejected — generate another";
  return null;
}

/* ── Which style a project renders in ─────────────────────────────────────── */

/**
 * Why a project is NOT rendering in the style it was created with. The normal
 * case — it is — has no entry here; it is `miss: null`.
 *
 *   unset    the record carries no `themeId`. Projects made before /library
 *            existed, and the demo shelf, are in this state (`themeId` is
 *            optional on the type for exactly that reason, projects.ts).
 *   deleted  it carries one, and no theme with that id is on this account.
 */
export type StyleMiss = "unset" | "deleted";

/** Resolved, as a union so a caller cannot read a name off a miss. */
export type ProjectStyle = { theme: Theme; miss: null } | { theme: null; miss: StyleMiss };

/**
 * THE one place a project's visual identity is resolved.
 *
 * Every surface that draws, prints or GENERATES against a project's style reads
 * this. What it replaces is worth naming, because it shipped: the frames step
 * resolved the style as `themes.find(t => statusOf(t) === "locked")` — the
 * account's most recently touched lock, which has nothing to do with the
 * project in hand. The create dialog refuses to make a project without a style
 * and then the studio rendered a different one, silently. On an account with
 * two locked styles that was wrong for at least one project, always.
 *
 * It deliberately does NOT stand another theme in when the project's own is
 * gone. A caller that needs pixels supplies its own fallback and SAYS which
 * miss it is covering (see STYLE_MISS_WORD) — an unannounced stand-in is the
 * bug this function exists to end, not the behaviour it should re-implement.
 *
 * A theme that exists but is no longer locked is not a case here: the lock is a
 * one-way ratchet (nothing clears `lockedAt`) and only locked styles are
 * offered at creation, so there is no way to reach it and nothing to draw.
 */
export function projectStyle(themes: Theme[], themeId?: string): ProjectStyle {
  if (!themeId) return { theme: null, miss: "unset" };
  const theme = themes.find((t) => t.id === themeId);
  return theme ? { theme, miss: null } : { theme: null, miss: "deleted" };
}

/** What to say, in the user's words, wherever a fallback is drawn. Written to
 *  read mid-sentence — the surface supplies what it fell back TO. */
export const STYLE_MISS_WORD: Record<StyleMiss, string> = {
  unset: "this project has no style of its own",
  deleted: "the style it was made with was deleted",
};

/* ── CRUD ─────────────────────────────────────────────────────────────────── */

export async function listThemes(uid: string): Promise<Theme[]> {
  let db: IDBDatabase | null = null;
  try {
    db = await openDb();
    const rows = await getByIndex<Theme>(db, THEMES_STORE, BY_UID, uid);
    return rows.sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
  } finally {
    db?.close();
  }
}

export async function getTheme(id: string): Promise<Theme | undefined> {
  let db: IDBDatabase | null = null;
  try {
    db = await openDb();
    return await getRecord<Theme>(db, THEMES_STORE, id);
  } finally {
    db?.close();
  }
}

/** Write one theme. THROWS when it could not be stored — the caller says so.
 *
 *  Proof images are base64 in the record, so a sheet is on the order of a
 *  megabyte. That is well inside a normal origin quota, but it is the reason a
 *  failed write has to surface rather than be swallowed: the failure mode is
 *  QuotaExceededError, and silently losing an approved sheet would be the
 *  worst bug this surface could have. */
export async function putTheme(t: Theme): Promise<Theme> {
  const stamped = { ...t, updatedAt: Date.now() };
  let db: IDBDatabase | null = null;
  try {
    db = await openDb();
    await runTx(db, THEMES_STORE, "readwrite", (store) => store.put(stamped));
    return stamped;
  } finally {
    db?.close();
  }
}

export async function deleteTheme(id: string): Promise<void> {
  let db: IDBDatabase | null = null;
  try {
    db = await openDb();
    await runTx(db, THEMES_STORE, "readwrite", (store) => store.delete(id));
  } finally {
    db?.close();
  }
}
