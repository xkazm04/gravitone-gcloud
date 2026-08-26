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
import type { MusicPlan, MusicResult, PlanSection } from "./types";

const ENDPOINT = "https://api.elevenlabs.io/v1/music";
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

export async function composeMusic(plan: MusicPlan): Promise<MusicResult> {
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
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
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
        ? `The vendor did not answer within ${TIMEOUT_MS / 1000}s.`
        : `The vendor could not be reached: ${(e as Error).message}`,
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    // 400s that read as content policy are refusals — a routing outcome the
    // Score surface renders as refused-silence, never a retry loop.
    const refusal = res.status === 451 || /moderat|policy|not allowed|prohibited/i.test(detail);
    if (refusal) throw new MusicError("refused", `The model declined this brief: ${detail.slice(0, 300)}`);
    if (res.status === 429) throw new MusicError("rate-limited", "Vendor rate limit; retry with backoff.");
    if (res.status === 401 || res.status === 403)
      throw new MusicError("no-key", `The vendor rejected the key (${res.status}).`);
    throw new MusicError(res.status >= 500 ? "failed" : "bad-request", `Vendor answered ${res.status}: ${detail.slice(0, 300)}`);
  }

  const bytes = Buffer.from(await res.arrayBuffer());
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
