import "server-only";

import { readdir } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { parseAt, type Parsed } from "@gt/domain/door";
import { err, ok, type Result } from "@gt/domain/errors";
import type { Actor, EventData } from "@gt/domain/event";
import type { JobState } from "@gt/domain/job";
import { list } from "@gt/kernel/job";

import { ARTICLE_STATUSES, STEP_NAMES } from "../../../../lib/articles/types.ts";
import { readJsonFile, RUN_ID_RE, storeRoot } from "../../../../lib/articles/store.ts";
import { pidAlive } from "../../../../lib/gpu/lease.ts";
import { storeLocation } from "../../../../lib/kernelStore.ts";
import { WORKING } from "../../../articles/types.ts";
import { bump, facts, instant, readEach, words } from "../facts.ts";
import type { IngestEvent, LiveJob, ProjectCtx, Projection, Skipped, Source, WeirItem } from "../types.ts";
import { universeRoot } from "./roots.ts";

// THE ARTICLE PIPELINE, PROJECTED - <store>/<id>/run.json (lib/articles/store.ts,
// written by the engine under a per-run lock) and the run's `.driver` lease.
//
// Event-grade, recorded: run.start (`createdAt`), step.start / step.end (each
// `steps[]` entry's `startedAt` / `endedAt` - keyed by name AND startedAt,
// because a rework moves draft/critique/check into rework/<n>/steps.json and
// runs them again: a key by name alone would make the second draft the first
// one's duplicate), verdict.approve (`approval.at`), verdict.reject
// (`rejection.at`), rework (`rework.at`, keyed by its count; only the latest
// rework is on the manifest, so an older one the ledger never saw is lost - it
// is in rework/<n>/, which no v1 reader lists), land (`landedAt`, written once
// by the `landed` transition - the field exists precisely because `updatedAt`
// cannot say when a post landed).
// Observed: run.status, the rewritten `status` field. Never `updatedAt`: every
// write restamps it, so it is "last touched", which is no fact at all.
// Step cost rides in `data.costUsd`: the seat's spend is the spend source's to
// project as money, and counting it here too would count it twice.
//
// LIVE IS STATUS AND A HOLDER (app/api/articles/route.ts GET; the WORKING set in lib/articles/types.ts,
// read by app/articles/runModel.ts phaseOf). Since Phase 4 (L30) the holder is the run's kernel job: a
// job of the run (`job:run:<id>[:...]`, producer `article`) that is queued or running holds it - the
// job record is the truth for running state, run.json for the work (§5.4). A `.driver` pid file a v1
// build left still holds it while that pid lives, so a drive started before the cutover is not called
// stalled. A WORKING status with a holder is running; without one
// it is what /articles calls `stalled` - a drive that died (a restarted
// server, a killed CLI) - and here `interrupted`: the kernel's word for "the
// holder died, look before re-spending", and the page offers the same Resume.
// The stall is said in `error`, in the page's word.
//
// THE WEIR: `awaiting-approval` is a gate pile of one - the human approves,
// reworks or rejects the post.
//
// THE ROOT. v1's reader lists `storeRoot()`, which ignores the fixture switch
// on purpose (lib/fixtures/mode.ts). This reader lists the root roots.ts picks
// and reads each manifest and lease through v1's own `readJsonFile`;
// `listRuns` and `driverAlive` cannot be pointed at a root, so their two loops
// are repeated here with v1's RUN_ID_RE and its pid probe.

const STEP = z.object({ name: z.enum(STEP_NAMES), status: z.enum(["running", "done", "failed"]), startedAt: z.string(), endedAt: z.string().optional(), costUsd: z.number().optional() });

const runSchema = z.object({
  id: z.string().min(1),
  status: z.enum(ARTICLE_STATUSES),
  topic: z.object({ kind: z.enum(["subject", "free"]), bundle: z.string().optional(), subject: z.string().optional(), text: z.string().optional() }),
  model: z.string(),
  steps: z.array(STEP),
  createdAt: z.string(),
  error: z.string().optional(),
  approval: z.object({ at: z.string(), patches: z.array(z.string()) }).optional(),
  rejection: z.object({ at: z.string(), note: z.string() }).optional(),
  rework: z.object({ at: z.string(), note: z.string(), count: z.number() }).optional(),
  landing: z.object({ slug: z.string(), branch: z.string(), prUrl: z.string().optional(), commit: z.string().optional() }).optional(),
  landedAt: z.string().optional(),
});

