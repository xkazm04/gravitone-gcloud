"use client";

// ALTERNATIVES — prototype host. Three directional variants behind a throwaway
// switcher; the winner absorbs this file's header and the switcher dies with
// the consolidation commit. Data lives in useAlternatives — the variants are
// pure views over the same AltsCtl, so switching tabs never loses state.

import { useState } from "react";

import type { Plate } from "../frames";
import type { useFrames } from "../useFrames";
import { useAlternatives } from "./useAlternatives";
import VariantContactSheet from "./VariantContactSheet";
import VariantWorkbench from "./VariantWorkbench";
import VariantWall from "./VariantWall";

const VARIANTS = [
  { id: "sheet", name: "contact sheet", sub: "scene columns on a rail" },
  { id: "bench", name: "workbench", sub: "one scene in focus, the cut indexed" },
  { id: "wall", name: "the wall", sub: "pan & zoom over everything" },
] as const;

type VariantId = (typeof VARIANTS)[number]["id"];

export default function AlternativesView({
  ctl,
  projectId,
}: {
  ctl: ReturnType<typeof useFrames>;
  projectId: string;
}) {
  const [variant, setVariant] = useState<VariantId>("sheet");

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
        <div className="flex items-center gap-1 rounded-xl border border-white/8 bg-white/[0.02] p-1">
          {VARIANTS.map((v) => (
            <button
              key={v.id}
              onClick={() => setVariant(v.id)}
              title={v.sub}
              className={`font-jetbrains rounded-lg px-3 py-1 text-[11px] tracking-[0.1em] uppercase transition ${
                variant === v.id ? "bg-cyan-400/15 text-cyan-100" : "text-white/40 hover:text-white/70"
              }`}
            >
              {v.name}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
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
      </div>

      {alts.error && (
        <p className="rounded-xl border border-rose-400/30 bg-rose-400/5 px-4 py-2.5 text-[13px] leading-snug text-rose-200">
          {alts.error}
        </p>
      )}

      {variant === "sheet" && <VariantContactSheet alts={alts} />}
      {variant === "bench" && <VariantWorkbench alts={alts} />}
      {variant === "wall" && <VariantWall alts={alts} />}
    </div>
  );
}
