// The ElevenLabs music provider — the only file that knows the vendor's wire
// format. SERVER ONLY: reads ELEVENLABS_API_KEY, which is never NEXT_PUBLIC_.
//
// Wire facts (docs resolved 2026-08-26, expect drift):
//   POST https://api.elevenlabs.io/v1/music
//   auth: `xi-api-key` header
//   body: { composition_plan | prompt, model_id, output_format }
//   music_v2 composition_plan: { chunks: [{ text, duration_ms,
//     positive_styles, negative_styles, context_adherence }] }
//   chunk duration 3_000..120_000 ms, ≤30 chunks, total 3 s..10 min
//   response: the encoded audio itself (bytes, not JSON)
//
// The key is read lazily per call, like lib/imaging/env.ts: a route handler
// that booted before .env.local was filled must not hold a stale absence.

import { MusicError } from "./errors";
import type {
  DetailedMusicResult,
  MusicPlan,
  MusicResult,
  PlanSection,
  SfxResult,
  WirePlan,
} from "./types";

const ENDPOINT = "https://api.elevenlabs.io/v1/music";
const PLAN_ENDPOINT = "https://api.elevenlabs.io/v1/music/plan";
const DETAILED_ENDPOINT = "https://api.elevenlabs.io/v1/music/detailed";
const SFX_ENDPOINT = "https://api.elevenlabs.io/v1/sound-generation";
const MODEL_ID = "music_v2";
const OUTPUT_FORMAT = "mp3_44100_128";
/** Music generation is slow; give the vendor room but not forever. */
const TIMEOUT_MS = 240_000;

export const MUSIC_KEY_VAR = "ELEVENLABS_API_KEY";

function keyOrThrow(): string {
  const v = process.env[MUSIC_KEY_VAR];
  if (!v || !v.trim())
    throw new MusicError(
      "no-key",
      `No ${MUSIC_KEY_VAR} configured — the music engine is off, not broken. Set it server-side.`,
    );
  return v.trim();
}

export function isMusicConfigured(): boolean {
  const v = process.env[MUSIC_KEY_VAR];
  return Boolean(v && v.trim());
}

/** One section → one wire chunk. The section name rides in square brackets,
 *  directions in braces, lyric lines verbatim — the vendor's text grammar. */
function toChunk(s: PlanSection) {
  const parts = [`[${s.name}]`];
  for (const d of s.directions ?? []) parts.push(`{${d}}`);
  for (const line of s.lyrics ?? []) parts.push(line);
  return {
    text: parts.join("\n"),
    duration_ms: s.durationMs,
    positive_styles: s.positiveStyles,
    negative_styles: s.negativeStyles,
    context_adherence: s.adherence ?? "high",
  };
}

/**
 * A vendor's non-ok response, classified.
 *
 * ORDER IS THE DEFECT THIS FIXES. Both call sites used to compute
 * `refusal = status === 451 || /moderat|policy|not allowed|prohibited/i.test(detail)`
 * and throw on it BEFORE checking 429 / 401 / 403 — so a definite status was
 * overruled by a fuzzy word match against the vendor's prose. "policy" is
 * ordinary vocabulary in a rate-limit or auth body ("quota policy exceeded",
 * "your API key policy does not allow this model"), and the two outcomes are
 * opposites in this codebase: `refused` is a routing decision the Score surface
 * renders as refused-silence and NEVER retries (see errors.ts), while
 * `rate-limited` is precisely the one a caller should retry with backoff. A
 * throttled request was therefore capable of being recorded as the model
 * declining the brief, permanently, and a rejected key as the same.
 *
 * So: the codes the vendor states outright are read first, and the text
 * heuristic is the LAST resort, reached only for a status that says nothing on
 * its own. 451 stays a refusal by status - that is what the code means.
 */
function vendorFailure(status: number, detail: string, what: string): MusicError {
  const tail = detail.slice(0, 300);
  if (status === 429) return new MusicError("rate-limited", "Vendor rate limit; retry with backoff.");
  if (status === 401 || status === 403)
    return new MusicError("no-key", `The vendor rejected the key (${status}).`);
  if (status === 451) return new MusicError("refused", `The model declined this ${what}: ${tail}`);
  if (status >= 500) return new MusicError("failed", `Vendor answered ${status}: ${tail}`);
  // Only now, and only for a 4xx that named no reason of its own.
  if (/moderat|policy|not allowed|prohibited/i.test(detail))
    return new MusicError("refused", `The model declined this ${what}: ${tail}`);
  return new MusicError("bad-request", `Vendor answered ${status}: ${tail}`);
}

