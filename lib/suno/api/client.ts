// SUNO'S OFFICIAL REST API (/v0) - the one client the server and the CLIs call it through.
//
// The bearer is tokens.ts's file, refreshed through oauth.ts: before a call when it expires within
// 60 s, and once more when a call answers 401 (the call is then retried once, and only once). Every
// call has a deadline - 60 s, 180 s for `stream`.
//
// SPEND. `create` spends Suno credits; `download` with `confirm` spends one of the person's download
// credits. Everything else reads (listen is free per Suno's own tool description, capped at five open
// questions and 200 a day; an unconfirmed `download` is the free quote).
//
// THE SHAPES ARE NOT YET VERIFIED with a real token (wire.ts): a body that does not parse is refused
// with the first 300 characters of what arrived, so the first live call reports the real shape.
//
// No `server-only` and no Next import: pipeline CLIs (pipeline/suno-api.mts, pipeline/music-clip.mts)
// load this through tsx.

import type { z } from "zod";

import { err, ok, type AppErrorCode, type Result } from "@gt/domain/errors";

import { apiBase, refresh, REFRESH_MARGIN_MS, vendorCall, type OAuthDeps, type Raw } from "./oauth.ts";
import { readAuth } from "./tokens.ts";
import {
  Alignment,
  Analysis,
  ApiErrorBody,
  Clip,
  CreateBody,
  CreateResponse,
  createdOf,
  CoverBody,
  Download,
  LibraryPage,
  Listen,
  Me,
  parseVendor,
  QUOTE_CHARS,
  Usage,
  type Created,
  type DownloadFormat,
  UploadSession,
} from "./wire.ts";

export const DEFAULT_TIMEOUT_MS = 60_000;
export const STREAM_TIMEOUT_MS = 180_000;
/** Suno's page cap for /v0/library and its search. */
export const LIBRARY_LIMIT_MAX = 50;
/** Response headers `stream` hands back for the spend question: anything naming a price, credit or quota. */
export const BILLING_HEADER = /price|credit|quota|cost|billing|usage|ratelimit|rate-limit/i;

export interface SunoApiDeps extends OAuthDeps {
  readonly timeoutMs?: number;
  readonly streamTimeoutMs?: number;
}

export interface Streamed {
  readonly bytes: Uint8Array;
  /** The Content-Type the response carried. */
  readonly mime: string;
  readonly status: number;
  /** Only the headers BILLING_HEADER matches - never a cookie, never a location. */
  readonly billingHeaders: Readonly<Record<string, string>>;
}

export interface Page {
  readonly cursor?: string;
  readonly limit?: number;
}

const NOT_CONNECTED = "not connected to suno";

function codeOf(status: number): AppErrorCode {
  if (status === 401) return "unauthenticated";
  if (status === 402) return "budget";
  if (status === 403) return "refused";
  if (status === 404) return "not-found";
  if (status === 409) return "conflict";
  if (status === 429 || status >= 500) return "unavailable";
  return "invalid";
}

/** api.suno.com's refusal in its own words: `error` verbatim, `code` as the detail. */
export function apiRefusal<T = never>(where: string, status: number, text: string): Result<T> {
  const body = parseVendor(where, ApiErrorBody, text);
  if (body.ok) return err(codeOf(status), body.value.error, { detail: body.value.code ?? `http-${status}` });
  return err(codeOf(status), `${where}: suno answered ${status}: ${text.slice(0, QUOTE_CHARS)}`, { detail: `http-${status}` });
}

const enc = encodeURIComponent;

function query(q: Record<string, string | number | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined) p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}

function limitOf(limit: number | undefined): number | undefined {
  if (limit === undefined) return undefined;
  return Math.max(1, Math.min(LIBRARY_LIMIT_MAX, Math.floor(limit)));
}

