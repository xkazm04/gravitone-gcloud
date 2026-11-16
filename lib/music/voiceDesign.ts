// THE VOICE DESIGN DOOR (spark concept-casting-stages S3): ElevenLabs voice design, creation and direct speech for a
// production's casting, ported from PoF's provider (src/lib/audio-gen/providers/elevenlabs-speech.ts, src/lib/voice/design.ts).
// SERVER ONLY, as the rest of lib/music: it reaches the vendor through lib/music/elevenlabs.ts `vendorFetch`.
//
// Wire facts (PoF's provider, read 2026-11-09; never yet called from this repo with a real key):
//   POST /v1/text-to-voice/design  { voice_description, model_id, text, auto_generate_text:false }
//     previews[].{ audio_base_64, generated_voice_id, duration_secs }; at most 3 per call
//   POST /v1/text-to-voice         { voice_name, voice_description, generated_voice_id } -> { voice_id }
//   POST /v1/text-to-speech/{id}   { text, model_id } -> audio bytes
//   GET  /v1/user/subscription     { character_count, ... }
//
// NO BUDGET, operator's decision: nothing here reserves or refuses on credits, so `speak`'s ceiling is not used. What a
// call consumed is READ from the API and reported per round (see `CreditReading`); it is never computed from the text.
//
// A preview comes from the design call. `POST /v1/text-to-voice` spends one of the account's voice slots (17 of 30 used,
// read 2026-11-09), so `createVoice` runs only for the operator's pick.
//
// DIRECTION IS AUDIO TAGS, WHICH ONLY v3 READS. Other models speak `[whispers]` aloud, so a spoken text with tags on a
// non-v3 model is refused, whichever door it came through. The design model is not v3: an audition script carries no tags.

import { err, ok, errorMessage, type AppErrorCode, type Result } from "@gt/domain/errors";
import type { CreditRead, ProductionRole } from "@gt/domain/production";

import type { Spawn } from "../foundry/scout/ingest";
import { VOICE_ID_RE, vendorFetch } from "./elevenlabs";
import { MusicError, type MusicErrorKind } from "./errors";
import { logCall } from "./log";
import { priceCall, type MusicOp } from "./pricing";

const API = "https://api.elevenlabs.io";
const DESIGN_ENDPOINT = `${API}/v1/text-to-voice/design`;
const CREATE_ENDPOINT = `${API}/v1/text-to-voice`;
const SUBSCRIPTION_ENDPOINT = `${API}/v1/user/subscription`;
const SPEECH_ENDPOINT = `${API}/v1/text-to-speech`;
const OUTPUT_FORMAT = "mp3_44100_128";

/** The speech model: the only one that performs audio tags. */
export const SPEECH_MODEL = "eleven_v3";
/** The voice design model. Previews are spoken by it, so what it speaks carries no tags. */
export const DESIGN_MODEL = "eleven_multilingual_ttv_v2";
export const PREVIEWS_PER_CALL = 3;
/** The vendor's limits on the text a design call speaks. */
export const AUDITION_MIN = 100;
export const AUDITION_MAX = 1000;
const DESCRIPTION_MAX = 1000;
/** PoF's clause: no reference audio is ever sent, and the description says the voice imitates nobody. */
export const ORIGINAL_VOICE_CLAUSE = "An original fictional character voice; not an imitation of any real person.";

/* ── Audio tags ───────────────────────────────────────────────────────────── */

const TAG_RE = /\[[^\][\n]{1,60}\]/;

export const supportsAudioTags = (model: string): boolean => model === SPEECH_MODEL;

/** "whispered, panicking" as v3 audio tags: "[whispered] [panicking]". */
export const directionTags = (direction: string): string =>
  direction
    .split(/[,;\n]/)
    .map((s) => s.trim().replace(/[[\]]/g, ""))
    .filter(Boolean)
    .map((s) => `[${s}]`)
    .join(" ");

