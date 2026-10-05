// THE YOUTUBE ADAPTER (Data API v3) — the only file in this repo that knows
// YouTube's wire format. Server-only.
//
// PORTED FROM StatReel packages/publish/src/youtube.ts, whose API facts were
// read from Google's docs on 2026-09-29 and are recorded in that package's
// API-NOTES.md. Kept: the resumable-upload protocol (init POST -> Location
// session URI -> chunked PUTs in 256 KiB multiples -> 308 Range bookkeeping),
// the idempotent-resume contract (probe a persisted session with
// `Content-Range: bytes */TOTAL` instead of creating a second private video),
// the one-restart rule on a forgotten session (404/410), the retry policy
// (5xx, 429, and the quota/rate 403 reasons, backoff
// min(64 s, max(2^n s, Retry-After))), the snippet limits, captions.insert as
// multipart/related, and videos.list statistics. Dropped: Analytics
// reports.query and videos.delete (no caller here yet), and the plan FILE —
// the engine (engine.ts) writes one plan per slot with the slot beside the
// requests, so the client only keeps the plan in memory.
//
// PRIVATE ONLY, IN BOTH MODES. `assertPrivate` refuses anything else before a
// byte moves, and a live upload that comes back non-private is an error. The
// owner flips visibility on the platform by hand.
//
// DRY MODE MAKES NO NETWORK CALL AT ALL. `send()` throws outside live mode, so
// a dry path that reached the wire would fail loudly rather than spend.

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { open, readFile, stat } from "node:fs/promises";
import { basename, extname } from "node:path";

import type { TokenProvider } from "./oauth";

export type PublishMode = "dry" | "live";

export const YT_API = "https://www.googleapis.com/youtube/v3";
export const YT_UPLOAD = "https://www.googleapis.com/upload/youtube/v3";

/** Chunks must be multiples of 256 KiB (except the last). */
export const CHUNK_QUANTUM = 256 * 1024;
export const DEFAULT_CHUNK_SIZE = 32 * CHUNK_QUANTUM; // 8 MiB

export interface FileRef {
  file: string;
  bytes: number;
  sha256: string;
  contentType: string;
}

export interface PlannedRequest {
  method: "GET" | "POST" | "PUT" | "DELETE";
  url: string;
  /** request headers without Authorization */
  headers: Record<string, string>;
  body?: unknown;
}

export interface UploadVideoRequest {
  file: string;
  title: string;
  description: string;
  tags?: string[];
  /** only "private" is accepted */
  privacyStatus?: string;
  /** status.containsSyntheticMedia — the altered-or-synthetic disclosure */
  containsSyntheticMedia: boolean;
  categoryId: string;
  madeForKids?: boolean;
  defaultLanguage?: string;
}

export interface UploadVideoOptions {
  /** a session URI an earlier attempt reported via `onSession`: probe and continue */
  resumeSessionUri?: string;
  /** fires once per NEW session, before any byte is sent, so the caller can persist it */
  onSession?: (sessionUri: string) => void | Promise<void>;
  /** refuse before any request when the file's streamed sha256 differs */
  expectedSha256?: string;
}

export interface UploadVideoResult {
  id: string;
  privacyStatus: "private";
  mode: PublishMode;
  file: FileRef;
  resource?: YouTubeVideo;
}

export interface YouTubeVideo {
  id: string;
  snippet?: { title?: string; description?: string; tags?: string[]; categoryId?: string };
  status?: { privacyStatus?: string; uploadStatus?: string; containsSyntheticMedia?: boolean };
  statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
}

export interface CaptionTrack {
  id: string;
  snippet?: { videoId?: string; language?: string; name?: string };
}

/** Lifetime totals from videos.list — null where the platform withheld a number. */
export interface VideoStats {
  videoId: string;
  viewCount: number | null;
  likeCount: number | null;
  commentCount: number | null;
}

export class YouTubeApiError extends Error {
  constructor(message: string, readonly status: number, readonly reason?: string) {
    super(message);
    this.name = "YouTubeApiError";
  }
}

export interface YouTubeClientOptions {
  mode: PublishMode;
  /** required in live mode */
  tokenProvider?: TokenProvider | null;
  fetch?: typeof fetch;
  chunkSize?: number;
  maxRetries?: number;
  sleep?: (ms: number) => Promise<void>;
}