type Article = { readonly run: Parsed<z.output<typeof runSchema>>; readonly driving: boolean };
export type ArticlesSnapshot = { readonly runs: readonly Article[]; readonly skipped: readonly Skipped[] };

export const ARTICLES_READ_CAP = 500;
const ENGINE: Actor = { kind: "agent", id: "article-engine" };
const OPERATOR: Actor = { kind: "operator", id: "operator" };
// Where the work is seen now: the Floor's article lane - its cells the running work, its Weir the
// pile (v1's /articles page retired in Phase 6 wave C and redirects; a redirect is not a link to keep).
const HREF = "/floor?lane=article";
// v1's page offered Resume here; it retired (Phase 6 wave C), and the run's kernel job is resumed
// from Runs or by `pipeline/article.mts resume <runId>`, which retries the same job.
const STALLED = "stalled: no live driver holds this run (a restarted server or a killed CLI); resume it from Runs or with pipeline/article.mts resume";

export const articlesRoot = (): string => universeRoot("articles", storeRoot, "ARTICLES_STORE_DIR");

/** lib/articles/store.ts driverAlive, at a given root. */
async function driverAt(dir: string): Promise<boolean> {
  const held = await readJsonFile<unknown>(path.join(dir, ".driver"), null).catch(() => null);
  const pid = parseAt("article driver", z.object({ pid: z.number() }), held);
  return pid.ok && pidAlive(pid.value.pid);
}

/**
 * The article runs a kernel job holds (queued or running), by run id. A READER NEVER OPENS A STORE: it
 * reads the process's kernel when this process has it open (the app opens it before any page reads,
 * app/_server/kernel.ts), and a process that never did - a test over a store of its own - reads no
 * jobs, so a `.driver` alone holds. Opening one here would leave a handle nobody closes.
 */
export function heldByJobs(): ReadonlySet<string> {
  const open = globalThis.__gravitoneKernel;
  if (open === undefined || open.location !== storeLocation()) return new Set();
  const jobs = list(open.kernel.store);
  if (!jobs.ok) return new Set();
  return new Set(jobs.value.filter((j) => j.producer === "article" && j.of.kind === "run" && (j.state === "queued" || j.state === "running")).map((j) => j.of.id));
}

export async function readArticles(root: string, held: () => ReadonlySet<string> = () => new Set()): Promise<Result<ArticlesSnapshot>> {
  let names: string[];
  try {
    names = await readdir(root);
  } catch (e) {
    if (!(e instanceof Error && "code" in e && e.code === "ENOENT")) return err("unavailable", `articles: listing ${root} failed: ${words(e)}`, { cause: e });
    names = [];
  }
  const ids = names.filter((n) => RUN_ID_RE.test(n)).sort().reverse().slice(0, ARTICLES_READ_CAP);
  const byJob = held();
  const got = await readEach(ids, async (id) => ({ id, raw: await readJsonFile<unknown>(path.join(root, id, "run.json"), null), driving: byJob.has(id) || (await driverAt(path.join(root, id))) }));
  const runs: Article[] = [];
  const skipped: Skipped[] = [...got.skipped];
  for (const d of got.items) {
    if (d.raw === null) continue;
    const run = parseAt(`article run ${d.id}`, runSchema, d.raw);
    if (run.ok) runs.push({ run: run.value, driving: d.driving });
    else skipped.push({ id: d.id, reason: run.error.message });
  }
  return ok({ runs, skipped });
}

