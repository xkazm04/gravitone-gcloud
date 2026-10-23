import "server-only";

import { errorMessage, err, ok, type Result } from "@gt/domain/errors";
import type { Actor, EventData } from "@gt/domain/event";

import { listSeedBatches } from "../../../foundry/scout/seedStore.ts";
import type { SeedBatch } from "../../../foundry/scout/types.ts";
import { bump, facts, instant } from "../facts.ts";
import type { IngestEvent, ProjectCtx, Projection, Source, WeirItem } from "../types.ts";

// THE SEED BATCHES, PROJECTED (spark scout-decision-graph WP-S1) - <scoutRoot>/seeds/<batch>/batch.json
// (lib/foundry/scout/seedStore.ts), read through the seed store's own lister.
//
// Event-grade, recorded: run.start (`createdAt`: the batch was written whole, by one door call), commit
// (`committed.at`, the Board's apply wrote it). Observed: whether it is committed. A batch is words: no
// job ever runs for it, so this source draws no LiveJob.
//
// THE WEIR: one pile per UNCOMMITTED batch that is not dry - the packet pkt:seeds:<batch>. A committed
// batch is decided and leaves the Weir; a dry one still opens on the Board by its id, as a dry night does
// (./scout.ts), and the Floor does not offer it.

export type SeedsSnapshot = { readonly batches: readonly SeedBatch[] };

export const SEEDS_READ_CAP = 120;

const SEAT: Actor = { kind: "machine", id: "scout-seeds" };
const OPERATOR: Actor = { kind: "operator", id: "operator" };
const AGENT: Actor = { kind: "agent", id: "scout-cull-model" };
const HREF = "/floor?lane=image";

async function read(): Promise<Result<SeedsSnapshot>> {
  try {
    return ok({ batches: (await listSeedBatches()).slice(0, SEEDS_READ_CAP) });
  } catch (e) {
    return err("unavailable", `seeds: listSeedBatches failed: ${errorMessage(e)}`, { cause: e });
  }
}

function eventsOf(b: SeedBatch, ctx: ProjectCtx): IngestEvent[] {
  const f = facts("seeds", ctx);
  const subject = { kind: "run", id: `seeds:${b.id}` };
  const data: EventData = { runId: b.id, ...(b.dry ? { dry: true } : {}), ...(b.night === undefined ? {} : { night: b.night }) };
  const out: IngestEvent[] = [
    f.recorded(b.id, "run.start", b.createdAt, { actor: SEAT, type: "run.start", subject, data: { ...data, seeds: b.seeds.length } }),
    f.observed(b.id, `state.${b.committed === undefined ? "open" : "committed"}`, { actor: SEAT, type: "run.status", subject, data: { ...data, status: b.committed === undefined ? "open" : "committed" } }),
  ];
  const c = b.committed;
  if (c !== undefined) out.push(f.recorded(b.id, "commit", c.at, { actor: c.by === "agent" ? AGENT : OPERATOR, type: "commit", subject, data: { ...data, kept: c.kept.length, rejected: c.rejected.length } }));
  return out;
}

function tallyOf(batches: readonly SeedBatch[]): Projection["tally"] {
  const records: Record<string, number> = {};
  const fs: Record<string, number> = {};
  for (const b of batches) {
    bump(records, `batch.${b.committed === undefined ? "open" : "committed"}`);
    bump(fs, "run.start");
    bump(fs, "run.status");
    if (b.committed !== undefined) bump(fs, "commit");
  }
  return { records, facts: fs };
}

function weirOf(b: SeedBatch): WeirItem | null {
  if (b.committed !== undefined || b.dry || b.seeds.length === 0) return null;
  const since = instant(b.createdAt);
  return { source: "seeds", id: b.id, title: `seeds ${b.id}`, media: "image", kind: "cull", ...(since === null ? {} : { since }), decided: 0, pending: b.seeds.length, href: HREF };
}

export function projectSeeds(s: SeedsSnapshot, ctx: ProjectCtx): Projection {
  return {
    events: s.batches.flatMap((b) => eventsOf(b, ctx)),
    live: [],
    weir: s.batches.map(weirOf).filter((w) => w !== null),
    tally: tallyOf(s.batches),
    skipped: [],
  };
}

export const seedsSource: Source<SeedsSnapshot> = { id: "seeds", read, project: projectSeeds };
