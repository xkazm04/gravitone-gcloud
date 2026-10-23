import "server-only";

import { errorMessage, err, ok, type Result } from "@gt/domain/errors";
import type { Actor, EventData } from "@gt/domain/event";

import { listNights, readNight } from "../../../foundry/scout/store.ts";
import type { Night } from "../../../foundry/scout/types.ts";
import { bump, facts, instant, readEach } from "../facts.ts";
import type { IngestEvent, ProjectCtx, Projection, Source, WeirItem } from "../types.ts";

// THE /scout NIGHTS, PROJECTED - foundry-out/scout/<night>/night.json
// (lib/foundry/scout/store.ts), read through the night store's own readers.
//
// Event-grade, recorded: run.start (`startedAt`), run.end (`closedAt`, with the
// stop reason), commit (`committed.at`, the Board's apply wrote it). Observed:
// the night's state. Each verdict is not projected here: it is a kernel
// decision on the packet already, and the night's record is its copy.
//
// NOT LIVE. A night's running work is its kernel jobs (scout-ingest,
// scout-scene, extract), which Runs reads from the job store; the manifest
// only lists them. So this source draws no LiveJob, as a run with a `job` is
// not drawn twice by the extract source.
//
// THE WEIR: one pile per CLOSED night that was not dry and rendered at least
// one candidate - the morning packet pkt:scout:<night>. A committed night is
// decided and leaves the Weir, as a committed extract run does. A dry night's
// packet still opens on the Board by its id; the Floor does not offer it.

export type ScoutSnapshot = { readonly nights: readonly Night[]; readonly skipped: readonly { readonly id: string; readonly reason: string }[] };

export const SCOUT_READ_CAP = 120;

const LOOP: Actor = { kind: "machine", id: "scout" };
const OPERATOR: Actor = { kind: "operator", id: "operator" };
const AGENT: Actor = { kind: "agent", id: "scout-cull-model" };
const HREF = "/floor?lane=image";

async function read(): Promise<Result<ScoutSnapshot>> {
  let ids: string[];
  try {
    ids = (await listNights()).slice(0, SCOUT_READ_CAP).map((n) => n.id);
  } catch (e) {
    return err("unavailable", `scout: listNights failed: ${errorMessage(e)}`, { cause: e });
  }
  const got = await readEach(ids, readNight);
  return ok({ nights: got.items, skipped: got.skipped });
}

const rendered = (n: Night): number => n.candidates.filter((c) => c.status === "rendered").length;

function eventsOf(n: Night, ctx: ProjectCtx): IngestEvent[] {
  const f = facts("scout", ctx);
  const subject = { kind: "run", id: n.id };
  const data: EventData = { runId: n.id, ...(n.dry ? { dry: true } : {}) };
  const out: IngestEvent[] = [
    f.recorded(n.id, "run.start", n.startedAt, { actor: LOOP, type: "run.start", subject, data: { ...data, ceilingUsd: n.ceilingUsd, target: n.target } }),
    f.observed(n.id, `state.${n.state}`, { actor: LOOP, type: "run.status", subject, data: { ...data, status: n.state } }),
  ];
  if (n.closedAt !== undefined) {
    out.push(f.recorded(n.id, "run.end", n.closedAt, { actor: LOOP, type: "run.end", subject, data: { ...data, ...(n.stop === undefined ? {} : { stop: n.stop }), sources: n.sources.length, candidates: n.candidates.length } }));
  }
  const c = n.committed;
  if (c !== undefined) {
    out.push(f.recorded(n.id, "commit", c.at, { actor: c.by === "agent" ? AGENT : OPERATOR, type: "commit", subject, data: { ...data, kept: c.kept.length, rejected: c.rejected.length } }));
  }
  return out;
}

function tallyOf(nights: readonly Night[]): Projection["tally"] {
  const records: Record<string, number> = {};
  const fs: Record<string, number> = {};
  for (const n of nights) {
    bump(records, `night.${n.state}`);
    bump(fs, "run.start");
    bump(fs, "run.status");
    if (n.closedAt !== undefined) bump(fs, "run.end");
    if (n.committed !== undefined) bump(fs, "commit");
  }
  return { records, facts: fs };
}

function weirOf(n: Night): WeirItem | null {
  if (n.state !== "closed" || n.dry || rendered(n) === 0) return null;
  const since = instant(n.closedAt);
  return { source: "scout", id: n.id, title: `scout ${n.id}`, media: "image", kind: "cull", ...(since === null ? {} : { since }), decided: 0, pending: rendered(n), href: HREF };
}

export function projectScout(s: ScoutSnapshot, ctx: ProjectCtx): Projection {
  return {
    events: s.nights.flatMap((n) => eventsOf(n, ctx)),
    live: [],
    weir: s.nights.map(weirOf).filter((w) => w !== null),
    tally: tallyOf(s.nights),
    skipped: s.skipped,
  };
}

export const scoutSource: Source<ScoutSnapshot> = { id: "scout", read, project: projectScout };
