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
//
// AND THE SUMMARY IS A QUOTE, NOT A FINDING. One sentence in the whale result is
// arithmetically false, the notebook says so and carries the corrected row, and
// the transcript still says what it said — because it is the record of a real
// run on 2026-08-11 and rewriting it would destroy the one thing it is for. So
// the quote is marked as a quote and the notebook's version is drawn against it
// (`revisionsOf`), derived from the fact rather than retyped. A reader can no
// longer take the false sentence away as a finding, and the run's own words are
// still there to be read.

import { revisionsOf, standingOf, type Effect, type FollowUpRequest } from "../followup";

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
  const revisions = revisionsOf(result);

  return (
    <div className="mt-3 border-t border-white/8 pt-3">
      {/* The quote, drawn as a quote. The rule on the ruled margin is the whole
          device: everything to the right of it is the run's words, unedited,
          and the correction below is not. */}
      <p className="font-jetbrains text-[10px] tracking-[0.16em] text-white/30 uppercase">
        what the run returned{revisions.length > 0 ? " — one claim has since been corrected" : ""}
      </p>
      <p
        className={`mt-1.5 border-l-2 pl-3 text-[13px] leading-relaxed text-slate-300 ${
          revisions.length > 0 ? "border-amber-400/40" : "border-white/10"
        }`}
      >
        {result.summary}
      </p>

      {/* THE CORRECTION, BESIDE THE RECORD — never instead of it. Every string
          below comes off the notebook's own fact row; nothing here is typed
          twice. See `revisionsOf`. */}
      {revisions.map((r) => (
        <div
          key={r.factId}
          data-testid={`revision-${r.factId}`}
          className="mt-2.5 rounded-xl border border-amber-400/25 bg-amber-400/[0.04] px-3 py-2.5"
        >
          <p className="font-jetbrains text-[10px] tracking-[0.14em] text-amber-200/90 uppercase">
            corrected since — {r.factId}
          </p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-white/45">
            <span className="font-jetbrains text-[10px] tracking-[0.1em] text-white/30 uppercase">
              returned ·{" "}
            </span>
            <span className="line-through decoration-amber-300/40">{r.transcribed}</span>{" "}
            <span className="font-jetbrains text-[10px] text-white/25">({r.transcribedConfidence})</span>
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-slate-200">
            <span className="font-jetbrains text-[10px] tracking-[0.1em] text-amber-200/70 uppercase">
              notebook ·{" "}
            </span>
            {r.current}{" "}
            <span className="font-jetbrains text-[10px] text-amber-200/60">({r.currentConfidence})</span>
          </p>
          <p className="font-jetbrains mt-1.5 text-[11px] leading-relaxed text-amber-200/75">{r.why}</p>
          {r.detail && (
            <p className="mt-1 text-[11px] leading-relaxed text-white/40 italic">{r.detail}</p>
          )}
        </div>
      ))}

      <ul className="mt-3 space-y-1.5">
        {result.effects.map((e, k) => {
          const t = EFFECT_TONE[e.kind];
          const target = "targetId" in e ? e.targetId : e.factId;
          const s = standings[k];
          // The false sentence is in the effect's claim as well as in the
          // summary, so the mark has to be in both places. Struck where it was
          // corrected — the words stay readable, and nobody copies them out as
          // a finding.
          const corrected = revisions.some((r) => r.factId === target);
          return (
            <li key={k} className="flex flex-wrap items-start gap-2 text-[12px]">
              <span className={`font-jetbrains shrink-0 rounded border px-1.5 py-0.5 text-[10px] tracking-[0.1em] ${t.cls}`}>
                {t.label}
              </span>
              <span className="font-jetbrains shrink-0 text-[10px] text-white/35">{target}</span>
              <span className="flex-1 text-white/60">
                <span className={corrected ? "text-white/40 line-through decoration-amber-300/40" : ""}>
                  {"claim" in e ? e.claim : ""}
                </span>
                {corrected && (
                  <span className="font-jetbrains mt-0.5 block text-[10px] tracking-[0.1em] text-amber-200/70 uppercase">
                    corrected — the notebook&rsquo;s row is above
                  </span>
                )}
                {"note" in e && e.note ? (
                  <span className={`block italic ${corrected ? "text-white/30 line-through decoration-amber-300/30" : "text-white/45"}`}>
                    {e.note}
                  </span>
                ) : null}
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

      {/* THE SOURCES, and not merely how many there are. The line above has
          counted them since the day it was written and drew none of them, so a
          result that came back with three URLs offered the reader the number
          three — on the one surface whose entire subject is what the research
          found and where it found it. A follow-up needs its provenance MORE
          than the notebook does, not less: the notebook's sources are listed in
          full (`SourcesBody`), and a follow-up is the only place a claim
          arrives AFTER that log was written, with nothing else on screen
          accounting for it.

          Plain text, in the notebook's own style, rather than anchors. Nothing
          in `app/_phases/` navigates out, and whether this prototype should is
          a decision about the app — not one to make on the way past while
          fixing a count. Copyable is the affordance the notebook's own sources
          already give. */}
      {result.sources.length > 0 && (
        <ul data-testid="followup-sources" className="mt-1.5 space-y-1">
          {result.sources.map((s) => (
            <li key={s} className="font-jetbrains text-[10px] leading-relaxed break-all text-white/35">
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