/** Why this text cannot be spoken by this model; undefined when it can. */
export const tagRefusal = (text: string, model: string): string | undefined =>
  !supportsAudioTags(model) && TAG_RE.test(text) ? `voice: ${model} speaks audio tags aloud; only ${SPEECH_MODEL} performs them` : undefined;

/* ── The credit reading ───────────────────────────────────────────────────── */

const CREDIT_HEADER = "character-cost";
/** The balance is read after the call and lags it: 10-60 s measured on compose (lib/music/pricing.ts). */
const BALANCE_TRIES = 6;
const BALANCE_WAIT_MS = 10_000;

/**
 * What one call consumed, as the API said it. `read` is the source: the `character-cost` response header, else the
 * subscription's `character_count` delta (which also counts anything else the account spent meanwhile). `unread` is
 * neither: nothing was invented, and `why` says what failed.
 */
export type CreditReading = { readonly used: number; readonly read: Exclude<CreditRead, "unread"> } | { readonly used: 0; readonly read: "unread"; readonly why: string };

export type VoiceDeps = { readonly sleep?: (ms: number) => Promise<void> };
const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function headerCredits(res: Response): number | undefined {
  const raw = res.headers.get(CREDIT_HEADER);
  if (raw === null || raw.trim() === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : undefined;
}

/** The account's used characters, or the sentence saying why they could not be read. */
async function balance(): Promise<number | string> {
  try {
    const json = await vendorFetch(SUBSCRIPTION_ENDPOINT, undefined, (res) => res.json() as Promise<{ character_count?: unknown }>);
    return typeof json.character_count === "number" ? json.character_count : "the subscription carried no character_count";
  } catch (e) {
    return `the subscription could not be read: ${errorMessage(e)}`;
  }
}

/** Runs `call` with the balance read around it. The header wins when the vendor sends one. */
async function credited<T>(deps: VoiceDeps, call: (hear: (res: Response) => void) => Promise<T>): Promise<{ readonly value: T; readonly credits: CreditReading }> {
  const before = await balance();
  let header: number | undefined;
  const value = await call((res) => {
    header = headerCredits(res);
  });
  if (header !== undefined) return { value, credits: { used: header, read: "character-cost-header" } };
  if (typeof before === "string") return { value, credits: { used: 0, read: "unread", why: before } };
  const sleep = deps.sleep ?? wait;
  let after = await balance();
  for (let i = 1; i < BALANCE_TRIES && typeof after === "number" && after === before; i += 1) {
    await sleep(BALANCE_WAIT_MS);
    after = await balance();
  }
  if (typeof after === "string") return { value, credits: { used: 0, read: "unread", why: after } };
  if (after < before) return { value, credits: { used: 0, read: "unread", why: `the balance fell from ${before} to ${after}: the plan's period rolled over` } };
  return { value, credits: { used: after - before, read: "subscription-delta" } };
}

/* ── Failure ──────────────────────────────────────────────────────────────── */

/**
 * `unavailable` is the one code a job retries: the vendor refused or could not be reached, and billed nothing. A timeout
 * is not in it: `BILLED_ON_FAILURE` says the render may have run, and a retry would pay for it twice.
 */
const CODES: Readonly<Record<MusicErrorKind, AppErrorCode>> = {
  "rate-limited": "unavailable",
  failed: "unavailable",
  timeout: "internal",
  "bad-response": "internal",
  "bad-request": "invalid",
  refused: "refused",
  "no-key": "unauthenticated",
  "over-budget": "refused",
};

function failure(op: MusicOp, started: number, e: unknown): Result<never> {
  const x = e instanceof MusicError ? e : new MusicError("failed", errorMessage(e));
  logCall({ op, ms: Date.now() - started, seconds: 0, kind: x.kind, message: x.message });
  return err(CODES[x.kind], x.message);
}

function served(op: MusicOp, started: number, model: string, chars: number): void {
  const q = priceCall({ op, model, seconds: 0 });
  logCall({ op, ms: Date.now() - started, seconds: 0, chars, model, basis: q.basis });
}

/* ── Design ───────────────────────────────────────────────────────────────── */

export type VoiceDesignRequest = {
  /** The role's voice brief, with direction tags. Described, not spoken. */
  readonly brief: string;
  /** The per-role audition script every preview speaks. */
  readonly script: string;
  /** How many options; 3 per call, over as many calls as it takes. */
  readonly count: number;
};

export type DesignedPreview = { readonly generatedVoiceId: string; readonly bytes: Uint8Array; readonly durationMs?: number };

export type VoiceDesignResult = {
  readonly previews: readonly DesignedPreview[];
  readonly calls: readonly CreditReading[];
};

/** Why an audition script cannot be sent; undefined when it can. */
export function auditionRefusal(script: string): string | undefined {
  const n = script.trim().length;
  if (n < AUDITION_MIN || n > AUDITION_MAX) return `voice: an audition script is ${AUDITION_MIN}-${AUDITION_MAX} characters, this one ${n}`;
  return tagRefusal(script, DESIGN_MODEL);
}

export const designCallsFor = (count: number): number => Math.ceil(count / PREVIEWS_PER_CALL);
/** How many previews call `k` (from 1) of a round of `count` contributes: the last one takes only what is left. */
export const previewsOfCall = (count: number, k: number): number => Math.min(PREVIEWS_PER_CALL, count - (k - 1) * PREVIEWS_PER_CALL);

const describe = (brief: string): string => `${brief.trim().slice(0, DESCRIPTION_MAX - ORIGINAL_VOICE_CLAUSE.length - 2)}. ${ORIGINAL_VOICE_CLAUSE}`;

type WirePreview = { readonly audio_base_64?: unknown; readonly generated_voice_id?: unknown; readonly duration_secs?: unknown };

function previewsIn(json: { readonly previews?: readonly WirePreview[] }, want: number): DesignedPreview[] {
  const out: DesignedPreview[] = [];
  for (const p of (json.previews ?? []).slice(0, want)) {
    if (typeof p.audio_base_64 !== "string" || typeof p.generated_voice_id !== "string") throw new MusicError("bad-response", "A design preview came without its audio or its id.");
    const bytes = new Uint8Array(Buffer.from(p.audio_base_64, "base64"));
    if (bytes.byteLength < 500) throw new MusicError("bad-response", `A design preview was ${bytes.byteLength} bytes: not speech.`);
    out.push({ generatedVoiceId: p.generated_voice_id, bytes, ...(typeof p.duration_secs === "number" ? { durationMs: Math.round(p.duration_secs * 1000) } : {}) });
  }
  if (out.length < want) throw new MusicError("bad-response", `The design call answered ${out.length} previews, ${want} were asked for.`);
  return out;
}

/** One round's previews, `count` of them over as many calls as it takes. Nothing is created: a preview is not a voice. */
export async function designVoices(request: VoiceDesignRequest, deps: VoiceDeps = {}): Promise<Result<VoiceDesignResult>> {
  const refusal = auditionRefusal(request.script);
  if (refusal !== undefined) return err("refused", refusal);
  if (!Number.isInteger(request.count) || request.count < 1) return err("invalid", `voice: ${request.count} is not a number of voices`);
  const started = Date.now();
  const script = request.script.trim();
  try {
    const previews: DesignedPreview[] = [];
    const calls: CreditReading[] = [];
    for (let k = 1; k <= designCallsFor(request.count); k += 1) {
      const want = previewsOfCall(request.count, k);
      const r = await credited(deps, (hear) =>
        vendorFetch(
          `${DESIGN_ENDPOINT}?output_format=${OUTPUT_FORMAT}`,
          { voice_description: describe(request.brief), model_id: DESIGN_MODEL, text: script, auto_generate_text: false },
          async (res) => {
            hear(res);
            return previewsIn((await res.json()) as { previews?: readonly WirePreview[] }, want);
          },
        ),
      );
      previews.push(...r.value);
      calls.push(r.credits);
    }
    served("voice-design", started, DESIGN_MODEL, script.length * calls.length);
    return ok({ previews, calls });
  } catch (e) {
    return failure("voice-design", started, e);
  }
}

/* ── Create, on the operator's pick only ──────────────────────────────────── */

/** Create the vendor voice from the picked preview; returns the vendor's voice id. Spends a voice slot. */
export async function createVoice(input: { readonly generatedVoiceId: string; readonly name: string; readonly brief: string }): Promise<Result<{ readonly voiceId: string }>> {
  const started = Date.now();
  try {
    const voiceId = await vendorFetch(CREATE_ENDPOINT, { voice_name: input.name.slice(0, 100), voice_description: describe(input.brief), generated_voice_id: input.generatedVoiceId }, async (res) => {
      const json = (await res.json()) as { voice_id?: unknown };
      if (typeof json.voice_id !== "string" || json.voice_id === "") throw new MusicError("bad-response", "The vendor created no voice_id.");
      return json.voice_id;
    });
    served("voice-design", started, DESIGN_MODEL, 0);
    return ok({ voiceId });
  } catch (e) {
    return failure("voice-design", started, e);
  }
}

/* ── Speech in a cast voice ───────────────────────────────────────────────── */

/** A production's voice is its role's cast. There is no default: George is the narration part's (partOptions.ts), and expires. */
export function castVoiceIdOf(role: ProductionRole): Result<string> {
  return role.cast === undefined ? err("refused", `voice: role ${role.id} has no cast voice yet`) : ok(role.cast.voiceId);
}

export type SpokenWithVoice = { readonly bytes: Uint8Array; readonly mime: "audio/mpeg"; readonly sentText: string; readonly credits: CreditReading };

/** One line in `voiceId`. `direction` becomes v3 audio tags; a model that would speak them aloud is refused. */
export async function speakWithVoice(text: string, opts: { readonly voiceId: string; readonly direction?: string; readonly model?: string }, deps: VoiceDeps = {}): Promise<Result<SpokenWithVoice>> {
  const model = opts.model ?? SPEECH_MODEL;
  const tags = directionTags(opts.direction ?? "");
  const sentText = tags === "" ? text.trim() : `${tags} ${text.trim()}`;
  const refusal = tagRefusal(sentText, model);
  if (refusal !== undefined) return err("refused", refusal);
  if (text.trim() === "") return err("invalid", "voice: a line to speak needs words");
  if (!VOICE_ID_RE.test(opts.voiceId)) return err("invalid", `voice: "${opts.voiceId.slice(0, 80)}" is not an ElevenLabs voice id`);
  const started = Date.now();
  try {
    const r = await credited(deps, (hear) =>
      vendorFetch(`${SPEECH_ENDPOINT}/${opts.voiceId}?output_format=${OUTPUT_FORMAT}`, { text: sentText, model_id: model }, async (res) => {
        hear(res);
        const bytes = new Uint8Array(await res.arrayBuffer());
        if (bytes.byteLength < 500) throw new MusicError("bad-response", `The vendor returned ${bytes.byteLength} bytes: not speech.`);
        return bytes;
      }),
    );
    served("tts", started, model, [...sentText].length);
    return ok({ bytes: r.value, mime: "audio/mpeg", sentText, credits: r.credits });
  } catch (e) {
    return failure("tts", started, e);
  }
}

/* ── The audition line ────────────────────────────────────────────────────── */

export type AuditionRole = { readonly role: string; readonly brief: string; readonly logline: string };
/** Writes one role's audition line from the concept. S4 binds the real writer. */
export type AuditionWriter = (role: AuditionRole) => Promise<string>;

/** A writer for tests: the same role always gets the same line, long enough to send. */
export const fakeAuditionWriter: AuditionWriter = async ({ role, brief, logline }) => `${role} speaks for the audition. ${brief} The story is this: ${logline} Every candidate reads these same words, so only the voice differs.`;

/** The line a role auditions with, checked against what the design call accepts. */
export async function writeAudition(writer: AuditionWriter, role: AuditionRole): Promise<Result<string>> {
  try {
    const line = (await writer(role)).trim();
    const refusal = auditionRefusal(line);
    return refusal === undefined ? ok(line) : err("refused", refusal);
  } catch (e) {
    return err("unavailable", `voice: the audition line could not be written: ${errorMessage(e)}`);
  }
}

/* ── One level before comparison ──────────────────────────────────────────── */

/**
 * The level every preview is mastered to, PoF's voice target (lib/voice/mastering.ts `DEFAULT_VOICE_TARGET`), inside
 * this repo's `voice-take` range (packages/domain/src/audio.accept.ts). PoF found previews up to ~9 LU apart.
 */
export const PREVIEW_LEVEL = { lufs: -18, truePeakDb: -2, lra: 11 } as const;

const FFMPEG_TIMEOUT_MS = 60_000;
const FFMPEG_BUFFER = 8 * 1024 * 1024;
const TARGET = `loudnorm=I=${PREVIEW_LEVEL.lufs}:TP=${PREVIEW_LEVEL.truePeakDb}:LRA=${PREVIEW_LEVEL.lra}`;

/** The JSON block loudnorm prints last on stderr. */
function loudnormOf(stderr: string): Readonly<Record<string, string>> | undefined {
  const at = stderr.lastIndexOf("{");
  if (at === -1) return undefined;
  try {
    return JSON.parse(stderr.slice(at)) as Record<string, string>;
  } catch {
    return undefined;
  }
}

const finite = (s: string | undefined): s is string => s !== undefined && Number.isFinite(Number(s));

/**
 * Two-pass loudnorm, spawned without a shell: the first pass measures this file, the second applies that measurement
 * linearly, so a preview changes level and not dynamics. Returns the level ffmpeg reports for the file it wrote.
 */
export async function levelPreview(tool: { readonly spawn: Spawn; readonly ffmpeg: string }, input: string, output: string): Promise<Result<{ readonly lufs: number }>> {
  const limits = { timeoutMs: FFMPEG_TIMEOUT_MS, maxBuffer: FFMPEG_BUFFER };
  const first = await tool.spawn(tool.ffmpeg, ["-hide_banner", "-nostats", "-i", input, "-af", `${TARGET}:print_format=json`, "-f", "null", "-"], limits);
  if (!first.ok) return err("unavailable", `ffmpeg could not measure a preview: ${first.error}`);
  const m = loudnormOf(first.stderr);
  if (m === undefined || ![m["input_i"], m["input_tp"], m["input_lra"], m["input_thresh"], m["target_offset"]].every(finite)) return err("unavailable", "a preview has no measurable loudness; it may be silent");
  const applied = `${TARGET}:measured_I=${m["input_i"]}:measured_TP=${m["input_tp"]}:measured_LRA=${m["input_lra"]}:measured_thresh=${m["input_thresh"]}:offset=${m["target_offset"]}:linear=true:print_format=json`;
  const second = await tool.spawn(tool.ffmpeg, ["-hide_banner", "-nostats", "-y", "-i", input, "-af", applied, "-ar", "44100", "-c:a", "libmp3lame", "-b:a", "128k", output], limits);
  if (!second.ok) return err("unavailable", `ffmpeg could not level a preview: ${second.error}`);
  const out = loudnormOf(second.stderr)?.["output_i"];
  if (!finite(out)) return err("unavailable", "ffmpeg leveled a preview and reported no output loudness");
  return ok({ lufs: Math.round(Number(out) * 10) / 10 });
}
