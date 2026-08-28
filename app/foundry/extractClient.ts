// The Extract tab's only way to the disk: the /api/foundry/extract/* seams,
// plus the one piece of client-side work the browser does better than the
// server — shrinking a gallery before it is uploaded.

import { accessHeader } from "@/lib/imagingClient";
import type {
  ExtractCommitResult,
  ExtractDetail,
  ExtractManifest,
  ExtractOptions,
  ExtractSummary,
  ExtractUpload,
  ExtractVerdicts,
  StepResult,
} from "@/lib/foundry/extract/types";

import { FoundryRequestError, fileUrl } from "./foundryClient";

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: { "content-type": "application/json", ...accessHeader(), ...(init.headers ?? {}) },
    });
  } catch {
    throw new FoundryRequestError("The studio could not be reached.", 0);
  }
  const json = await res.json().catch(() => ({}) as Record<string, unknown>);
  if (!res.ok) throw new FoundryRequestError((json as { detail?: string }).detail ?? `HTTP ${res.status}`, res.status);
  return json as T;
}

export const fetchExtractRuns = () => call<{ runs: ExtractSummary[] }>("/api/foundry/extract").then((r) => r.runs);
export const fetchExtractRun = (id: string) => call<ExtractDetail>(`/api/foundry/extract/${encodeURIComponent(id)}`);
export const createExtractRun = (slug: string, images: ExtractUpload[], options: Partial<ExtractOptions>) =>
  call<{ run: ExtractManifest }>("/api/foundry/extract", { method: "POST", body: JSON.stringify({ slug, images, options }) }).then((r) => r.run);
export const stepExtractRun = (id: string, units = 1, retry = false) =>
  call<StepResult>(`/api/foundry/extract/${encodeURIComponent(id)}/step`, { method: "POST", body: JSON.stringify({ units, retry }) });
export const saveExtractVerdicts = (id: string, verdicts: ExtractVerdicts) =>
  call<{ ok: true }>(`/api/foundry/extract/${encodeURIComponent(id)}/verdicts`, { method: "PUT", body: JSON.stringify({ verdicts }) });
export const commitExtractRun = (id: string) =>
  call<ExtractCommitResult>(`/api/foundry/extract/${encodeURIComponent(id)}/commit`, { method: "POST", body: "{}" });

/** URL of an extract-run file, for an <img>. */
export const extractFileUrl = (run: string, rel: string) => fileUrl(run, rel, "extract");

/** The long edge a source is shrunk to before upload. Vision encoders tile
 *  past this anyway, and bytes are upload time — the same cap intake.py uses. */
export const LONG_EDGE = 1280;

/** Shrink one File to a JPEG under the cap, in the browser. A file that is
 *  already small enough is still re-encoded: one format on disk, and it
 *  strips whatever metadata the download carried. */
export async function prepareUpload(file: File): Promise<ExtractUpload> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, LONG_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No 2D canvas.");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
  return { name: file.name, mime: "image/jpeg", base64: dataUrl.slice(dataUrl.indexOf(",") + 1) };
}