export interface SunoApi {
  usage(): Promise<Result<z.output<typeof Usage>>>;
  me(): Promise<Result<z.output<typeof Me>>>;
  getClip(id: string): Promise<Result<Clip>>;
  listLibrary(page?: Page): Promise<Result<LibraryPage>>;
  searchLibrary(q: Page & { readonly query: string }): Promise<Result<LibraryPage>>;
  /**
   * POST /v0/audio - SPENDS SUNO CREDITS. The caller must hold a priced receipt for this job before
   * calling (CLAUDE.md "Spend"); nothing here prices or gates it. Pass `idempotency_key` so a retry
   * returns the first clip instead of paying twice.
   */
  create(body: z.input<typeof CreateBody>): Promise<Result<Created>>;
  analysis(id: string): Promise<Result<Analysis>>;
  listen(id: string, question: string): Promise<Result<Listen>>;
  listenRead(listenId: string): Promise<Result<Listen>>;
  alignment(id: string): Promise<Result<Alignment>>;
  stream(id: string): Promise<Result<Streamed>>;
  /**
   * POST /v0/audio/{id}/download. Unconfirmed it is the free quote (`requires_credit` and the credits
   * left). WITH `confirm` IT SPENDS ONE DOWNLOAD CREDIT when the song needs one: the caller must hold
   * the person's press and a receipt (lib/sound/suno/pull.ts). Needs the `download` scope.
   */
  download(id: string, o: { readonly format: DownloadFormat; readonly confirm: boolean }): Promise<Result<Download>>;
  /** POST /v0/audio/upload-sessions: free (uploads spend no credits). Needs the `audio.upload` feature. */
  uploadSession(title: string): Promise<Result<UploadSession>>;
  /** PUT the raw bytes to the session's signed `upload_url` (no bearer: the URL is the credential). */
  putUpload(uploadUrl: string, bytes: Uint8Array, mime: string): Promise<Result<void>>;
  /** POST /v0/audio/upload-sessions/{id}/complete: the clip the upload becomes; poll `getClip` to `complete`. */
  completeUpload(sessionId: string): Promise<Result<Clip>>;
  /** POST /v0/audio/{id}/covers - SPENDS SUNO SONG CREDITS. The caller holds a confirmed receipt
   *  (lib/producers/coverSuno.ts); pass `idempotency_key` so a retried step is one cover. */
  cover(clipId: string, body: CoverBody): Promise<Result<Created>>;
}

type Sent = { readonly raw: Raw; readonly res: Response | null };

