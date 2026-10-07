// THE `poster-generate` TURN KIND — the music-video poster, as server work.
// SERVER ONLY. (AIO-A tail: the first WORK kind, beside the text kinds.)
//
// A poster is ~57 s through `agy` and PAID. Before this it was a client-driven
// job: a reload rewrote it `interrupted`, the server kept generating, and the
// image was billed and thrown away because its only consumer was a closure in
// a dead tab. As a work kind the answer is KEPT, and the tab only watches.
//
// OPERATOR DECISION T1 (ask 61a88b35, "Yes, keep what is paid for"): the poster
// is a server work kind with `cancellable: false`. The imaging router's
// `generate()` takes no signal, so nothing below this kind can abort the vendor
// call; a cancel would only write `cancelled` over a call still billing.
// `cancelTurn` answers `not-cancellable` and the tab draws no Stop.
//
// WHAT IS HERE
//   · prepare  = validates `{ style }` (a string, at most MAX_STYLE_CHARS) and
//                builds the prompt. THE RIGHTS RULE LIVES HERE NOW, unchanged
//                from useMusicVideoComposition: the prompt NEVER carries a track
//                filename, ID3 data or an artist — the only track-derived input
//                is the creator's own freely-typed style line. The server takes
//                no track field at all, so a client cannot leak one through it.
//   · work     = `generate({ prompt, aspect: "16:9", count: 1 })` — the imaging
//                router, which reserves and settles on the IMAGING meter. No new
//                meter, no new spend path, no text spend row.
//   · result   = `{ base64, mime, provider }`; receipt = `{ lane: "imaging",
//                provenance }`. The record keeps `promptDigest`, never the
//                prompt (lib/turns/ledger.ts).
//
// ACCEPTED COST: the ledger never prunes, so each poster leaves its base64
// (about 1-2 MB) in foundry-out/turns/ for good.
//
// Serialised: one live poster per project, as lib/jobs.tsx's SERIALISED had it.
//
// REGISTERED ON IMPORT, replaceably — see the recalibrate kind for why.

import { generate } from "@/lib/imaging/router";
import { registerTurnKind, TurnInputError, type WorkSpec } from "@/lib/turns/runner";

export const POSTER_KIND = "poster-generate";

/** The creator's style line is one line of direction, not a brief. 1000 characters
 *  is several sentences — past what any prompt tail needs — and a longer one is
 *  refused rather than silently cut, so the poster never answers a different
 *  direction than the one typed. */
export const MAX_STYLE_CHARS = 1000;

export interface PosterResult {
  base64: string;
  mime: string;
  provider: string;
}

/** The prompt sent to the imaging router. NEVER the track's filename, ID3
 *  metadata or artist/song information — an album poster generated FROM a prompt
 *  that leaked the real track's title would entangle a generic "image boosting"
 *  render with a specific commercial work's identity. The only track-derived
 *  input is the creator's own style line, which they wrote for this purpose. */
export function posterPrompt(style: string): string {
  const base =
    "A single cinematic album-poster-style still image for a music video. " +
    "Dramatic lighting, rich detail, no text, no lyrics, no logos, no watermarks.";
  const trimmed = style.trim();
  return trimmed ? `${base} Visual direction: ${trimmed}.` : base;
}

export const POSTER_SPEC: WorkSpec<{ prompt: string }, PosterResult> = {
  kind: POSTER_KIND,
  lane: "imaging",
  serialised: true,
  cancellable: false,
  async prepare(raw) {
    const style = (raw && typeof raw === "object" ? (raw as { style?: unknown }).style : undefined) ?? "";
    if (typeof style !== "string") throw new TurnInputError("input.style must be text.");
    if (style.length > MAX_STYLE_CHARS)
      throw new TurnInputError(`input.style is ${style.length} characters; the limit is ${MAX_STYLE_CHARS}.`);
    const prompt = posterPrompt(style);
    return { input: { prompt }, digestOf: prompt, chars: prompt.length };
  },
  async work({ input }) {
    const out = await generate({ prompt: input.prompt, aspect: "16:9", count: 1 });
    const image = out.images[0];
    if (!image) throw new Error("The imaging router returned no image.");
    return {
      result: { base64: image.base64, mime: image.mime, provider: out.provenance.provider },
      receipt: { lane: "imaging", provenance: out.provenance },
    };
  },
};

const G = globalThis as typeof globalThis & { __gravitonePosterKind?: () => void };
G.__gravitonePosterKind?.();
G.__gravitonePosterKind = registerTurnKind(POSTER_SPEC as WorkSpec);
