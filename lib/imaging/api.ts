// Request validation and error shaping for the /api/imaging/* handlers.
//
// Lives here rather than in each route so three handlers cannot drift into
// three different opinions about what a refusal is, or three different words
// for the same bad input. The routes stay thin enough to read in one screen.

import { ImagingError, statusFor } from "./errors";
import {
  ASPECT_PX,
  PROVIDER_IDS,
  type Aspect,
  type ImageRef,
  type ProviderId,
  type ProviderSteer,
} from "./types";

export class BadRequest extends Error {}

const MIMES = ["image/png", "image/jpeg", "image/webp"] as const;

export function asString(v: unknown, field: string, max = 8000): string {
  if (typeof v !== "string" || !v.trim()) throw new BadRequest(`\`${field}\` is required.`);
  if (v.length > max) throw new BadRequest(`\`${field}\` is longer than ${max} characters.`);
  return v;
}

export function asAspect(v: unknown): Aspect {
  // No default. The whole point of aspect being required is that a batch
  // silently coming back in the wrong ratio is a class of bug we have decided
  // not to have.
  if (typeof v !== "string" || !(v in ASPECT_PX))
    throw new BadRequest(`\`aspect\` must be one of ${Object.keys(ASPECT_PX).join(", ")}.`);
  return v as Aspect;
}

export function asImage(v: unknown, field: string): ImageRef {
  if (typeof v !== "object" || v === null) throw new BadRequest(`\`${field}\` is required.`);
  const o = v as Record<string, unknown>;
  const base64 = typeof o.base64 === "string" ? o.base64.replace(/^data:[^;]+;base64,/, "") : "";
  if (!base64) throw new BadRequest(`\`${field}.base64\` is required.`);
  const mime = typeof o.mime === "string" ? o.mime : "image/png";
  if (!(MIMES as readonly string[]).includes(mime))
    throw new BadRequest(`\`${field}.mime\` must be one of ${MIMES.join(", ")}.`);
  return { base64, mime: mime as ImageRef["mime"] };
}

export function asImages(v: unknown, field: string, cap: number): ImageRef[] | undefined {
  if (v === undefined || v === null) return undefined;
  if (!Array.isArray(v)) throw new BadRequest(`\`${field}\` must be an array.`);
  if (v.length > cap) throw new BadRequest(`\`${field}\` accepts at most ${cap} images.`);
  return v.map((x, i) => asImage(x, `${field}[${i}]`));
}

export function asCount(v: unknown): number | undefined {
  if (v === undefined || v === null) return undefined;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 8) throw new BadRequest("`count` must be 1–8.");
  return n;
}

export function asProviderId(v: unknown, field: string): ProviderId | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "string" || !(PROVIDER_IDS as readonly string[]).includes(v))
    throw new BadRequest(`\`${field}\` must be one of ${PROVIDER_IDS.join(", ")}.`);
  return v as ProviderId;
}

/**
 * The caller's vendor steer, validated like every other field.
 *
 * An unknown vendor id is a 400 rather than a shrug, and `avoid` is why: a
 * typo'd avoidance that fell back to default routing would send the request to
 * the very vendor the caller ruled out, and answer 200. That is the one
 * outcome this field may never have.
 */
export function asSteer(body: Record<string, unknown>): ProviderSteer {
  const prefer = asProviderId(body.prefer, "prefer");
  const avoid = asProviderId(body.avoid, "avoid");
  if (prefer && avoid && prefer === avoid)
    throw new BadRequest("`prefer` and `avoid` name the same provider.");
  return { prefer, avoid };
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    if (typeof body !== "object" || body === null) throw new Error();
    return body as Record<string, unknown>;
  } catch {
    throw new BadRequest("The request body was not a JSON object.");
  }
}

/** One error vocabulary for every imaging route. `code` is the machine-readable
 *  half; `detail` is already written for a person to read. */
export function errorResponse(e: unknown): Response {
  if (e instanceof BadRequest) return Response.json({ detail: e.message, code: "bad-request" }, { status: 400 });

  if (e instanceof ImagingError)
    return Response.json(
      { detail: e.message, code: e.kind, provider: e.provider },
      { status: statusFor(e.kind) },
    );

  console.error("[imaging]", e);
  return Response.json({ detail: "The imaging call failed.", code: "failed" }, { status: 502 });
}
