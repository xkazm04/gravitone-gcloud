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

import { overrideLineOf, receiptOf } from "../versions";
import type { Version } from "../versions";
import type { VersionsApi } from "../useVersions";

function Receipt({ v }: { v: Version }) {
  const line = receiptOf(v);
  if (!line) return null;
  return (
    <span
      data-testid={`receipt-${v.id}`}
      title={v.engineRun?.sessionId ? `claude session ${v.engineRun.sessionId}` : undefined}
      className="font-jetbrains text-label text-white/35"
    >
      {line}
    </span>
  );
}

/** A version accepted over a blocking gate says so WHEREVER it is named, not
 *  only in the second the button was clicked. This is the other place a version
 *  is chosen, so it is the other place the receipt belongs. */
function Override({ v }: { v: Version }) {
  const line = overrideLineOf(v);
  if (!line) return null;
  return (
    <span data-testid={`override-${v.id}`} className="font-jetbrains text-label text-rose-200/90">
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
        <p className="font-jetbrains text-content text-white/35">
          {api.accepted.length > 0
            ? `Showing ${api.baseline.label} — accepted from ${api.baseline.notes.length} note${api.baseline.notes.length === 1 ? "" : "s"}.`
            : "Showing the baseline. Stack notes on a track id, then recalibrate to get something to compare."}
        </p>
        <Receipt v={api.baseline} />
        <Override v={api.baseline} />
      </div>
    );

  const shown = showing === "candidate" ? api.candidate : api.baseline;

  return (
    <div
      data-testid="version-bar"
      className="flex flex-wrap items-center gap-2 rounded-xl border border-cyan-400/25 bg-cyan-400/[0.04] px-3 py-2"
    >
      <span className="font-jetbrains text-label tracking-[0.14em] text-cyan-200 uppercase">showing</span>
      {(
        [
          { key: "baseline" as const, label: api.baseline.label },
          { key: "candidate" as const, label: api.candidate.label },
        ]
      ).map((v) => (
        <button
          key={v.key}
          data-testid={`show-${v.key}`}
          // Which version the weight tabs are drawing was a border colour and a
          // tint. The labels are version NAMES, so nothing in the text says which
          // of the two is live.
          aria-pressed={showing === v.key}
          onClick={() => setShowing(v.key)}
          className={`font-jetbrains rounded-full border px-3 py-1 text-label transition ${
            showing === v.key
              ? "border-cyan-400/50 bg-cyan-400/12 text-cyan-100"
              : "border-white/12 text-white/50 hover:text-white/80"
          }`}
        >
          {v.label}
        </button>
      ))}
      <span className="font-jetbrains text-label text-white/35">
        {showing === "candidate"
          ? "deltas are against the baseline · nothing is committed until you accept"
          : "switch to the candidate to see what your notes did"}
      </span>
      {(receiptOf(shown) || overrideLineOf(shown)) && (
        <>
          <span className="basis-full" />
          <Receipt v={shown} />
          <Override v={shown} />
        </>
      )}
    </div>
  );
}
