"use client";

// What a follow-up came back with.
//
// The design rule this renders: a follow-up result must be able to make the
// notebook WORSE. `kills` and `downgrades` are first-class effect kinds, drawn
// as loudly as `confirms` — a queue that can only add is a queue that quietly
// launders whatever it finds.
//
// WHAT IT NO LONGER SAYS. This footer used to promise that applying an effect
// "writes a new notebook revision — the current script is unaffected". No apply
// action exists anywhere in this app, and none can today: an effect edits the
// notebook, and the notebook is one static module shared by every project, so
// there is nowhere per-project to write one. The scope IS per-project and does
// persist — but it records kept-or-cut, and nothing these results return is a
// kept-or-cut decision on a card that still exists. So the claim is cut rather
// than propped up with an invented mechanism, and each effect now says where it
// actually stands instead (`standingOf`). Most of them have already landed: the
// notebook on screen has absorbed the very round these transcripts came from.

import { standingOf, type Effect, type FollowUpRequest } from "../followup";

const EFFECT_TONE: Record<Effect["kind"], { label: string; cls: string }> = {
  confirms: { label: "confirms", cls: "border-emerald-400/35 bg-emerald-400/[0.07] text-emerald-200" },
  downgrades: { label: "downgrades", cls: "border-amber-400/35 bg-amber-400/[0.07] text-amber-200" },
  kills: { label: "kills", cls: "border-rose-400/40 bg-rose-400/[0.08] text-rose-200" },
  "resolves-unknown": { label: "resolves", cls: "border-cyan-400/35 bg-cyan-400/[0.07] text-cyan-200" },
  "adds-fact": { label: "adds", cls: "border-white/15 bg-white/[0.05] text-white/70" },
};

export const VERDICT_TONE: Record<string, string> = {
  strengthened: "text-emerald-300",
  weakened: "text-amber-200",
  resolved: "text-cyan-200",
  inconclusive: "text-white/50",
};

export default function FollowUpResult({
  result,
  cardIds,
}: {
  result: NonNullable<FollowUpRequest["result"]>;
  cardIds: ReadonlySet<string>;
}) {
  const standings = result.effects.map((e) => standingOf(e, cardIds));
  const landed = standings.filter((s) => s.landed).length;

  return (
    <div className="mt-3 border-t border-white/8 pt-3">
      <p className="text-[13px] leading-relaxed text-slate-300">{result.summary}</p>

      <ul className="mt-3 space-y-1.5">
        {result.effects.map((e, k) => {
          const t = EFFECT_TONE[e.kind];
          const target = "targetId" in e ? e.targetId : e.factId;
          const s = standings[k];
          return (
            <li key={k} className="flex flex-wrap items-start gap-2 text-[12px]">
              <span className={`font-jetbrains shrink-0 rounded border px-1.5 py-0.5 text-[10px] tracking-[0.1em] ${t.cls}`}>
                {t.label}
              </span>
              <span className="font-jetbrains shrink-0 text-[10px] text-white/35">{target}</span>
              <span className="flex-1 text-white/60">
                {"claim" in e ? e.claim : ""}
                {"note" in e && e.note ? <span className="block text-white/45 italic">{e.note}</span> : null}
                {/* Where this effect stands against the notebook on screen —
                    derived, so it cannot drift out of date the way a written
                    caption did. */}
                <span
                  data-testid={`effect-standing-${target}`}
                  title={s.why}
                  className={`font-jetbrains mt-1 block text-[10px] tracking-[0.1em] ${
                    s.landed ? "text-white/30" : "text-amber-200/50"
                  }`}
                >
                  {s.label}
                </span>
              </span>
            </li>
          );
        })}
      </ul>

      <p data-testid="followup-apply-note" className="font-jetbrains mt-2.5 text-[10px] leading-relaxed text-white/28">
        {result.sources.length} source{result.sources.length === 1 ? "" : "s"} · nothing here is
        applied, and there is no apply action to reach for: an effect edits the notebook, and the
        notebook in this prototype is one static document shared by every project, so there is
        nowhere per-project to write one.
        {landed > 0 &&
          ` ${landed} of ${result.effects.length} describe material this notebook already carries — these results were transcribed from a real terminal run, and that run's output is already in the fixture.`}
      </p>
    </div>
  );
}
