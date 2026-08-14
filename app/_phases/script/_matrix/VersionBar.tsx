"use client";

// Which version the weight tabs are drawing, and what that version cost.
//
// Only Coverage and the Spend bar get this control. Candidates and Tracks are
// baseline-only by design: a recalibration re-weights research, and expressing
// that as two interleaved beat chains or two running orders would be a diff
// nobody can read.
//
// The receipt line is here because this is where a version is chosen. A run is
// minutes of a local Claude Opus 5 turn at real money, and the route has always
// returned the cost — it was simply thrown away at the fetch. Where it is not
// known it says so; a figure the engine did not report is never drawn as zero.

import { receiptOf } from "../versions";
import type { Version } from "../versions";
import type { VersionsApi } from "../useVersions";

function Receipt({ v }: { v: Version }) {
  const line = receiptOf(v);
  if (!line) return null;
  return (
    <span
      data-testid={`receipt-${v.id}`}
      title={v.engineRun?.sessionId ? `claude session ${v.engineRun.sessionId}` : undefined}
      className="font-jetbrains text-[10px] text-white/35"
    >
      {line}
    </span>
  );
}

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
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <p className="font-jetbrains text-[11px] text-white/35">
          {api.accepted.length > 0
            ? `Showing ${api.baseline.label} — accepted from ${api.baseline.notes.length} note${api.baseline.notes.length === 1 ? "" : "s"}.`
            : "Showing the baseline. Stack notes on a track id, then recalibrate to get something to compare."}
        </p>
        <Receipt v={api.baseline} />
      </div>
    );

  const shown = showing === "candidate" ? api.candidate : api.baseline;

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
      {receiptOf(shown) && (
        <>
          <span className="basis-full" />
          <Receipt v={shown} />
        </>
      )}
    </div>
  );
}