export async function composeMusic(
  plan: MusicPlan,
  /** The deadline, injectable exactly as runClaude's is: a probe cannot wait
   *  four minutes to prove the body read is covered by it. */
  timeoutMs: number = TIMEOUT_MS,
): Promise<MusicResult> {
  const key = keyOrThrow();

  const totalMs = plan.sections.reduce((n, s) => n + s.durationMs, 0);
  if (plan.sections.length === 0 || plan.sections.length > 30)
    throw new MusicError("bad-request", `A plan carries 1..30 sections; this one has ${plan.sections.length}.`);
  if (totalMs < 3_000 || totalMs > 600_000)
    throw new MusicError("bad-request", `Total duration ${totalMs}ms is outside the vendor's 3s..10min window.`);
  for (const s of plan.sections)
    if (s.durationMs < 3_000 || s.durationMs > 120_000)
      throw new MusicError("bad-request", `Section "${s.name}" is ${s.durationMs}ms; sections run 3s..120s.`);

  const body = {
    model_id: MODEL_ID,
    output_format: OUTPUT_FORMAT,
    composition_plan: { chunks: plan.sections.map(toChunk) },
  };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "xi-api-key": key, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch (e) {
    throw new MusicError(
      (e as Error).name === "AbortError" ? "timeout" : "failed",
      (e as Error).name === "AbortError"
        ? `The vendor did not answer within ${timeoutMs / 1000}s.`
        : `The vendor could not be reached: ${(e as Error).message}`,
    );
  }

  // THE TIMER SPANS THE BODY, NOT JUST THE HEADERS. It used to be cleared in a
  // `finally` on the fetch, which resolves when the RESPONSE HEAD arrives - so
  // the megabyte-scale audio download below ran with no deadline of its own. A
  // vendor that answered 200 and then stalled mid-stream was not a timeout here;
  // it was a handler that sat until the platform's maxDuration killed it, with
  // no error naming the vendor and nothing distinguishing it from a slow render.
  // `signal` is already on the request, and an abort mid-body rejects the body
  // read, so the deadline reaches it for free once the timer is left running.
  let bytes: Buffer;
  try {
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw vendorFailure(res.status, detail, "brief");
    }
    bytes = Buffer.from(await res.arrayBuffer());
  } catch (e) {
    if (e instanceof MusicError) throw e;
    throw new MusicError(
      (e as Error).name === "AbortError" ? "timeout" : "bad-response",
      (e as Error).name === "AbortError"
        ? `The vendor began answering but did not finish within ${timeoutMs / 1000}s.`
        : `The vendor's response could not be read: ${(e as Error).message}`,
    );
  } finally {
    clearTimeout(timer);
  }

  if (bytes.length < 1_000)
    throw new MusicError("bad-response", `The vendor returned ${bytes.length} bytes — not audio.`);

  return {
    audio: { b64: bytes.toString("base64"), mime: "audio/mpeg" },
    provenance: {
      vendor: "elevenlabs",
      modelId: MODEL_ID,
      requestedMs: totalMs,
      plan,
      generatedAt: new Date().toISOString(),
    },
  };
}

// ── Raw feature surface (playground) ────────────────────────────────────────
//
// The functions below expose the vendor's wire-level features — free plan
// drafting, detailed compose with inpainting storage, section editing via
// chunk references, and text-to-SFX — with the same key handling, timeout and
// error taxonomy as composeMusic. They exist so the playground can exercise
// the feature set exactly as shipped; production surfaces keep going through
// the doctrine-shaped composeMusic path.

async function vendorFetch(url: string, body: unknown): Promise<Response> {
  const key = keyOrThrow();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "xi-api-key": key, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch (e) {
    throw new MusicError(
      (e as Error).name === "AbortError" ? "timeout" : "failed",
      (e as Error).name === "AbortError"
        ? `The vendor did not answer within ${TIMEOUT_MS / 1000}s.`
        : `The vendor could not be reached: ${(e as Error).message}`,
    );
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw vendorFailure(res.status, detail, "request");
  }
  return res;
}

/** Draft a composition plan from a prompt — COSTS NO CREDITS, which makes it
 *  the iteration surface: shape the structure for free, spend on renders. */
export async function draftPlan(req: {
  prompt: string;
  lengthMs?: number;
  style?: string;
  negativeStyle?: string;
  sourcePlan?: WirePlan;
}): Promise<WirePlan> {
  const res = await vendorFetch(PLAN_ENDPOINT, {
    prompt: req.prompt,
    model_id: MODEL_ID,
    ...(req.lengthMs ? { music_length_ms: req.lengthMs } : {}),
    ...(req.style ? { style: req.style } : {}),
    ...(req.negativeStyle ? { negative_style: req.negativeStyle } : {}),
    ...(req.sourcePlan ? { source_composition_plan: req.sourcePlan } : {}),
  });
  const json = (await res.json().catch(() => null)) as WirePlan | null;
  if (!json || !Array.isArray(json.chunks))
    throw new MusicError("bad-response", "The plan endpoint did not return { chunks: [...] }.");
  return json;
}

/** Split a multipart body into its parts (headers + body bytes). Dependency-
 *  free on purpose, and only as general as the vendor's response needs. */
