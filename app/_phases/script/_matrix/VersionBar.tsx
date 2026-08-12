"use client";

// Which version the weight tabs are drawing.
//
// Only Coverage and the Spend bar get this control. Candidates and Tracks are
// baseline-only by design: a recalibration re-weights research, and expressing
// that as two interleaved beat chains or two running orders would be a diff
// nobody can read.

import type { VersionsApi } from "../useVersions";

export default function VersionBar({
  api,
  showing,
  setShowing,
}: {
  api: VersionsApi;
  showing: "baseline" | "candidate";
  setShowing: (v: "baseline" | "candidate") => void;
}) {
  if (!api.candidate)
    return (
      <p className="font-jetbrains text-[11px] text-white/35">
        {api.accepted.length > 0
          ? `Showing ${api.baseline.label} — accepted from ${api.baseline.notes.length} note${api.baseline.notes.length === 1 ? "" : "s"}.`
          : "Showing the baseline. Stack notes on a track id, then recalibrate to get something to compare."}
      </p>
    );

  return (
    <div
      data-testid="version-bar"
      className="flex flex-wrap items-center gap-2 rounded-xl border border-cyan-400/25 bg-cyan-400/[0.04] px-3 py-2"
    >
      <span className="font-jetbrains text-[10px] tracking-[0.14em] text-cyan-200 uppercase">showing</span>
      {(
        [
          { key: "baseline" as const, label: api.baseline.label },
          { key: "candidate" as const, label: api.candidate.label },
        ]
      ).map((v) => (
        <button
          key={v.key}
          data-testid={`show-${v.key}`}
          onClick={() => setShowing(v.key)}
          className={`font-jetbrains rounded-full border px-3 py-1 text-[11px] transition ${
            showing === v.key
              ? "border-cyan-400/50 bg-cyan-400/12 text-cyan-100"
              : "border-white/12 text-white/50 hover:text-white/80"
          }`}
        >
          {v.label}
        </button>
      ))}
      <span className="font-jetbrains text-[10px] text-white/35">
        {showing === "candidate"
          ? "deltas are against the baseline · nothing is committed until you accept"
          : "switch to the candidate to see what your notes did"}
      </span>
    </div>
  );
}
