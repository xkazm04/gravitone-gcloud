import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import { parseAt } from "@gt/domain/door";
import { AppError, err, isAppError, ok, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import { jobIdSchema } from "@gt/domain/ids";
import type { Job } from "@gt/domain/job";
import type { ModelOption, Receipt, ReceiptMode } from "@gt/domain/produce";
import { blobStore } from "@gt/kernel/blob";
import { liveEffects, type Effects } from "@gt/kernel/effects";
import type { Producer } from "@gt/kernel/job-core";
import { get, list } from "@gt/kernel/job";
import { runJob, type RunOptions, type RunReport } from "@gt/kernel/job-run";
import { processKernel, storeLocation } from "@gt/kernel/process";
import { launchRun, runReceipt } from "@gt/kernel/records/launch";
import { modelOptions } from "@gt/kernel/records/options";
import type { Store } from "@gt/kernel/store";
import { defineStrips, type StripsPorts } from "@gt/producers/strips/define";
import { cardWorstUsd, RENDER_ESTIMATE, TURN_ESTIMATE } from "@gt/producers/strips/plan";

import { runAgent, type AgentResult, type RunAgentInput } from "../agent/cliSeam.ts";
import { OUT_DIRNAME } from "../fixtures/mode.ts";
import { codeRoot } from "./forge.ts";
import { blobRootOf } from "../kernelProcess.ts";
import { makeAsset, standInTurn, type StripTurn } from "../foundry/strips/author.ts";
import { FoundryError } from "../foundry/runStore.ts";
import { DEFAULT_OPTIONS, loadApproaches, selectCards, type CardSelection } from "../foundry/strips/cards.ts";
import { readStripRunNow, saveStripRun, stripRunDir, stripsRoot } from "../foundry/strips/store.ts";
import { asset, assetUsd, land, lint, prepare, render, triage, viewOf, type Capture, type ImageMaker } from "../foundry/strips/steps.ts";
import { STRIP_FPS, STRIP_FRAMES, STRIP_SIZE, type StripRun, type StripRunOptions } from "../foundry/strips/types.ts";

// THE STRIPS PRODUCER, BOUND (Phase 4, L33) - packages/producers/src/strips over
// lib/foundry/strips (the workspace, the steps on disk, run.json as the artefact store)
// and pipeline/strips/render.mts (the capture). The CLI (pipeline/strips/run.mts), the
// route (POST /api/foundry/strips) and the worker launch, act on and drive THE SAME job
// through here. Removed, and what holds the guarantee now:
//   the run's process as its only holder  ->  the kernel's fenced slot lease on seat.text:
//       a second driver of the job is refused at the claim, and a driver whose slot was
//       taken over writes nothing to run.json (steps.ts asks the fence first); a process
//       that died is found by `recover` and its job reads `interrupted`, naming the card
//       step in flight - v1's "running forever" is gone;
//   `--resume` re-authoring every unrendered card  ->  the job's retry: booked steps are
//       never planned again, and a page that landed unbooked is adopted (plan.ts);
//   the card cost summed on the card only  ->  the job meter, per turn (define.ts); the card
//       keeps its sum for the Strips tab, as v1's readers expect.

export type StripsKernel = { readonly store: Store; readonly fx: Effects };

export type StripsBinding = {
  /** The process's kernel when absent (a test hands a temp one). */
  readonly kernel?: StripsKernel;
  /** The seat (lib/agent/cliSeam.ts `runAgent`); a test hands a counted fake. */
  readonly seat?: (input: RunAgentInput) => Promise<AgentResult>;
  /** The capture (pipeline/strips/render.mts); a test hands a fake that writes no frames. */
  readonly capture?: () => Promise<Capture>;
  readonly image?: ImageMaker;
};

/** The process's kernel, as the worker opens it: the store and its effects. */
export function stripsKernel(): Result<StripsKernel> {
  const location = storeLocation(OUT_DIRNAME);
  const k = processKernel(location);
  if (!k.ok) return k;
  return ok({ store: k.value.store, fx: liveEffects(k.value.store, blobStore(blobRootOf(k.value.store))) });
}

const kernelOf = (b: StripsBinding): Result<StripsKernel> => (b.kernel === undefined ? stripsKernel() : ok(b.kernel));

/** The real capture: one headless Chromium per call, closed after (render.mts says why its flags). */
async function realCapture(): Promise<Capture> {
  const r = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ "../../pipeline/strips/render.mts");
  const withBrowser = async <T,>(fn: (b: Awaited<ReturnType<typeof r.launchHeadless>>) => Promise<T>): Promise<T> => {
    const browser = await r.launchHeadless();
    try {
      return await fn(browser);
    } finally {
      await browser.close();
    }
  };
  return {
    render: (o) => withBrowser((browser) => r.renderStrip({ browser, ...o })),
    distances: (sheets) => withBrowser((browser) => r.sheetDistances(browser, sheets)),
  };
}

