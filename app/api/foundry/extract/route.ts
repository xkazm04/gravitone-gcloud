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
  const o = (typeof body.options === "object" && body.options ? body.options : {}) as Partial<ExtractOptions>;
  try {
    const run = await createRun(slug, uploads, o);
    return Response.json({ run });
  } catch (e) {
    if (e instanceof FoundryError) return Response.json({ detail: e.message }, { status: e.status });
    throw e;
  }
}
