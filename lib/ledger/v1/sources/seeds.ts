import "server-only";

import { errorMessage, err, ok, type Result } from "@gt/domain/errors";
import type { Actor, EventData } from "@gt/domain/event";

import { isWhole, nextPart, openOf, partRunId, partsOf } from "../../../foundry/scout/parts.ts";
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
//
// IN PARTS (spark scout-storyboards, lib/foundry/scout/parts.ts): a batch committed with seeds left undecided is still
// open, and its ONE pile is the remainder `<batch>:<n>`, pending the seeds still open. Part 1 is the `commit` fact,
// part n `commit.<n>` at its own instant.

/** `batches` are the scout wing's; `muse` the muse wing's (absent in a snapshot taken before the wings). */
export type SeedsSnapshot = { readonly batches: readonly SeedBatch[]; readonly muse?: readonly SeedBatch[]; readonly skipped?: readonly { readonly id: string; readonly reason: string }[] };

export const SEEDS_READ_CAP = 120;

const SEAT: Actor = { kind: "machine", id: "scout-seeds" };
const OPERATOR: Actor = { kind: "operator", id: "operator" };
const AGENT: Actor = { kind: "agent", id: "scout-cull-model" };
const HREF = "/floor?lane=image";

// Each wing is listed on its own: the scout wing failing fails the source, the muse wing failing is a skip, so an
// unreadable muse root does not take the scout wing's seed pile off the Floor.
async function readWing(w: ScoutWing): Promise<Result<SeedBatch[]>> {
  return withWing(w, async () => {
    try {
      return ok((await listSeedBatches()).slice(0, SEEDS_READ_CAP));
    } catch (e) {
      return err("unavailable", `seeds: listSeedBatches failed${w === "scout" ? "" : ` (${w})`}: ${errorMessage(e)}`, { cause: e });
    }
  });
}

async function read(): Promise<Result<SeedsSnapshot>> {
  const [scout, muse] = await Promise.all(SCOUT_WINGS.map(readWing));
  if (scout === undefined || !scout.ok) return scout ?? err("unavailable", "seeds: no scout wing");
  if (muse === undefined) return ok({ batches: scout.value, muse: [] });
  if (!muse.ok) return ok({ batches: scout.value, skipped: [{ id: "muse", reason: muse.error.message }] });
  return ok({ batches: scout.value, muse: muse.value });
}

function eventsOf(wing: ScoutWing, b: SeedBatch, ctx: ProjectCtx): IngestEvent[] {
  const f = facts("seeds", ctx);
  const run = wingRunId(wing, b.id);
  const subject = { kind: "run", id: `seeds:${run}` };
  const data: EventData = { runId: run, ...(wing === "scout" ? {} : { wing }), ...(b.dry ? { dry: true } : {}), ...(b.night === undefined ? {} : { night: b.night }) };
  const status = isWhole(b.committed) ? "committed" : "open";
  const out: IngestEvent[] = [
    f.recorded(run, "run.start", b.createdAt, { actor: SEAT, type: "run.start", subject, data: { ...data, seeds: b.seeds.length } }),
    f.observed(run, `state.${status}`, { actor: SEAT, type: "run.status", subject, data: { ...data, status } }),
  ];
  const c = b.committed;
  if (c !== undefined) {
    const actor = c.by === "agent" ? AGENT : OPERATOR;
    const parts = partsOf(c);
    const split = parts > 1 || openOf(c).length > 0 ? { parts } : {};
    out.push(f.recorded(run, "commit", c.at, { actor, type: "commit", subject, data: { ...data, kept: c.kept.length, rejected: c.rejected.length, ...split } }));
    for (let p = 2; p <= parts; p++) out.push(f.recorded(run, `commit.${p}`, c.partAt?.[p - 2], { actor, type: "commit", subject, data: { ...data, part: p, open: openOf(c).length } }));
  }
  return out;
}

function tallyOf(batches: readonly SeedBatch[]): Projection["tally"] {
  const records: Record<string, number> = {};
  const fs: Record<string, number> = {};
  for (const b of batches) {
    bump(records, `batch.${isWhole(b.committed) ? "committed" : "open"}`);
    bump(fs, "run.start");
    bump(fs, "run.status");
    for (let p = 1; p <= partsOf(b.committed); p++) bump(fs, p === 1 ? "commit" : `commit.${p}`);
  }
  return { records, facts: fs };
}

function weirOf(b: SeedBatch): WeirItem | null {
  if (b.dry || b.seeds.length === 0) return null;
  // Committed in part: the remainder, pending the seeds still open, since the last part landed.
  const part = b.committed === undefined ? 1 : nextPart(b.committed);
  if (part === undefined) return null;
  const since = instant(part === 1 ? b.createdAt : (b.committed?.partAt?.at(-1) ?? b.committed?.at));
  const pending = part === 1 ? b.seeds.length : openOf(b.committed).length;
  return { source: "seeds", id: partRunId(b.id, part), title: `seeds ${b.id}${part === 1 ? "" : ` · part ${part}`}`, media: "image", kind: "cull", ...(since === null ? {} : { since }), decided: 0, pending, href: HREF };
}

export function projectSeeds(s: SeedsSnapshot, ctx: ProjectCtx): Projection {
  const muse = s.muse ?? [];
  return {
    events: [...s.batches.flatMap((b) => eventsOf("scout", b, ctx)), ...muse.flatMap((b) => eventsOf("muse", b, ctx))],
    live: [],
    weir: s.batches.map(weirOf).filter((w) => w !== null),
    tally: tallyOf([...s.batches, ...muse]),
    skipped: s.skipped ?? [],
  };
}

export const seedsSource: Source<SeedsSnapshot> = { id: "seeds", read, project: projectSeeds };
