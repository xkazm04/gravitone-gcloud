// POST /api/music/generate — a spotting cue in, its rendered audio out.
//
// The seam exists for the same reason as /api/imaging/*: the vendor key must
// never reach the browser. The caller sends the CUE (title, intent, bpm,
// duration, style block) — never a wire-format plan — and the cue→plan
// translation happens server-side in lib/music/plan.ts, so the briefing
// doctrine lives in exactly one place and the browser cannot ask for
// something the doctrine would not produce.
//
// Money route — auth + rate limit before anything is read or spent
// (lib/apiAuth.ts). NOT yet under lib/imaging/budget.ts's spend ceiling: that
// ledger prices per-image USD and a music credit is a different unit. Until a
// music line exists in the budget, the ceiling on this route is the rate
// limit alone — stated here so nobody mistakes absence for coverage.

import { guardRequest } from "@/lib/apiAuth";
import { MusicError, statusFor } from "@/lib/music/errors";
import { composeMusic } from "@/lib/music/elevenlabs";
import { cueToPlan } from "@/lib/music/plan";
import type { CueBrief } from "@/lib/music/types";

export const runtime = "nodejs";
/** Music generation can run minutes; give the handler the platform max. */
export const maxDuration = 300;

class BadRequest extends Error {}

function asString(v: unknown, field: string, max = 2000): string {
  if (typeof v !== "string" || !v.trim()) throw new BadRequest(`"${field}" must be a non-empty string.`);
  if (v.length > max) throw new BadRequest(`"${field}" is over ${max} chars.`);
  return v.trim();
}

function asNumber(v: unknown, field: string, min: number, max: number): number {
  const n = typeof v === "number" ? v : NaN;
  if (!Number.isFinite(n) || n < min || n > max)
    throw new BadRequest(`"${field}" must be a number in ${min}..${max}.`);
  return n;
}

function asStrings(v: unknown, field: string, cap: number): string[] {
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.some((s) => typeof s !== "string"))
    throw new BadRequest(`"${field}" must be an array of strings.`);
  if (v.length > cap) throw new BadRequest(`"${field}" is over ${cap} entries.`);
  return (v as string[]).map((s) => s.trim()).filter(Boolean);
}

export async function POST(req: Request) {
  const denied = guardRequest(req);
  if (denied) return denied;
  try {
    const body = (await req.json().catch(() => {
      throw new BadRequest("Body must be JSON.");
    })) as Record<string, unknown>;

    const cue: CueBrief = {
      title: asString(body.title, "title", 120),
      intent: asString(body.intent, "intent"),
      bpm: asNumber(body.bpm, "bpm", 40, 220),
      durS: asNumber(body.durS, "durS", 3, 600),
      styleBlock: asStrings(body.styleBlock, "styleBlock", 40),
      avoid: asStrings(body.avoid, "avoid", 40),
    };

    const out = await composeMusic(cueToPlan(cue));
    return Response.json(out);
  } catch (e) {
    if (e instanceof BadRequest) return Response.json({ detail: e.message, code: "bad-request" }, { status: 400 });
    if (e instanceof MusicError) return Response.json({ detail: e.message, code: e.kind }, { status: statusFor(e.kind) });
    return Response.json({ detail: "The music call failed unexpectedly.", code: "failed" }, { status: 500 });
  }
}
