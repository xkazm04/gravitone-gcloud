"use client";

// THE ADS RENDERS, AS THE FINISH STEP SEES THEM — start one per aspect as an
// "ad-render" job, then poll its record until it settles.
//
// POST /api/ads/render answers 202 with an id the moment the request is
// validated; the render runs after the response. So the job is DRIVEN (lib/jobs
// rule: no invented fraction) and settles when the polled record turns `done` or
// `failed`. The export ref is written to ADS_FINISH at the 202 — before the
// render ends — so a reload still knows which record to poll.

import { useCallback, useEffect, useRef, useState } from "react";

import { accessHeader } from "@/lib/imagingClient";
import type { useJobs } from "@/lib/jobs";
import { usePolling } from "@/lib/usePolling";
import type { AdErrorBody, AdExportRef, AdRenderRequest } from "@/lib/ads/types";
import type { Aspect } from "@/lib/imaging/types";

import type { AdRenderView } from "./finish";

export type RenderRefusal = { aspect: Aspect; code: string; message: string };

const terminal = (v: AdRenderView | undefined) => v?.status === "done" || v?.status === "failed";

async function readRecord(id: string): Promise<AdRenderView | "gone" | null> {
  try {
    const res = await fetch(`/api/ads/render/${id}`, { headers: accessHeader(), cache: "no-store" });
    if (res.status === 404) return "gone";
    if (!res.ok) return null;
    return (await res.json()) as AdRenderView;
  } catch {
    return null;
  }
}

/** The download href, with the (already PUBLIC — lib/apiAuth.ts) access secret
 *  as `k=`: an `<a download>` cannot carry an Authorization header. */
export function adDownloadHref(id: string): string {
  const url = `/api/ads/render/${id}/file`;
  const k = process.env.NEXT_PUBLIC_IMAGING_ACCESS_SECRET?.trim();
  return k ? `${url}?k=${encodeURIComponent(k)}` : url;
}

export function useAdRenders(
  projectId: string,
  /** The newest export per aspect — the ones worth reading. */
  watched: AdExportRef[],
  jobs: ReturnType<typeof useJobs>,
  onExport: (ref: AdExportRef) => void,
) {
  const [views, setViews] = useState<Record<string, AdRenderView | "gone">>({});
  const [starting, setStarting] = useState<Aspect | null>(null);
  const [refusal, setRefusal] = useState<RenderRefusal | null>(null);
  /** exportId → the job this tab started for it. */
  const jobFor = useRef(new Map<string, string>());

  const land = useCallback(
    (id: string, v: AdRenderView | "gone") => {
      setViews((m) => ({ ...m, [id]: v }));
      const job = jobFor.current.get(id);
      if (!job) return;
      if (v === "gone") {
        jobs.settle(job, "failed", "The render's record is gone from this machine.");
        jobFor.current.delete(id);
      } else if (terminal(v)) {
        jobs.settle(job, v.status === "done" ? "done" : "failed", v.status === "done" ? `${v.aspect} ready.` : (v.error ?? "The render failed."));
        jobFor.current.delete(id);
      }
    },
    [jobs],
  );

  const refresh = useCallback(
    (ids: string[]) =>
      Promise.all(ids.map((id) => readRecord(id).then((v) => [id, v] as const))).then((got) => {
        for (const [id, v] of got) if (v) land(id, v);
      }),
    [land],
  );

  // First read of every watched record this tab has not seen yet.
  const unseen = watched.filter((e) => views[e.exportId] === undefined).map((e) => e.exportId);
  const unseenKey = unseen.join(",");
  useEffect(() => {
    if (!unseenKey) return;
    void Promise.all(unseenKey.split(",").map((id) => readRecord(id).then((v) => [id, v] as const))).then((got) => {
      for (const [id, v] of got) if (v) land(id, v);
    });
  }, [unseenKey, land]);

  const open = watched.filter((e) => {
    const v = views[e.exportId];
    return v !== undefined && v !== "gone" && !terminal(v);
  });
  usePolling(() => void refresh(open.map((e) => e.exportId)), 2000, open.length > 0);

  const start = useCallback(
    async (req: AdRenderRequest) => {
      if (starting) return;
      setStarting(req.aspect);
      setRefusal(null);
      const job = jobs.start("ad-render", projectId, `Ad render · ${req.aspect}`, { driven: true });
      try {
        const res = await fetch("/api/ads/render", {
          method: "POST",
          headers: { "content-type": "application/json", ...accessHeader() },
          body: JSON.stringify(req),
        });
        const body = (await res.json().catch(() => ({}))) as Partial<AdErrorBody> & { exportId?: string };
        if (res.status !== 202 || typeof body.exportId !== "string") {
          const message = typeof body.message === "string" ? body.message : `The render was refused (HTTP ${res.status}).`;
          setRefusal({ aspect: req.aspect, code: typeof body.error === "string" ? body.error : "failed", message });
          if (job) jobs.settle(job.id, "failed", message);
          return;
        }
        if (job) jobFor.current.set(body.exportId, job.id);
        setViews((m) => ({
          ...m,
          [body.exportId!]: {
            exportId: body.exportId!,
            projectId,
            aspect: req.aspect,
            status: "queued",
            error: null,
            durationS: null,
            createdAt: Date.now(),
            finishedAt: null,
          },
        }));
        onExport({ aspect: req.aspect, exportId: body.exportId, createdAt: Date.now() });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        setRefusal({ aspect: req.aspect, code: "network", message });
        if (job) jobs.settle(job.id, "failed", message);
      } finally {
        setStarting(null);
      }
    },
    [starting, jobs, projectId, onExport],
  );

  return { views, start, starting, refusal };
}
