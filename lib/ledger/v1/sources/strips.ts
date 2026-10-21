import "server-only";

import path from "node:path";

import { z } from "zod";

import { parseAt, type Parsed } from "@gt/domain/door";
import { err, errorMessage, ok, type Result } from "@gt/domain/errors";
import type { Actor, EventData } from "@gt/domain/event";

import { listManifests, readJson } from "../../../../lib/foundry/runStore.ts";
import { stripsRoot as v1StripsRoot } from "../../../../lib/foundry/strips/store.ts";
import { JUDGEABLE, STRIP_COMMITTABLE } from "../../../../lib/foundry/strips/triage.ts";
import { bump, facts, instant, seg } from "../facts.ts";
import type { IngestEvent, LiveJob, ProjectCtx, Projection, Skipped, Source, WeirItem } from "../types.ts";

// CODE-RENDERED STRIPS, PROJECTED - foundry-out/strips/<id>/run.json (written
// by pipeline/strips/run.mts) and the triage's verdicts.json
// (lib/foundry/strips/store.ts), read through v1's own manifest lister
// (lib/foundry/runStore.ts listManifests) at a root this adapter chooses.
//
// NOT through `listStripRuns`, which returns a summary that has dropped every
// card - the facts this source exists for. The root is v1's own since Phase 4
// (L33: store.ts `stripsRoot`, the universe's `<out>/strips` or STRIPS_STORE_DIR),
// which used to be a module constant fixed to foundry-out/strips in both universes.
//
// A strip run records ONE instant of its own: `at`, when the pipeline began it.
// Cards carry durations (authorMs, renderMs), never times, and the run has no
// `finished` and no log. So:
//   recorded  run.start (`at`), verdict.keep|reject (`at` per card, stamped by
//             the triage on every verdict write)
//   observed  card.status - each card's status, keyed by value, so pending ->
//             rendered is two facts and a re-render after a lint fix is a third;
//             run.status for `running`/`awaiting-triage`; commit, because
//             commitStripRun flips `status` and writes the instant only into
//             findings.md prose (lib/foundry/strips/store.ts stripFindings),
//             which is not a field a door can read.
// Card cost rides in `data.costUsd`, never `cost`: authoring is a text turn on
// the operator's seat, and the spend source projects the money ledger itself.
//
// LIVE: `running` (the pipeline is still authoring or capturing) on a v1 run, which
// keeps no holder or heartbeat, so a pipeline that died mid-run still reads `running`.
// A run driven by a kernel job (Phase 4, L33: `job` on run.json) is NOT drawn here: the
// job record is the truth for running state (plan §5.4) - Runs reads it, with its slot,
// its step and, for a dead driver, its interruption - so it is never drawn twice from a
// mirror that lags it. A dry job's run is kept off the Weir: its pages are stand-ins. The lane is seat.text
// with the reason on the row: a run alternates authoring turns with headless
// captures, and authoring is the longer half (measured on this machine's
// strips-r1, 2026-10-15: a control card authored for 653 s and rendered in 24 s).
//
// THE WEIR: `awaiting-triage` (STRIP_COMMITTABLE) is a cull pile over the
// JUDGEABLE (rendered) cards.

const CARD_STATUSES = ["pending", "rendered", "lint-failed", "render-failed", "author-failed"] as const;

const runSchema = z.object({
  id: z.string().min(1),
  at: z.string(),
  status: z.enum(["running", "awaiting-triage", "committed"]),
  /** The kernel job driving the run (lib/producers/strips.ts); absent on a v1 run. */
  job: z.string().min(1).optional(),
  dry: z.boolean().optional(),
  cards: z.array(
    z.object({
      id: z.string().min(1),
      lane: z.enum(["edu", "stat"]),
      case: z.string(),
      approach: z.string(),
      status: z.enum(CARD_STATUSES),
      costUsd: z.number().optional(),
      error: z.string().optional(),
    }),
  ),
});
// A cleared verdict is absent in v1 (cleanStripVerdicts `continue`s on null); a null is read as cleared all the same.
const verdictsSchema = z
  .record(z.string(), z.object({ verdict: z.enum(["keep", "reject"]), at: z.string(), note: z.string().optional(), chips: z.array(z.string()).optional() }).nullable())
  .transform((m) => Object.entries(m).flatMap(([key, v]) => (v === null ? [] : [{ key, ...v }])));

type StripRun = { readonly run: Parsed<z.output<typeof runSchema>>; readonly verdicts: Parsed<z.output<typeof verdictsSchema>> };
export type StripsSnapshot = { readonly runs: readonly StripRun[]; readonly skipped: readonly Skipped[] };

const PIPELINE: Actor = { kind: "machine", id: "strips" };
const OPERATOR: Actor = { kind: "operator", id: "operator" };
// Where the work is seen now: the Floor's video lane - its cells the running work, its Weir the
// pile (v1's /foundry page retired in Phase 6 wave C and redirects; a redirect is not a link to keep).
const HREF = "/floor?lane=video";
const LANE_FROM = "v1 records no per-card phase; a strip run is mostly authoring turns on the text seat, with short headless captures";

/** v1's strips root in this universe: store.ts `stripsRoot`, which honours the fixture switch itself. */
export const stripsRoot = (): string => v1StripsRoot();

