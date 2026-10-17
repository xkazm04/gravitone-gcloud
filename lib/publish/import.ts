// THE CALENDAR'S ONE-TIME IMPORT, the disk half (owner ruling 3, plan §5.3): read v1's three
// files under the publish root (PUBLISH_STORE_DIR, else <out>/publish - ./store.ts storeRoot),
// hand them to the kernel (@gt/kernel/slots/import decides and writes), list what plans/ and
// sessions/ hold, and - after a real import that refused nothing - leave the MIGRATED marker
// that says where the calendar went.
//
// THE FILES ARE READ AS THEY STAND, never through ./schedule.ts listSlots, which sweeps first
// and would write schedule.json on the way (the ledger projection's same refusal,
// lib/ledger/v1/sources/publish.ts). A corrupt file is an error, as ./store.ts made it: an
// importer that read a broken calendar as empty would import nothing and then mark it migrated.
//
// plans/ AND sessions/ STAY WHERE THEY ARE. Both are keyed by slot id (./store.ts planPath,
// sessionPath), and the import keeps every v1 slot id, so a dry plan still names its slot and a
// live resumable session can still be found by the publisher that resumes it (wave B). The
// report lists each with whether its slot was imported - a session for a slot that never
// published is an upload that may have half-happened, and the operator should see it.

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { parseJsonAt } from "@gt/domain/door";
import { err, ok, type Result } from "@gt/domain/errors";
import { importV1Calendar, type ImportOutcome } from "@gt/kernel/slots/import";
import type { Store } from "@gt/kernel/store";
import { z } from "zod";

const FILES = { schedule: "schedule.json", publications: "publications.json", metrics: "metrics.json" } as const;
const EMPTY = { schedule: { slots: [] }, publications: { publications: [] }, metrics: { snapshots: [] } } as const;
const anyObject = z.record(z.string(), z.unknown());

export type SideFile = { readonly dir: "plans" | "sessions"; readonly slotId: string; readonly slotImported: boolean };

export type CalendarImport = {
  readonly root: string;
  readonly dry: boolean;
  readonly outcomes: readonly ImportOutcome[];
  readonly sideFiles: readonly SideFile[];
  /** The marker's path when this run wrote it; absent on a dry run or when anything was refused. */
  readonly marked?: string;
  /** True when the root already carried the marker before this run. */
  readonly alreadyMarked: boolean;
};

function readKind(root: string, kind: keyof typeof FILES): Result<unknown> {
  const file = path.join(root, FILES[kind]);
  if (!existsSync(file)) return ok(EMPTY[kind]);
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (e) {
    return err("unavailable", `${file}: ${e instanceof Error ? e.message : String(e)}`, { cause: e });
  }
  return parseJsonAt(file, anyObject, text);
}

function sideFiles(root: string, dir: "plans" | "sessions", imported: ReadonlySet<string>): SideFile[] {
  const at = path.join(root, dir);
  if (!existsSync(at)) return [];
  return readdirSync(at)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      const slotId = f.slice(0, -".json".length);
      return { dir, slotId, slotImported: imported.has(slotId) };
    });
}

export const MIGRATED_FILE = "MIGRATED";

export function migratedText(at: string): string {
  return (
    `MIGRATED ${at.slice(0, 10)} (Phase 6, L57). The calendar is the kernel's slot tables in the store\n` +
    "(GRAVITONE_STORE_PATH, else <foundry-out|fixtures-out>/gravitone.sqlite): @gt/kernel/slots.\n" +
    "schedule.json, publications.json and metrics.json here are frozen history; plans/ and sessions/ stay, keyed by the same slot ids.\n"
  );
}

/**
 * Import the calendar under `root` into `store`. DRY by default at the CLI; here the caller says.
 * Idempotent: a second run imports nothing it imported before (the kernel skips held ids).
 */
export function importCalendar(store: Store, root: string, opts: { readonly dry: boolean; readonly now: Date }): Result<CalendarImport> {
  const schedule = readKind(root, "schedule");
  if (!schedule.ok) return schedule;
  const publications = readKind(root, "publications");
  if (!publications.ok) return publications;
  const metrics = readKind(root, "metrics");
  if (!metrics.ok) return metrics;
  const marker = path.join(root, MIGRATED_FILE);
  const alreadyMarked = existsSync(marker);
  const r = importV1Calendar(store, { schedule: schedule.value, publications: publications.value, metrics: metrics.value }, { dry: opts.dry });
  if (!r.ok) return r;
  const outcomes = r.value;
  const imported = new Set(outcomes.filter((o) => o.kind === "slot" && o.outcome !== "refused").map((o) => o.id));
  const side = [...sideFiles(root, "plans", imported), ...sideFiles(root, "sessions", imported)];
  const refused = outcomes.some((o) => o.outcome === "refused");
  if (opts.dry || refused || alreadyMarked || !existsSync(root)) return ok({ root, dry: opts.dry, outcomes, sideFiles: side, alreadyMarked });
  try {
    writeFileSync(marker, migratedText(opts.now.toISOString()), { flag: "wx" });
  } catch (e) {
    return err("unavailable", `the calendar was imported, but ${marker} could not be written: ${e instanceof Error ? e.message : String(e)}`, { cause: e });
  }
  return ok({ root, dry: false, outcomes, sideFiles: side, marked: marker, alreadyMarked });
}
