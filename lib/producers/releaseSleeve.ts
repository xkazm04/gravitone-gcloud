import { createHash } from "node:crypto";

import { parseAt } from "@gt/domain/door";
import { err, ok, type Result } from "@gt/domain/errors";
import type { Actor, EventData } from "@gt/domain/event";
import { jobIdSchema } from "@gt/domain/ids";
import type { Job } from "@gt/domain/job";
import { LANE_CAPACITY, type ResourceLane } from "@gt/domain/lane";
import type { ModelOption, Receipt } from "@gt/domain/produce";
import { parseSleeveRequest, sleeveAskSchema, sleeveCheck, type SleeveAsk, type SleeveCandidate, type SleeveLaunchAnswer, type SleeveMiss, type SleeveProvider, type SleeveRequest, type SleeveTakesView } from "@gt/domain/release.sleeve";
import { armLive, dryOnlyFrom, DRY } from "@gt/kernel/dryrun";
import { append } from "@gt/kernel/events";
import { queryEvents } from "@gt/kernel/events-query";
import { enqueueIn, get, loadOutputs } from "@gt/kernel/job";
import type { Producer, StepContext, StepOutcome } from "@gt/kernel/job-core";
import { runJob, type RunReport } from "@gt/kernel/job-run";
import { readQueue } from "@gt/kernel/records/read";
import { receiptFor, type PlanLine } from "@gt/kernel/records/receipt";
import type { Reader, Store } from "@gt/kernel/store";
import { defineReleaseSleeve, RELEASE_SLEEVE, SLEEVE_REQUEST, takeStep } from "@gt/producers/release-sleeve/define";
import { pixelsOf } from "@gt/producers/release-sleeve/pixels";
import { madeFree, madePaid } from "@gt/producers/research/partAct";
import { meteredCall } from "@gt/producers/research/metered";

import { ImagingError } from "../imaging/errors.ts";
import { generate } from "../imaging/router.ts";
import type { GenerateRequest, GeneratedImages, ImageRef } from "../imaging/types.ts";
import { kernel } from "../kernelProcess.ts";
import { blobRoute } from "../library/media.ts";
import { effectsFor } from "./extract.ts";
import { imageFailure, PIXEL } from "./frames.ts";
import { scoutStillOption } from "./scoutStillOption.ts";

// THE RELEASE SLEEVE PRODUCER, BOUND (spark studio-to-release WP3) - the sleeve step's "N takes" as one kernel job of N
// steps (packages/producers/src/release-sleeve/define.ts). This file is the launch - receipt, then confirm - the
// binding over the imaging router, and the read the step polls.
//
// WHAT A RUN COSTS ON ITS RECEIPT: one line of N units on the provider's lane, priced by the scout still's option
// (./scoutStillOption.ts): Codex on seat.text at $0 (the operator's ChatGPT seat bills no image), Leonardo Flare on
// cloud.leonardo at the price table's per-image fallback, replaced by the API's reported credits when booked.
// CODEX IS ONE PRESS: its receipt is $0 and the press that asked for it is the confirm. LEONARDO IS TWO: the press
// answers the receipt and writes nothing; the operator's confirm carries its token back. Under GRAVITONE_DRY_ONLY=1
// a Leonardo run is refused before a receipt (@gt/domain/release.sleeve `sleeveCheck`) and a Codex run goes dry -
// each take the kernel's stand-in pixel, booked as a would-call.
//
// ONE JOB PER PRESS, of the run `release:<id>`: `job:release-sleeve:<release>:<stamp>`, the stamp the confirm's
// clock in base 36. The launch drives the job on this process (the style act's rule, app/(studio)/library/style/
// _port/real.ts): a dry run to its end before the answer, a live one in the background - the worker carries any
// job this process did not finish, and the step reads the job's outputs, whoever drove it.

export const SLEEVE_LANES: Readonly<Record<SleeveProvider, ResourceLane>> = { codex: "seat.text", leonardo: "cloud.leonardo" };
const GENERATOR = { codex: "codex", leonardo: "leonardo-flare" } as const;