/** Every strip run under `root`, through the door. A damaged run is skipped with its words. */
export async function readStrips(root: string): Promise<Result<StripsSnapshot>> {
  type Got = { ok: true; run: StripRun } | { ok: false; skip: Skipped };
  let listed: { items: Got[]; warnings: { id: string; reason: string }[] };
  try {
    listed = await listManifests<unknown, Got>(root, "run.json", async (name, raw): Promise<Got> => {
      const run = parseAt(`strip run ${name}`, runSchema, raw);
      if (!run.ok) return { ok: false, skip: { id: name, reason: run.error.message } };
      let rawVerdicts: unknown;
      try {
        rawVerdicts = await readJson<unknown>(path.join(root, name, "verdicts.json"), {});
      } catch (e) {
        return { ok: false, skip: { id: name, reason: `verdicts.json: ${errorMessage(e)}` } };
      }
      const verdicts = parseAt(`strip run ${name} verdicts`, verdictsSchema, rawVerdicts);
      return verdicts.ok ? { ok: true, run: { run: run.value, verdicts: verdicts.value } } : { ok: false, skip: { id: name, reason: verdicts.error.message } };
    });
  } catch (e) {
    return err("unavailable", `strips: listing ${root} failed: ${errorMessage(e)}`, { cause: e });
  }
  const runs: StripRun[] = [];
  const skipped: Skipped[] = [...listed.warnings];
  for (const g of listed.items) {
    if (g.ok) runs.push(g.run);
    else skipped.push(g.skip);
  }
  return ok({ runs, skipped });
}

function eventsOf({ run, verdicts }: StripRun, ctx: ProjectCtx): IngestEvent[] {
  const f = facts("strips", ctx);
  const subject = { kind: "run", id: run.id };
  const data: EventData = { runId: run.id };
  const out: IngestEvent[] = [f.recorded(run.id, "run.start", run.at, { actor: PIPELINE, type: "run.start", subject, lane: "seat.text", data })];
  for (const c of run.cards) {
    const detail: EventData = { ...data, status: c.status, lane: c.lane, case: c.case, approach: c.approach, ...(c.costUsd === undefined ? {} : { costUsd: c.costUsd }), ...(c.error === undefined ? {} : { error: c.error }) };
    out.push(f.observed(run.id, `card.${seg(c.id)}.${c.status}`, { actor: PIPELINE, type: "card.status", subject: { kind: "card", id: `${run.id}/${c.id}` }, data: detail }));
  }
  if (run.status === "committed") out.push(f.observed(run.id, "commit", { actor: OPERATOR, type: "commit", subject, data }));
  else out.push(f.observed(run.id, `status.${run.status}`, { actor: PIPELINE, type: "run.status", subject, data: { ...data, status: run.status } }));
  for (const v of verdicts) {
    const extra: EventData = { ...(v.note === undefined ? {} : { note: v.note }), ...(v.chips === undefined ? {} : { chips: v.chips }) };
    out.push(
      f.recorded(run.id, `verdict.${seg(v.key)}.${v.verdict}.${v.at}`, v.at, { actor: OPERATOR, type: `verdict.${v.verdict}`, subject: { kind: "card", id: `${run.id}/${v.key}` }, data: { ...data, ...extra } }),
    );
  }
  return out;
}

function tallyOf(runs: readonly StripRun[]): Projection["tally"] {
  const records: Record<string, number> = {};
  const fs: Record<string, number> = {};
  for (const { run, verdicts } of runs) {
    bump(records, `run.${run.status}`);
    bump(fs, "run.start");
    bump(fs, "card.status", run.cards.length);
    bump(fs, run.status === "committed" ? "commit" : "run.status");
    for (const v of verdicts) bump(fs, `verdict.${v.verdict}`);
  }
  return { records, facts: fs };
}

function liveOf({ run }: StripRun): LiveJob | null {
  if (run.status !== "running" || run.job !== undefined) return null;
  const startedAt = instant(run.at);
  return {
    source: "strips",
    id: run.id,
    title: `strips ${run.id}`,
    lane: "seat.text",
    laneFrom: LANE_FROM,
    media: "video",
    state: "running",
    ...(startedAt === null ? {} : { startedAt }),
    progress: { done: run.cards.filter((c) => c.status !== "pending").length, total: run.cards.length },
    href: HREF,
  };
}

function weirOf({ run, verdicts }: StripRun): WeirItem | null {
  if (!STRIP_COMMITTABLE.includes(run.status) || run.dry === true) return null;
  const plates = run.cards.filter((c) => JUDGEABLE.includes(c.status));
  if (plates.length === 0) return null;
  const judged = new Set(verdicts.map((v) => v.key));
  const decided = plates.filter((c) => judged.has(c.id)).length;
  return { source: "strips", id: run.id, title: `strips ${run.id}`, media: "video", kind: "cull", decided, pending: plates.length - decided, href: HREF };
}

export function projectStrips(s: StripsSnapshot, ctx: ProjectCtx): Projection {
  return {
    events: s.runs.flatMap((r) => eventsOf(r, ctx)),
    live: s.runs.map(liveOf).filter((j) => j !== null),
    weir: s.runs.map(weirOf).filter((w) => w !== null),
    tally: tallyOf(s.runs),
    skipped: s.skipped,
  };
}

export const stripsSource: Source<StripsSnapshot> = { id: "strips", read: () => readStrips(stripsRoot()), project: projectStrips };
