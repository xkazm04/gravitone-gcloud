"use client";

// THE CUT'S "EXPORT ANIMATIC" — compiles the derived cut (cutDocument.ts) and
// POSTs it to /api/cut/export (lib/cutExport.ts). The hook is deliberately NOT
// gated on the finish line's verdicts: an animatic with holes is the review
// artifact, and the document and sidecar carry the failing rows with the media.
//
// Progress is honest: the route is one request with no stream, so the surface
// shows "exporting", not a fraction.

import { useCallback, useState } from "react";

import { accessHeader } from "@/lib/imagingClient";
import type { CutExportResult } from "@/lib/cutExport";

import { compileCut } from "./cutDocument";
import type { CutCtx } from "./useCut";

export type AnimaticStatus = "idle" | "exporting" | "done" | "error";

/** The route's answer: the result plus the download link it adds. */
export type AnimaticSummary = CutExportResult & { downloadUrl: string };

export function useAnimaticExport({ projectId, cut, offsets, takeIds }: Pick<CutCtx, "projectId" | "cut" | "offsets" | "takeIds">) {
  const [status, setStatus] = useState<AnimaticStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnimaticSummary | null>(null);

  const run = useCallback(async () => {
    if (status === "exporting") return;
    setStatus("exporting");
    setError(null);
    setResult(null);
    try {
      const document = compileCut(cut, offsets, takeIds);
      const res = await fetch("/api/cut/export", {
        method: "POST",
        headers: { "content-type": "application/json", ...accessHeader() },
        body: JSON.stringify({ document, projectId }),
      });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        throw new Error(typeof body.detail === "string" ? body.detail : `The export failed (HTTP ${res.status}).`);
      }
      setResult(body as unknown as AnimaticSummary);
      setStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  }, [status, cut, offsets, takeIds, projectId]);

  return { status, error, result, run };
}
