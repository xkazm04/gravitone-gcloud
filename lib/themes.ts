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
  /** What produced it, kept so a sheet can be audited later. */
  model?: string;
  costUsd?: number;
  createdAt: number;
}

/** The production model's reference-image window. A sheet may not exceed it,
 *  because every approved proof is a reference on the next generation. */
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
};

export function newTheme(uid: string, draft: ThemeDraft): Theme {
  const now = Date.now();
  return {
    id: `th-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    uid,
    name: draft.name.trim() || "Untitled style",
    origin: draft.origin,
    presetId: draft.presetId,
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

/** Why the lock button is disabled, in the user's words. */
export function lockBlocker(t: Theme): string | null {
  if (t.lockedAt) return null;
  if (!t.proofs.length) return "generate at least one proof first";
  const pending = t.proofs.filter((p) => p.state === "pending").length;
  if (pending) return `${pending} proof${pending > 1 ? "s" : ""} still undecided`;
  if (!approvedProofs(t).length) return "every proof was rejected — generate another";
  return null;
}

/* ── CRUD ─────────────────────────────────────────────────────────────────── */

export async function listThemes(uid: string): Promise<Theme[]> {
  let db: IDBDatabase | null = null;
  try {
    db = await openDb();
    const rows = await getByIndex<Theme>(db, THEMES_STORE, BY_UID, uid);
    return rows.sort((a, b) => b.updatedAt - a.updatedAt);
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
