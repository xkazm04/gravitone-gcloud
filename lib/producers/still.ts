import { ok, type Result } from "@gt/domain/errors";
import type { EventData } from "@gt/domain/event";
import type { BlobStore } from "@gt/kernel/blob";
import type { ResourceLane } from "@gt/domain/lane";
import type { Producer } from "@gt/kernel/job-core";
import { lookWords } from "@gt/producers/frames/look";
import { landPart } from "@gt/producers/research/partJob";
import { defineStill, stillPlan } from "@gt/producers/still/define";

import { NEGATIVE_PROMPT, compilePrompt } from "@/lib/stylePrompt";

import { imageFailure, kernelBlobs, LIVE_IMAGING, lookImages, meteredImages, putImage, type ImagingEngines } from "./frames.ts";
import { asData, must, partFacts, priceOf, recOf, written, type DriveHooks, type PartFacts, type UnitsFn, preflightFrom } from "./research.ts";
import { madeFree, madePaid, type ActPlan } from "@gt/producers/research/partAct";
import type { PartSnapshot } from "@gt/kernel/parts/driver";
import { ImagingError } from "@/lib/imaging/errors";

// THE STILL PRODUCER, BOUND (Phase 4 wave C, L37) - an album still part's takes through the
// imaging router (`generate`, one paid image per unit, metered with a dry stand-in), each take's
// pixels a blob.
//
// WHERE THE TAKES LIVE, SAID: each take lands on the STILL record (@gt/domain/steps/still.ts: takes
// as blob refs, appended under the job's id so a second run adds takes beside the first) and stays
// the job's booked output as well - `{ n, blob, model, costUsd? }` per `unit:take:<n>`, which the
// mv still step reads today. The adopted take is the gate packet's pick, so landing never moves
// it. The project title is the prompt's subject
// (the album recipe has no research part to write one), drawn under the project's look the way a
// frames plate is (./frames.ts, Phase 5 L56): its style's block and references, or the named
// default with its miss on the receipt - an album project carries no style today, so that is
// the default, said.

export const stillView = (f: PartFacts): { prompt: string } => ({ prompt: f.plan.project.title });

/** The still act's units (receipt and plan step): a still part has no records, so the snapshot is
 *  null by construction (lib/producers/research.ts `actReceiptIn`). */
export const stillUnits: UnitsFn = (_s, f, ask) => {
  const plan = stillPlan(stillView(f), { act: ask.act }, priceOf(f.option));
  return plan.ok ? ok({ ...plan.value, about: lookWords(f.look) }) : plan;
};

/** The STILL record after the job's takes: each drawn unit appended once (a refused one has no
 *  blob), `adopted` and every sibling field left as they were. */
export function landStill(jobId: string, plan: ActPlan, made: ReadonlyMap<string, EventData>, s: PartSnapshot): Result<Record<string, unknown>> {
  const rec = recOf(s, "still");
  const held = Array.isArray(rec["takes"]) ? written<{ id: string }[]>(rec["takes"]) : [];
  const have = new Set(held.map((t) => t.id));
  const added = plan.units.flatMap((u) => {
    const m = made.get(u.name);
    const id = `${jobId}:${u.name}`;
    if (m === undefined || m["blob"] === undefined || have.has(id)) return [];
    return [{ id, blob: m["blob"], prompt: String(u.input["prompt"] ?? ""), ...(typeof m["model"] === "string" ? { model: m["model"] } : {}), ...(typeof m["costUsd"] === "number" ? { costUsd: m["costUsd"] } : {}) }];
  });
  return ok({ still: { ...rec, takes: asData({ takes: [...held, ...added] })["takes"] } });
}

export function stillProducer(lane: ResourceLane = "box.chrome", hooks: DriveHooks = {}, engines: ImagingEngines = LIVE_IMAGING, blobs: () => BlobStore = kernelBlobs): Producer {
  return defineStill(lane, {
    // Held at the release, not failed by the worker, while its act waits on a human act (L45).
    preflight: preflightFrom(stillUnits),
    async plan(_job, ask, ctx) {
      const f = partFacts(ctx);
      return f.ok ? stillUnits(null, f.value, ask) : f;
    },
    async perform(_job, _plan, unit, ctx) {
      try {
        const { look } = must(partFacts(ctx));
        const prompt = compilePrompt(look.block, String(unit.input["prompt"] ?? ""));
        const references = await lookImages(look, blobs);
        const got = await meteredImages(ctx, unit, { prompt, negativePrompt: NEGATIVE_PROMPT, aspect: "16:9", count: 1, ...(references.length === 0 ? {} : { references }) }, engines, look.refs);
        const img = got.images[0];
        if (img === undefined) return { kind: "vendor-failure", message: "the imaging router answered with no image" };
        const blob = await putImage(ctx, img);
        const p = got.provenance;
        const out = asData({ n: unit.input["n"], blob, model: p?.model ?? "dry stand-in", ...(p?.costUsd === undefined ? {} : { costUsd: p.costUsd }) });
        return p === undefined ? madeFree(out) : madePaid(out, ctx);
      } catch (e) {
        if (e instanceof ImagingError && e.kind === "refused") return madeFree(asData({ n: unit.input["n"], refused: e.message }));
        return imageFailure(e);
      }
    },
    async land(job, plan, made, ctx) {
      return landPart(ctx, plan.act, (s) => landStill(job.id, plan, made, s));
    },
    ...(hooks.onSettled === undefined ? {} : { settled: hooks.onSettled }),
  });
}