const MIME: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".srt": "application/octet-stream",
  ".vtt": "application/octet-stream",
};

/** Streamed: an export is hundreds of MB and is never held whole in memory. */
export async function sha256File(file: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

export async function fileRef(file: string): Promise<FileRef> {
  const [info, sha256] = await Promise.all([stat(file), sha256File(file)]);
  return {
    file: basename(file),
    bytes: info.size,
    sha256,
    contentType: MIME[extname(file).toLowerCase()] ?? "application/octet-stream",
  };
}

const sha8 = (...parts: string[]) => createHash("sha256").update(parts.join("\n")).digest("hex").slice(0, 8);

/** `dry-<sha8(file sha256 + title)>` — stable for the same bytes and title.
 *  Written into the plan only; a dry Publication's platformVideoId stays null,
 *  because no platform ever issued it. */
export function dryVideoId(fileSha256: string, title: string): string {
  return `dry-${sha8(fileSha256, title)}`;
}

export function assertPrivate(privacyStatus: string | undefined): "private" {
  if (privacyStatus !== undefined && privacyStatus !== "private") {
    throw new Error(`privacyStatus '${privacyStatus}' refused: uploads are private; the owner changes visibility on the platform`);
  }
  return "private";
}

/** API-NOTES.md "Video resource": title <= 100 chars, description <= 5000
 *  BYTES, neither may hold `<` or `>`, tags <= 500 chars where commas count and
 *  a tag with a space also counts its quotes. Returns the first violation. */
export function snippetProblem(s: { title: string; description: string; tags?: string[] }): string | null {
  const bad = /[<>]/;
  if (!s.title.trim()) return "title is empty";
  if ([...s.title].length > 100) return "title exceeds 100 characters";
  if (bad.test(s.title) || bad.test(s.description)) return "title/description may not contain '<' or '>'";
  if (Buffer.byteLength(s.description, "utf8") > 5000) return "description exceeds 5000 bytes";
  const tags = s.tags ?? [];
  const tagChars = tags.reduce((n, t) => n + t.length + (t.includes(" ") ? 2 : 0), 0) + Math.max(0, tags.length - 1);
  if (tagChars > 500) return "tags exceed 500 characters";
  return null;
}

export function videoInsertBody(req: UploadVideoRequest) {
  return {
    snippet: {
      title: req.title,
      description: req.description,
      tags: req.tags ?? [],
      categoryId: req.categoryId,
      ...(req.defaultLanguage ? { defaultLanguage: req.defaultLanguage } : {}),
    },
    status: {
      privacyStatus: assertPrivate(req.privacyStatus),
      selfDeclaredMadeForKids: req.madeForKids ?? false,
      containsSyntheticMedia: req.containsSyntheticMedia,
    },
  };
}

class SessionGoneError extends Error {
  constructor(readonly status: number) {
    super(`resumable session expired (${status})`);
  }
}

const RETRY_CAP_MS = 64_000;
const RETRYABLE_403 = new Set(["quotaExceeded", "rateLimitExceeded", "userRateLimitExceeded", "dailyLimitExceeded"]);

export function retryAfterMs(header: string | null, now = Date.now()): number | null {
  if (!header) return null;
  const secs = Number(header);
  if (Number.isFinite(secs) && secs >= 0) return secs * 1000;
  const at = Date.parse(header);
  return Number.isNaN(at) ? null : Math.max(0, at - now);
}

export function chunkRanges(total: number, size: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let s = 0; s < total; s += size) out.push([s, Math.min(s + size, total) - 1]);
  return out;
}

/** `Range: bytes=0-999999` -> 1000000; no header -> 0 (nothing persisted yet). */
export function nextOffset(range: string | null): number {
  const m = range ? /bytes=\d+-(\d+)/.exec(range) : null;
  return m?.[1] ? Number(m[1]) + 1 : 0;
}

