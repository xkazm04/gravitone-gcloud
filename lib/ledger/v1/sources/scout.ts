import "server-only";

import { errorMessage, err, ok, type Result } from "@gt/domain/errors";
import type { Actor, EventData } from "@gt/domain/event";

import { nextPart, openOf, partsOf } from "../../../foundry/scout/parts.ts";
import { listNights, readNight } from "../../../foundry/scout/store.ts";
import type { Night } from "../../../foundry/scout/types.ts";
import { wingRunId, type ScoutWing } from "../../../foundry/scout/wing.ts";
import { withWing } from "../../../foundry/scout/wingScope.ts";
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
//
// BOTH WINGS (spark scout-muse): each wing's root is read inside its own scope.
// A muse night's record id, subject and run id are its RUN ID `muse:<night>` -
// the same day's scout night is a different record - its events' data carry
// `wing: "muse"`, and its pile is `muse <night>`, opening pkt:scout:muse:<night>.
//
// IN PARTS (spark scout-storyboards, lib/foundry/scout/parts.ts): a night committed with cells left undecided stays
// `closed`, and its ONE pile is the remainder - `<run>:<n>`, pending the cells still open - never the base again.
// Part 1 is the `commit` fact (key unchanged); part n is `commit.<n>`, at its own instant.

/** `nights` are the scout wing's; `muse` the muse wing's (absent in a snapshot taken before the wings). */
export type ScoutSnapshot = { readonly nights: readonly Night[]; readonly muse?: readonly Night[]; readonly skipped: readonly { readonly id: string; readonly reason: string }[] };

export const SCOUT_READ_CAP = 120;

const LOOP: Actor = { kind: "machine", id: "scout" };
const OPERATOR: Actor = { kind: "operator", id: "operator" };
const AGENT: Actor = { kind: "agent", id: "scout-cull-model" };
const HREF = "/floor?lane=image";

/** One wing's nights; a skipped night named by its run id. */
async function readWing(wing: ScoutWing): Promise<Result<{ nights: Night[]; skipped: { id: string; reason: string }[] }>> {
  return withWing(wing, async () => {
    let ids: string[];
    try {
      ids = (await listNights()).slice(0, SCOUT_READ_CAP).map((n) => n.id);
    } catch (e) {
      return err("unavailable", `${wing}: listNights failed: ${errorMessage(e)}`, { cause: e });
    }
    const got = await readEach(ids, readNight);
    return ok({ nights: got.items, skipped: got.skipped.map((s) => ({ ...s, id: wingRunId(wing, s.id) })) });
  });
}

async function read(): Promise<Result<ScoutSnapshot>> {
  const [scout, muse] = await Promise.all([readWing("scout"), readWing("muse")]);
  if (!scout.ok) return scout;
  if (!muse.ok) return muse;
  return ok({ nights: scout.value.nights, muse: muse.value.nights, skipped: [...scout.value.skipped, ...muse.value.skipped] });
}

const rendered = (n: Night): number => n.candidates.filter((c) => c.status === "rendered").length;

function eventsOf(wing: ScoutWing, n: Night, ctx: ProjectCtx): IngestEvent[] {
  const f = facts("scout", ctx);
  const run = wingRunId(wing, n.id);
  const subject = { kind: "run", id: run };
  const data: EventData = { runId: run, ...(wing === "scout" ? {} : { wing }), ...(n.dry ? { dry: true } : {}) };
  const out: IngestEvent[] = [
    f.recorded(run, "run.start", n.startedAt, { actor: LOOP, type: "run.start", subject, data: { ...data, ceilingUsd: n.ceilingUsd, target: n.target } }),
    f.observed(run, `state.${n.state}`, { actor: LOOP, type: "run.status", subject, data: { ...data, status: n.state } }),
  ];
  if (n.closedAt !== undefined) {
    out.push(f.recorded(run, "run.end", n.closedAt, { actor: LOOP, type: "run.end", subject, data: { ...data, ...(n.stop === undefined ? {} : { stop: n.stop }), sources: n.sources.length, candidates: n.candidates.length } }));
  }
  const c = n.committed;
  if (c !== undefined) {
    const actor = c.by === "agent" ? AGENT : OPERATOR;
    const parts = partsOf(c);
    const split = parts > 1 || openOf(c).length > 0 ? { parts } : {};
    out.push(f.recorded(run, "commit", c.at, { actor, type: "commit", subject, data: { ...data, kept: c.kept.length, rejected: c.rejected.length, ...split } }));
    for (let p = 2; p <= parts; p++) out.push(f.recorded(run, `commit.${p}`, c.partAt?.[p - 2], { actor, type: "commit", subject, data: { ...data, part: p, open: openOf(c).length } }));
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
    for (let p = 1; p <= partsOf(n.committed); p++) bump(fs, p === 1 ? "commit" : `commit.${p}`);
  }
  return { records, facts: fs };
}

function weirOf(wing: ScoutWing, n: Night): WeirItem | null {
  if (n.state !== "closed" || n.dry || rendered(n) === 0) return null;
  // Committed in part: the remainder, pending what is still open, since the last part landed.
  const part = n.committed === undefined ? 1 : nextPart(n.committed);
  if (part === undefined) return null;
  const since = instant(part === 1 ? n.closedAt : (n.committed?.partAt?.at(-1) ?? n.committed?.at));
  const pending = part === 1 ? rendered(n) : openOf(n.committed).length;
  return { source: "scout", id: wingRunId(wing, n.id, part), title: `${wing} ${n.id}${part === 1 ? "" : ` · part ${part}`}`, media: "image", kind: "cull", ...(since === null ? {} : { since }), decided: 0, pending, href: HREF };
}

export function projectScout(s: ScoutSnapshot, ctx: ProjectCtx): Projection {
  const all = [...s.nights.map((n) => ["scout", n] as const), ...(s.muse ?? []).map((n) => ["muse", n] as const)];
  return {
    events: all.flatMap(([w, n]) => eventsOf(w, n, ctx)),
    live: [],
    weir: all.map(([w, n]) => weirOf(w, n)).filter((x) => x !== null),
    tally: tallyOf(all.map(([, n]) => n)),
    skipped: s.skipped,
  };
}

export const scoutSource: Source<ScoutSnapshot> = { id: "scout", read, project: projectScout };
