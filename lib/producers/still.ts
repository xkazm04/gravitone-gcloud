import { ok } from "@gt/domain/errors";
import type { BlobStore } from "@gt/kernel/blob";
import type { ResourceLane } from "@gt/domain/lane";
import type { Producer } from "@gt/kernel/job-core";
import { lookWords } from "@gt/producers/frames/look";
import { defineStill, stillPlan } from "@gt/producers/still/define";

import { NEGATIVE_PROMPT, compilePrompt } from "@/lib/stylePrompt";

import { imageFailure, kernelBlobs, LIVE_IMAGING, lookImages, meteredImages, putImage, type ImagingEngines } from "./frames.ts";
import { asData, must, partFacts, priceOf, type DriveHooks, type PartFacts, type UnitsFn, preflightFrom } from "./research.ts";
import { madeFree, madePaid } from "@gt/producers/research/partAct";
import { ImagingError } from "@/lib/imaging/errors";

// THE STILL PRODUCER, BOUND (Phase 4 wave C, L37) - an album still part's takes through the
// imaging router (`generate`, one paid image per unit, metered with a dry stand-in), each take's
// pixels a blob.
//
// WHERE THE TAKES LIVE, SAID: the STILL record exists (@gt/domain/steps/still.ts: takes as blob
// refs and the adopted one), but this job's `land` does not write it yet, so the takes are the
// job's booked outputs - `{ n, blob, model, costUsd? }` per `unit:take:<n>`. The project title is the prompt's subject
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
    // The still record is not written yet (see the header): the takes stay the job's outputs.
    land: async () => ok({ rev: 0, unchanged: true }),
    ...(hooks.onSettled === undefined ? {} : { settled: hooks.onSettled }),
  });
}