function num(v: string | undefined): number | null {
  if (v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export class YouTubeClient {
  readonly mode: PublishMode;
  /** Every request this client made (live) or would have made (dry), auth stripped. */
  readonly plan: PlannedRequest[] = [];
  private readonly fetchImpl: typeof fetch;
  private readonly chunkSize: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly opts: YouTubeClientOptions) {
    this.mode = opts.mode;
    this.fetchImpl = opts.fetch ?? ((...a: Parameters<typeof fetch>) => globalThis.fetch(...a));
    this.chunkSize = opts.chunkSize ?? DEFAULT_CHUNK_SIZE;
    if (this.chunkSize <= 0 || this.chunkSize % CHUNK_QUANTUM !== 0) {
      throw new Error(`chunkSize must be a positive multiple of ${CHUNK_QUANTUM}`);
    }
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    if (this.mode === "live" && !opts.tokenProvider) throw new Error("live mode needs a tokenProvider");
  }

  // ── videos.insert (resumable) ─────────────────────────────────────────────

  async uploadVideo(req: UploadVideoRequest, options: UploadVideoOptions = {}): Promise<UploadVideoResult> {
    const body = videoInsertBody(req); // refuses non-private before anything else
    const problem = snippetProblem(req);
    if (problem) throw new Error(problem);
    const ref = await fileRef(req.file);
    if (ref.bytes === 0) throw new Error(`video file is empty: ${req.file}`);
    if (options.expectedSha256 !== undefined && options.expectedSha256.toLowerCase() !== ref.sha256) {
      throw new Error(`refusing to upload ${ref.file}: sha256 ${ref.sha256} does not match the expected ${options.expectedSha256}`);
    }
    const initUrl = `${YT_UPLOAD}/videos?uploadType=resumable&part=snippet,status&notifySubscribers=false`;
    const bodyText = JSON.stringify(body);
    const initHeaders = {
      "Content-Type": "application/json; charset=UTF-8",
      "Content-Length": String(Buffer.byteLength(bodyText)),
      "X-Upload-Content-Length": String(ref.bytes),
      "X-Upload-Content-Type": ref.contentType,
    };

    if (this.mode === "dry") {
      this.record({ method: "POST", url: initUrl, headers: initHeaders, body });
      for (const [start, end] of chunkRanges(ref.bytes, this.chunkSize)) {
        this.record({
          method: "PUT",
          url: "<session-uri from Location header>",
          headers: {
            "Content-Length": String(end - start + 1),
            "Content-Type": ref.contentType,
            "Content-Range": `bytes ${start}-${end}/${ref.bytes}`,
          },
          body: { media: ref, range: [start, end] },
        });
      }
      return { id: dryVideoId(ref.sha256, req.title), privacyStatus: "private", mode: "dry", file: ref };
    }

    let resume = options.resumeSessionUri;
    let video: YouTubeVideo | undefined;
    for (let restarts = 0; !video; restarts++) {
      try {
        let session = resume;
        let offset = 0;
        let done: unknown;
        if (session) {
          const probe = await this.probeSession(session, ref);
          if ("resource" in probe) done = probe.resource;
          else offset = probe.offset;
        } else {
          session = await this.createSession(initUrl, initHeaders, bodyText);
          await options.onSession?.(session);
        }
        video = (done ?? (await this.uploadChunks(session, req.file, ref, offset))) as YouTubeVideo;
      } catch (err) {
        // a forgotten session restarts with a fresh one, ONCE; anything else is the caller's
        if (!(err instanceof SessionGoneError) || restarts >= 1) throw err;
        resume = undefined;
      }
    }
    const privacy = video.status?.privacyStatus;
    if (privacy !== "private") {
      throw new YouTubeApiError(`uploaded video ${video.id} came back with privacyStatus '${privacy}', expected 'private'`, 200);
    }
    return { id: video.id, privacyStatus: "private", mode: "live", file: ref, resource: video };
  }

  private async createSession(url: string, headers: Record<string, string>, bodyText: string): Promise<string> {
    for (let attempt = 1; ; attempt++) {
      let res: Response;
      try {
        res = await this.send("POST", url, headers, bodyText);
      } catch (err) {
        await this.backoff(attempt, err, null);
        continue;
      }
      const wait = await this.retryable(res);
      if (wait !== undefined) {
        await this.backoff(attempt, new YouTubeApiError(`videos.insert (init) ${res.status}`, res.status), wait);
        continue;
      }
      await this.ensureOk(res, "videos.insert (init)");
      const session = res.headers.get("location");
      if (!session) throw new YouTubeApiError("resumable session URI missing (no Location header)", res.status);
      return session;
    }
  }

  private async uploadChunks(session: string, filePath: string, ref: FileRef, startOffset = 0): Promise<unknown> {
    const fh = await open(filePath, "r");
    try {
      let offset = startOffset;
      let attempt = 0;
      while (offset < ref.bytes) {
        const end = Math.min(offset + this.chunkSize, ref.bytes) - 1;
        const len = end - offset + 1;
        const buf = Buffer.alloc(len);
        await fh.read(buf, 0, len, offset);
        let res: Response;
        try {
          res = await this.send(
            "PUT",
            session,
            { "Content-Length": String(len), "Content-Type": ref.contentType, "Content-Range": `bytes ${offset}-${end}/${ref.bytes}` },
            buf,
          );
        } catch (err) {
          const r = await this.retryOrResume(session, ref, ++attempt, err, null);
          if ("resource" in r) return r.resource;
          offset = r.offset;
          continue;
        }
        if (res.status === 200 || res.status === 201) return res.json();
        if (res.status === 308) {
          const next = nextOffset(res.headers.get("range"));
          if (next > offset) {
            offset = next;
            attempt = 0;
            continue;
          }
          // the server kept nothing of this chunk: a stall spends the retry budget, never resets it
          await this.backoff(++attempt, new YouTubeApiError(`chunk upload made no progress at byte ${offset}`, 308), null);
          offset = next;
          continue;
        }
        if (res.status === 404 || res.status === 410) throw new SessionGoneError(res.status);
        const wait = await this.retryable(res);
        if (wait !== undefined) {
          const r = await this.retryOrResume(session, ref, ++attempt, new YouTubeApiError(`chunk upload ${res.status}`, res.status), wait);
          if ("resource" in r) return r.resource;
          offset = r.offset;
          continue;
        }
        await this.ensureOk(res, "videos.insert (upload)");
        throw new YouTubeApiError(`chunk upload: unexpected status ${res.status}`, res.status);
      }
      throw new YouTubeApiError("upload finished without a video resource", 0);
    } finally {
      await fh.close();
    }
  }

  private async probeSession(session: string, ref: FileRef): Promise<{ offset: number } | { resource: unknown }> {
    for (let attempt = 1; ; attempt++) {
      let res: Response;
      try {
        res = await this.send("PUT", session, { "Content-Length": "0", "Content-Range": `bytes */${ref.bytes}` });
      } catch (err) {
        await this.backoff(attempt, err, null);
        continue;
      }
      if (res.status === 308) return { offset: nextOffset(res.headers.get("range")) };
      if (res.status === 200 || res.status === 201) return { resource: await res.json() };
      if (res.status === 404 || res.status === 410) throw new SessionGoneError(res.status);
      const wait = await this.retryable(res);
      if (wait !== undefined) {
        await this.backoff(attempt, new YouTubeApiError(`resume status ${res.status}`, res.status), wait);
        continue;
      }
      await this.ensureOk(res, "videos.insert (resume status)");
      throw new YouTubeApiError(`resume status: unexpected status ${res.status}`, res.status);
    }
  }

  private async retryOrResume(session: string, ref: FileRef, attempt: number, err: unknown, retryAfter: number | null) {
    await this.backoff(attempt, err, retryAfter);
    return this.probeSession(session, ref);
  }

  /** Retry-After is honoured but never beyond the cap, so a hostile header cannot stall a publish. */
  private async backoff(attempt: number, err: unknown, retryAfter: number | null): Promise<void> {
    if (attempt > (this.opts.maxRetries ?? 5)) throw err;
    await this.sleep(Math.min(Math.max(2 ** attempt * 1000, retryAfter ?? 0), RETRY_CAP_MS));
  }

  private async retryable(res: Response): Promise<number | undefined> {
    const after = retryAfterMs(res.headers.get("retry-after")) ?? 0;
    if (res.status >= 500 || res.status === 429) return after;
    if (res.status !== 403) return undefined;
    try {
      const json = (await res.clone().json()) as { error?: { errors?: Array<{ reason?: string }> } };
      const reason = json.error?.errors?.[0]?.reason;
      return reason && RETRYABLE_403.has(reason) ? after : undefined;
    } catch {
      return undefined;
    }
  }

  // ── captions.insert (multipart) ───────────────────────────────────────────

  async insertCaptions(videoId: string, file: string, language: string, name = ""): Promise<CaptionTrack> {
    const ref = await fileRef(file);
    const metadata = { snippet: { videoId, language, name, isDraft: false } };
    const boundary = `gravitone-${sha8(videoId, ref.sha256)}`;
    const url = `${YT_UPLOAD}/captions?uploadType=multipart&part=snippet`;
    const headers = { "Content-Type": `multipart/related; boundary=${boundary}` };
    if (this.mode === "dry") {
      this.record({
        method: "POST",
        url,
        headers,
        body: {
          multipart: [
            { contentType: "application/json; charset=UTF-8", json: metadata },
            { contentType: ref.contentType, media: ref },
          ],
        },
      });
      return { id: `dry-caption-${sha8(videoId, ref.sha256, language)}`, snippet: { videoId, language, name } };
    }
    const media = await readFile(file);
    const payload = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Type: ${ref.contentType}\r\n\r\n`),
      media,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const res = await this.send("POST", url, headers, payload);
    await this.ensureOk(res, "captions.insert");
    return (await res.json()) as CaptionTrack;
  }

  // ── videos.list statistics ────────────────────────────────────────────────

  /** Lifetime statistics via videos.list (1 unit per call, ids batched by 50).
   *  Dry mode records the request and returns ALL-NULL stats — StatReel
   *  returned "0" strings here, which is the fake zero this repo forbids. */
  async fetchStats(videoIds: string[]): Promise<VideoStats[]> {
    const out: VideoStats[] = [];
    for (let i = 0; i < videoIds.length; i += 50) {
      const batch = videoIds.slice(i, i + 50);
      const url = `${YT_API}/videos?part=statistics&id=${batch.map(encodeURIComponent).join(",")}`;
      let items: YouTubeVideo[];
      if (this.mode === "dry") {
        this.record({ method: "GET", url, headers: {} });
        items = [];
      } else {
        const res = await this.send("GET", url, {});
        await this.ensureOk(res, "videos.list (statistics)");
        items = ((await res.json()) as { items?: YouTubeVideo[] }).items ?? [];
      }
      const byId = new Map(items.map((v) => [v.id, v]));
      for (const id of batch) {
        const s = byId.get(id)?.statistics;
        out.push({ videoId: id, viewCount: num(s?.viewCount), likeCount: num(s?.likeCount), commentCount: num(s?.commentCount) });
      }
    }
    return out;
  }

  // ── plumbing ──────────────────────────────────────────────────────────────

  private record(req: PlannedRequest) {
    const headers = Object.fromEntries(Object.entries(req.headers).filter(([k]) => k.toLowerCase() !== "authorization"));
    this.plan.push({ ...req, headers });
  }

  private async send(method: PlannedRequest["method"], url: string, headers: Record<string, string>, body?: string | Buffer): Promise<Response> {
    if (this.mode !== "live") throw new Error("network call attempted outside live mode");
    const provider = this.opts.tokenProvider;
    if (!provider) throw new Error("live mode needs a tokenProvider");
    this.record({ method, url, headers, body: body === undefined ? undefined : `<${typeof body === "string" ? Buffer.byteLength(body) : body.length} bytes>` });
    const token = await provider.getAccessToken();
    const h: Record<string, string> = { ...headers, Authorization: `Bearer ${token}` };
    delete h["Content-Length"]; // fetch computes it and forbids setting it
    return this.fetchImpl(url, {
      method,
      headers: h,
      body: body === undefined ? undefined : new Uint8Array(typeof body === "string" ? Buffer.from(body) : body),
    });
  }

  private async ensureOk(res: Response, what: string): Promise<void> {
    if (res.ok) return;
    let reason: string | undefined;
    let message = res.statusText;
    try {
      const json = (await res.json()) as { error?: { message?: string; errors?: Array<{ reason?: string }> } };
      reason = json.error?.errors?.[0]?.reason;
      message = json.error?.message ?? message;
    } catch {
      /* non-JSON error body */
    }
    throw new YouTubeApiError(`${what} failed: ${res.status} ${reason ?? ""} ${message}`.trim(), res.status, reason);
  }
}
