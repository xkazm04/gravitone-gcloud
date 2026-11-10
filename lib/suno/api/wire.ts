// SUNO'S OFFICIAL API, ON THE WIRE - the zod shapes of what api.suno.com and its OAuth server answer.
//
// No `node:` import and no Next import: the types are shared, and a plain-node CLI (tsx) loads this
// file as it is. Every vendor body enters through `parseVendor`, which goes through the schema door
// (`@gt/domain/door`) and, on a refusal, quotes the first 300 characters of what arrived - the REST
// shapes below were read through Suno's MCP wrapper (2026-11-10), not from a call with a real token,
// so the first live call that disagrees must say what it got. Field sets are "at least": objects
// are `.loose()` (unknown keys kept) and every field not seen on every sample is optional.

import { z } from "zod";

import { parseJsonAt } from "@gt/domain/door";
import { err, type Result } from "@gt/domain/errors";

/** The most characters of a vendor body a refusal quotes. */
export const QUOTE_CHARS = 300;

/** Parse a vendor body through the door; a refusal carries the door's sentence and what arrived. */
export function parseVendor<S extends z.ZodType>(door: string, schema: S, text: string): Result<z.output<S>> {
  const r = parseJsonAt(door, schema, text);
  if (r.ok) return r as Result<z.output<S>>;
  return err("unavailable", `${r.error.message}; arrived: ${text.slice(0, QUOTE_CHARS)}`, { detail: "suno-shape" });
}

/* ── OAuth (RFC 9728, RFC 8414, RFC 7591, RFC 6749) ─────────────────────── */

export const ProtectedResource = z
  .object({ authorization_servers: z.array(z.string().url()).min(1), resource: z.string(), scopes_supported: z.array(z.string()).optional() })
  .loose();
export type ProtectedResource = z.output<typeof ProtectedResource>;

export const AuthServer = z
  .object({
    issuer: z.string().optional(),
    authorization_endpoint: z.string().url(),
    token_endpoint: z.string().url(),
    revocation_endpoint: z.string().url().optional(),
    registration_endpoint: z.string().url().optional(),
    code_challenge_methods_supported: z.array(z.string()).optional(),
  })
  .loose();
export type AuthServer = z.output<typeof AuthServer>;

export const Registration = z.object({ client_id: z.string().min(1), redirect_uris: z.array(z.string()).optional() }).loose();

export const TokenResponse = z
  .object({
    access_token: z.string().min(1),
    token_type: z.string().optional(),
    expires_in: z.coerce.number().positive().optional(),
    refresh_token: z.string().min(1).optional(),
    scope: z.string().optional(),
  })
  .loose();
export type TokenResponse = z.output<typeof TokenResponse>;

/** RFC 6749 §5.2 - the vendor's own sentence is `error_description`. */
export const OAuthErrorBody = z.object({ error: z.string(), error_description: z.string().optional() }).loose();

/** api.suno.com's refusal: `{"error":"missing API key","code":"unauthorized"}`. */
export const ApiErrorBody = z.object({ error: z.string(), code: z.string().optional() }).loose();

/* ── REST /v0 ───────────────────────────────────────────────────────────── */

const nullish = <T extends z.ZodType>(s: T) => s.nullable().optional();

export const Clip = z
  .object({
    id: z.string().min(1),
    title: nullish(z.string()),
    status: z.string(),
    created_at: nullish(z.string()),
    error: z.unknown().optional(),
    song_url: nullish(z.string()),
    cover_image_url: nullish(z.string()),
    cover_image_large_url: nullish(z.string()),
    handle: nullish(z.string()),
    liked: nullish(z.boolean()),
    visibility: nullish(z.string()),
    metadata: nullish(
      z
        .object({
          duration: nullish(z.number()),
          style: nullish(z.string()),
          lyrics: nullish(z.string()),
          description: nullish(z.string()),
          type: nullish(z.string()),
        })
        .loose(),
    ),
  })
  .loose();
export type Clip = z.output<typeof Clip>;

export const LibraryPage = z.object({ items: z.array(Clip), next_cursor: nullish(z.string()) }).loose();
export type LibraryPage = z.output<typeof LibraryPage>;

export const Usage = z
  .object({
    allowed_models: z.array(z.string()),
    features: z.array(z.string()),
    metered_features: z.record(z.string(), z.unknown()),
    suno_account: nullish(
      z
        .object({
          credits_remaining: nullish(z.number()),
          download_credits_remaining: nullish(z.number()),
          monthly_limit: nullish(z.number()),
          monthly_usage: nullish(z.number()),
          plan: nullish(z.object({ name: nullish(z.string()), period: nullish(z.string()) }).loose()),
          renews_on: nullish(z.string()),
          cancel_on: nullish(z.string()),
        })
        .loose(),
    ),
  })
  .loose();
