import path from "node:path";
import type { Actor } from "@gt/domain/event";
import type { Holder } from "@gt/domain/job";
import type { Channel } from "@gt/domain/slot";
import { openKernel, type Kernel } from "../src/kernel.ts";
import type { SweepFacts } from "../src/slots/sweep-core.ts";
import type { SlotDraft } from "../src/slots/write.ts";
import { must } from "./helpers.ts";

// The calendar's test world: a whole kernel on a scratch file, a clock the test moves, and
// v1's probe vocabulary (tests/golden-path/publish.probe.spec.ts): NOW, `at(minutes)`, one
// export, a window of 60 minutes.

export const NOW = Date.parse("2026-10-05T12:00:00.000Z");
export const at = (minutes: number, from = NOW): string => new Date(from + minutes * 60_000).toISOString();
export const WINDOW_MS = 60 * 60_000;
export const ITEM = "video:export:0b1c2d3e-4f50-4617-8a9b-cafe0000aaaa";
export const ITEM_B = "video:export:0b1c2d3e-4f50-4617-8a9b-cafe0000bbbb";
export const OP: Actor = { kind: "operator", id: "op" };
export const PUBLISHER: Actor = { kind: "machine", id: "publisher" };

export const ME: Holder = { bootId: "boot-me", pid: 4100, host: "render-box" };
/** A claimant on this host whose process is gone (the `alive` stub below says so). */
export const DEAD: Holder = { bootId: "boot-dead", pid: 4200, host: "render-box" };
export const aliveBut =
  (...dead: number[]) =>
  (pid: number): boolean =>
    !dead.includes(pid);

export function draft(over: Partial<SlotDraft> = {}): SlotDraft {
  return { libraryItemId: ITEM, channel: "youtube", at: at(-5), title: "A cut", description: "probe", tags: ["a", "b"], ...over };
}

export function facts(over: Partial<SweepFacts> & { missing?: readonly string[]; unwired?: readonly Channel[] } = {}): SweepFacts {
  const missing = new Set(over.missing ?? []);
  const unwired = new Set(over.unwired ?? []);
  const wired = new Set<Channel>((["youtube", "tiktok", "instagram", "blog"] as const).filter((c) => !unwired.has(c)));
  return { now: over.now ?? NOW, windowMs: over.windowMs ?? WINDOW_MS, wired: over.wired ?? wired, itemExists: over.itemExists ?? ((id) => !missing.has(id)) };
}

export type World = { readonly k: Kernel; readonly file: string; setClock(ms: number): void };

/** A kernel whose store clock reads what the test set (NOW to begin with). */
export function world(dir: string, name: string): World {
  let t = NOW;
  const file = path.join(dir, `${name}.sqlite`);
  const k = must(openKernel(file, { clock: () => new Date(t), snapshotDir: dir }));
  return { k, file, setClock: (ms) => void (t = ms) };
}

export const eventTypes = (k: Kernel, subjectId?: string): string[] =>
  must(k.store.read((r) => (subjectId === undefined ? r.all("SELECT type FROM events ORDER BY seq") : r.all("SELECT type FROM events WHERE subject_id = ? ORDER BY seq", subjectId)))).map((row) => String(row["type"]));
