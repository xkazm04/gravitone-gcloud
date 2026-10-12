// THE SHELL PALETTE'S INDEX — a pure projection of stores the app already has.
//
// Nothing here reads a store, a clock or the DOM: callers hand in the projects,
// board counts, jobs and registered verbs, and get back the entries to rank. That
// is what lets the index be probed without a renderer (the node lane replaces
// React's element factory), and it keeps Palette.tsx a thin view.
//
// FACTS ARE TALLIES, NOT PROSE. An entry carries `facts: Tally[]` — value/of/label
// triples the dialog draws with <Tally> — so "the 12 decisions waiting" is `12`
// beside the label, never a sentence the dialog wrote about itself.

import { studioHref, jobHref } from "@/lib/jobLinks";
import { PHASES, PHASE_TITLE, type Project } from "@/lib/projects";
import type { Job } from "@/lib/jobs";
import { SOURCE_LABEL } from "@/lib/board/registry";
import { SOURCE_ORDER } from "@/lib/board/source";
import type { BoardSourceId } from "@/lib/board/types";

/** The data a <Tally> takes. Structural, so this file imports no component. */
export interface PaletteTally {
  value: number;
  of?: number;
  label?: string;
}

export type EntryKind = "place" | "project-step" | "decision" | "job" | "command";

interface EntryBase {
  /** Stable across rebuilds — the roving selection keys on it. */
  id: string;
  label: string;
  facts: PaletteTally[];
}

export type Entry =
  | (EntryBase & { kind: "place" | "project-step" | "decision" | "job"; href: string })
  | (EntryBase & { kind: "command"; run: () => void });

/** A verb a mounted route contributes ("New project", "Next undecided"). */
export interface ShellCommand {
  id: string;
  label: string;
  run: () => void;
}

export interface PaletteInput {
  projects: readonly Project[];
  /** Cross-project shelf items. Optional: the shell does not load the Library
   *  just to open a palette, so the frame passes none today. */
  assets?: readonly { id: string; label: string; href: string }[];
  /** Pending decisions per Board source. Zero and absent both mean "none". */
  boardCounts: Partial<Record<BoardSourceId, number | null>>;
  jobs: readonly Job[];
  commands: readonly ShellCommand[];
  /** The module links (StudioFrame's MODULES). */
  places?: readonly { label: string; href: string }[];
}

export function paletteIndex({
  projects,
  assets = [],
  boardCounts,
  jobs,
  commands,
  places = [],
}: PaletteInput): Entry[] {
  const out: Entry[] = [];

  for (const p of places) {
    out.push({ kind: "place", id: `place:${p.href}`, label: p.label, href: p.href, facts: [] });
  }

  for (const p of projects) {
    for (const step of PHASES) {
      out.push({
        kind: "project-step",
        id: `step:${p.id}:${step}`,
        label: `${p.title} · ${PHASE_TITLE[step]}`,
        href: studioHref(p.id, step),
        facts: [],
      });
    }
  }

  for (const a of assets) {
    out.push({ kind: "place", id: `asset:${a.id}`, label: a.label, href: a.href, facts: [] });
  }

  // A source with nothing waiting is not a destination worth a keystroke.
  for (const src of SOURCE_ORDER) {
    const n = boardCounts[src] ?? 0;
    if (n <= 0) continue;
    out.push({
      kind: "decision",
      id: `decision:${src}`,
      label: SOURCE_LABEL[src],
      href: `/board?src=${src}`,
      facts: [{ value: n, label: "waiting" }],
    });
  }

  for (const j of jobs) {
    if (j.status !== "running" || j.clearedAt) continue;
    const href = jobHref(j);
    if (!href) continue;
    out.push({
      kind: "job",
      id: `job:${j.id}`,
      label: j.label,
      href,
      facts: j.measured ? [{ value: Math.round(j.progress * 100), of: 100, label: "done" }] : [],
    });
  }

  for (const c of commands) {
    out.push({ kind: "command", id: `command:${c.id}`, label: c.label, run: c.run, facts: [] });
  }

  return out;
}

/* ── ranker ─────────────────────────────────────────────────────────────── */

const WORD = /[^\p{L}\p{N}]+/u;

/** Score one query token against a label; null = no match. Higher is better.
 *  A word-prefix beats a mid-word substring beats a scattered subsequence. */
function scoreToken(token: string, label: string): number | null {
  const words = label.toLowerCase().split(WORD).filter(Boolean);
  let best: number | null = null;
  words.forEach((w, i) => {
    let s: number | null = null;
    if (w === token) s = 100 - i;
    else if (w.startsWith(token)) s = 80 - i;
    else if (w.includes(token)) s = 40 - i;
    if (s !== null && (best === null || s > best)) best = s;
  });
  if (best !== null) return best;
  // Subsequence over the whole label: "gh" finds "Glass Harbor".
  const flat = label.toLowerCase();
  let at = 0;
  for (const ch of token) {
    at = flat.indexOf(ch, at);
    if (at < 0) return null;
    at++;
  }
  return 10;
}

/**
 * Rank entries for a query. Every whitespace-separated token must match;
 * entries that miss any token are dropped. Ties keep index order (stable).
 * With an empty query, `recents` (hrefs, newest first) lead; a typed query is a
 * stronger statement than history, so recents do not reorder a search.
 */
export function rankEntries(
  entries: readonly Entry[],
  query: string,
  recents: readonly string[] = [],
): Entry[] {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    const rank = (e: Entry) => {
      const at = "href" in e ? recents.indexOf(e.href) : -1;
      return at < 0 ? Infinity : at;
    };
    return entries
      .map((e, i) => ({ e, i, r: rank(e) }))
      .sort((a, b) => (a.r === b.r ? a.i - b.i : a.r - b.r))
      .map((x) => x.e);
  }
  const scored: { e: Entry; i: number; s: number }[] = [];
  entries.forEach((e, i) => {
    let total = 0;
    for (const t of tokens) {
      const s = scoreToken(t, e.label);
      if (s === null) return;
      total += s;
    }
    scored.push({ e, i, s: total });
  });
  return scored.sort((a, b) => b.s - a.s || a.i - b.i).map((x) => x.e);
}

/* ── recents + the global chord ─────────────────────────────────────────── */

/** Newest first, de-duplicated, capped. */
export function pushRecent(list: readonly string[], href: string, max = 6): string[] {
  return [href, ...list.filter((h) => h !== href)].slice(0, max);
}

// Per account, and listed in lib/identityEviction.ts#userScopedLocalKeys so a
// sign-out or account switch removes it: where someone went is theirs.
const recentsKey = (uid: string) => `gravitone.palette.recents.${uid}`;

export function readRecents(uid: string | null): string[] {
  if (!uid) return [];
  try {
    const raw = localStorage.getItem(recentsKey(uid));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function writeRecents(uid: string | null, list: readonly string[]): void {
  if (!uid) return;
  try {
    localStorage.setItem(recentsKey(uid), JSON.stringify(list));
  } catch {
    /* storage off or full — recents are a convenience, the palette works without */
  }
}

/**
 * Ctrl/⌘K, and nothing else. Deliberately a GLOBAL: it matches while focus is in
 * an <input>, because a chord with a modifier cannot be typed text. A bare `k`
 * must never open it — that would eat a letter from every field in the app.
 */
export function isPaletteChord(e: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}): boolean {
  return e.key.toLowerCase() === "k" && (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey;
}
