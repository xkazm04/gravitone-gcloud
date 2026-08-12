"use client";

import type { VersionsApi } from "../useVersions";

/** Shown only when a candidate exists, so the tab cannot look stale by accident. */
export default function BaselineOnlyNote({ api, what }: { api: VersionsApi; what: string }) {
  if (!api.candidate) return null;
  return (
    <p
      data-testid="baseline-only"
      className="font-jetbrains mb-3 rounded-xl border border-amber-400/25 bg-amber-400/[0.04] px-3 py-2 text-[11px] leading-snug text-amber-200/90"
    >
      A recalibration is staged. {what} It re-weights the research rather than rewriting beats, so
      compare it in Coverage or the Spend bar — showing it here would be a diff nobody can read.
    </p>
  );
}
