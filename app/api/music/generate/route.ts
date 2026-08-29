// POST /api/music/generate — a spotting cue in, its rendered audio out.
//
// The seam exists for the same reason as /api/imaging/*: the vendor key must
// never reach the browser. The caller sends the CUE (title, intent, bpm, style
// block, and THE PICTURE it plays under) — never a wire-format plan — and the
// cue→plan translation happens server-side in lib/music/plan.ts, so the
// briefing doctrine lives in exactly one place and the browser cannot ask for
// something the doctrine would not produce.
//
// `durS` IS NO LONGER ACCEPTED. It was a number the client typed, and the
// length of music this route bought was whatever that number said — with
// nothing tying it to the film. The duration is DERIVED from `picture` now, so
// a caller cannot buy 60 seconds of music for 13 seconds of picture, and a
// caller with no picture cannot buy anything at all.
//
// Money route — auth + rate limit before anything is read or spent
// (lib/apiAuth.ts), AND, since 2026-08-29, a real spend ceiling.
//
// This comment used to read: "NOT yet under lib/imaging/budget.ts's spend
// ceiling: that ledger prices per-image USD and a music credit is a different
// unit … the ceiling on this route is the rate limit alone — stated here so
// nobody mistakes absence for coverage." The absence has been closed rather
// than restated, and the unit problem answered instead of avoided:
//
//   · lib/music/pricing.ts models the cost as a three-link chain — SECONDS OF
//     AUDIO (exact) x CREDITS PER SECOND (undeclared) x USD PER CREDIT
//     (undeclared) — and quotes the link it reaches. No dollar figure is
//     invented to make the arithmetic close.
//   · lib/music/budget.ts meters the link that IS exact: the ceiling is
//     denominated in SECONDS OF AUDIO PER ROLLING WINDOW, refuses with
//     `over-budget` (402) BEFORE the vendor is called, and counts its refusals.
//   · lib/music/log.ts writes one greppable line per call, and lib/music/
//     elevenlabs.ts's `metered` is the chokepoint all three run through.

import { guardRequest } from "@/lib/apiAuth";
import { MusicError, statusFor } from "@/lib/music/errors";
import { composeMusic } from "@/lib/music/elevenlabs";
import { cueToPlan } from "@/lib/music/plan";
import type { CueBrief, CuePicture, CueScene } from "@/lib/music/types";

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

/**
 * THE PICTURE, VALIDATED AS THE THING THE DURATION IS DERIVED FROM.
 *
 * Stricter than the fields around it on purpose: the total of
 * `scenes[].durS` is now the number of seconds of audio this route asks the
 * vendor for, so every bound the old `durS` check carried has to live here
 * instead — and each scene bounded individually, or thirty small overstatements
 * add up to one large bill.
 */
function asPicture(v: unknown): CuePicture {
  if (!v || typeof v !== "object")
    throw new BadRequest(
      '"picture" is required: a cue is a span of film, and briefing one without the film would mean inventing it.',
    );
  const p = v as Record<string, unknown>;
  const raw = p.scenes;
  if (!Array.isArray(raw) || raw.length === 0)
    throw new BadRequest('"picture.scenes" must be a non-empty array — a cue with no scenes is not a cue.');
  if (raw.length > 30) throw new BadRequest('"picture.scenes" is over 30 entries.');

  const scenes: CueScene[] = raw.map((s, i) => {
    if (!s || typeof s !== "object") throw new BadRequest(`"picture.scenes[${i}]" must be an object.`);
    const r = s as Record<string, unknown>;
    return {
      index: asNumber(r.index, `picture.scenes[${i}].index`, 0, 10_000),
      slug: asString(r.slug, `picture.scenes[${i}].slug`, 200),
      mood: asString(r.mood, `picture.scenes[${i}].mood`, 200),
      startS: asNumber(r.startS, `picture.scenes[${i}].startS`, 0, 36_000),
      durS: asNumber(r.durS, `picture.scenes[${i}].durS`, 0, 600),
    };
  });

  const totalS = scenes.reduce((n, s) => n + s.durS, 0);
  if (totalS < 3 || totalS > 600)
    throw new BadRequest(
      `The picture totals ${totalS}s; the vendor renders 3s..600s, and this route buys exactly the picture's length.`,
    );

  return {
    projectTitle: asString(p.projectTitle, "picture.projectTitle", 200),
    logline: typeof p.logline === "string" ? p.logline.trim().slice(0, 600) : "",
    scenes,
  };
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
      styleBlock: asStrings(body.styleBlock, "styleBlock", 40),
      avoid: asStrings(body.avoid, "avoid", 40),
      picture: asPicture(body.picture),
    };

    const out = await composeMusic(cueToPlan(cue));
    return Response.json(out);
  } catch (e) {
    if (e instanceof BadRequest) return Response.json({ detail: e.message, code: "bad-request" }, { status: 400 });
    if (e instanceof MusicError) return Response.json({ detail: e.message, code: e.kind }, { status: statusFor(e.kind) });
    return Response.json({ detail: "The music call failed unexpectedly.", code: "failed" }, { status: 500 });
  }
}