function splitMultipart(buf: Buffer, boundary: string): { headers: string; body: Buffer }[] {
  const delim = Buffer.from(`--${boundary}`);
  const parts: { headers: string; body: Buffer }[] = [];
  let at = buf.indexOf(delim);
  while (at !== -1) {
    const next = buf.indexOf(delim, at + delim.length);
    if (next === -1) break;
    const chunk = buf.subarray(at + delim.length, next);
    const sep = chunk.indexOf("\r\n\r\n");
    if (sep !== -1) {
      // Trim the leading CRLF after the boundary and the trailing CRLF before
      // the next one.
      const headers = chunk.subarray(0, sep).toString("utf8").trim();
      const body = chunk.subarray(sep + 4, chunk.length - 2);
      parts.push({ headers, body });
    }
    at = next;
  }
  return parts;
}

/**
 * Compose via the detailed endpoint: audio PLUS the vendor's own plan and
 * metadata, and — when `storeForInpainting` — the song id that section edits
 * reference. Accepts either a prompt or a wire plan; a wire plan may mix
 * generation chunks with audio-reference chunks, which is how a section edit
 * keeps the approved sections byte-for-byte.
 */
export async function composeDetailed(req: {
  prompt?: string;
  plan?: WirePlan;
  lengthMs?: number;
  storeForInpainting?: boolean;
}): Promise<DetailedMusicResult> {
  if (!req.prompt === !req.plan)
    throw new MusicError("bad-request", "Send exactly one of prompt / plan.");
  const res = await vendorFetch(DETAILED_ENDPOINT, {
    model_id: MODEL_ID,
    output_format: OUTPUT_FORMAT,
    ...(req.prompt ? { prompt: req.prompt } : {}),
    ...(req.plan ? { composition_plan: req.plan } : {}),
    ...(req.lengthMs && req.prompt ? { music_length_ms: req.lengthMs } : {}),
    ...(req.storeForInpainting ? { store_for_inpainting: true } : {}),
  });

  // The song id travels in a response header; the exact name is treated as
  // vendor-owned, so match any header that carries "song".
  let songId: string | null = null;
  res.headers.forEach((v, k) => {
    if (/song[-_]?id/i.test(k)) songId = v;
  });

  const ctype = res.headers.get("content-type") ?? "";
  let audio: Buffer | null = null;
  let plan: WirePlan | null = null;
  let meta: Record<string, unknown> | null = null;

  if (ctype.includes("multipart")) {
    const boundary = ctype.match(/boundary=([^;]+)/)?.[1]?.replace(/"/g, "");
    if (!boundary) throw new MusicError("bad-response", "Multipart response without a boundary.");
    for (const part of splitMultipart(Buffer.from(await res.arrayBuffer()), boundary)) {
      if (/application\/json/i.test(part.headers)) {
        const j = JSON.parse(part.body.toString("utf8")) as Record<string, unknown>;
        plan = (j.composition_plan as WirePlan) ?? plan;
        songId = (j.song_id as string) ?? songId;
        meta = (j.song_metadata as Record<string, unknown>) ?? j;
      } else if (/audio\//i.test(part.headers)) {
        audio = part.body;
      }
    }
  } else if (ctype.includes("application/json")) {
    const j = (await res.json()) as Record<string, unknown>;
    plan = (j.composition_plan as WirePlan) ?? null;
    songId = (j.song_id as string) ?? songId;
    meta = (j.song_metadata as Record<string, unknown>) ?? j;
    const b64 = (j.audio_base_64 as string) ?? (j.audio as string);
    if (typeof b64 === "string") audio = Buffer.from(b64, "base64");
  } else {
    audio = Buffer.from(await res.arrayBuffer());
  }

  if (!audio || audio.length < 1_000)
    throw new MusicError("bad-response", `No usable audio in the detailed response (content-type ${ctype}).`);
  return { audio: { b64: audio.toString("base64"), mime: "audio/mpeg" }, songId, plan, meta };
}

/** Text-to-SFX: envelope-first prompt in, one sound out. The adherence dial
 *  (`prompt_influence`) defaults low vendor-side — tuned for fishing — so
 *  spec-shaped briefs should pass an explicit high value. */
export async function generateSfx(req: {
  text: string;
  durationSeconds?: number;
  promptInfluence?: number;
  loop?: boolean;
}): Promise<SfxResult> {
  if (req.durationSeconds !== undefined && (req.durationSeconds < 0.5 || req.durationSeconds > 30))
    throw new MusicError("bad-request", "SFX duration runs 0.5..30 seconds.");
  if (req.promptInfluence !== undefined && (req.promptInfluence < 0 || req.promptInfluence > 1))
    throw new MusicError("bad-request", "prompt_influence runs 0..1.");
  const res = await vendorFetch(SFX_ENDPOINT, {
    text: req.text,
    model_id: "eleven_text_to_sound_v2",
    ...(req.durationSeconds !== undefined ? { duration_seconds: req.durationSeconds } : {}),
    ...(req.promptInfluence !== undefined ? { prompt_influence: req.promptInfluence } : {}),
    ...(req.loop !== undefined ? { loop: req.loop } : {}),
  });
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length < 500)
    throw new MusicError("bad-response", `The vendor returned ${bytes.length} bytes — not audio.`);
  return {
    audio: { b64: bytes.toString("base64"), mime: "audio/mpeg" },
    requestedSeconds: req.durationSeconds ?? null,
  };
}
