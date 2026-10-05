"use client";

// THE MUSIC-VIDEO DISCIPLINE'S CUT STEP — triggers the real export
// (`POST /api/music-video/export`, `lib/musicVideoExport.ts`) and reports what
// came back.
//
// WHY THIS HOOK READS THE COMPOSITION'S BYTES OUT OF IndexedDB ITSELF, rather
// than the server reading them. The server has no IndexedDB — see
// `lib/musicVideoExport.ts`'s own header on this — so every byte the export
// route needs (the poster, the source mp3, the baked envelope, the seed, the
// effect params) is resolved HERE, in the browser, and sent once in the POST
// body. Same seam `useMusicVideoComposition.ts#generatePoster` already uses
// for `/api/imaging/generate`, just with more fields.
//
// PROGRESS IS HONEST, NOT INVENTED. `lib/jobs.tsx`'s own header states the
// rule directly: every job kind is DRIVEN now, and a driven job has no
// `progress` fraction to show, only elapsed time — there is no mechanism in
// this app's job system for a route to stream "frame 40/750 captured" back to
// a polling client mid-request (the whole call is one `fetch`, not a
// subscription). This hook does not fake one; the UI shows elapsed time via
// `elapsed(job)`, same as poster generation does.

import { useCallback, useState } from "react";

import { getAsset, getUploadBlobs, readUploadPointer } from "@/lib/assets";
import { accessHeader } from "@/lib/imagingClient";
import type { useJobs } from "@/lib/jobs";

import type { MusicVideoSourceStepData } from "../../_shared/stepStore";

import type { ExportResolutionId } from "./resolutions";

export type ExportRunStatus = "idle" | "preparing" | "exporting" | "done" | "error";

export interface ExportSummary {
  id: string;
  encoder: "h264_nvenc" | "libx264";
  width: number;
  height: number;
  frameCount: number;
  fps: number;
  durationS: number;
  wallMs: number;
  captureMs: number;
  muxMs: number;
  sizeBytes: number;
  downloadUrl: string;
}

/** `ArrayBuffer` → base64, chunked so `String.fromCharCode(...bytes)` never
 *  blows the call-stack argument limit on a multi-megabyte mp3 (V8's own
 *  ceiling is a function of engine and build, not a documented constant worth
 *  chasing — 32KB chunks stay far under any of them while costing nothing
 *  measurable in loop overhead). */
async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** An asset's bytes, read back the same way `useMusicVideoComposition.ts`'s
 *  `loadPosterAsset` does (asset → `upload:` pointer → blob), but returning a
 *  base64 string this hook can put straight into a JSON body instead of an
 *  object URL a `<img>`/`<audio>` tag would consume. `null` means the asset or
 *  its bytes are gone — the same "unresolved" case `hydrateUploadSrcs`
 *  already names elsewhere in this app, surfaced here as a plain failure the
 *  caller turns into an honest error message. */
async function resolveAssetBytes(assetId: string): Promise<{ base64: string; mime: string } | null> {
  const asset = await getAsset(assetId);
  if (!asset) return null;
  const uploadId = readUploadPointer(asset.src);
  if (!uploadId) return null;
  const blobs = await getUploadBlobs([uploadId]);
  const blob = blobs.get(uploadId);
  if (!blob) return null;
  const mime = (asset.meta?.mime as string | undefined) || blob.type || "application/octet-stream";
  return { base64: await blobToBase64(blob), mime };
}

export function useMusicVideoExport(projectId: string, jobs: ReturnType<typeof useJobs>) {
  const [resolution, setResolution] = useState<ExportResolutionId>("1080p");
  const [status, setStatus] = useState<ExportRunStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [result, setResult] = useState<ExportSummary | null>(null);

  const runExport = useCallback(
    async (comp: MusicVideoSourceStepData) => {
      if (status === "preparing" || status === "exporting") return;
      if (!comp.sourceAssetId || !comp.posterAssetId || !comp.envelope || comp.seed === undefined || !comp.effectParams) {
        setStatus("error");
        setErrorCode("incomplete-composition");
        setError("This composition has no track, poster, seed or effect parameters yet — finish Research and Frames first.");
        return;
      }

      const job = jobs.start("video-export", projectId, `Export (${resolution})`, { driven: true });
      if (!job) return; // another export is already running for this project

      setStatus("preparing");
      setError(null);
      setErrorCode(null);
      setResult(null);

      try {
        const [poster, audio] = await Promise.all([
          resolveAssetBytes(comp.posterAssetId),
          resolveAssetBytes(comp.sourceAssetId),
        ]);
        if (!poster) throw new Error("The poster's bytes could not be read back from this browser's storage — re-generate it in Frames.");
        if (!audio) throw new Error("The source track's bytes could not be read back from this browser's storage — re-attach it in Research.");

        setStatus("exporting");
        const res = await fetch("/api/music-video/export", {
          method: "POST",
          headers: { "content-type": "application/json", ...accessHeader() },
          body: JSON.stringify({
            resolution,
            posterBase64: poster.base64,
            posterMime: poster.mime,
            audioBase64: audio.base64,
            audioMime: audio.mime,
            envelope: comp.envelope,
            seed: comp.seed,
            effectParams: comp.effectParams,
            projectId,
          }),
        });
        const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (!res.ok) {
          const detail = typeof body.detail === "string" ? body.detail : `The export failed (HTTP ${res.status}).`;
          const err = new Error(detail) as Error & { code?: string };
          err.code = typeof body.code === "string" ? body.code : undefined;
          throw err;
        }

        const summary = body as unknown as ExportSummary;
        setResult(summary);
        setStatus("done");
        jobs.settle(job.id, "done", `${resolution} export ready via ${summary.encoder}.`);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        const code = (e as { code?: string } | undefined)?.code ?? null;
        setStatus("error");
        setError(message);
        setErrorCode(code);
        jobs.settle(job.id, "failed", message);
      }
    },
    [status, jobs, projectId, resolution],
  );

  return { resolution, setResolution, status, error, errorCode, result, runExport };
}

export type MusicVideoExportApi = ReturnType<typeof useMusicVideoExport>;
