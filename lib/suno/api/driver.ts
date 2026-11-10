// THE API SUNO DRIVER (spark suno-api, hybrid bytes) - server-only by use. The same `SunoDriver`
// the queue, the bound producer and the library import name (lib/sound/suno/drivers.ts), made of
// Suno's official REST API for the create, the polling, the library and the credits, and of the
// signed-in browser profile for one thing only: the audio URL (../resolve.ts). The API refuses to
// stream a suno.com song ("This app can't stream suno.com songs. Play the song at its song_url.").
//
// A browser that is down does not fail a create: the credits are spent once POST /v0/audio has
// answered, so the refs come back with `audioUrl: null` rather than being thrown away. Nor does it
// make the probe unhealthy - health is the API grant and the account read, nothing else.
//
// THE CREATE ANSWER IS UNVERIFIED LIVE (wire.ts `CreateResponse` accepts a clip, `{clip_ids}`,
// `{clips}` or a bare array). The polling reads clip ids only, so any of those shapes is enough.
//
// Nothing here logs: a token, a URL with a signature, a body - none of it is ours to print.

import { createHash } from "node:crypto";

import type { SunoCreateOptions, SunoDriver } from "../../sound/suno/drivers.ts";
import { resolveSunoAudio } from "../resolve.ts";
import { normalizeModelLabel } from "../selectors.ts";
import type { SunoClipRef, SunoDriverHealth, SunoFields, SunoLibraryClip, SunoModel, SunoPhase } from "../types.ts";
import { LIBRARY_LIMIT_MAX, sunoApi, sunoApiStatus, type SunoApi, type SunoApiStatus } from "./client.ts";
import type { Clip } from "./wire.ts";

const PROBE_TTL_MS = 15_000;
const RENDER_TIMEOUT_MS = 6 * 60_000;
const POLL_MS = 5_000;
const MAX_PAGES = 1000;

export interface ApiSunoDeps {
  /** The REST client (default `sunoApi()`); a test hands a fake. */
  readonly api?: () => SunoApi;
  /** Whether a grant is held (default `sunoApiStatus()`, the file only). */
  readonly status?: () => Promise<SunoApiStatus>;
  /** Song ids -> audio URLs (default the browser profile's `resolveSunoAudio`). */
  readonly resolve?: (songIds: readonly string[]) => Promise<Map<string, string | null>>;
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly pollMs?: number;
  readonly renderTimeoutMs?: number;
}

const text = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const isInstrumental = (lyrics: string | undefined) => !lyrics || !lyrics.trim() || /^\[\s*instrumental\s*\]$/i.test(lyrics.trim());
const looksLikeCredits = (s: string) => /credit|insufficient|quota|limit reached|upgrade/i.test(s);
/** At least `streaming`: Suno has audio for it, even if not the final file. */
const playable = (status: string | undefined) => status === "complete" || status === "streaming";

/** The idempotency key: one per (fields, model, caller key). With no caller key it falls back to the
 *  minute, so a double press inside one minute is one create. */
export function idempotencyKey(fields: SunoFields, model: SunoModel, key: string | undefined, now: number): string {
  const basis = JSON.stringify({
    key: key ?? `minute:${Math.floor(now / 60_000)}`,
    model,
    title: text(fields.title),
    style: text(fields.style),
    lyrics: text(fields.lyrics),
    exclude: text(fields.exclude),
  });
  return `gt-${createHash("sha256").update(basis).digest("hex").slice(0, 48)}`;
}

/** SunoFields -> the POST /v0/audio body. Empty or `[Instrumental]` lyrics = `instrumental: true`, no lyrics. */
export function createBody(fields: SunoFields, model: SunoModel, key: string) {
  const title = text(fields.title);
  const exclude = text(fields.exclude);
  const instrumental = isInstrumental(fields.lyrics);
  return {
    ...(title ? { title } : {}),
    style: fields.style.trim(),
    ...(instrumental ? { instrumental: true } : { lyrics: fields.lyrics!.trim() }),
    ...(exclude ? { negative_style: exclude } : {}),
    model,
    idempotency_key: key,
  };
}

