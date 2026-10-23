import "server-only";

import { errorMessage, err, ok, type Result } from "@gt/domain/errors";
import type { Actor, EventData } from "@gt/domain/event";

import { listSeedBatches } from "../../../foundry/scout/seedStore.ts";
import type { SeedBatch } from "../../../foundry/scout/types.ts";
import { SCOUT_WINGS, wingRunId, type ScoutWing } from "../../../foundry/scout/wing.ts";
import { withWing } from "../../../foundry/scout/wingScope.ts";
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
//
// EVERY WING'S ROOT (spark scout-muse), each read in its own scope. The muse wing draws no seeds (its CLI has no
// seeds command), so its root holds none; were one there, its events would be keyed `muse:<batch>` and carry
// `wing: "muse"`, and it would make no pile - the seeds packet (lib/decision/v1/sources/seeds.ts) is the scout
// wing's alone.

/** `batches` are the scout wing's; `muse` the muse wing's (absent in a snapshot taken before the wings). */
export type SeedsSnapshot = { readonly batches: readonly SeedBatch[]; readonly muse?: readonly SeedBatch[] };

export const SEEDS_READ_CAP = 120;

const SEAT: Actor = { kind: "machine", id: "scout-seeds" };
const OPERATOR: Actor = { kind: "operator", id: "operator" };
const AGENT: Actor = { kind: "agent", id: "scout-cull-model" };
const HREF = "/floor?lane=image";

async function read(): Promise<Result<SeedsSnapshot>> {
  try {
    const [batches, muse] = await Promise.all(SCOUT_WINGS.map((w) => withWing(w, async () => (await listSeedBatches()).slice(0, SEEDS_READ_CAP))));
    return ok({ batches: batches ?? [], muse: muse ?? [] });
  } catch (e) {
    return err("unavailable", `seeds: listSeedBatches failed: ${errorMessage(e)}`, { cause: e });
  }
}

function eventsOf(wing: ScoutWing, b: SeedBatch, ctx: ProjectCtx): IngestEvent[] {
  const f = facts("seeds", ctx);
  const run = wingRunId(wing, b.id);
  const subject = { kind: "run", id: `seeds:${run}` };
  const data: EventData = { runId: run, ...(wing === "scout" ? {} : { wing }), ...(b.dry ? { dry: true } : {}), ...(b.night === undefined ? {} : { night: b.night }) };
  const out: IngestEvent[] = [
    f.recorded(run, "run.start", b.createdAt, { actor: SEAT, type: "run.start", subject, data: { ...data, seeds: b.seeds.length } }),
    f.observed(run, `state.${b.committed === undefined ? "open" : "committed"}`, { actor: SEAT, type: "run.status", subject, data: { ...data, status: b.committed === undefined ? "open" : "committed" } }),
  ];
  const c = b.committed;
  if (c !== undefined) out.push(f.recorded(run, "commit", c.at, { actor: c.by === "agent" ? AGENT : OPERATOR, type: "commit", subject, data: { ...data, kept: c.kept.length, rejected: c.rejected.length } }));
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
  const muse = s.muse ?? [];
  return {
    events: [...s.batches.flatMap((b) => eventsOf("scout", b, ctx)), ...muse.flatMap((b) => eventsOf("muse", b, ctx))],
    live: [],
    weir: s.batches.map(weirOf).filter((w) => w !== null),
    tally: tallyOf([...s.batches, ...muse]),
    skipped: [],
  };
}

export const seedsSource: Source<SeedsSnapshot> = { id: "seeds", read, project: projectSeeds };
