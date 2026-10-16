import { ok, type Result } from "@gt/domain/errors";
import type { ResourceLane } from "@gt/domain/lane";
import type { Producer } from "@gt/kernel/job-core";
import { definePartAct, refuse, unitOf, type ActPlan, type PartActPorts, type UnitPrice } from "../research/partAct.ts";

// THE CUT PRODUCER (Phase 4 wave C, L37) - a cut part's acts as kernel jobs:
//   export-animatic  the deterministic EDL (v1 lib/cut/cutDocument.ts `compileCut` over
//                    `deriveTimeline`, the one clock Score shares) rendered by ffmpeg
//                    (lib/cutExport.ts `runCutExport`). v1 POSTed the whole document from the
//                    browser with no job and no cost; here it is a job on box.render whose
//                    output is an mp4 BLOB on the cut record - no data: URL is ever stored.
//   render-aspect    the ads finish for one aspect (v1 POST /api/ads/render, lib/adRender.ts),
//                    target = the aspect; the render request is refused BEFORE the job while a
//                    blocking finish check fails (v1 `adRenderRequest` returned null then).

export const CUT_ACTS = ["export-animatic", "render-aspect"] as const;
export type CutAct = (typeof CUT_ACTS)[number];

export const AD_ASPECT_TARGETS = ["9:16", "1:1", "4:5", "16:9"] as const;

export type CutView = {
  readonly face: "standard" | "ads";
  /** Scenes on the clock (picture units placed): nothing to export without them. */
  readonly scenes: number;
  /** The ads finish's blocking check sentence, when one fails (clips, end card). */
  readonly adsBlocked?: string;
  /** The aspects the ads finish asks for. */
  readonly aspects: readonly string[];
};

export const cutDefaultAct = (v: CutView): CutAct => (v.face === "ads" ? "render-aspect" : "export-animatic");

export function cutPlan(v: CutView, act: string | null, target: string | undefined, price: UnitPrice): Result<ActPlan> {
  const a = act ?? cutDefaultAct(v);
  switch (a) {
    case "export-animatic":
      if (v.face === "ads") return refuse("an ads cut renders its aspects, not an animatic");
      if (v.scenes === 0) return refuse("no picture to cut");
      return ok({ act: a, units: [unitOf("animatic", price, {})] });
    case "render-aspect": {
      if (v.face !== "ads") return refuse("aspect renders are the ads face's act");
      if (v.adsBlocked !== undefined) return refuse(v.adsBlocked);
      const aspects = target === undefined ? v.aspects : [target];
      if (aspects.length === 0) return refuse("no aspect asked for");
      const bad = aspects.find((x) => !(AD_ASPECT_TARGETS as readonly string[]).includes(x));
      if (bad !== undefined) return refuse(`${bad} is not an aspect an ad renders at`);
      return ok({ act: a, units: aspects.map((x) => unitOf(`aspect:${x}`, price, { aspect: x })) });
    }
    default:
      return refuse(`${a} is not an act of a cut part`);
  }
}

export const defineCut = (lane: ResourceLane, ports: PartActPorts): Producer => definePartAct(lane, ports);