export type SleeveEngines = { readonly generate: (req: GenerateRequest) => Promise<GeneratedImages> };
export const LIVE_SLEEVE: SleeveEngines = { generate };

export type LaunchSleeveOptions = {
  readonly actor: Actor;
  /** A priced run's confirm: the token of the receipt the operator saw. */
  readonly token?: string;
  readonly dryOnly: boolean;
  readonly now?: number;
  /** Drive the job here after the launch (the default); a test drives it itself. */
  readonly drive?: boolean;
  readonly engines?: SleeveEngines;
};

export const sleeveOption = (p: SleeveProvider): Result<ModelOption> => scoutStillOption("release-sleeve", "sleeve take · 1:1", SLEEVE_LANES[p], GENERATOR[p]);

const sleeveJobId = (releaseId: string, now: number): string => `job:release-sleeve:${releaseId}:${now.toString(36)}`;

function receiptIn(r: Reader, ask: SleeveAsk, now: number): Result<{ readonly receipt: Receipt; readonly option: ModelOption }> {
  const option = sleeveOption(ask.provider);
  if (!option.ok) return option;
  // The key names the run AT its prompt: a prompt edited since the receipt is another line, so its token is stale.
  const at = createHash("sha256").update(`${ask.provider}\n${ask.takes}\n${ask.prompt}`).digest("hex").slice(0, 12);
  const line: PlanLine = { key: `sleeve:${ask.releaseId}@${at}`, label: `sleeve · ${ask.takes} takes`, lane: option.value.lane, units: ask.takes, option: option.value, after: [], order: 0, status: "pending" };
  const receipt = receiptFor({ subject: { kind: "run", lane: "image" }, lines: [line], plan: [line], queue: readQueue(r), capacity: LANE_CAPACITY, now, mode: "live" });
  return ok({ receipt, option: option.value });
}

const priced = (kind: "receipt" | "stale", rc: Receipt, takes: number): SleeveLaunchAnswer => ({ kind, token: rc.token, usd: rc.totals.unpriced > 0 ? null : rc.totals.usd, seconds: rc.totals.seconds, takes });

/** A run of sleeve takes: Leonardo's receipt (no token), or the job, launched and (dry) driven. */
export async function launchSleeve(store: Store, raw: unknown, o: LaunchSleeveOptions): Promise<Result<SleeveLaunchAnswer>> {
  const parsed = parseAt("sleeve takes", sleeveAskSchema, raw);
  if (!parsed.ok) return parsed;
  const checked = sleeveCheck(parsed.value, { dryOnly: o.dryOnly });
  if (!checked.ok) return checked;
  const ask = checked.value;
  const now = o.now ?? Date.now();
  const first = store.read((r) => receiptIn(r, ask, now));
  if (!first.ok) return first;
  if (!first.value.ok) return first.value;
  const isPriced = (first.value.value.option.usdPerUnit ?? 0) > 0;
  if (isPriced && o.token === undefined) return ok(priced("receipt", first.value.value.receipt, ask.takes));
  const token = o.token ?? first.value.value.receipt.token;
  const jobId = sleeveJobId(ask.releaseId, now);
  const out = store.tx((t): Result<SleeveLaunchAnswer | { readonly kind: "queued"; readonly lane: ResourceLane }> => {
    const read = receiptIn(t, ask, now);
    if (!read.ok) return read;
    if (read.value.receipt.token !== token) return ok(priced("stale", read.value.receipt, ask.takes));
    const mode = o.dryOnly ? ok(DRY) : armLive(o.actor, t.at, `sleeve receipt ${token.slice(0, 12)} confirmed`, { dryOnly: o.dryOnly });
    if (!mode.ok) return mode;
    const lane = read.value.option.lane;
    enqueueIn(t, { id: jobId, of: { kind: "run", id: `release:${ask.releaseId}` }, producer: RELEASE_SLEEVE, lane, mode: mode.value }, o.actor);
    const take = { seconds: read.value.option.secondsPerUnit, usd: read.value.option.usdPerUnit, ...(read.value.option.unpricedReason === undefined ? {} : { unpricedReason: read.value.option.unpricedReason }) };
    const request: SleeveRequest = { releaseId: ask.releaseId, prompt: ask.prompt, provider: ask.provider, takes: ask.takes, estimates: { take }, by: o.actor.id };
    append(t, { actor: o.actor, type: SLEEVE_REQUEST, subject: { kind: "job", id: jobId }, data: { ...request } });
    return ok({ kind: "queued", lane });
  });
  if (!out.ok) return out;
  if (!out.value.ok) return out.value;
  if (out.value.value.kind !== "queued") return ok(out.value.value);
  if (o.drive !== false) {
    const drive = driveSleeve(store, jobId, { dryOnly: o.dryOnly, ...(o.engines === undefined ? {} : { engines: o.engines }) });
    if (o.dryOnly) {
      const r = await drive;
      if (!r.ok) return r;
    } else {
      // A live drive outlives the request: its ending is the job's record, which the step polls.
      void drive.then(
        (r) => {
          if (!r.ok) console.error(`sleeve job ${jobId}: ${r.error.message}`);
        },
        (e: unknown) => console.error(`sleeve job ${jobId}: ${e instanceof Error ? e.message : String(e)}`),
      );
    }
  }
  const view = sleeveTakesOf(store, jobId);
  return view.ok ? ok({ kind: "launched", view: view.value }) : view;
}

