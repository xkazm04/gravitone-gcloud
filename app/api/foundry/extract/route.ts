// /api/foundry/extract
//   GET   every extract run on disk, summarised
//   POST  create a run from a gallery: { slug, images: [{name, mime, base64}], options? }
//
// POST is a money route by proximity — it spends nothing itself, but it is
// the door to /step, which does — so it takes the full guard (auth + rate).
// The browser sends its images already resized (extractClient.ts caps the
// long edge at 1280); the CLI sends files as they are, under the store's
// byte cap.

import { guardAccessOnly, guardRequest } from "@/lib/apiAuth";
import { FoundryError } from "@/lib/foundry/store";
import { MAX_SOURCES, createRun, listExtractRuns } from "@/lib/foundry/extract/store";
import type { ExtractOptions, ExtractUpload } from "@/lib/foundry/extract/types";

export const runtime = "nodejs";
/** Sixty decoded uploads written to disk is seconds, not minutes; the ceiling
 *  is for a slow link, not for work. */
export const maxDuration = 120;

const MIMES = new Set(["image/png", "image/jpeg", "image/webp"]);

/**
 * The most this route will PARSE. `req.json()` reads the whole body into one
 * string before a single image is looked at, and until 2026-09-05 nothing
 * bounded it: the per-image cap (12 MB) and the per-run cap (60 images) live in
 * the store, AFTER the parse, so the route would happily materialise
 * 60 × 12 MB × 4/3 ≈ 960 MB of base64 — and any body at all from a caller who
 * had the public secret — before refusing. The browser resizes to a 1280 px
 * long edge (≈1 MB a tile, ≈80 MB for a full gallery); the CLI does not go
 * through this route. 256 MB is headroom for the browser's worst case and a
 * ceiling on the rest. Refused on the DECLARED length, before the read.
 */
export const MAX_BODY_BYTES = 256 * 1024 * 1024;

export async function GET(req: Request) {
  const denied = guardAccessOnly(req);
  if (denied) return denied;
  try {
    return Response.json({ runs: await listExtractRuns() });
  } catch (e) {
    if (e instanceof FoundryError) return Response.json({ detail: e.message }, { status: e.status });
    throw e;
  }
}

export async function POST(req: Request) {
  const denied = guardRequest(req);
  if (denied) return denied;
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES)
    return Response.json(
      { detail: `The upload is ${Math.round(declared / 1024 / 1024)} MB; this route takes at most ${MAX_BODY_BYTES / 1024 / 1024} MB per run. Resize the images or send fewer.`, code: "too-large" },
      { status: 413 },
    );
  let body: Record<string, unknown>;
  try {
    body = await req.json();
    if (typeof body !== "object" || body === null) throw new Error();
  } catch {
    return Response.json({ detail: "The request body was not a JSON object." }, { status: 400 });
  }
  const slug = typeof body.slug === "string" ? body.slug : "";
  const images = Array.isArray(body.images) ? body.images : [];
  if (images.length > MAX_SOURCES) return Response.json({ detail: `At most ${MAX_SOURCES} images per run.` }, { status: 400 });
  const uploads: ExtractUpload[] = [];
  for (let i = 0; i < images.length; i++) {
    const im = images[i] as Record<string, unknown>;
    if (!im || typeof im !== "object") return Response.json({ detail: `images[${i}] is not an object.` }, { status: 400 });
    const mime = typeof im.mime === "string" ? im.mime : "image/jpeg";
    if (!MIMES.has(mime)) return Response.json({ detail: `images[${i}].mime must be a PNG, JPEG or WebP.` }, { status: 400 });
    const base64 = typeof im.base64 === "string" ? im.base64.replace(/^data:[^;]+;base64,/, "") : "";
    if (!base64) return Response.json({ detail: `images[${i}].base64 is required.` }, { status: 400 });
    uploads.push({ name: typeof im.name === "string" && im.name ? im.name : `image-${i + 1}`, mime: mime as ExtractUpload["mime"], base64 });
  }
  const raw = (typeof body.options === "object" && body.options ? body.options : {}) as Record<string, unknown>;
  const o: Partial<ExtractOptions> = { ...raw, grouping: raw.grouping === "none" ? "none" : undefined } as Partial<ExtractOptions>;
  try {
    const run = await createRun(slug, uploads, o);
    return Response.json({ run });
  } catch (e) {
    if (e instanceof FoundryError) return Response.json({ detail: e.message }, { status: e.status });
    throw e;
  }
}
