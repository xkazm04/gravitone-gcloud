"use client";

import { ConfidenceChip } from "./Chips";
import { FACT_BY_ID } from "./notebook";
import type { Fact } from "./types";

/** THE SIDEWAYS EDGE, drawn. `contests` and `qualifies` were authored in the
 *  fixture, documented in the schema as the wound graph's crucial case, and
 *  read by no file at all — so two facts that point in opposite directions
 *  rendered as two unrelated rows, and a reader scrolling the fact table could
 *  not see the conflict that is often the video.
 *
 *  This resolves the other end and prints it. It does NOT wound: `woundsOf()`
 *  still reads `dependsOn` only — see the note on `Fact.contests` in types.ts
 *  for what that costs and what would change it. */
function Edge({ label, ids, tone }: { label: string; ids: string[]; tone: string }) {
  return (
    <>
      {ids.map((id) => {
        const other = FACT_BY_ID[id];
        return (
          <p key={id} className={`mt-1.5 text-[12px] leading-relaxed ${tone}`}>
            <span className="font-jetbrains tracking-[0.12em] uppercase">{label} </span>
            <span className="font-jetbrains opacity-70">{id}</span>
            {other && <span className="opacity-80"> — {other.claim}</span>}
          </p>
        );
      })}
    </>
  );
}

/** One fact, with everything that decides whether a script may use it. */
export default function FactRow({ f }: { f: Fact }) {
  const danger = f.loadBearing && f.confidence === "low";
  return (
    <li
      className={`rounded-xl border px-3.5 py-3 ${
        danger ? "border-rose-400/30 bg-rose-400/[0.05]" : "border-white/8 bg-white/[0.02]"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-jetbrains text-[10px] tracking-[0.12em] text-white/35">{f.id}</span>
        {f.loadBearing && (
          <span className="font-jetbrains rounded border border-cyan-400/30 bg-cyan-400/[0.07] px-1.5 py-0.5 text-[10px] tracking-[0.12em] text-cyan-200">
            load-bearing
          </span>
        )}
        <ConfidenceChip c={f.confidence} />
        <span className="font-jetbrains ml-auto text-[10px] text-white/30">as of {f.asOf}</span>
      </div>
      <p className="mt-1.5 text-sm leading-relaxed text-slate-300">{f.claim}</p>
      <p className="font-jetbrains mt-1.5 text-[11px] text-white/35">
        {f.source}
        {f.confidenceNote ? ` — ${f.confidenceNote}` : ""}
      </p>
      {!!f.contests?.length && <Edge label="contests" ids={f.contests} tone="text-violet-200/85" />}
      {!!f.qualifies?.length && <Edge label="qualifies" ids={f.qualifies} tone="text-white/50" />}
      {f.note && <p className="mt-1.5 text-[13px] leading-relaxed text-white/55 italic">{f.note}</p>}
      {danger && (
        <p className="font-jetbrains mt-2 text-[11px] text-rose-300">
          load-bearing at low confidence — needs a second source before any render may state it
        </p>
      )}
    </li>
  );
}