/* ── the ports ──────────────────────────────────────────────────────────────── */

export function stripsPorts(b: StripsBinding = {}): StripsPorts<StripTurn, AgentResult> {
  const capture = b.capture ?? realCapture;
  const seat = b.seat ?? runAgent;
  return {
    load(runId) {
      try {
        return ok(viewOf(readStripRunNow(runId)));
      } catch (e) {
        if (isAppError(e)) return err(e.code, e.message);
        if (e instanceof FoundryError) return err(e.status === 404 ? "not-found" : "unavailable", e.message);
        throw e;
      }
    },
    prepare: (runId, step) => prepare(runId, step),
    describe: (t) => ({ model: t.agent.model, effort: t.agent.effort, promptChars: t.agent.prompt.length }),
    live: (t) => seat(t.agent),
    stand: (t) => standInTurn(t),
    capped: (t, usd) => ({ ...t, agent: { ...t.agent, maxBudgetUsd: Math.min(t.agent.maxBudgetUsd ?? Number.POSITIVE_INFINITY, usd) } }),
    land: (runId, step, t, r, io) => land(runId, step, t, r, io),
    lint: (runId, step, io) => lint(runId, step, io),
    render: (runId, step, io) => render(runId, step, io, capture),
    asset: (runId, approach, call, io) => asset(runId, approach, call, io, b.image ?? makeAsset),
    triage: (runId, io) => triage(runId, io, capture),
    settle: (job) => settleStripsRun(job),
  };
}

/** The bound producer - the one line lib/producers/registry.ts carries. */
export const stripsProducer = (b: StripsBinding = {}): Producer => defineStrips(stripsPorts(b));

/* ── the receipt ────────────────────────────────────────────────────────────── */

/** The cards a launch will author: what the receipt prices and the token binds. */
export type StripsShape = { readonly runId: string; readonly cards: readonly string[]; readonly assets: number; readonly options: StripRunOptions };

/** The run's worst case, per card: every fix round taken, every capture, its image. Measured figures (plan.ts). */
export function stripsOption(shape: StripsShape, day: string): ModelOption {
  const base = modelOptions("strips", day)[0];
  if (base === undefined) throw new AppError("internal", "catalog: the strips part has no option");
  const n = Math.max(1, shape.cards.length);
  const turns = shape.options.rounds + 1;
  const usd = Math.round(((n * cardWorstUsd(shape.options.rounds, false, 0) + shape.assets * assetUsd()) / n) * 1e6) / 1e6;
  const { unpricedReason: _seat, ...rest } = base;
  return {
    ...rest,
    lane: "seat.text",
    label: `${base.label} · worst case`,
    usdPerUnit: usd,
    secondsPerUnit: turns * (TURN_ESTIMATE.seconds + RENDER_ESTIMATE.seconds),
    src: "model",
    basis: {
      seconds: { src: "real", note: "strips-r1: 879 s of seat and 142 s of capture per round", measuredAt: "2026-10-06" },
      usd: { src: "model", note: `${turns} seat turn(s) a card at the measured $${TURN_ESTIMATE.usd} each, the seat's own report replacing it` },
    },
  };
}

const keyOf = (s: StripsShape): string =>
  `strips:${s.runId}:${createHash("sha256").update(JSON.stringify([s.cards, s.assets, s.options])).digest("hex").slice(0, 24)}`;

const inputOf = (lane: CardSelection["lane"], only: readonly string[]) => ({ producer: "strips" as const, lane, ...(only.length ? { only: [...only] } : {}) });

/* ── launch: receipt, then confirm ─────────────────────────────────────────── */

export type StripsTarget =
  | { readonly kind: "new"; readonly runId: string; readonly selection: CardSelection; readonly options: StripRunOptions }
  /** An existing run: a pre-Phase-4 run's `--resume`, or a finished run with cards added. */
  | { readonly kind: "run"; readonly runId: string; readonly add?: CardSelection };

export type LaunchStripsOptions = {
  readonly mode: ReceiptMode;
  readonly ceilingUsd?: number;
  readonly actor: Actor;
  /** Absent: answer with the receipt and launch nothing. */
  readonly token?: string;
  readonly dryOnly: boolean;
  readonly now?: number;
  readonly binding?: StripsBinding;
};