function eventsOf({ run }: Article, ctx: ProjectCtx): IngestEvent[] {
  const f = facts("articles", ctx);
  const subject = { kind: "article", id: run.id };
  const data: EventData = { runId: run.id, model: run.model, topic: run.topic.subject ?? run.topic.text ?? run.topic.kind };
  const at = { actor: ENGINE, subject, lane: "seat.text" } as const;
  const out: IngestEvent[] = [f.recorded(run.id, "run.start", run.createdAt, { ...at, type: "run.start", data })];
  for (const s of run.steps) {
    const step = `step.${s.name}.${s.startedAt}`;
    out.push(f.recorded(run.id, step, s.startedAt, { ...at, type: "step.start", data: { ...data, step: s.name } }));
    if (s.endedAt !== undefined) {
      const end: EventData = { ...data, step: s.name, status: s.status, ...(s.costUsd === undefined ? {} : { costUsd: s.costUsd }) };
      out.push(f.recorded(run.id, `${step}.end`, s.endedAt, { ...at, type: "step.end", data: end }));
    }
  }
  if (run.status !== "queued" && !(run.status === "landed" && run.landedAt !== undefined)) {
    out.push(f.observed(run.id, `status.${run.status}`, { actor: ENGINE, type: "run.status", subject, data: { ...data, status: run.status, ...(run.error === undefined ? {} : { error: run.error }) } }));
  }
  if (run.approval !== undefined) out.push(f.recorded(run.id, "approve", run.approval.at, { actor: OPERATOR, type: "verdict.approve", subject, data: { ...data, patches: run.approval.patches } }));
  if (run.rejection !== undefined) out.push(f.recorded(run.id, "reject", run.rejection.at, { actor: OPERATOR, type: "verdict.reject", subject, data: { ...data, note: run.rejection.note } }));
  if (run.rework !== undefined) out.push(f.recorded(run.id, `rework.${run.rework.count}`, run.rework.at, { actor: OPERATOR, type: "rework", subject, data: { ...data, note: run.rework.note, count: run.rework.count } }));
  if (run.landedAt !== undefined) {
    const landing: EventData = run.landing === undefined ? {} : { slug: run.landing.slug, branch: run.landing.branch, ...(run.landing.prUrl === undefined ? {} : { prUrl: run.landing.prUrl }) };
    out.push(f.recorded(run.id, "land", run.landedAt, { actor: ENGINE, type: "land", subject, data: { ...data, ...landing } }));
  }
  return out;
}

function tallyOf(runs: readonly Article[]): Projection["tally"] {
  const records: Record<string, number> = {};
  const fs: Record<string, number> = {};
  for (const { run } of runs) {
    bump(records, `run.${run.status}`);
    bump(fs, "run.start");
    bump(fs, "step.start", run.steps.length);
    bump(fs, "step.end", run.steps.filter((s) => s.endedAt !== undefined).length);
    if (run.status !== "queued" && !(run.status === "landed" && run.landedAt !== undefined)) bump(fs, "run.status");
    if (run.approval !== undefined) bump(fs, "verdict.approve");
    if (run.rejection !== undefined) bump(fs, "verdict.reject");
    if (run.rework !== undefined) bump(fs, "rework");
    if (run.landedAt !== undefined) bump(fs, "land");
  }
  return { records, facts: fs };
}

function liveOf({ run, driving }: Article): LiveJob | null {
  if (!WORKING.includes(run.status)) return null;
  const state: JobState = driving ? "running" : "interrupted";
  const startedAt = instant(run.createdAt);
  const current = run.steps.at(-1);
  return {
    source: "articles",
    id: run.id,
    title: `article ${run.topic.subject ?? run.topic.text ?? run.id}`,
    lane: "seat.text",
    media: "article",
    state,
    ...(startedAt === null ? {} : { startedAt }),
    progress: { done: run.steps.filter((s) => s.status === "done").length, total: STEP_NAMES.length, stage: current?.name ?? run.status },
    ...(driving ? {} : { error: STALLED }),
    href: HREF,
  };
}

function weirOf({ run }: Article): WeirItem | null {
  if (run.status !== "awaiting-approval") return null;
  const since = instant(run.steps.at(-1)?.endedAt);
  return { source: "articles", id: run.id, title: `article ${run.topic.subject ?? run.topic.text ?? run.id}`, media: "article", kind: "gate", ...(since === null ? {} : { since }), decided: 0, pending: 1, href: HREF };
}

export function projectArticles(s: ArticlesSnapshot, ctx: ProjectCtx): Projection {
  return {
    events: s.runs.flatMap((r) => eventsOf(r, ctx)),
    live: s.runs.map(liveOf).filter((j) => j !== null),
    weir: s.runs.map(weirOf).filter((w) => w !== null),
    tally: tallyOf(s.runs),
    skipped: s.skipped,
  };
}

export const articlesSource: Source<ArticlesSnapshot> = { id: "articles", read: () => readArticles(articlesRoot(), heldByJobs), project: projectArticles };
