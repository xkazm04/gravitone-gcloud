import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { AppError, errorMessage } from "@gt/domain/errors";
import type { EventData } from "@gt/domain/event";
import type { Job } from "@gt/domain/job";
import type { StepContext, StepOutcome } from "@gt/kernel/job-core";
import { assertFence } from "@gt/kernel/lease";
import { madePaid } from "@gt/producers/research/partAct";
import { meteredCall } from "@gt/producers/research/metered";
import type { SheetPorts, SheetRequest } from "@gt/producers/scout-sheet/define";

import { FLUX_MODEL } from "../imaging/local/flux2.ts";
import { recognize as LIVE_RECOGNIZE } from "../imaging/router.ts";
import type { Recognition, RecognizeRequest } from "../imaging/types.ts";
import { castStillOf, rootedNights } from "../foundry/scout/cast.ts";
import { judgeStill, STAND_JUDGE } from "../foundry/scout/judge.ts";
import { judgeFailure, type MuseJudge } from "../foundry/scout/muse.ts";
import { sheetFile, type SheetEngines } from "../foundry/scout/sheet.ts";
import { mutateNight, readNight, resolveInNight, withCandidate } from "../foundry/scout/store.ts";
import type { SheetCandidate } from "../foundry/scout/types.ts";
import { standIdea } from "./scoutIdeaActs.ts";

// THE SHEET'S ACT - the ports of packages/producers/src/scout-sheet/define.ts over the local Flux client, the eye and
// the night store (spark scout-vision S3).
//
//   draw   THE GUARD first: her kept portrait's bytes through lib/foundry/scout/cast.ts castStillOf - the one door, the
//          request's portrait ref re-checked against her kept portrait as the nights hold it NOW; anything else fails
//          the sheet with the guard's sentence and nothing is drawn. Then one Flux 2 still at 1:1 from the compiled
//          prompt, the portrait admitted late (the request's `late`). A LOCAL STILL IS FREE (no spend row); a dry job
//          declares it to the meter and is answered by a stand-in. Then THE EYE (the idea eye's call, metered; a dry job
//          reads STAND_JUDGE, a parody card adds the eye's parody clause): an adult-audience character is read by the
//          muse rule (lib/foundry/scout/muse.ts judgeFailure), a kids or family one with `minors` (never nude, never a
//          real person) - a still that fails is never written, and the sheet fails with `judge: <why>`. A still that
//          passes is sheets/<c-NN>.png.
//   ended  the candidate told how its job ended (`settledSheet`).
//
// Every night write is fenced against the job's slot first (the storyboard acts' `fence`).

/** The sheet's engines: its draw (./sheet.ts SheetEngines) and, for a test, the eye. */
export type SheetActEngines = SheetEngines & { readonly recognize?: (req: RecognizeRequest) => Promise<Recognition> };

const data = (x: unknown): EventData => JSON.parse(JSON.stringify(x)) as EventData;

function fence(ctx: StepContext): void {
  const { slot, lease } = ctx.job;
  if (slot === undefined || lease === undefined) throw new AppError("conflict", `job ${ctx.job.id} holds no slot; night.json is not written`);
  const r = ctx.fx.tx("scout.fence", (t) => assertFence(t, slot, lease.fence));
  if (!r.ok) throw r.error;
}

const isSheet = (cid: string) => (x: { readonly id: string; readonly kind: string }): x is SheetCandidate => x.id === cid && x.kind === "sheet";

async function writeSheet(req: SheetRequest, jobId: string, fn: (c: SheetCandidate) => SheetCandidate): Promise<void> {
  await mutateNight(req.nightId, (n) => {
    const c = n.candidates.find(isSheet(req.candidateId));
    if (c === undefined) return n;
    const m = withCandidate(n, { ...fn(c), jobId });
    return m.jobs.includes(jobId) ? m : { ...m, jobs: [...m.jobs, jobId] };
  });
}

/** Why the eye's read fails a sheet, or null: the muse rule for an adult (or unnamed) audience, `minors` for kids or family. */
export const sheetJudgeFailure = (audience: SheetRequest["audience"], j: MuseJudge): string | null => judgeFailure(j, { minors: audience === "kids" || audience === "family" });

/** One read by the eye, declared to the step's meter: a dry job answers with STAND_JUDGE and asks no eye. */
function meteredEye(e: SheetActEngines, req: SheetRequest, r: RecognizeRequest, ctx: StepContext): Promise<{ readonly json?: unknown }> {
  return meteredCall<{ readonly json?: unknown }>(ctx, {
    provider: "imaging-router",
    model: "recognize",
    payload: { instruction: r.instruction, schema: r.schema, night: req.nightId, sheet: req.candidateId },
    stand: () => ({ json: { ...STAND_JUDGE } }),
    live: async () => {
      const out = await (e.recognize ?? LIVE_RECOGNIZE)(r);
      const p = out.provenance;
      return { value: { json: out.json }, served: `${p.provider}/${p.model}`, ...(p.costUsd === undefined ? { unpriced: `${p.provider} reported no cost for a judge read` } : { usd: p.costUsd }) };
    },
  });
}