/* ── The read the step polls ──────────────────────────────────────────────── */

/** The request a sleeve job carries: the event its launch wrote beside the enqueue. */
export function sleeveRequestOf(store: Store, jobId: string): Result<SleeveRequest> {
  const page = queryEvents(store, { type: [SLEEVE_REQUEST], subject: { kind: "job", id: jobId }, limit: 1 });
  if (!page.ok) return page;
  const e = page.value.events[0];
  return e === undefined ? err("not-found", `job ${jobId} carries no sleeve request`) : parseSleeveRequest(e.data);
}

const isSleeveJob = (id: string): boolean => /^job:release-sleeve:rel-[0-9a-f]{12}:[0-9a-z]{1,12}$/.test(id);

/** One sleeve job as the step shows it: its state, its takes as candidates, the takes it missed. */
export function sleeveTakesOf(store: Store, jobId: string): Result<SleeveTakesView> {
  if (!isSleeveJob(jobId)) return err("invalid", `${jobId} is not a sleeve job`);
  const id = parseAt("job id", jobIdSchema, jobId);
  if (!id.ok) return id;
  const j = get(store, id.value);
  if (!j.ok) return j;
  const req = sleeveRequestOf(store, jobId);
  if (!req.ok) return req;
  const outputs = store.read((r) => loadOutputs(r, jobId));
  if (!outputs.ok) return outputs;
  const candidates: SleeveCandidate[] = [];
  const misses: SleeveMiss[] = [];
  for (let n = 1; n <= req.value.takes; n++) {
    const v = outputs.value.get(takeStep(n))?.value;
    if (v === undefined) continue;
    const blob = v["blob"] as { sha256?: unknown; mime?: unknown } | undefined;
    const href = blobRoute(typeof blob?.sha256 === "string" ? blob.sha256 : null, typeof blob?.mime === "string" ? blob.mime : null);
    if (href === null) {
      misses.push({ n, reason: typeof v["refused"] === "string" ? v["refused"] : `take ${n} left no picture` });
      continue;
    }
    candidates.push({ n, href, widthPx: Number(v["widthPx"]), heightPx: Number(v["heightPx"]), rgb: v["rgb"] === true, provider: String(v["provider"] ?? req.value.provider), model: String(v["model"] ?? ""), dry: v["dry"] === true });
  }
  const job = j.value.job;
  return ok({ jobId, state: job.state, takes: req.value.takes, candidates, misses, error: job.state === "failed" ? (job.error?.message ?? `job ${jobId} failed`) : null });
}

/** The newest sleeve job of a release, as the step shows it; null when it has none. */
export function latestSleeveOf(store: Store, releaseId: string): Result<SleeveTakesView | null> {
  const page = queryEvents(store, { type: [SLEEVE_REQUEST], limit: 200 });
  if (!page.ok) return page;
  const e = page.value.events.find((x) => x.data["releaseId"] === releaseId);
  return e === undefined ? ok(null) : sleeveTakesOf(store, e.subject.id);
}

