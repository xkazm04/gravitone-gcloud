import { createHash } from "node:crypto";

import { errorMessage } from "@gt/domain/errors";
import type { Actor, EventData, Subject } from "@gt/domain/event";
import type { ResourceLane } from "@gt/domain/lane";

import type { IngestEvent, ProjectCtx } from "./types.ts";

// THE PROJECTION'S VOCABULARY - the few pure rules every adapter applies the
// same way, so eleven sources cannot spell "when did this happen" eleven ways.
//
//   instant()   v1 writes time in three shapes: Python's `isoformat()` with
//               `+00:00` and whole seconds (pipeline/foundry/forge.py `now()`),
//               JS's `toISOString()`, and epoch milliseconds (lib/spend,
//               lib/turns). All become `toISOString()`'s shape, the one the
//               ledger's `t` index sorts correctly. A string with no zone is
//               refused rather than read in this machine's local time.
//   recorded()  a fact whose instant v1 wrote down when it happened. If that
//               instant does not parse, the fact is still projected - as
//               observed now, `derived`, with the raw text kept in
//               `data.unparsedAt` - because inventing an instant is the one
//               thing a ledger may not do (audit-logging: a null effective
//               time is never defaulted to a guess).
//   observed()  a rewritten field (a status, a verdict with no `at`) seen by
//               THIS sync: `derived` at the sync's clock (COMMON decision 3).
//   logged()    an appended `log[]`: each line its own fact (a line with no
//               `at` at all is observed, not recorded), keyed by a digest
//               of (at, msg) and its occurrence among identical lines, NOT its
//               index - extract's journal is capped at 400 and drops from the
//               front (lib/foundry/extract/journal.ts), so an index would
//               re-key every surviving line on the next sync.

/** A v1 timestamp in `toISOString()` form, or null when it has no zone or does not parse. */
export function instant(raw: unknown): string | null {
  if (typeof raw === "number") return Number.isFinite(raw) && raw > 0 ? new Date(raw).toISOString() : null;
  if (typeof raw !== "string" || !/(Z|[+-]\d\d:?\d\d)$/.test(raw)) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

export const digest = (text: string, n = 12): string => createHash("sha256").update(text, "utf8").digest("hex").slice(0, n);

/** A key segment: the id itself when it is short and has no whitespace, else its digest. */
export function seg(id: string): string {
  return /^\S{1,120}$/.test(id) ? id : `h-${digest(id)}`;
}

/** The part of an event the adapter decides; the helpers add key, clocks and `data.src`. */
export type Fact = {
  readonly actor: Actor;
  readonly type: string;
  readonly subject: Subject;
  readonly lane?: string;
  readonly data?: EventData;
};

/** The fact builders for one source under one sync. */
export function facts(source: string, ctx: ProjectCtx) {
  const now = ctx.now.toISOString();
  const make = (recordId: string, fact: string, f: Fact, occurredAt: string, atSrc: IngestEvent["atSrc"], extra: EventData = {}): IngestEvent => {
    const e: IngestEvent = {
      actor: f.actor,
      type: f.type,
      subject: f.subject,
      data: { ...f.data, ...extra, src: ctx.universe },
      key: `${source}:${seg(recordId)}:${fact}`,
      occurredAt,
      atSrc,
    };
    return f.lane === undefined ? e : { ...e, lane: f.lane };
  };
  const recorded = (recordId: string, fact: string, rawAt: unknown, f: Fact): IngestEvent => {
    if (rawAt === null || rawAt === undefined) return make(recordId, fact, f, now, "derived");
    const at = instant(rawAt);
    return at === null ? make(recordId, fact, f, now, "derived", { unparsedAt: typeof rawAt === "string" ? rawAt : String(rawAt) }) : make(recordId, fact, f, at, "recorded");
  };
  const observed = (recordId: string, fact: string, f: Fact): IngestEvent => make(recordId, fact, f, now, "derived");
  const logged = (recordId: string, log: readonly { readonly at: string | null; readonly msg: string }[], f: Omit<Fact, "type">): IngestEvent[] => {
    const seen = new Map<string, number>();
    return log.map((line) => {
      const id = digest(`${line.at ?? ""}\n${line.msg}`);
      const n = seen.get(id) ?? 0;
      seen.set(id, n + 1);
      return recorded(recordId, `log.${id}.${n}`, line.at, { ...f, type: "run.log", data: { ...f.data, note: line.msg } });
    });
  };
  return { recorded, observed, logged };
}

/** A counting map for tallies: `bump(m, "run.log", 3)`. */
export function bump(m: Record<string, number>, key: string, n = 1): void {
  if (n !== 0) m[key] = (m[key] ?? 0) + n;
}

/**
 * Read `ids` through `get`, at most `width` at a time, keeping readdir's order.
 * A record whose read throws is skipped with its message - one damaged
 * manifest never hides the rest (lib/foundry/runStore.ts listManifests' rule).
 */
export async function readEach<T>(ids: readonly string[], get: (id: string) => Promise<T>, width = 8): Promise<{ items: T[]; skipped: { id: string; reason: string }[] }> {
  const slots: ({ ok: true; v: T } | { ok: false; reason: string } | undefined)[] = new Array(ids.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < ids.length) {
      const i = next++;
      const id = ids[i] ?? "";
      try {
        slots[i] = { ok: true, v: await get(id) };
      } catch (e) {
        slots[i] = { ok: false, reason: errorMessage(e) };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(width, ids.length) }, worker));
  const items: T[] = [];
  const skipped: { id: string; reason: string }[] = [];
  slots.forEach((s, i) => {
    if (s?.ok === true) items.push(s.v);
    else skipped.push({ id: ids[i] ?? "", reason: s?.reason ?? "not read" });
  });
  return { items, skipped };
}

// WHICH RESOURCE A v1 ENGINE OCCUPIES. v1 names an engine as `<vendor>/<model>`
// (lib/foundry/extract manifests' `engines`, the imaging router's provider
// ids); @gt/domain/lane names the rows Runs draws. This is the one table
// between them, so an engine nobody mapped is a `null` the caller must say
// something about - never a silent default row.
//
// Measured on this machine's extract runs (2026-10-15): google/gemini-3.6-flash,
// google/gemini-3.1-flash-image, claude-cli/claude-opus-5. The fixture universe
// adds openai/gpt-image-2.5, for which RESOURCE_LANES has no row (a finding for
// the lane vocabulary, not something to paper over here).

const VENDORS: Readonly<Record<string, ResourceLane>> = {
  google: "cloud.google",
  gemini: "cloud.google",
  qwen: "cloud.qwen",
  leonardo: "cloud.leonardo",
  "leonardo-flare": "cloud.leonardo",
  elevenlabs: "cloud.elevenlabs",
  "claude-cli": "seat.text",
  agy: "seat.text",
  codex: "seat.text",
  comfy: "gpu.local",
  comfyui: "gpu.local",
  flux: "gpu.local",
  ollama: "gpu.local",
  local: "gpu.local",
};

/** The lane an engine id's vendor occupies, or null when no row exists for it. */
export function laneOfEngine(engine: string | undefined): ResourceLane | null {
  if (engine === undefined) return null;
  const vendor = engine.split("/")[0]?.toLowerCase() ?? "";
  return VENDORS[vendor] ?? null;
}
