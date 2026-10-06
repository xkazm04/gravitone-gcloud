// THE SIGN-OUT DIALOG'S DECISIONS, AND THE IMPORT RESULT'S SHAPE — as pure
// functions, so the probe lane can hold them without a DOM
// (tests/golden-path/signout-dialog.probe.spec.ts).
//
// Two surfaces read this file: components/ui/SignOutDialog.tsx (what a sign-out
// would erase, from `evictIdentity(uid, reason, {dryRun: true})`, and which of
// its two actions is live) and app/projects/ProjectsView.tsx (what an archive
// import wrote). Both draw counts with <Tally>; the labels here are the ones the
// rest of the app already uses — the theme store is "styles" everywhere a person
// can see it (/library, the locked-styles chip on /projects).
//
// Nothing here imports a store at runtime. `EvictionReport` and `ImportReport`
// are types only, so this module costs the account menu nothing until the
// dialog is opened.

import type { EvictionReport } from "@/lib/identityEviction";
import type { ImportReport } from "@/lib/studioArchive";
import type { TallyTone } from "./signal";

/** The five stores, in the order the eviction and the archive both walk them. */
export const STORE_KEYS = ["projects", "steps", "themes", "assets", "uploads"] as const;
export type StoreKey = (typeof STORE_KEYS)[number];

const LABEL: Record<StoreKey, { one: string; many: string }> = {
  projects: { one: "project", many: "projects" },
  steps: { one: "step", many: "steps" },
  themes: { one: "style", many: "styles" },
  assets: { one: "asset", many: "assets" },
  uploads: { one: "upload", many: "uploads" },
};

type Counts = Pick<EvictionReport, StoreKey>;

export interface StoreTally {
  key: StoreKey;
  label: string;
  n: number;
}

/** One count per store, store order. `local` (seed marks, the job tray) is not
 *  work a person made and is not shown. */
export function wipeTallies(r: Counts): StoreTally[] {
  return STORE_KEYS.map((key) => ({ key, label: LABEL[key].many, n: r[key] }));
}

/** Rows of work at stake — the five stores summed. */
export function workTotal(r: Counts): number {
  return STORE_KEYS.reduce((n, k) => n + r[k], 0);
}

/** Whether a sign-out would lose anything — and so whether an archive is worth
 *  building. A count that FAILED is treated as work at stake, never as empty. */
export function wantsArchive(r: EvictionReport | null): boolean {
  return !!r && (r.failed || workTotal(r) > 0);
}

/** Bytes as the size of a file a person saves. */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(1)} ${units[i]}`;
}

/**
 * The destructive confirm's statement of consequence — exempt from the
 * narration law (CLAUDE.md, "Three standing exemptions") and held to one line
 * that names what is lost. Zero stores are not named. `null` when there is
 * nothing to state: still counting, or nothing on the shelf.
 *
 * A dry run that could not count (`failed`) is not an empty shelf: the line is
 * stated without numbers rather than with zeroes that would read as "nothing".
 */
export function consequenceLine(r: EvictionReport | null): string | null {
  if (!r) return null;
  if (r.failed) return "Erases this account's work from this browser — the count could not be read.";
  const parts = STORE_KEYS.filter((k) => r[k] > 0).map((k) => `${r[k]} ${r[k] === 1 ? LABEL[k].one : LABEL[k].many}`);
  if (parts.length === 0) return null;
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  return `Erases ${list} from this browser.`;
}

/** Where the downloadable archive stands. Built when the dialog opens, so the
 *  size is known before anyone presses anything and the save is instant. */
export type ArchivePrep =
  | { state: "idle" }
  | { state: "preparing" }
  | { state: "ready"; bytes: number }
  | { state: "failed"; error: string };

export interface SignOutPlan {
  download: {
    /** Absent on an empty shelf: there is nothing to archive. */
    shown: boolean;
    enabled: boolean;
    label: string;
    /** The archive's size once built. */
    size: string | null;
  };
  erase: {
    enabled: boolean;
    label: string;
    /** Rose and stated, or a plain sign-out when nothing would be lost. */
    destructive: boolean;
  };
  consequence: string | null;
}

/**
 * Which action is live when.
 *
 *   · still counting (no report)    → nothing can be pressed
 *   · signing out (`busy`)          → nothing can be pressed
 *   · nothing on the shelf          → a plain "Sign out", no archive
 *   · work on the shelf, or a count
 *     that failed                   → "Download archive" once the file is built,
 *                                     and "Sign out and erase" at once — the
 *                                     erase never waits on the archive, and a
 *                                     failed archive never traps anyone signed in
 */
export function signOutPlan({
  report,
  prep,
  busy,
  saved,
}: {
  report: EvictionReport | null;
  prep: ArchivePrep;
  busy: boolean;
  saved: boolean;
}): SignOutPlan {
  const atStake = wantsArchive(report);
  const ready = prep.state === "ready";
  return {
    download: {
      shown: atStake,
      enabled: atStake && ready && !busy,
      label: saved ? "Downloaded" : "Download archive",
      size: prep.state === "ready" ? formatBytes(prep.bytes) : null,
    },
    erase: {
      enabled: !!report && !busy,
      label: !report || atStake ? "Sign out and erase" : "Sign out",
      destructive: !report || atStake,
    },
    consequence: atStake ? consequenceLine(report) : null,
  };
}

/** `gravitone-2026-10-06.gravitone` — dated, never named after the account: a
 *  file name travels further than its contents are meant to. */
export function archiveFileName(now: Date = new Date()): string {
  return `gravitone-${now.toISOString().slice(0, 10)}.gravitone`;
}

export interface ResultTally {
  label: string;
  n: number;
  tone: TallyTone;
}

/** What an import wrote: the five stores always, then skipped / replaced /
 *  re-minted only when something was. */
export function importTallies(r: ImportReport): ResultTally[] {
  const out: ResultTally[] = STORE_KEYS.map((k) => ({
    label: LABEL[k].many,
    n: r[k],
    tone: r[k] > 0 ? "emerald" : "neutral",
  }));
  if (r.skipped > 0) out.push({ label: "skipped", n: r.skipped, tone: "amber" });
  if (r.replaced > 0) out.push({ label: "replaced", n: r.replaced, tone: "amber" });
  if (r.reminted > 0) out.push({ label: "re-minted", n: r.reminted, tone: "cyan" });
  return out;
}

/** A failure, verbatim. An `ArchiveRefused` already says what was wrong and
 *  what to do; a storage error carries the engine's own words. */
export function errorText(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}
