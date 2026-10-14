"use client";

import { formatAge, type Freshness } from "@/lib/pollFreshness";

/** Beside the run it describes: the shown status is the last one read, and says
 *  how old that is. Silent while the edge is healthy. */
export function StalePoll({ freshness }: { freshness: Freshness }) {
  if (freshness.state === "fresh") return null;
  const lapsed = freshness.state === "lapsed";
  return (
    <div
      role="status"
      className={`font-jetbrains rounded-xl border px-4 py-3 text-label ${
        lapsed ? "border-rose-400/30 bg-rose-400/[0.06] text-rose-100/90" : "border-amber-400/25 bg-amber-400/[0.06] text-amber-100/90"
      }`}
    >
      {lapsed
        ? `the server has not answered for ${formatAge(freshness.ageMs)} · this status is not current and may have changed`
        : `the server did not answer the last check · showing the status read ${formatAge(freshness.ageMs)} ago`}
    </div>
  );
}
