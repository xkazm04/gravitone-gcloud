import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { parseAt, parseJsonAt } from "@gt/domain/door";
import { AppError, err, ok, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import { jobIdSchema } from "@gt/domain/ids";
import type { Job } from "@gt/domain/job";
import type { ModelOption, ProducerRunInput, Receipt, ReceiptMode } from "@gt/domain/produce";
import { get, retry } from "@gt/kernel/job";
import { launchRun, runReceipt, type RunLaunchOptions } from "@gt/kernel/records/launch";
import { modelOptions } from "@gt/kernel/records/options";
import type { Store } from "@gt/kernel/store";
import { forgeJobId, forgeRunOf, forgeWork, type ForgeCandidateView, type ForgeView } from "@gt/producers/forge/plan";
import { z } from "zod";

import { OUT_DIRNAME } from "../fixtures/mode.ts";

// THE FORGE'S NODE HALF (Phase 4, L34): its receipt and its launch. Its PERFORM is
// Python's - pipeline/foundry/worker.py claims the job on gpu.local#1 (the card's
// one slot, which IS the GPU lease) and walks forge_job.py's plan - so nothing
// here drives a forge job, and the forge is not in lib/producers/registry.ts: the
// Node worker must leave its jobs queued for the Python one (`workLoop` names a
// head it does not carry and never skips it).
//
// What v1 had instead: nothing. forge.py had no launcher (app/foundry/
// uiCommandCard.tsx's FORGE_COMMAND card has no consumer), no lease, no pid - a
// SIGKILL left run.json `generating` forever. The job is the run's running state
// now; run.json stays the artefact store v1's readers read (§5.4).
//
// Plain-Node loadable on purpose (no `@/` alias, no v1 store import): forge.py and
// dojo_run.py spawn pipeline/foundry/launch.mts with `node`, never through tsx.

/* ── Where runs live, and what one says ───────────────────────────────────── */

/** forge.py `runs_root`: FOUNDRY_RUNS_DIR, else `<cwd>/<universe>/runs` (lib/foundry/store.ts OUT_ROOT). */
export function forgeRunsRoot(env: Readonly<Record<string, string | undefined>> = process.env, cwd: string = process.cwd()): string {
  const v = env["FOUNDRY_RUNS_DIR"]?.trim();
  return v !== undefined && v !== "" ? path.resolve(cwd, v) : path.join(cwd, OUT_DIRNAME, "runs");
}

const runJsonSchema = z.object({
  id: z.string().min(1),
  plan: z.object({ id: z.string().min(1) }),
  scenes: z.array(z.object({ id: z.string().min(1), annotation: z.unknown().optional() })),
  candidates: z.array(z.object({ id: z.string().min(1), scene: z.string().min(1), status: z.enum(["pending", "generated", "graded", "unmeasured", "failed"]), file: z.string().min(1) })),
  forge: z.object({ skip_grade: z.boolean().optional() }).optional(),
  job: z.string().optional(),
});

export type ForgeRun = { readonly id: string; readonly plan: string; readonly view: ForgeView; readonly skipGrade: boolean; readonly job?: string };

/** run.json as the plan reads it: which scenes are annotated, each candidate's status, which PNGs are on disk. */
export function readForgeRun(runId: string, root: string = forgeRunsRoot()): Result<ForgeRun> {
  const dir = path.join(root, runId);
  const file = path.join(dir, "run.json");
  if (!existsSync(file)) return err("not-found", `forge run ${runId} has no run.json under ${root}`);
  const m = parseJsonAt(`forge run ${runId}`, runJsonSchema, readFileSync(file, "utf8"));
  if (!m.ok) return m;
  const candidates: ForgeCandidateView[] = m.value.candidates.map((c) => ({ id: c.id, scene: c.scene, status: c.status, plate: existsSync(path.join(dir, c.file)) }));
  const view: ForgeView = { scenes: m.value.scenes.map((s) => ({ id: s.id, annotated: s.annotation !== undefined && s.annotation !== null })), candidates };
  return ok({ id: m.value.id, plan: m.value.plan.id, view, skipGrade: m.value.forge?.skip_grade === true, ...(m.value.job === undefined ? {} : { job: m.value.job }) });
}

/**
 * A plan becomes a run: forge.py's own validation (unknown styles, observables the
 * grader cannot score, a style with nothing gradable) and run.json, through
 * `python forge.py <plan> --prepare --json` - one copy of those rules, in the
 * language that runs the run. The launch for a UI that starts from a plan.
 */
export function prepareForgeRun(planPath: string, runId: string, opts: { readonly python?: string; readonly resume?: boolean; readonly code?: string } = {}): Result<{ readonly runId: string; readonly candidates: number }> {
  const script = path.join(opts.code ?? path.resolve("."), "pipeline", "foundry", "forge.py");
  const argv = [script, planPath, "--run-id", runId, "--prepare", "--json", ...(opts.resume === true ? ["--resume"] : [])];
  const r = spawnSync(opts.python ?? (process.platform === "win32" ? "python" : "python3"), argv, { encoding: "utf8", timeout: 120_000 });
  const last = (r.stdout ?? "").trim().split("\n").at(-1) ?? "";
  const doc = parseJsonAt("forge.py --prepare", z.object({ ok: z.boolean(), runId: z.string().optional(), candidates: z.number().optional(), error: z.string().optional() }), last === "" ? "{}" : last);
  if (!doc.ok) return err("unavailable", `forge.py --prepare exited ${String(r.status)}: ${(r.stderr ?? "").trim().slice(-400)}`);
  if (!doc.value.ok || doc.value.runId === undefined) return err("invalid", doc.value.error ?? `forge.py --prepare refused ${planPath}`);
  return ok({ runId: doc.value.runId, candidates: doc.value.candidates ?? 0 });
}

/* ── The receipt ───────────────────────────────────────────────────────────── */

/**
 * The forge's own quote for a run (L32 `RunQuote`): the catalog's forge option at $0
 * (the local card is free), its seconds the whole run's - plates and the reads
 * around them (plan.ts `forgeWork`) - spread over the plates, so the line's total
 * is the run's. Keyed by the run, so a token cannot confirm a different run.
 */
export function forgeQuote(run: ForgeRun, day: string): { readonly units: number; readonly quote: { readonly key: string; readonly label: string; readonly option: ModelOption } } {
  const base = modelOptions("forge", day)[0];
  if (base === undefined) throw new AppError("internal", "catalog: the forge part has no option");
  const { plates, reads, seconds } = forgeWork(run.view, { skipGrade: run.skipGrade });
  const units = Math.max(1, plates);
  const option = { ...base, label: `${base.label} · ${plates} plate(s) + ${reads} read(s)`, secondsPerUnit: seconds / units, usdPerUnit: 0 };
  return { units, quote: { key: `forge:${run.id}`, label: `forge · ${run.id}`, option } };
}

/** What launched it, in the forge's terms (@gt/domain/produce `ProducerRunInput`): the plan, by name. */
export const forgeInput = (run: ForgeRun): ProducerRunInput => ({ producer: "forge", plan: run.plan });

function launchOpts(run: ForgeRun, o: { readonly mode: ReceiptMode; readonly ceilingUsd?: number; readonly now: number }): RunLaunchOptions {
  const { units, quote } = forgeQuote(run, new Date(o.now).toISOString().slice(0, 10));
  return { mode: o.mode, units, quote, ...(o.ceilingUsd === undefined ? {} : { ceilingUsd: o.ceilingUsd }) };
}

export function forgeReceipt(store: Store, run: ForgeRun, opts: { readonly mode: ReceiptMode; readonly ceilingUsd?: number; readonly now: number }): Result<Receipt> {
  return runReceipt(store, forgeInput(run), launchOpts(run, opts), { now: opts.now });
}

/* ── Launch: receipt, then confirm ────────────────────────────────────────── */

export type LaunchForgeOptions = {
  readonly mode: ReceiptMode;
  readonly ceilingUsd?: number;
  readonly actor: Actor;
  /** Absent: answer with the receipt and launch nothing. */
  readonly token?: string;
  readonly dryOnly: boolean;
  /** The operator's `--resume`: a failed or interrupted job is retried; a done one is run again as a new job. */
  readonly resume?: boolean;
  readonly now?: number;
  readonly root?: string;
};

export type ForgeLaunch =
  | { readonly kind: "receipt"; readonly receipt: Receipt }
  | { readonly kind: "stale"; readonly fresh: Receipt }
  | { readonly kind: "launched"; readonly runId: string; readonly jobId: string; readonly receipt: Receipt }
  /** The run's job, retried: same id, attempt counted, every booked output kept. */
  | { readonly kind: "retried"; readonly runId: string; readonly jobId: string; readonly receipt: Receipt }
  /** The run already has a job that is not finished: the same job, never a second (v1 MV enqueue idempotency). */
  | { readonly kind: "existing"; readonly runId: string; readonly jobId: string; readonly state: Job["state"] };

/** A job by id, or undefined when the store has none (strips and extract find their runs' jobs with it too). */
export function jobOf(store: Store, id: string): Job | undefined {
  const parsed = parseAt("job id", jobIdSchema, id);
  if (!parsed.ok) throw parsed.error;
  const r = get(store, parsed.value);
  if (r.ok) return r.value.job;
  if (r.error.code === "not-found") return undefined;
  throw r.error;
}

/** The run's newest job (`job:run:forge:<id>`, `~2`, `~3`...), and the next free id after it. */
export function newestJob(store: Store, ids: (k: number) => string): { readonly job?: Job; readonly free: string } {
  let last: Job | undefined;
  for (let k = 1; k < 1000; k++) {
    const j = jobOf(store, ids(k));
    if (j === undefined) return { ...(last === undefined ? {} : { job: last }), free: ids(k) };
    last = j;
  }
  throw new AppError("conflict", `${ids(1)} has run a thousand times`);
}

const UNFINISHED: ReadonlySet<Job["state"]> = new Set(["planned", "queued", "running", "paused"]);

/** Which job a launch acts on: the unfinished one, a retry, or a new one. */
export function launchTarget(job: Job | undefined, resume: boolean): "existing" | "retry" | "new" {
  if (job === undefined) return "new";
  if (UNFINISHED.has(job.state)) return "existing";
  if (job.state === "failed" || job.state === "interrupted") return resume ? "retry" : "existing";
  return "new"; // done or cancelled: a run taken again is a new job (`~k`)
}

export function launchForge(store: Store, runId: string, opts: LaunchForgeOptions): Result<ForgeLaunch> {
  const now = opts.now ?? Date.now();
  const run = readForgeRun(runId, opts.root);
  if (!run.ok) return run;
  const { job: held, free } = newestJob(store, (k) => forgeJobId(runId, k));
  const target = launchTarget(held, opts.resume === true);
  if (target === "existing" && held !== undefined) return ok({ kind: "existing", runId, jobId: held.id, state: held.state });
  const ro = launchOpts(run.value, { mode: opts.mode, now, ...(opts.ceilingUsd === undefined ? {} : { ceilingUsd: opts.ceilingUsd }) });
  const receipt = runReceipt(store, forgeInput(run.value), ro, { now });
  if (!receipt.ok) return receipt;
  if (opts.token === undefined) return ok({ kind: "receipt", receipt: receipt.value });
  if (opts.token !== receipt.value.token) return ok({ kind: "stale", fresh: receipt.value });
  // A ceiling is a stop point (Director ruling): a worst case over it is shown on the receipt, never refused here.

  if (target === "retry" && held !== undefined) {
    // The same job and the same Run row: a retry is the job's, never a new launch (attempt counted, outputs kept).
    const r = retry(store, held.id, opts.actor, opts.ceilingUsd === undefined ? {} : { ceilingUsd: opts.ceilingUsd });
    if (!r.ok) return r;
    return ok({ kind: "retried", runId, jobId: held.id, receipt: receipt.value });
  }
  // The Run row and its one job in one transaction (L26/L32 `launchRun`), so Runs, the queue's
  // quote and re-route read a forge run like any other; a run taken again moves its row to `~k`.
  const l = launchRun(store, { input: forgeInput(run.value), token: opts.token, ...ro }, opts.actor, { now, dryOnly: opts.dryOnly, id: forgeRunOf(runId), jobId: free });
  if (!l.ok) {
    if (l.fresh !== undefined && l.error.detail === "stale-receipt") return ok({ kind: "stale", fresh: l.fresh });
    return err(l.error.code, l.error.message);
  }
  return ok({ kind: "launched", runId, jobId: l.value.jobId, receipt: receipt.value });
}

/* ── The Floor's door: a sweep built from the chosen style(s) over the stock scenes ───── */
//
// L45 (L44's live forge-UI row): the Floor image composer priced a sweep and REFUSED its confirm,
// because a sweep launched only from a plan file. A Floor sweep is now a plan built here - the
// chosen style (or the whole sweep's styles), the chosen mechanisms, the stock scenes and seeds of
// pipeline/foundry/plans/dry-run.json - priced STATICALLY from the candidates it will cross
// (forge.py `build_manifest`'s product: scene x style x mechanism x seed, every one pending, no
// scene annotated, no plate on disk), so the receipt performs nothing. Only the confirm writes:
// forge.py `--prepare` (its validation, its run.json - one copy of those rules), then
// `launchForge` with the receipt's token, which re-reads run.json and so refuses a run that came
// out different from what was priced.

const planDoc = z.object({
  scenes: z.array(z.object({ id: z.string().min(1), frame: z.string().min(1), note: z.string().optional() }).loose()).min(1),
  styles: z.array(z.string().min(1)),
  mechanisms: z.array(z.object({ id: z.string().min(1) }).loose()).min(1),
  seeds: z.array(z.number().int()).optional(),
  steps: z.number().int().optional(),
});

/**
 * The checkout this process runs from: the cwd when it holds the forge, else the nearest ancestor
 * of the entry script that does. A server may run with its cwd in a data universe (a test lane, a
 * second store) while the forge and its stock plans are part of the CODE, not of the data.
 */
export function codeRoot(cwd: string = process.cwd(), entry: string | undefined = process.argv[1]): string {
  const holds = (d: string): boolean => existsSync(path.join(d, "pipeline", "foundry", "forge.py"));
  if (holds(cwd)) return cwd;
  for (let d = entry === undefined ? cwd : path.dirname(path.resolve(entry)); ; d = path.dirname(d)) {
    if (holds(d)) return d;
    if (path.dirname(d) === d) return cwd;
  }
}

/** forge.py `frames_dir`: FOUNDRY_FRAMES_DIR, else the checkout's pipeline/vlm-probe/frames. */
export function framesDir(code: string, env: Readonly<Record<string, string | undefined>> = process.env): string {
  const v = env["FOUNDRY_FRAMES_DIR"]?.trim();
  return v !== undefined && v !== "" ? path.resolve(v) : path.join(code, "pipeline", "vlm-probe", "frames");
}

export type FloorSweep = { readonly runId: string; readonly styles: readonly string[] | "sweep"; readonly mechanisms: readonly string[] };

/** The plan a Floor sweep runs, as forge.py reads a plan file. Its id is the run's, so the receipt is keyed by the run. */
export function floorPlan(sweep: FloorSweep, code: string): Result<Record<string, unknown>> {
  const read = (name: string) => parseJsonAt(`plans/${name}.json`, planDoc, readFileSync(path.join(code, "pipeline", "foundry", "plans", `${name}.json`), "utf8"));
  const stock = read("dry-run");
  if (!stock.ok) return stock;
  let styles: readonly string[];
  if (sweep.styles === "sweep") {
    const all = read("sweep-01");
    if (!all.ok) return all;
    styles = all.value.styles;
  } else styles = sweep.styles;
  // A scene whose frame is not on this machine is a run that fails at its first plate (forge.py
  // "frame not found"): the receipt can see it, so it is left out here, and a sweep with no scene
  // left is refused before anything is priced (the receipt holds a precondition, L45 item D).
  const frames = framesDir(code);
  const scenes = stock.value.scenes.filter((sc) => typeof sc.frame === "string" && (/^(frame|lane):/.test(sc.frame) || existsSync(path.join(frames, sc.frame))));
  if (scenes.length === 0) return err("refused", `no stock scene's frame is on this machine (looked in ${frames})`);
  const mechanisms = stock.value.mechanisms.filter((m) => typeof m.id === "string" && sweep.mechanisms.includes(m.id));
  if (mechanisms.length === 0) return err("invalid", `no stock mechanism among ${sweep.mechanisms.join(", ")}`);
  if (styles.length === 0) return err("invalid", "a sweep needs a style");
  return ok({ id: sweep.runId, scenes, styles: [...styles], mechanisms, seeds: stock.value.seeds ?? [20260826], ...(stock.value.steps === undefined ? {} : { steps: stock.value.steps }) });
}

/** The run a plan WILL be, read without writing it (forge.py `build_manifest`'s candidates). */
export function plannedRun(runId: string, plan: Record<string, unknown>): Result<ForgeRun> {
  const p = planDoc.safeParse(plan);
  if (!p.success) return err("invalid", `floor plan: ${p.error.message}`);
  const seeds = p.data.seeds ?? [20260826];
  const candidates: ForgeCandidateView[] = p.data.scenes.flatMap((sc) => p.data.styles.flatMap((st) => p.data.mechanisms.flatMap((m) => seeds.map((seed) => ({ id: `${sc.id}/${st}--${m.id}--s${seed}`, scene: sc.id, status: "pending" as const, plate: false })))));
  return ok({ id: runId, plan: runId, view: { scenes: p.data.scenes.map((sc) => ({ id: sc.id, annotated: false })), candidates }, skipGrade: false });
}

/** The Floor sweep's receipt (no token) or its confirm: prepare run.json, then the forge's own launch. */
export function launchFloorForge(store: Store, sweep: FloorSweep, opts: LaunchForgeOptions & { readonly code?: string }): Result<ForgeLaunch> {
  const code = opts.code ?? codeRoot();
  const plan = floorPlan(sweep, code);
  if (!plan.ok) return plan;
  const now = opts.now ?? Date.now();
  if (opts.token === undefined) {
    const run = plannedRun(sweep.runId, plan.value);
    if (!run.ok) return run;
    const r = forgeReceipt(store, run.value, { mode: opts.mode, now, ...(opts.ceilingUsd === undefined ? {} : { ceilingUsd: opts.ceilingUsd }) });
    return r.ok ? ok({ kind: "receipt", receipt: r.value }) : r;
  }
  const root = opts.root ?? forgeRunsRoot();
  const tmp = mkdtempSync(path.join(tmpdir(), "gt-floor-plan-"));
  try {
    const file = path.join(tmp, `${sweep.runId}.json`);
    writeFileSync(file, JSON.stringify(plan.value));
    // A second confirm of the same receipt (a stale answer, a double click) finds its run.json: resume it, never refuse it.
    const prepared = prepareForgeRun(file, sweep.runId, { code, resume: existsSync(path.join(root, sweep.runId, "run.json")) });
    if (!prepared.ok) return prepared;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  return launchForge(store, sweep.runId, { ...opts, now, root });
}