export function sunoApi(deps: SunoApiDeps = {}): SunoApi {
  const now = () => (deps.now ?? Date.now)();

  /** A usable access token: the file's, refreshed first when it expires within the margin. */
  async function bearer(): Promise<Result<string>> {
    const tokens = (await readAuth()).tokens;
    if (!tokens) return err("unauthenticated", NOT_CONNECTED, { detail: "suno-not-connected" });
    if (tokens.expiresAt - now() > REFRESH_MARGIN_MS) return ok(tokens.accessToken);
    const r = await refresh(deps);
    return r.ok ? ok(r.value.accessToken) : r;
  }

  /** One authorised call: on a 401, refresh once (unless another process already did) and retry once. */
  async function call(method: string, path: string, body: unknown, timeoutMs: number, binary: boolean): Promise<Result<Sent>> {
    const first = await bearer();
    if (!first.ok) return first;
    let token = first.value;
    for (let attempt = 0; ; attempt++) {
      const headers: Record<string, string> = { authorization: `Bearer ${token}`, accept: binary ? "*/*" : "application/json" };
      if (body !== undefined) headers["content-type"] = "application/json";
      const init: RequestInit = { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) };
      const sent = binary ? await binaryCall(`${apiBase(deps)}${path}`, init, timeoutMs) : await jsonCall(`${apiBase(deps)}${path}`, init, timeoutMs);
      if (!sent.ok) return sent;
      if (sent.value.raw.status !== 401 || attempt > 0) return sent;
      const r = await refresh(deps, { stale: token });
      if (!r.ok) return r;
      token = r.value.accessToken;
    }
  }

  async function jsonCall(url: string, init: RequestInit, timeoutMs: number): Promise<Result<Sent>> {
    const raw = await vendorCall(deps, url, init, timeoutMs);
    return raw.ok ? ok({ raw: raw.value, res: null }) : raw;
  }

  /** The bytes, unread as text; an error body is read as text for its sentence. */
  async function binaryCall(url: string, init: RequestInit, timeoutMs: number): Promise<Result<Sent>> {
    try {
      const res = await (deps.fetch ?? globalThis.fetch)(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
      if (res.ok) return ok({ raw: { status: res.status, ok: true, text: "" }, res });
      return ok({ raw: { status: res.status, ok: false, text: await res.text() }, res: null });
    } catch (e) {
      return err("unavailable", `${new URL(url).host}: ${e instanceof Error ? e.message : String(e)}`, { detail: "suno-unreachable", cause: e });
    }
  }

  async function json<S extends z.ZodType>(where: string, method: string, path: string, schema: S, body?: unknown): Promise<Result<z.output<S>>> {
    const sent = await call(method, path, body, deps.timeoutMs ?? DEFAULT_TIMEOUT_MS, false);
    if (!sent.ok) return sent;
    const { raw } = sent.value;
    if (!raw.ok) return apiRefusal(where, raw.status, raw.text);
    return parseVendor(where, schema, raw.text);
  }

  return {
    usage: () => json("suno usage", "GET", "/v0/account/usage", Usage),
    me: () => json("suno me", "GET", "/v0/me", Me),
    getClip: (id) => json("suno clip", "GET", `/v0/audio/${enc(id)}`, Clip),
    listLibrary: (p = {}) => json("suno library", "GET", `/v0/library${query({ cursor: p.cursor, limit: limitOf(p.limit) })}`, LibraryPage),
    searchLibrary: (p) => json("suno library search", "GET", `/v0/library/search${query({ query: p.query, cursor: p.cursor, limit: limitOf(p.limit) })}`, LibraryPage),
    async create(body) {
      const checked = CreateBody.safeParse(body);
      if (!checked.success) return err("invalid", `suno create: ${checked.error.issues[0]?.message ?? "body refused"}`, { detail: "suno-create-body" });
      const r = await json("suno create", "POST", "/v0/audio", CreateResponse, checked.data);
      return r.ok ? createdOf(r.value) : r;
    },
    analysis: (id) => json("suno analysis", "GET", `/v0/audio/${enc(id)}/analysis`, Analysis),
    listen: (id, question) => json("suno listen", "POST", `/v0/audio/${enc(id)}/listen`, Listen, { question }),
    listenRead: (listenId) => json("suno listen read", "GET", `/v0/audio/listens/${enc(listenId)}`, Listen),
    // spark suno-covers WP0: stubs with the final signatures; WP1 builds them.
    uploadSession: async () => err("unavailable", "suno upload: not built yet"),
    putUpload: async () => err("unavailable", "suno upload: not built yet"),
    completeUpload: async () => err("unavailable", "suno upload: not built yet"),
    cover: async () => err("unavailable", "suno cover: not built yet"),
    download: (id, o) => json("suno download", "POST", `/v0/audio/${enc(id)}/download`, Download, { format: o.format, ...(o.confirm ? { confirm: true } : {}) }),
    alignment: (id) => json("suno lyrics alignment", "GET", `/v0/audio/${enc(id)}/lyrics-alignment`, Alignment),
    async stream(id) {
      const sent = await call("GET", `/v0/audio/${enc(id)}/stream`, undefined, deps.streamTimeoutMs ?? STREAM_TIMEOUT_MS, true);
      if (!sent.ok) return sent;
      const { raw, res } = sent.value;
      if (!raw.ok || !res) return apiRefusal("suno stream", raw.status, raw.text);
      const bytes = new Uint8Array(await res.arrayBuffer());
      const billingHeaders: Record<string, string> = {};
      res.headers.forEach((v, k) => {
        if (BILLING_HEADER.test(k)) billingHeaders[k] = v;
      });
      return ok({ bytes, mime: res.headers.get("content-type") ?? "application/octet-stream", status: res.status, billingHeaders });
    },
  };
}

export type SunoApiStatus =
  | { readonly connected: false; readonly reason: string }
  | { readonly connected: true; readonly scope: string; readonly expiresAt: number };

/** Whether this machine holds a Suno grant - the file only, no network. */
export async function sunoApiStatus(): Promise<SunoApiStatus> {
  const tokens = (await readAuth()).tokens;
  if (!tokens) return { connected: false, reason: NOT_CONNECTED };
  return { connected: true, scope: tokens.scope, expiresAt: tokens.expiresAt };
}