/** A clip's failure in one line: the API's `error` as a string, or its `message`. */
function errorOf(c: Clip): string {
  const e = c.error;
  if (typeof e === "string" && e.trim()) return e.trim();
  if (e && typeof e === "object") {
    const m = (e as { message?: unknown; detail?: unknown }).message ?? (e as { detail?: unknown }).detail;
    if (typeof m === "string" && m.trim()) return m.trim();
  }
  return "no reason given";
}

function toRef(id: string, c: Clip | undefined, audioUrl: string | null, fallbackTitle: string): SunoClipRef {
  const d = c?.metadata?.duration;
  return {
    songId: id,
    url: text(c?.song_url) || `https://suno.com/song/${id}`,
    audioUrl,
    imageUrl: text(c?.cover_image_large_url) || text(c?.cover_image_url) || null,
    title: text(c?.title) || fallbackTitle,
    durationS: typeof d === "number" && d > 0 ? d : null,
  };
}

/** The API names no model on a clip (seen 2026-11-10); a raw `metadata.model` or `major_model_version`
 *  is read when one appears, else "unknown". */
export function apiModelLabel(c: Clip): string {
  const meta = (c.metadata ?? {}) as Record<string, unknown>;
  const raw = text(meta["model"]) || text((c as Record<string, unknown>)["major_model_version"]) || text((c as Record<string, unknown>)["model"]);
  return raw ? normalizeModelLabel(raw) : "unknown";
}

/** A finished library clip, or null for anything not `complete`. */
export function apiLibraryClip(c: Clip, audioUrl: string | null): SunoLibraryClip | null {
  if (c.status !== "complete") return null;
  const m = c.metadata;
  const title = text(c.title);
  const prompt: SunoFields = { style: text(m?.style) };
  if (title) prompt.title = title;
  const lyrics = text(m?.lyrics);
  if (lyrics) prompt.lyrics = lyrics;
  const at = Date.parse(text(c.created_at));
  return { ...toRef(c.id, c, audioUrl, ""), title, model: apiModelLabel(c), prompt, createdAt: Number.isFinite(at) ? at : Date.now() };
}

/** Audio for every id, or null for every id when the browser cannot answer: never a failure. */
async function audioFor(resolve: NonNullable<ApiSunoDeps["resolve"]>, ids: readonly string[]): Promise<Map<string, string | null>> {
  try {
    return await resolve(ids);
  } catch {
    return new Map(ids.map((id) => [id, null]));
  }
}