export type Usage = z.output<typeof Usage>;

/** GET /v0/me - unseen; at least an object. */
export const Me = z.object({}).loose();
export type Me = z.output<typeof Me>;

export const Analysis = z
  .object({
    audio_id: z.string(),
    status: z.string(),
    bpm: nullish(z.number()),
    key: nullish(z.string()),
    time_signature: nullish(z.number()),
    duration_s: nullish(z.number()),
    beats: nullish(z.array(z.object({ time_s: z.number(), bar_position: nullish(z.number()) }).loose())),
    sections: nullish(z.array(z.object({ start_s: z.number(), end_s: z.number(), label: nullish(z.string()) }).loose())),
    terms: nullish(z.array(z.string())),
    labels: nullish(z.array(z.object({ label: z.string(), probability: nullish(z.number()) }).loose())),
  })
  .loose();
export type Analysis = z.output<typeof Analysis>;

export const Listen = z
  .object({ id: z.string(), audio_id: z.string().optional(), status: z.string(), created_at: nullish(z.string()), answer: nullish(z.string()), error: z.unknown().optional() })
  .loose();
export type Listen = z.output<typeof Listen>;

/** POST /v0/audio/{id}/download. Measured 2026-11-10: unconfirmed, `{"status":"requires_credit",
 *  "format":"mp3","credits_remaining":42,"message":"..."}`; confirmed, and every call after for the
 *  same song (paid once, no second credit), `{"status":"ok","format":"mp3","url":<signed S3 URL,
 *  ..._paid_wm.mp3>}` with no `credits_remaining`. Suno's tool description names `processing` (call
 *  again, at most once a second). A `url` is what makes an answer ready. */
export const Download = z
  .object({ status: z.string(), format: nullish(z.string()), url: nullish(z.string()), credits_remaining: nullish(z.number()), message: nullish(z.string()) })
  .loose();
export type Download = z.output<typeof Download>;
export type DownloadFormat = "mp3" | "wav";

/** A word's shape is unseen: `word` or `text`, `start_s`, `end_s`, `success` expected, nothing required. */
export const AlignedWord = z
  .object({ word: nullish(z.string()), text: nullish(z.string()), start_s: nullish(z.number()), end_s: nullish(z.number()), success: nullish(z.boolean()) })
  .loose();
export const Alignment = z.object({ audio_id: z.string(), status: z.string(), words: nullish(z.array(AlignedWord)) }).loose();
export type Alignment = z.output<typeof Alignment>;

/** POST /v0/audio. Custom mode carries lyrics/style/title, simple mode a description; mixing them is
 *  the vendor's 400 to give. Fields read from Suno's MCP tool schema (2026-11-10); others pass through. */
export const CreateBody = z
  .object({
    description: z.string().min(1).max(3000).optional(),
    lyrics: z.string().max(5000).optional(),
    style: z.string().max(1000).optional(),
    title: z.string().max(256).optional(),
    instrumental: z.boolean().optional(),
    model: z.string().optional(),
    negative_style: z.string().max(1000).optional(),
    duration: z.number().int().min(15).max(360).optional(),
    idempotency_key: z.string().min(1).max(255).optional(),
  })
  .loose();
export type CreateBody = z.input<typeof CreateBody>;

/** The create answer is unseen: a clip, `{clip_ids}`, both, `{clips}` or a bare clip array are accepted. */
export const CreateResponse = z.union([
  z.array(Clip).min(1),
  z
    .object({ id: z.string().optional(), clip_ids: z.array(z.string()).optional(), clips: z.array(Clip).optional() })
    .loose()
    .refine((o) => o.id !== undefined || (o.clip_ids?.length ?? 0) > 0 || (o.clips?.length ?? 0) > 0, "neither a clip id, clip_ids nor clips"),
]);

export interface Created {
  readonly clipIds: readonly string[];
  readonly clips: readonly Clip[];
}

/** One reading of every accepted create answer. */
export function createdOf(raw: z.output<typeof CreateResponse>): Result<Created> {
  if (Array.isArray(raw)) return { ok: true, value: { clipIds: raw.map((c) => c.id), clips: raw } };
  const clips: Clip[] = [];
  if (raw.clips) clips.push(...raw.clips);
  if (raw.id !== undefined) {
    const one = Clip.safeParse(raw);
    if (one.success) clips.push(one.data);
  }
  const ids = [...new Set([...(raw.clip_ids ?? []), ...clips.map((c) => c.id), ...(raw.id !== undefined ? [raw.id] : [])])];
  return { ok: true, value: { clipIds: ids, clips } };
}