export type StripsLaunch =
  | { readonly kind: "receipt"; readonly receipt: Receipt; readonly cards: readonly string[] }
  | { readonly kind: "stale"; readonly fresh: Receipt }
  | { readonly kind: "launched"; readonly runId: string; readonly jobId: string; readonly receipt: Receipt }
  /** The run has a job that is not finished: that job, never a second. */
  | { readonly kind: "existing"; readonly runId: string; readonly jobId: string; readonly state: Job["state"] };

export function jobOf(store: Store, id: string): Job | undefined {
  const parsed = parseAt("job id", jobIdSchema, id);
  if (!parsed.ok) throw parsed.error;
  const r = get(store, parsed.value);
  if (r.ok) return r.value.job;
  if (r.error.code === "not-found") return undefined;
  throw r.error;
}

/** A free job id for a run: `job:run:<id>`, else `~2`, `~3`... (a launch after a finished job). */
function freeJobId(store: Store, runId: string): string {
  for (let k = 1; k < 1000; k++) {
    const id = k === 1 ? `job:run:${runId}` : `job:run:${runId}~${k}`;
    if (jobOf(store, id) === undefined) return id;
  }
  throw new AppError("conflict", `strip run ${runId} has run a thousand times`);
}

const FINISHED: readonly Job["state"][] = ["done", "cancelled"];

/** Every brief a card needs is in the checkout (forge.ts `codeRoot`, not the cwd): refused at the receipt, before a turn
 *  is bought for a card that cannot be authored. */
function missingBriefs(cases: Iterable<string>): string[] {
  const code = codeRoot();
  return [...new Set(cases)].filter((c) => !existsSync(path.join(code, "pipeline", "strips", "data", `${c}.json`)));
}

export async function launchStrips(target: StripsTarget, opts: LaunchStripsOptions): Promise<Result<StripsLaunch>> {
  const k = kernelOf(opts.binding ?? {});
  if (!k.ok) return k;
  const store = k.value.store;
  const now = opts.now ?? Date.now();
  const approaches = loadApproaches();
  let manifest: StripRun | undefined;
  let added = [] as ReturnType<typeof selectCards>;
  if (target.kind === "run") {
    manifest = readStripRunNow(target.runId);
    if (manifest.status === "committed") return err("conflict", `strip run ${target.runId} is committed; launch a new run`);
    if (manifest.dry === true && opts.mode === "live") return err("refused", `strip run ${target.runId} was a dry job; its pages are stand-ins - launch a new run to spend`);
    const held = manifest.job === undefined ? undefined : jobOf(store, manifest.job);
    if (held !== undefined && !FINISHED.includes(held.state)) return ok({ kind: "existing", runId: manifest.id, jobId: held.id, state: held.state });
    added = target.add === undefined ? [] : selectCards(approaches, target.add).filter((s) => !manifest?.cards.some((c) => c.id === s.card.id));
  } else {
    if (existsSync(path.join(stripRunDir(target.runId), "run.json"))) return err("conflict", `strip run ${target.runId} exists; resume it (--resume --run ${target.runId}) or name a new run`);
    added = selectCards(approaches, target.selection);
    if (added.length === 0) return err("invalid", "the flags select no card");
  }
  // A run from before Phase 4 carries no options: it was launched under v1's defaults, which it keeps.
  const options = target.kind === "new" ? target.options : (manifest?.options ?? DEFAULT_OPTIONS);
  const cards = [...(manifest?.cards.filter((c) => c.status !== "rendered" && c.status !== "author-failed") ?? []).map((c) => c.id), ...added.map((s) => s.card.id)];
  const pending = new Set(cards);
  const absent = missingBriefs([...(manifest?.cards ?? []), ...added.map((s) => s.card)].filter((c) => pending.has(c.id)).map((c) => c.case));
  if (absent.length > 0) return err("invalid", `no data fixture for ${absent.map((c) => `pipeline/strips/data/${c}.json`).join(", ")}`);
  const assets = options.leonardo ? new Set(added.filter((s) => s.approach.leonardo !== "none").map((s) => s.approach.id)).size : 0;
  const shape: StripsShape = { runId: target.runId, cards, assets, options };
  const day = new Date(now).toISOString().slice(0, 10);
  const selection = target.kind === "new" ? target.selection : target.add;
  const input = inputOf(selection?.lane ?? "all", selection?.only ?? []);
  const quote = { key: keyOf(shape), label: `strips · ${Math.max(1, cards.length)} card(s)`, option: stripsOption(shape, day) };
  const ro = { mode: opts.mode, units: Math.max(1, cards.length), quote, ...(opts.ceilingUsd === undefined ? {} : { ceilingUsd: opts.ceilingUsd }) };
  const receipt = runReceipt(store, input, ro, { now });
  if (!receipt.ok) return receipt;
  if (opts.token === undefined) return ok({ kind: "receipt", receipt: receipt.value, cards });
  if (opts.token !== receipt.value.token) return ok({ kind: "stale", fresh: receipt.value });

  const jobId = freeJobId(store, target.runId);
  const at = new Date(now).toISOString();
  const m: StripRun = manifest ?? {
    version: 1,
    id: target.runId,
    at,
    width: { edu: STRIP_SIZE.edu.width, stat: STRIP_SIZE.stat.width },
    height: { edu: STRIP_SIZE.edu.height, stat: STRIP_SIZE.stat.height },
    fps: STRIP_FPS,
    frames: STRIP_FRAMES,
    approaches: [],
    cards: [],
    status: "running",
    options,
  };
  for (const s of added) {
    if (s.approach.id !== "CTRL" && !m.approaches.some((a) => a.id === s.approach.id)) m.approaches.push(s.approach);
    m.cards.push(s.card);
  }
  // The manifest names its job BEFORE the job exists: a launch that dies between the two
  // leaves a run whose job is missing, which the next launch (`--resume`) enqueues.
  m.job = jobId;
  m.options = options;
  m.status = "running";
  if (opts.mode === "dry") m.dry = true;
  delete m.error;
  await mkdir(stripRunDir(m.id), { recursive: true });
  await saveStripRun(m);
  const l = launchRun(store, { input, token: opts.token, ...ro }, opts.actor, { now, dryOnly: opts.dryOnly, id: m.id, jobId });
  if (!l.ok) {
    if (l.fresh !== undefined && l.error.detail === "stale-receipt") return ok({ kind: "stale", fresh: l.fresh });
    return err(l.error.code, `strip run ${m.id} was written and not launched: ${l.error.message}`);
  }
  return ok({ kind: "launched", runId: m.id, jobId: l.value.jobId, receipt: receipt.value });
}

