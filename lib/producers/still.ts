import { ok } from "@gt/domain/errors";
import type { ResourceLane } from "@gt/domain/lane";
import type { Producer } from "@gt/kernel/job-core";
import { defineStill, stillPlan } from "@gt/producers/still/define";

import { NEGATIVE_PROMPT, compilePrompt } from "@/lib/stylePrompt";

import { fallbackBlock, imageFailure, LIVE_IMAGING, meteredImages, putImage, type ImagingEngines } from "./frames.ts";
import { asData, partFacts, priceOf, type DriveHooks, type PartFacts, type UnitsFn } from "./research.ts";
import { madeFree, madePaid } from "@gt/producers/research/partAct";
import { ImagingError } from "@/lib/imaging/errors";

// THE STILL PRODUCER, BOUND (Phase 4 wave C, L37) - an album still part's takes through the
// imaging router (`generate`, one paid image per unit, metered with a dry stand-in), each take's
// pixels a blob.
//
// WHERE THE TAKES LIVE, SAID: a still part has no step record (@gt/domain/steps registers the six
// film kinds; the parts driver refuses any other), so this job's `land` writes nothing and the
// takes are the job's booked outputs - `{ n, blob, model, costUsd? }` per `unit:take:<n>` - until a
// `still` record exists (L39 is defining its shape). The project title is the prompt's subject
// (the album recipe has no research part to write one), in the fallback preset's style.

export const stillView = (f: PartFacts): { prompt: string } => ({ prompt: f.plan.project.title });

/** The still act's units (receipt and plan step): a still part has no records, so the snapshot is
 *  null by construction (lib/producers/research.ts `actReceiptIn`). */
export const stillUnits: UnitsFn = (_s, f, ask) => stillPlan(stillView(f), { act: ask.act }, priceOf(f.option));

export function stillProducer(lane: ResourceLane = "box.chrome", hooks: DriveHooks = {}, engines: ImagingEngines = LIVE_IMAGING): Producer {
  return defineStill(lane, {
    async plan(_job, ask, ctx) {
      const f = partFacts(ctx);
      return f.ok ? stillUnits(null, f.value, ask) : f;
    },
    async perform(_job, _plan, unit, ctx) {
      try {
        const prompt = compilePrompt(fallbackBlock(), String(unit.input["prompt"] ?? ""));
        const got = await meteredImages(ctx, unit, { prompt, negativePrompt: NEGATIVE_PROMPT, aspect: "16:9", count: 1 }, engines);
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
    // No still record to land in (see the header): the takes stay the job's outputs.
    land: async () => ok({ rev: 0, unchanged: true }),
    ...(hooks.onSettled === undefined ? {} : { settled: hooks.onSettled }),
  });
}