export function apiSunoDriver(deps: ApiSunoDeps = {}): SunoDriver {
  const api = deps.api ?? (() => sunoApi());
  const status = deps.status ?? sunoApiStatus;
  const resolve = deps.resolve ?? resolveSunoAudio;
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const pollMs = deps.pollMs ?? POLL_MS;
  const renderTimeoutMs = deps.renderTimeoutMs ?? RENDER_TIMEOUT_MS;
  let probed: { at: number; health: SunoDriverHealth } | null = null;

  async function probe(): Promise<SunoDriverHealth> {
    if (probed && now() - probed.at < PROBE_TTL_MS) return probed.health;
    const st = await status();
    let health: SunoDriverHealth;
    if (!st.connected) health = { ok: false, reason: "not connected to suno" };
    else {
      const u = await api().usage();
      health = u.ok ? { ok: true } : { ok: false, reason: u.error.message };
    }
    probed = { at: now(), health };
    return health;
  }

  async function credits(): Promise<number | null> {
    try {
      if (!(await status()).connected) return null;
      const u = await api().usage();
      const left = u.ok ? u.value.suno_account?.credits_remaining : undefined;
      return typeof left === "number" && Number.isFinite(left) ? left : null;
    } catch {
      return null;
    }
  }

  async function create(fields: SunoFields, model: SunoModel, onPhase: (phase: SunoPhase) => void, opts: SunoCreateOptions = {}): Promise<SunoClipRef[]> {
    if (!fields.style?.trim()) throw new Error("suno create needs a style");
    onPhase("attaching");
    if (!(await status()).connected) throw new Error("not connected to suno");
    const client = api();
    const usage = await client.usage();
    if (!usage.ok) throw new Error(usage.error.message);
    const left = usage.value.suno_account?.credits_remaining;
    if (typeof left === "number" && left <= 0) throw new Error("suno: out of credits");

    onPhase("composing");
    const body = createBody(fields, model, idempotencyKey(fields, model, opts.key, now()));

    onPhase("creating");
    const made = await client.create(body);
    if (!made.ok) {
      if (made.error.code === "budget" || looksLikeCredits(made.error.message)) throw new Error("suno: out of credits");
      throw new Error(`suno refused the create: ${made.error.message}`);
    }
    const ids = [...made.value.clipIds];
    if (!ids.length) throw new Error("suno refused the create: no clips in the answer");
    const seen = new Map<string, Clip>();
    for (const c of made.value.clips) seen.set(c.id, c);

    onPhase("rendering");
    const deadline = now() + renderTimeoutMs;
    for (;;) {
      for (const id of ids) {
        const r = await client.getClip(id);
        if (r.ok) seen.set(id, r.value);
      }
      const clips = ids.map((id) => seen.get(id));
      const failed = clips.find((c) => c?.status === "error");
      if (failed) throw new Error(`suno failed the clip: ${errorOf(failed)}`);
      if (clips.every((c) => c?.status === "complete")) break;
      if (now() > deadline) {
        // The ids are real and the credits are spent: hand back what is playable rather than lose it.
        if (clips.every((c) => playable(c?.status))) break;
        throw new Error(`suno did not finish rendering in ${Math.round(renderTimeoutMs / 60_000)} min (songs ${ids.join(", ")})`);
      }
      await sleep(pollMs);
    }

    onPhase("collecting");
    const audio = await audioFor(resolve, ids);
    const fallbackTitle = text(fields.title) || "Untitled";
    return ids.map((id) => toRef(id, seen.get(id), audio.get(id) ?? null, fallbackTitle));
  }

  async function listLibrary(onPage?: (n: number, total: number | null) => void): Promise<SunoLibraryClip[]> {
    if (!(await status()).connected) throw new Error("not connected to suno");
    const client = api();
    const done = new Map<string, Clip>();
    let read = 0;
    let cursor: string | undefined;
    for (let pageNo = 0; pageNo < MAX_PAGES; pageNo++) {
      const r = await client.listLibrary({ ...(cursor === undefined ? {} : { cursor }), limit: LIBRARY_LIMIT_MAX });
      if (!r.ok) throw new Error(r.error.message);
      read += r.value.items.length;
      for (const c of r.value.items) if (c.status === "complete" && !done.has(c.id)) done.set(c.id, c);
      onPage?.(read, null);
      const next = text(r.value.next_cursor);
      if (!next || next === cursor) break;
      cursor = next;
    }
    const at = (c: Clip) => {
      const t = Date.parse(text(c.created_at));
      return Number.isFinite(t) ? t : 0;
    };
    const clips = [...done.values()].sort((a, b) => at(b) - at(a));
    const audio = await audioFor(resolve, clips.map((c) => c.id));
    return clips.map((c) => apiLibraryClip(c, audio.get(c.id) ?? null)).filter((c): c is SunoLibraryClip => c !== null);
  }

  return { probe, create, listLibrary, credits };
}

/** The API driver as the selection binds it (lib/sound/suno/drivers.ts). */
export const API_SUNO: SunoDriver = apiSunoDriver();
