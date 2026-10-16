import { ok, type Result } from "@gt/domain/errors";
import type { ResourceLane } from "@gt/domain/lane";
import type { Producer } from "@gt/kernel/job-core";
import { madeFree, madePaid, type ActAsk, type ActPlan } from "@gt/producers/research/partAct";
import { defineWords, wordsPlan } from "@gt/producers/words/define";

import { standText } from "@/lib/sound/mv/standIns";
import { writeMetadata } from "@/lib/sound/mv/metadata";
import { cleanTitle, readMv } from "@/lib/sound/mv/store";
import type { MvAnalysis } from "@/lib/sound/mv/types";
import type { TextRequest } from "@/lib/text/types";

import { asData, enginesOf, meteredText, partFacts, priceOf, textFailure, type DriveHooks, type PartFacts } from "./research.ts";

// THE WORDS PRODUCER, BOUND (Phase 4 wave C, L37): the `mv-metadata` turn over the album track's
// analysis, through the step's meter. v1's `writeMetadata` takes its `reason` as a parameter, so
// the meter is handed in as that function - the prompt, the schema and the fitter stay v1's, one
// copy. The track is found by title among the music-video records (the album project has no
// track link of its own until projects import, wave D); a live job without one is refused at its
// plan step, and a dry one stands in without it (no chapters).

const EMPTY_ANALYSIS: MvAnalysis = { durationS: 0, tempoBpm: [], energyShape: [], sections: [] };

async function analysisFor(title: string): Promise<MvAnalysis | undefined> {
  const f = await readMv().catch(() => undefined);
  return f?.jobs.find((j) => cleanTitle(j.source.title) === title && j.analysis !== undefined)?.analysis;
}

/** Statically, for the receipt: whether the track is analysed is read at the plan step (a file
 *  read); the receipt prices the one turn and says nothing it has not read. */
export function wordsUnits(_s: unknown, f: PartFacts, ask: Pick<ActAsk, "act">, opts: { analysed?: boolean; dry?: boolean } = {}): Result<ActPlan> {
  return wordsPlan({ title: f.plan.project.title, analysed: opts.analysed ?? true, dry: opts.dry ?? true }, ask.act, priceOf(f.option, { text: true }));
}

export function wordsProducer(lane: ResourceLane = "seat.text", hooks: DriveHooks = {}): Producer {
  const engine = enginesOf(hooks);
  return defineWords(lane, {
    async plan(job, ask, ctx) {
      const f = partFacts(ctx);
      if (!f.ok) return f;
      const analysed = (await analysisFor(f.value.plan.project.title)) !== undefined;
      return wordsUnits(null, f.value, ask, { analysed, dry: job.mode.kind === "dry" });
    },
    async perform(job, _plan, unit, ctx) {
      try {
        const title = String(unit.input["title"] ?? "");
        const analysis = (await analysisFor(title)) ?? EMPTY_ANALYSIS;
        let metered = false;
        const meta = await writeMetadata(
          { title, analysis },
          {
            reason: (req: TextRequest) => {
              metered = true;
              return meteredText(ctx, unit, req, () => standText(req), async () => {
                const served = await engine.reason(req);
                return { value: served, provenance: served.provenance };
              });
            },
          },
        );
        // Fitted and validated inside writeMetadata (v1's `fitMetadata`); booked as plain JSON.
        const out = asData({ metadata: meta });
        return job.mode.kind === "dry" || !metered ? madeFree(out) : madePaid(out, ctx);
      } catch (e) {
        return textFailure(e);
      }
    },
    // The words part holds no step record yet: the answer stays on the job, where render reads it.
    async land() {
      return ok({ rev: 0, unchanged: true });
    },
    ...(hooks.onSettled === undefined ? {} : { settled: hooks.onSettled }),
  });
}
