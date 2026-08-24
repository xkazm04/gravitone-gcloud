"use client";

// ALTERNATIVES — the cut as a contact sheet.
//
// Prototype round 1 ran three variants: Workbench (master–detail with a
// virtualized index) and the Wall (pan/zoom camera with semantic zoom) lost to
// this, the Contact Sheet — one column per scene on a horizontal rail, every
// kept plate stacked inside it, the chosen one circled. Choosing between
// pictures is a scanning job, and a rail you sweep left→right with a scrubber
// that answers "where am I in a hundred scenes" beat both a camera you steer
// and a bench that shows one scene at a time.
//
// Data lives in useAlternatives; this file owns the header (counts, spend,
// stress, errors) and hands the sheet the controller.

import type { Plate } from "../frames";
import type { useFrames } from "../useFrames";
import { useAlternatives } from "./useAlternatives";
import VariantContactSheet from "./VariantContactSheet";

export default function AlternativesView({
  ctl,
  projectId,
}: {
  ctl: ReturnType<typeof useFrames>;
  projectId: string;
}) {
  const alts = useAlternatives({
    projectId,
    frames: ctl.frames,
    block: ctl.block,
    onAdopt: (frameId: string, plate: Plate) =>
      ctl.setFrames((fs) => fs.map((f) => (f.id === frameId ? { ...f, plate } : f))),
  });

  if (!alts.loaded)
    return (
      <p className="font-jetbrains py-16 text-center text-[12px] tracking-[0.18em] text-white/30 uppercase">
        reading the alternatives…
      </p>
    );

  const kept = alts.columns.filter((c) => !c.synthetic).reduce((s, c) => s + c.alts.length, 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-jetbrains text-[11px] text-white/35">
          {kept} kept
          {alts.altCost > 0 && <span className="text-white/25"> · ${alts.altCost.toFixed(3)} on alternatives</span>}
        </p>
        {/* The 100-scene claim, judged rather than assumed: ×7 the cut with
            interactive synthetic scenes. Free — clones never call the API. */}
        <button
          onClick={() => alts.setStress(!alts.stress)}
          className={`font-jetbrains rounded-lg border px-2.5 py-1 text-[10px] tracking-[0.12em] uppercase transition ${
            alts.stress
              ? "border-amber-300/40 bg-amber-300/10 text-amber-200"
              : "border-white/10 text-white/35 hover:text-white/60"
          }`}
        >
          stress ×7 {alts.stress ? `· ${alts.columns.length} scenes` : ""}
        </button>
      </div>

      {alts.error && (
        <p className="rounded-xl border border-rose-400/30 bg-rose-400/5 px-4 py-2.5 text-[13px] leading-snug text-rose-200">
          {alts.error}
        </p>
      )}

      <VariantContactSheet alts={alts} />
    </div>
  );
}
