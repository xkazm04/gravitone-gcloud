"use client";

// A render, read as beats — and, when there is one, read AGAINST the chain it
// replaced.
//
// The diff exists because a recalibration is a proposal: minutes of model time
// produce a new script, and "accept as baseline" is a decision nobody can make
// from a summary paragraph. Before this, `Version.beats` was written by the
// model path and read by no component at all, so the creator paid for a rewrite
// they could not read.
//
// The pairing is deliberately lexical rather than positional. Beat marks are
// RECOMPUTED from durations when a plan lands (editPlan.ts), so 2:05 in the new
// chain and 2:05 in the old one are not the same beat and matching on the mark
// would report a rewrite everywhere a beat above it got longer. Identical text
// is the same beat; a surviving craft label is the same beat, rewritten;
// anything else is new. Baseline beats nothing claims are shown where they were
// — a cut you cannot see is a cut you cannot argue with.

import { ConnectorChip } from "../../_shared/notebook/Chips";
import type { Beat } from "../types";

type Change = "unchanged" | "rewritten" | "new" | "cut";

const CHANGE: Record<Exclude<Change, "unchanged">, { label: string; cls: string }> = {
  rewritten: { label: "rewritten", cls: "border-cyan-400/40 text-cyan-200" },
  new: { label: "new beat", cls: "border-emerald-400/40 text-emerald-200" },
  cut: { label: "cut", cls: "border-rose-400/40 text-rose-200" },
};

interface Row {
  key: string;
  beat: Beat;
  change: Change;
}

/** Where each beat of `beats` sits in `against`, and how much of it survived. */
function rowsFor(beats: Beat[], against?: Beat[]): Row[] {
  if (!against) return beats.map((b) => ({ key: b.at, beat: b, change: "unchanged" }));

  const pairs = beats.map((b) => {
    const same = against.findIndex((x) => x.text === b.text);
    if (same >= 0) return { beat: b, at: same, change: "unchanged" as Change };
    const kin = against.findIndex((x) => x.label === b.label && x.kind === b.kind);
    return { beat: b, at: kin, change: (kin >= 0 ? "rewritten" : "new") as Change };
  });

  // Walk both chains together so a dropped beat is drawn between the beats that
  // still surround it, rather than in a footnote at the bottom.
  const rows: Row[] = [];
  let cursor = 0;
  const flushTo = (limit: number) => {
    for (; cursor < limit; cursor++)
      rows.push({ key: `cut-${cursor}`, beat: against[cursor], change: "cut" });
  };

  for (const p of pairs) {
    // A match BEHIND the cursor means the chain was reordered, or two beats now
    // carry the same label. Either way its partner has already been drawn, so
    // draw this one where it now sits rather than dragging the walk backwards.
    if (p.at >= cursor) {
      flushTo(p.at);
      cursor = p.at + 1;
    }
    rows.push({ key: `${p.beat.at}-${rows.length}`, beat: p.beat, change: p.change });
  }
  flushTo(against.length);
  return rows;
}

export default function BeatList({ beats, against }: { beats: Beat[]; against?: Beat[] }) {
  const rows = rowsFor(beats, against);
  const changed = rows.filter((r) => r.change !== "unchanged").length;

  return (
    <>
      {against && (
        <p
          data-testid="beat-diff-summary"
          className="font-jetbrains mb-3 text-[11px] leading-snug text-white/40"
        >
          {changed === 0
            ? "This version left every beat of the chain it was built on exactly as it found it."
            : `${changed} of ${rows.length} beats differ from the chain this version was built on.`}
        </p>
      )}

      <ol className="space-y-3">
        {rows.map((r) => {
          const b = r.beat;
          const mark = r.change === "cut" ? CHANGE.cut : r.change === "unchanged" ? null : CHANGE[r.change];
          return (
            <li
              key={r.key}
              data-testid={`beat-${r.change}`}
              className={`grid grid-cols-[3.2rem_1fr] gap-3 ${r.change === "cut" ? "opacity-45" : ""}`}
            >
              <span className="font-jetbrains pt-0.5 text-[11px] text-white/30">{b.at}</span>
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2">
                  <ConnectorChip connector={b.connector} />
                  <span
                    className={`font-jetbrains text-[11px] tracking-[0.1em] ${
                      r.change === "cut"
                        ? "text-white/40 line-through"
                        : b.kind === "turn"
                          ? "text-violet-200"
                          : b.kind === "steelman"
                            ? "text-emerald-300/90"
                            : b.kind === "close" || b.kind === "verdict"
                              ? "text-cyan-200"
                              : "text-white/45"
                    }`}
                  >
                    {b.label}
                  </span>
                  {b.device && (
                    <span className="font-jetbrains rounded border border-white/10 px-1.5 py-0.5 text-[10px] text-white/35">
                      {b.device}
                    </span>
                  )}
                  {mark && (
                    <span
                      className={`font-jetbrains rounded-full border px-1.5 py-0.5 text-[10px] tracking-[0.1em] ${mark.cls}`}
                    >
                      {mark.label}
                    </span>
                  )}
                </p>
                <p
                  className={`font-hanken mt-1 text-[15px] leading-relaxed ${
                    r.change === "cut" ? "text-slate-500" : "text-slate-300"
                  }`}
                >
                  {b.text}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </>
  );
}