async function drawAct(e: SheetActEngines, req: SheetRequest, ctx: StepContext): Promise<StepOutcome> {
  const c = (await readNight(req.nightId)).candidates.find(isSheet(req.candidateId));
  if (c === undefined) return { kind: "fatal", code: "not-found", message: `no sheet ${req.candidateId} in night ${req.nightId}` };
  // A drive that died between the still and the booking: the still is the sheet's.
  if (c.image !== undefined) return madePaid(data({ sheet: c.id, file: c.image, held: true }), ctx);
  const failed = async (why: string, judge?: MuseJudge): Promise<StepOutcome> => {
    fence(ctx);
    await writeSheet(req, ctx.job.id, (s) => ({ ...s, error: why }));
    return madePaid(data({ sheet: c.id, failed: why, ...(judge === undefined ? {} : { judge }) }), ctx);
  };

  // THE GUARD: her kept portrait, and only it.
  const portrait = await castStillOf(await rootedNights(), { name: req.name, ref: req.portrait });
  if (!portrait.ok) return failed(portrait.error.message);
  if (portrait.value.which !== "portrait") return failed(`${req.portrait} is her sheet, not her portrait; a sheet is drawn from her kept portrait`);
  const draw = e.draw;
  let got: { readonly png: Uint8Array; readonly seed: number; readonly model: string };
  try {
    if (draw === undefined) throw new AppError("unavailable", "no sheet engine is bound");
    const render = async () => ({ ...(await draw(req.prompt, { refs: [portrait.value.bytes], late: req.late, seed: req.seed })), model: FLUX_MODEL });
    got =
      ctx.job.mode.kind === "live"
        ? await render()
        : await meteredCall<{ png: Uint8Array; seed: number; model: string }>(ctx, {
            provider: "comfyui",
            model: FLUX_MODEL,
            payload: { prompt: req.prompt, aspect: "1:1", seed: req.seed, refs: [portrait.value.ref], late: req.late },
            estimate: req.estimates.draw,
            stand: () => ({ png: new Uint8Array(standIdea(7)), seed: req.seed, model: "dry stand-in" }),
            live: async () => ({ value: await render(), unpriced: "free: a local model" }),
          });
  } catch (x) {
    return failed(errorMessage(x));
  }
  // THE EYE, before a byte is written.
  const read = await judgeStill({ base64: Buffer.from(got.png).toString("base64"), mime: "image/png" }, { recognize: (r) => meteredEye(e, req, r, ctx) }, { parody: req.parody === true });
  const why = read.ok ? sheetJudgeFailure(req.audience, read.value) : `unavailable - ${read.error.message}`;
  if (why !== null) return failed(`judge: ${why}`, read.ok ? read.value : undefined);
  const rel = sheetFile(c.id);
  fence(ctx);
  const abs = resolveInNight(req.nightId, rel);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, got.png);
  await writeSheet(req, ctx.job.id, (s) => {
    const { error: _e, ...base } = s;
    return { ...base, image: rel, seed: got.seed };
  });
  return madePaid(data({ sheet: c.id, file: rel, seed: got.seed, from: portrait.value.ref, late: req.late, provider: "comfyui", model: got.model, dry: got.model === "dry stand-in", costUsd: 0, ...(read.ok ? { judge: read.value } : {}) }), ctx);
}

/* ── The ending ───────────────────────────────────────────────────────────── */

/**
 * The sheet a finished job leaves, or null when the ending leaves it as it is (an interruption or an operator's stop:
 * the job may yet be retried). Drawn: `rendered`. Not drawn: `failed`, with the act's sentence, else the job's.
 */
export function settledSheet(c: SheetCandidate, ending: string, job: { readonly id: string; readonly error?: { readonly message: string } }): SheetCandidate | null {
  if (ending !== "done" && ending !== "failed") return null;
  const { error: _e, ...base } = c;
  if (ending === "done" && c.image !== undefined) return { ...base, status: "rendered", jobId: job.id };
  const said = [c.error, ending === "failed" ? (job.error?.message ?? `job ${job.id} failed`) : undefined].filter((s): s is string => s !== undefined && s !== "").join("; ");
  return { ...base, status: "failed", jobId: job.id, error: said === "" ? `job ${job.id} drew no sheet` : said };
}

async function ended(req: SheetRequest, job: Job, ending: string): Promise<void> {
  await mutateNight(req.nightId, (n) => {
    const c = n.candidates.find(isSheet(req.candidateId));
    if (c === undefined || (c.jobId !== undefined && c.jobId !== job.id)) return n;
    const next = settledSheet(c, ending, job);
    if (next === null) return n;
    const m = withCandidate(n, next);
    return m.jobs.includes(job.id) ? m : { ...m, jobs: [...m.jobs, job.id] };
  });
}

export function sheetActs(e: SheetActEngines): Pick<SheetPorts, "draw" | "ended"> {
  return {
    draw: async (req, ctx) => {
      try {
        return await drawAct(e, req, ctx);
      } catch (x) {
        return { kind: "fatal", code: x instanceof AppError ? x.code : "internal", message: errorMessage(x) };
      }
    },
    ended,
  };
}