/* ── drive and settle ───────────────────────────────────────────────────────── */

export type DriveOptions = RunOptions & { readonly binding?: StripsBinding; readonly onStep?: (step: string) => void };

/** Drive one strips job in this process (the CLI; the worker does the same through `workLoop`). */
export async function driveStrips(jobId: string, o: DriveOptions = {}): Promise<Result<RunReport>> {
  const { binding = {}, onStep, ...run } = o;
  const k = kernelOf(binding);
  if (!k.ok) return k;
  const base = k.value.fx;
  const fx: Effects =
    onStep === undefined
      ? base
      : {
          ...base,
          tx: (name, fn) => {
            const r = base.tx(name, fn);
            if (r.ok && name.startsWith("book:")) onStep(name.slice("book:".length));
            return r;
          },
        };
  return runJob(fx, stripsProducer({ ...binding, kernel: k.value }), jobId, run);
}

/**
 * The producer's `settle` (kernel job-core): a job the KERNEL ended - its ceiling, the
 * breaker, a money stop, a cancel - never ran the triage step, so run.json would read
 * `running` with nobody driving it (v1's defect, now with a cause). Hand the run to triage
 * with the reason on it: what rendered is judgeable, what did not stays undecided. Called by
 * runJob after every drive, so the CLI, the route's worker and a test settle alike.
 * Idempotent; a retried job sets the run running again at its first write. An interrupted or
 * paused job is left as it is: Runs shows it, the operator decides.
 */
export async function settleStripsRun(job: Job): Promise<void> {
  if (job.producer !== "strips" || (job.state !== "failed" && job.state !== "cancelled")) return;
  const m = readStripRunNow(job.of.id);
  if (m.job !== job.id || m.status !== "running") return;
  m.status = "awaiting-triage";
  m.error = job.error?.message ?? `job ${job.id} was ${job.state}`;
  await saveStripRun(m);
}

/** Every strips job, by run id: what the Strips tab and the CLI's status read for running state. */
export function stripsJobs(store: Store): Result<Job[]> {
  const all = list(store);
  return all.ok ? ok(all.value.filter((j) => j.producer === "strips")) : all;
}

export { stripsRoot };