/* ── The binding ──────────────────────────────────────────────────────────── */

const data = (x: unknown): EventData => JSON.parse(JSON.stringify(x)) as EventData;

/** One take: the router at 1:1 on the chosen provider, declared to the step's meter (a dry job reads PIXEL). */
async function drawTake(e: SleeveEngines, req: SleeveRequest, n: number, ctx: StepContext): Promise<StepOutcome> {
  const prefer = GENERATOR[req.provider];
  const ask: GenerateRequest = { prompt: req.prompt, aspect: "1:1", count: 1, prefer };
  try {
    const got = await meteredCall<{ readonly images: readonly ImageRef[]; readonly provenance?: GeneratedImages["provenance"] }>(ctx, {
      provider: "imaging-router",
      model: "generate",
      payload: { prompt: req.prompt, aspect: "1:1", count: 1, prefer, take: n },
      estimate: req.estimates.take,
      stand: () => ({ images: [PIXEL] }),
      live: async () => {
        const out = await e.generate(ask);
        const p = out.provenance;
        return { value: { images: out.images, provenance: p }, served: `${p.provider}/${p.model}`, ...(p.costUsd === undefined ? { unpriced: `${p.provider} reported no cost for the image` } : { usd: p.costUsd }) };
      },
    });
    const img = got.images[0];
    if (img === undefined) return { kind: "vendor-failure", message: "the imaging router answered with no image" };
    const bytes = new Uint8Array(Buffer.from(img.base64, "base64"));
    const px = pixelsOf(bytes);
    if (px === null) return madeFree(data({ n, refused: `take ${n}'s bytes are not a PNG, JPEG or WebP picture` }));
    const blob = await ctx.fx.blob(bytes, px.mime);
    if (!blob.ok) return { kind: "fatal", code: blob.error.code, message: blob.error.message };
    const p = got.provenance;
    const out = data({ n, blob: blob.value, widthPx: px.widthPx, heightPx: px.heightPx, rgb: px.rgb, provider: p?.provider ?? req.provider, model: p?.model ?? "dry stand-in", dry: p === undefined, ...(p?.costUsd === undefined ? {} : { costUsd: p.costUsd }) });
    return p === undefined ? madeFree(out) : madePaid(out, ctx);
  } catch (x) {
    if (x instanceof ImagingError && x.kind === "refused") return madeFree(data({ n, refused: x.message }));
    return imageFailure(x);
  }
}

const processStore = (): Result<Store> => {
  const k = kernel();
  return k.ok ? ok(k.value.store) : k;
};

/** Production's engine is the imaging router; a test hands a fake. */
export function releaseSleeveProducer(lane: ResourceLane, o: { readonly store?: () => Result<Store>; readonly engines?: SleeveEngines } = {}): Producer {
  const store = o.store ?? processStore;
  const engines = o.engines ?? LIVE_SLEEVE;
  return defineReleaseSleeve(lane, {
    request: (job: Job) => {
      const s = store();
      return s.ok ? sleeveRequestOf(s.value, job.id) : s;
    },
    draw: (req, n, ctx) => drawTake(engines, req, n, ctx),
  });
}

/** Drive one sleeve job on this process (the launch, a test): the worker's rules. */
export function driveSleeve(store: Store, jobId: string, o: { readonly dryOnly?: boolean; readonly engines?: SleeveEngines } = {}): Promise<Result<RunReport>> {
  const j = parseAt("job id", jobIdSchema, jobId);
  if (!j.ok) return Promise.resolve(j);
  const held = get(store, j.value);
  if (!held.ok) return Promise.resolve(held);
  const producer = releaseSleeveProducer(held.value.job.lane, { store: () => ok(store), ...(o.engines === undefined ? {} : { engines: o.engines }) });
  return runJob(effectsFor(store, store.location), producer, jobId, { dryOnly: o.dryOnly ?? dryOnlyFrom(process.env) });
}
