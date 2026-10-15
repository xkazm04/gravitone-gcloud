import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { parseAt, parseJsonAt, type Parsed } from "@gt/domain/door";
import { err, ok, type Result } from "@gt/domain/errors";
import type { EventData } from "@gt/domain/event";

import { gpuBroker, gpuRoot, type GpuStatus } from "../../../../lib/gpu/lease.ts";
import { bump, facts, instant, words } from "../facts.ts";
import type { IngestEvent, LiveJob, ProjectCtx, Projection, Skipped, Source } from "../types.ts";

// THE GPU LEASE QUEUE, PROJECTED - <gpu root>/queue.jsonl (lib/gpu/lease.ts,
// pipeline/gpu/lease.py: the one APPEND-ONLY log among the v1 stores) and the
// current holder, lease.json, read through the broker's `status()`.
//
// Every queue line is a fact, recorded at its own `at` (epoch ms, both
// writers): gpu.wait, gpu.grant, gpu.leave, gpu.release, gpu.reclaim. A line
// is keyed by (event, ticket, instant) and its occurrence among identical
// lines, so the log can be re-read from the top on every sync and append
// nothing new. A torn final line (a writer mid-append) is skipped with its
// line number, as the broker skips it; it is not a damaged store.
//
// LIVE: the holder is the occupancy of gpu.local - running, or interrupted when
// the broker's own staleReason says pid-dead or heartbeat-expired (the next
// acquire reclaims it). Live waiters (the queue's replay, dead pids dropped)
// are queued. This duplicates nothing it should not: a forge run drawn on
// gpu.local is the WORK, the lease is the CARD; Runs may draw the lease as the
// row's occupancy band and the run inside it.
// `status()` is read-only (readLease + events, no lock, no reclaim); the
// reclaiming read is `acquire`'s, which this never calls.

const EVENTS = ["wait", "grant", "leave", "release", "reclaim"] as const;
const lineSchema = z.object({
  at: z.number(),
  ev: z.enum(EVENTS),
  ticket: z.string().optional(),
  tenant: z.string().optional(),
  engine: z.string().optional(),
  pid: z.number().optional(),
  host: z.string().optional(),
  reclaims: z.number().optional(),
  reason: z.string().optional(),
});
const statusSchema = z.object({
  holder: z.object({ tenant: z.string(), engine: z.string(), pid: z.number(), host: z.string(), jobPrefix: z.string(), acquiredAt: z.number(), heartbeatAt: z.number(), ttlS: z.number(), ticket: z.string() }).nullable(),
  stale: z.string().nullable(),
  queue: z.array(z.object({ tenant: z.string().optional(), engine: z.string().optional(), pid: z.number().optional() })),
});

type Line = Parsed<z.output<typeof lineSchema>>;
export type GpuSnapshot = { readonly lines: readonly Line[]; readonly status: Parsed<z.output<typeof statusSchema>>; readonly skipped: readonly Skipped[] };

const BROKER = { kind: "machine", id: "gpu-broker" } as const;
const HREF = "/foundry";

/** Every line of a queue log through the door; a line that does not parse is skipped by number. */
export function linesOf(text: string): { lines: Line[]; skipped: Skipped[] } {
  const lines: Line[] = [];
  const skipped: Skipped[] = [];
  text.split("\n").forEach((raw, i) => {
    if (raw.trim() === "") return;
    const p = parseJsonAt(`gpu queue line ${i + 1}`, lineSchema, raw);
    if (p.ok) lines.push(p.value);
    else skipped.push({ id: `queue.jsonl:${i + 1}`, reason: p.error.message });
  });
  return { lines, skipped };
}

async function read(): Promise<Result<GpuSnapshot>> {
  const file = path.join(gpuRoot(), "queue.jsonl");
  let text = "";
  let status: GpuStatus;
  try {
    text = await readFile(file, "utf8");
  } catch (e) {
    if (!(e instanceof Error && "code" in e && e.code === "ENOENT")) return err("unavailable", `gpu: reading ${file} failed: ${words(e)}`, { cause: e });
  }
  try {
    status = await gpuBroker().status();
  } catch (e) {
    return err("unavailable", `gpu: the broker's status failed: ${words(e)}`, { cause: e });
  }
  const s = parseAt("gpu status", statusSchema, status);
  if (!s.ok) return s;
  return ok({ ...linesOf(text), status: s.value });
}

function eventsOf(lines: readonly Line[], ctx: ProjectCtx): IngestEvent[] {
  const f = facts("gpu", ctx);
  const seen = new Map<string, number>();
  return lines.map((l) => {
    const record = l.ticket ?? "queue";
    const id = `${l.ev}.${l.at}`;
    const n = seen.get(`${record}/${id}`) ?? 0;
    seen.set(`${record}/${id}`, n + 1);
    // The line's own fields, minus the two the event already carries as its time and type.
    const data: EventData = { ...Object.fromEntries(Object.entries(l).filter(([k]) => k !== "at" && k !== "ev")), ...(l.ticket === undefined ? {} : { runId: l.ticket }) };
    return f.recorded(record, `${id}.${n}`, l.at, {
      actor: l.tenant === undefined ? BROKER : { kind: "machine", id: l.tenant },
      type: `gpu.${l.ev}`,
      subject: { kind: "lease", id: record },
      lane: "gpu.local",
      data,
    });
  });
}

function tallyOf(s: GpuSnapshot): Projection["tally"] {
  const records: Record<string, number> = {};
  const fs: Record<string, number> = {};
  bump(records, "lease.held", s.status.holder === null ? 0 : 1);
  bump(records, "lease.waiting", s.status.queue.length);
  for (const l of s.lines) bump(fs, `gpu.${l.ev}`);
  return { records, facts: fs };
}

function liveOf(s: GpuSnapshot): LiveJob[] {
  const out: LiveJob[] = [];
  const h = s.status.holder;
  if (h !== null) {
    const startedAt = instant(h.acquiredAt);
    out.push({
      source: "gpu",
      id: h.ticket,
      title: `${h.tenant} holds ${h.engine}`,
      lane: "gpu.local",
      media: "image",
      state: s.status.stale === null ? "running" : "interrupted",
      ...(startedAt === null ? {} : { startedAt }),
      ...(s.status.stale === null ? {} : { error: `lease is stale (${s.status.stale}); the next acquire reclaims it` }),
      href: HREF,
    });
  }
  for (const w of s.status.queue) {
    out.push({ source: "gpu", id: `wait:${w.tenant ?? "?"}:${w.pid ?? "?"}`, title: `${w.tenant ?? "a tenant"} waits for ${w.engine ?? "the card"}`, lane: "gpu.local", media: "image", state: "queued", href: HREF });
  }
  return out;
}

export function projectGpu(s: GpuSnapshot, ctx: ProjectCtx): Projection {
  return { events: eventsOf(s.lines, ctx), live: liveOf(s), weir: [], tally: tallyOf(s), skipped: s.skipped };
}

export const gpuSource: Source<GpuSnapshot> = { id: "gpu", read, project: projectGpu };
