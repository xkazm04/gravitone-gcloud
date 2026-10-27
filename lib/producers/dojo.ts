import { existsSync, readdirSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { parseJsonAt } from "@gt/domain/door";
import { AppError, err, ok, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import type { ModelOption, ProducerRunInput, Receipt, ReceiptMode } from "@gt/domain/produce";
import { blobStore } from "@gt/kernel/blob";
import { liveEffects, type Effects } from "@gt/kernel/effects";
import type { Producer } from "@gt/kernel/job-core";
import { retry } from "@gt/kernel/job";
import { runJob, type RunOptions, type RunReport } from "@gt/kernel/job-run";
import { launchRun, runReceipt, type RunLaunchOptions } from "@gt/kernel/records/launch";
import { modelOptions } from "@gt/kernel/records/options";
import type { Store } from "@gt/kernel/store";
import { defineDojoGoogle, type CycleView, type DojoGooglePorts } from "@gt/producers/dojo/define";
import {
  ARMS,
  dojoGooglePlan,
  dojoJobId,
  dojoLocalWork,
  dojoRunOf,
  googleRepeats,
  localOrder,
  runnerOf,
  type GenSpecView,
  type GoogleEstimates,
  type LocalUnit,
  type Runner,
} from "@gt/producers/dojo/plan";
import { DEFAULT_CALL_ESTIMATE_USD } from "@gt/producers/extract/units";
import { z } from "zod";

import { OUT_DIRNAME } from "../fixtures/mode.ts";
import { blobRootOf } from "../kernelProcess.ts";
import { estimatePerImage } from "../imaging/pricing.ts";
import { launchTarget, newestJob } from "./forge.ts";

// A DOJO CYCLE'S NODE HALF (Phase 4, L34): the receipt and launch for both stacks,
// and the GOOGLE stack's whole producer.
//
// v1's driver was the external `dojo` skill (a Claude loop) calling
// `python dojo_run.py <cycle>`, which picked a runner by the declared stack and
// refused an undeclared one. A cycle's renders are a kernel job now, on the lane
// its stack declares (packages/producers/src/dojo/plan.ts `runnerOf` keeps the
// purity rule): local -> gpu.local, PERFORMED by pipeline/foundry/worker.py; google
// -> cloud.google, performed here (`dojoProducer`) so every Nano Banana and Gemini
// call is metered against the job (decision 7) - v1's google cycle billed and wrote
// no ledger. The judge (dojo_judge.py prepare|park) stays the skill's act on the
// cycle after its job is done, and the blind gate stays the Board packet.
//
// `dojo` IS BOUND ON cloud.google ONLY (lib/producers/registry.ts). The worker carries a producer
// per `<name>@<lane>` (kernel job-queue-core `producerKey`, L41), so a Node worker binding this
// google stack names a gpu.local Dojo head an orphan and leaves it to pipeline/foundry/worker.py,
// instead of picking it and being refused by runJob on every look (which is why, until L41, a
// google cycle was driven only by its launcher and `--detach` refused it). Plain-Node loadable
// except the google stack's live calls, which load lib/imaging/router lazily (it needs `npx tsx`).

/* ── Where cycles live, and what one says ─────────────────────────────────── */

/** dojo_job.py `training_root`: FOUNDRY_TRAINING_DIR, else `<cwd>/<universe>/training` (lib/foundry/training/store.ts). */
export function trainingRoot(env: Readonly<Record<string, string | undefined>> = process.env, cwd: string = process.cwd()): string {
  const v = env["FOUNDRY_TRAINING_DIR"]?.trim();
  return v !== undefined && v !== "" ? path.resolve(cwd, v) : path.join(cwd, OUT_DIRNAME, "training");
}

/* ── The cycles a start-cycle door offers (L45) ───────────────────────────── */

const cycleStatus = z.object({ status: z.string() }).loose();

/** A cycle the door can start: `planning`, with a gen-spec its runner accepts - or the spec's refusal, verbatim. */
export type StartableCycle = { readonly id: string; readonly pairs: number; readonly runner: Runner } | { readonly id: string; readonly refused: string };

/** How many cycles a door lists (bounded-enumeration): a training root holds a few dozen. */
export const CYCLE_CAP = 50;

/**
 * Every cycle under the training root that is `planning` and carries a gen-spec - the cycles whose
 * renders the dojo skill has specified and nobody has launched. A cycle past `planning` is the
 * job's (its Run row says so in Runs); one with no gen-spec has nothing to render yet. Newest
 * first by id (cycle ids lead with their date), at most CYCLE_CAP.
 */
export function startableCycles(root: string = trainingRoot()): Result<StartableCycle[]> {
  if (!existsSync(root)) return ok([]);
  const out: StartableCycle[] = [];
  const ids = readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort().reverse();
  for (const id of ids) {
    if (out.length >= CYCLE_CAP) break;
    const cycle = path.join(root, id, "cycle.json");
    if (!existsSync(cycle) || !existsSync(path.join(root, id, "gen-spec.json"))) continue;
    const c = parseJsonAt(`dojo cycle ${id}`, cycleStatus, readFileSync(cycle, "utf8"));
    if (!c.ok) return c;
    if (c.value.status !== "planning") continue;
    const spec = readSpec(id, root);
    if (!spec.ok) {
      out.push({ id, refused: spec.error.message });
      continue;
    }
    const runner = runnerOf(spec.value);
    out.push(runner.ok ? { id, pairs: spec.value.pairs?.length ?? 0, runner: runner.value } : { id, refused: runner.error.message });
  }
  return ok(out);
}

const armSchema = z.object({ prompt: z.string().optional(), engine: z.string().optional() }).loose();
const specSchema = z
  .object({
    stack: z.unknown().optional(),
    media: z.unknown().optional(),
    repeats: z.unknown().optional(),
    aspect: z.unknown().optional(),
    pairs: z.array(z.object({ id: z.string().min(1), baseline: armSchema.optional(), challenger: armSchema.optional() }).loose()),
  })
  .loose();

export function readSpec(cycleId: string, root: string = trainingRoot()): Result<GenSpecView> {
  const file = path.join(root, cycleId, "gen-spec.json");
  if (!existsSync(file)) return err("not-found", `dojo cycle ${cycleId} has no gen-spec.json under ${root}`);
  return parseJsonAt(`dojo cycle ${cycleId} gen-spec`, specSchema, readFileSync(file, "utf8"));
}

function readbacksOf(dir: string): Record<string, unknown> {
  const file = path.join(dir, "readbacks.json");
  if (!existsSync(file)) return {};
  const r = parseJsonAt("readbacks.json", z.record(z.string(), z.unknown()), readFileSync(file, "utf8"));
  if (!r.ok) throw r.error;
  return r.value;
}

const EXTS: Readonly<Record<Runner["media"], readonly string[]>> = { image: [".png"], video: [".webm"], "video-serial-lanes": [".webm", ".mp4"] };

/** The local units in the runner's order, each rendered (a file on disk) and read (a key in readbacks.json). */
export function localUnits(cycleId: string, spec: GenSpecView, media: Runner["media"], root: string = trainingRoot()): LocalUnit[] {
  const dir = path.join(root, cycleId);
  const rb = readbacksOf(dir);
  return localOrder(spec, media).map(({ pair, arm }) => {
    const key = `${pair}--${arm}`;
    return { key, rendered: EXTS[media].some((x) => existsSync(path.join(dir, "pairs", `${key}${x}`))), read: key in rb };
  });
}

export function googleView(cycleId: string, root: string = trainingRoot()): Result<CycleView> {
  const spec = readSpec(cycleId, root);
  if (!spec.ok) return spec;
  const dir = path.join(root, cycleId);
  const rb = readbacksOf(dir);
  const n = googleRepeats(spec.value);
  const arms = (spec.value.pairs ?? []).flatMap((p) =>
    ARMS.map((arm) => {
      const key = `${p.id}--${arm}`;
      const idx = Array.from({ length: n }, (_, i) => i + 1);
      return { key, have: idx.map((i) => existsSync(path.join(dir, "pairs", `${key}--r${i}.png`))), read: idx.map((i) => `${key}--r${i}` in rb) };
    }),
  );
  return ok({ spec: spec.value, arms });
}

/* ── The google stack's ports ─────────────────────────────────────────────── */

/** The imaging layer's own pre-call figure for a generate (errs high on purpose); a readback at v1 extract's default. */
export function googleEstimates(): GoogleEstimates {
  return { perImageUsd: estimatePerImage().usd ?? DEFAULT_CALL_ESTIMATE_USD.generate, readbackUsd: DEFAULT_CALL_ESTIMATE_USD.recognize };
}

type RouterModule = typeof import("../imaging/router.ts");
async function router(): Promise<RouterModule> {
  try {
    return await import("../imaging/router.ts");
  } catch (cause) {
    throw new AppError("unavailable", "the google stack's live calls load lib/imaging/router, which resolves the app's `@/` imports only under tsx: run `npx tsx pipeline/foundry/launch.mts dojo ...`", { cause });
  }
}

export function dojoGooglePorts(root: string = trainingRoot()): DojoGooglePorts {
  return {
    view: (cycleId) => googleView(cycleId, root),
    estimates: googleEstimates,
    async generate({ prompt, aspect, count }) {
      const { generate } = await router();
      try {
        const out = await generate({ prompt, aspect: aspect as "16:9", count, prefer: "google" });
        return { value: out.images.map((i) => i.base64), model: `${out.provenance.provider}/${out.provenance.model}`, costUsd: out.provenance.costUsd, basis: out.provenance.costBasis };
      } catch (e) {
        // The imaging window's refusal is money, never the breaker's (v1 extract breaker.ts).
        if (e instanceof Error && "kind" in e && e.kind === "over-budget") throw new AppError("budget", e.message, { cause: e });
        throw e;
      }
    },
    async recognize({ base64 }) {
      const { recognize } = await router();
      const { READBACK_SCHEMA } = await import("../foundry/extract/vocabulary.ts");
      const { readbackInstruction } = await import("../foundry/extract/prompts.ts");
      const r = await recognize({ image: { base64, mime: "image/png" }, instruction: readbackInstruction(), schema: READBACK_SCHEMA as Record<string, unknown>, prefer: "google" });
      return { value: r.json, model: `${r.provenance.provider}/${r.provenance.model}`, costUsd: r.provenance.costUsd, basis: r.provenance.costBasis };
    },
    async writeImages(cycleId, key, images) {
      const dir = path.join(root, cycleId, "pairs");
      await mkdir(dir, { recursive: true });
      await Promise.all(images.map((b64, i) => writeFile(path.join(dir, `${key}--r${i + 1}.png`), Buffer.from(b64, "base64"))));
    },
    async readImage(cycleId, file) {
      return (await readFile(path.join(root, cycleId, file))).toString("base64");
    },
    async writeReadback(cycleId, key, entry) {
      const dir = path.join(root, cycleId);
      const rb = readbacksOf(dir);
      rb[key] = entry;
      await writeFile(path.join(dir, "readbacks.json"), JSON.stringify(rb, null, 1));
    },
  };
}

/** The google stack's bound producer: `dojo@cloud.google` in lib/producers/registry.ts. */
export const dojoProducer = (root?: string): Producer => defineDojoGoogle(dojoGooglePorts(root));

/* ── The receipt ───────────────────────────────────────────────────────────── */

/** The cycle's own quote (L32 `RunQuote`): its runner's catalog option, priced from the gen-spec (the catalog row cannot be). */
export function dojoQuote(cycleId: string, runner: Runner, root: string, day: string): Result<{ readonly key: string; readonly label: string; readonly option: ModelOption }> {
  const base = modelOptions("dojo", day).find((o) => o.lane === runner.lane);
  if (base === undefined) return err("internal", `catalog: the dojo part has no ${runner.lane} option`);
  const spec = readSpec(cycleId, root);
  if (!spec.ok) return spec;
  let seconds: number;
  let usd = 0;
  let what: string;
  if (runner.stack === "local") {
    const w = dojoLocalWork(localUnits(cycleId, spec.value, runner.media, root), runner.media);
    seconds = w.seconds;
    what = `${w.renders} render(s) + ${w.reads} read(s)`;
  } else {
    const v = googleView(cycleId, root);
    if (!v.ok) return v;
    const steps = dojoGooglePlan(v.value.arms, new Set(), googleEstimates());
    seconds = steps.reduce((a, s) => a + s.estimate.seconds, 0);
    usd = Math.round(steps.reduce((a, s) => a + (s.estimate.usd ?? 0), 0) * 1e6) / 1e6;
    what = `${steps.length} call(s)`;
  }
  const { unpricedReason: _priced, ...priced } = base;
  const option: ModelOption = { ...priced, label: `${base.label} · ${runner.runner} · ${what}`, secondsPerUnit: seconds, usdPerUnit: usd, src: runner.stack === "local" ? base.src : "model" };
  return ok({ key: `dojo:${cycleId}`, label: `dojo · ${cycleId}`, option });
}

/* ── Launch: receipt, then confirm ────────────────────────────────────────── */

export type LaunchDojoOptions = {
  readonly mode: ReceiptMode;
  readonly ceilingUsd?: number;
  readonly actor: Actor;
  readonly token?: string;
  readonly dryOnly: boolean;
  readonly resume?: boolean;
  readonly now?: number;
  readonly root?: string;
};

export type DojoLaunch =
  | { readonly kind: "receipt"; readonly receipt: Receipt; readonly runner: Runner }
  | { readonly kind: "stale"; readonly fresh: Receipt }
  | { readonly kind: "launched" | "retried"; readonly cycle: string; readonly jobId: string; readonly receipt: Receipt; readonly runner: Runner }
  | { readonly kind: "existing"; readonly cycle: string; readonly jobId: string; readonly state: string; readonly runner: Runner };

export function launchDojo(store: Store, cycleId: string, opts: LaunchDojoOptions): Result<DojoLaunch> {
  const now = opts.now ?? Date.now();
  const root = opts.root ?? trainingRoot();
  const spec = readSpec(cycleId, root);
  if (!spec.ok) return spec;
  // Purity before anything else: a spec that names no stack never reaches a receipt.
  const runner = runnerOf(spec.value);
  if (!runner.ok) return runner;
  const { job: held, free } = newestJob(store, (k) => dojoJobId(cycleId, k));
  const target = launchTarget(held, opts.resume === true);
  if (target === "existing" && held !== undefined) return ok({ kind: "existing", cycle: cycleId, jobId: held.id, state: held.state, runner: runner.value });
  const quote = dojoQuote(cycleId, runner.value, root, new Date(now).toISOString().slice(0, 10));
  if (!quote.ok) return quote;
  const input: ProducerRunInput = { producer: "dojo", cycle: cycleId };
  const ro: RunLaunchOptions = { mode: opts.mode, units: 1, quote: quote.value, ...(opts.ceilingUsd === undefined ? {} : { ceilingUsd: opts.ceilingUsd }) };
  const receipt = runReceipt(store, input, ro, { now });
  if (!receipt.ok) return receipt;
  if (opts.token === undefined) return ok({ kind: "receipt", receipt: receipt.value, runner: runner.value });
  if (opts.token !== receipt.value.token) return ok({ kind: "stale", fresh: receipt.value });

  if (target === "retry" && held !== undefined) {
    const r = retry(store, held.id, opts.actor, opts.ceilingUsd === undefined ? {} : { ceilingUsd: opts.ceilingUsd });
    if (!r.ok) return r;
    return ok({ kind: "retried", cycle: cycleId, jobId: held.id, receipt: receipt.value, runner: runner.value });
  }
  // The Run row and its job in one transaction; the quote's option carries the stack's lane (the job's lane).
  const l = launchRun(store, { input, token: opts.token, ...ro }, opts.actor, { now, dryOnly: opts.dryOnly, id: dojoRunOf(cycleId), jobId: free });
  if (!l.ok) {
    if (l.fresh !== undefined && l.error.detail === "stale-receipt") return ok({ kind: "stale", fresh: l.fresh });
    return err(l.error.code, l.error.message);
  }
  return ok({ kind: "launched", cycle: cycleId, jobId: l.value.jobId, receipt: receipt.value, runner: runner.value });
}

/* ── Drive (the google stack) ─────────────────────────────────────────────── */

/** `_location` is the path `store` was opened at (kept for the callers); the blobs are beside it. */
export function effectsFor(store: Store, _location: string): Effects {
  return liveEffects(store, blobStore(blobRootOf(store)));
}

/** Drive a google cycle's job in this process (kernel runJob), as extract's CLI drives its own. */
export async function driveDojo(store: Store, location: string, jobId: string, opts: RunOptions & { readonly root?: string; readonly producer?: Producer } = {}): Promise<Result<RunReport>> {
  const { root, producer, ...run } = opts;
  return runJob(effectsFor(store, location), producer ?? dojoProducer(root), jobId, run);
}
