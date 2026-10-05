// LEONARDO IMAGE-TO-VIDEO — the hosted clip adapter. Server-only.
//
// Every request shape below is taken from the ONE working client this repo
// has, pipeline/video/leonardo_reference.py, not from documentation:
//
//   1. upload the key image through v1's two-step init-image (a presigned
//      slot, then a multipart POST of the file to it);
//   2. POST v2 /generations with the model NAMED — an unnamed request once
//      silently got a different model family (`motionModel: "WAN21"`), which
//      is why `VideoModel` is required on the wire;
//   3. poll GET v2 /generations/{id} until a video URL appears, walking the
//      reply for it because its shape is undocumented and a guessed path
//      fails after the money is spent;
//   4. download it with a browser-ish User-Agent — the CDN answers a bare
//      client 403.
//
// `prompt_enhance` is OFF for the reference's reason: the vendor rewriting the
// motion line answers a different question from the one asked.
//
// REFUSAL IS A STATE, NOT AN ERROR. A moderation answer — at the start POST or
// as a terminal job status — comes back as `{ kind: "refused" }` carrying the
// vendor's own words, and is never retried: the same image and line refuse
// again. Nothing here blind-retries a call that can spend: the start POST runs
// with ONE attempt (lib/imaging/http.ts would otherwise retry a 5xx three times,
// and each retry of a start is a second clip billed).
//
// THE SEAM. `VideoAdapter` is the whole contract the clip runner
// (./clips.ts) holds; probes hand it a fake through `setVideoAdapterForTests`
// and never reach this file's network path. The options object lets a probe
// drive THIS adapter offline too (a stubbed global fetch, a fake resolver, no
// sleeping).

import { ImagingError } from "../errors";
import { isConfigured, keyFor } from "../env";
import { requestJson } from "../http";
import { scrub } from "../log";
import { BlockedUrlError, safeFetch, type Resolver } from "../safeUrl";
import { costFromVendor } from "./pricing";
import type { Aspect } from "@/lib/imaging/types";
import type { ClipDuration, CostBasis, VideoModel } from "./types";

const BASE = "https://cloud.leonardo.ai/api/rest/v1";
const BASE2 = "https://cloud.leonardo.ai/api/rest/v2";

/** v2's prompt ceiling (lib/imaging/providers/leonardo.ts names it: "the v2
 *  endpoint allows 2000"). Checked before anything is uploaded. */
export const MAX_VIDEO_PROMPT_CHARS = 2000;

/**
 * Request sizes by aspect. 856×480 is the ONLY size measured working
 * (leonardo_reference.py's default, on hailuo-03); 9:16 is that size turned on
 * its side, which is an assumption about the vendor, not a measurement. The
 * square and 4:5 sizes have no evidence at all and are refused at the route
 * rather than guessed — the ads templates generate at 9:16 and 16:9 only.
 */
export const VIDEO_SIZE: Partial<Record<Aspect, { w: number; h: number }>> = {
  "16:9": { w: 856, h: 480 },
  "9:16": { w: 480, h: 856 },
};

export interface VideoRenderInput {
  image: Uint8Array;
  mime: "image/png" | "image/jpeg" | "image/webp";
  prompt: string;
  durationS: ClipDuration;
  aspect: Aspect;
  model: VideoModel;
}

/** The vendor took the job — reported as soon as it is known, so the record
 *  holds the vendor id and the charge even if the poll later dies. */
export interface VideoAccepted {
  vendorJobId: string;
  costUsd: number | null;
  costBasis: CostBasis;
}

export type VideoOutcome =
  | { kind: "done"; bytes: Uint8Array }
  | { kind: "failed"; message: string }
  | { kind: "refused"; message: string };

export interface VideoAdapter {
  /** Provider id, for the spend row and the log. */
  readonly id: string;
  /** False when no key is configured: the capability says so, the route
   *  refuses, the button is absent. */
  configured(): boolean;
  render(input: VideoRenderInput, onAccepted: (a: VideoAccepted) => Promise<void> | void): Promise<VideoOutcome>;
}

export interface LeonardoVideoOptions {
  /** For a probe: a resolver that never touches DNS. */
  resolve?: Resolver;
  sleep?: (ms: number) => Promise<void>;
  pollMs?: number;
  maxPolls?: number;
}

const POLL_MS = 10_000;
/** 15 minutes, the reference's ceiling: "a hosted video job is minutes, not seconds". */
const MAX_POLLS = 90;
/** A 10 s clip at 856×480 is a few MB; this bounds a hostile or runaway body. */
const MAX_CLIP_BYTES = 200 * 1024 * 1024;

const MODERATION_RE = /moderat|nsfw|safety|content.?polic|inappropriate|not allowed|prohibited|flagged/i;
const REFUSED_STATUSES = new Set(["NSFW", "MODERATED", "CONTENT_MODERATED", "BLOCKED", "REJECTED", "FILTERED"]);

const EXT: Record<VideoRenderInput["mime"], string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

/** Vendor words, made safe to store and show: scrubbed of anything
 *  credential-shaped, one line, bounded. */
function vendorWords(text: unknown, max = 500): string {
  const s = scrub(typeof text === "string" ? text : JSON.stringify(text ?? "")).replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** The vendor's message inside a JSON error body, or the body itself. */
function messageIn(body: unknown): string {
  if (typeof body === "string") {
    try {
      return messageIn(JSON.parse(body));
    } catch {
      return body;
    }
  }
  if (body && typeof body === "object") {
    const o = body as Record<string, unknown>;
    for (const k of ["error", "message", "detail", "failureReason", "reason"]) {
      const v = o[k];
      if (typeof v === "string" && v.trim()) return v;
      if (v && typeof v === "object") return messageIn(v);
    }
  }
  return JSON.stringify(body ?? "");
}

/** The first http(s) URL that is plainly a video, anywhere in the reply. */
export function findVideoUrl(obj: unknown): string | null {
  if (Array.isArray(obj)) {
    for (const v of obj) {
      const got = findVideoUrl(v);
      if (got) return got;
    }
  } else if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (typeof v === "string" && /^https?:\/\//.test(v) && (v.includes(".mp4") || /video/i.test(k))) return v;
      const got = findVideoUrl(v);
      if (got) return got;
    }
  }
  return null;
}

export function leonardoVideoAdapter(opts: LeonardoVideoOptions = {}): VideoAdapter {
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const pollMs = opts.pollMs ?? POLL_MS;
  const maxPolls = opts.maxPolls ?? MAX_POLLS;

  return {
    id: "leonardo",
    configured: () => isConfigured("leonardo"),

    async render(input, onAccepted) {
      const size = VIDEO_SIZE[input.aspect];
      if (!size) return { kind: "failed", message: `No verified Leonardo video size for ${input.aspect}.` };
      if (input.prompt.length > MAX_VIDEO_PROMPT_CHARS)
        return {
          kind: "failed",
          message: `The motion prompt is ${input.prompt.length} characters; Leonardo accepts ${MAX_VIDEO_PROMPT_CHARS}.`,
        };

      const key = keyFor("leonardo");
      const headers = { authorization: `Bearer ${key}` };

      // 1. upload — nothing is billed yet, so a failure here is plain `failed`.
      let imageId: string;
      try {
        imageId = await upload(input, headers, opts.resolve);
      } catch (e) {
        return { kind: "failed", message: `Leonardo would not take the key image: ${describe(e)}` };
      }

      // 2. start — ONE attempt. A moderation answer is a refusal, verbatim.
      let start: Record<string, unknown>;
      try {
        start = await requestJson<Record<string, unknown>>("leonardo", `${BASE2}/generations`, {
          method: "POST",
          headers,
          attempts: 1,
          body: {
            model: input.model,
            public: false,
            parameters: {
              duration: input.durationS,
              prompt_enhance: "OFF",
              quantity: 1,
              prompt: input.prompt,
              width: size.w,
              height: size.h,
              // Clips enter the cut silent: Score owns music
              // (docs/video-generation-plan.md, decision 4).
              audio: false,
              guidances: { start_frame: [{ image: { id: imageId, type: "UPLOADED" } }] },
            },
          },
        });
      } catch (e) {
        const said = e instanceof ImagingError ? messageIn(e.detail) : "";
        if (said && MODERATION_RE.test(said)) return { kind: "refused", message: vendorWords(said) };
        return { kind: "failed", message: `Leonardo did not start the clip: ${describe(e)}` };
      }

      // v2 nests the job under `generate`, alongside what it just charged.
      const gen = ((start.generate as Record<string, unknown> | undefined) ?? start) as Record<string, unknown>;
      const gid = (gen.generationId ?? gen.id) as string | undefined;
      if (typeof gid !== "string" || !gid)
        return { kind: "failed", message: `Leonardo returned no generation id: ${vendorWords(start, 300)}` };
      const costRaw = (gen.cost as Record<string, unknown> | undefined) ?? {};
      const cost = costFromVendor({ amount: costRaw.amount, unit: costRaw.unit, apiCreditCost: gen.apiCreditCost });
      await onAccepted({ vendorJobId: gid, costUsd: cost.usd, costBasis: cost.basis });

      // 3. poll. One bad poll is not a failed clip; a terminal status is.
      let url: string | null = null;
      for (let i = 0; i < maxPolls && !url; i++) {
        await sleep(pollMs);
        let res: Record<string, unknown>;
        try {
          res = await requestJson<Record<string, unknown>>("leonardo", `${BASE2}/generations/${encodeURIComponent(gid)}`, {
            headers,
            attempts: 1,
          });
        } catch {
          continue;
        }
        const pk = ((res.generation ?? res.generations_by_pk ?? res) as Record<string, unknown>) ?? {};
        const status = String(pk.status ?? "").toUpperCase();
        if (REFUSED_STATUSES.has(status) || MODERATION_RE.test(status))
          return { kind: "refused", message: vendorWords(messageIn(pk) || status) };
        if (status === "FAILED") {
          const said = messageIn(pk);
          return MODERATION_RE.test(said)
            ? { kind: "refused", message: vendorWords(said) }
            : { kind: "failed", message: `Leonardo reported FAILED: ${vendorWords(said, 400)}` };
        }
        url = findVideoUrl(res);
      }
      if (!url)
        return { kind: "failed", message: `Leonardo produced no video within ${Math.round((maxPolls * pollMs) / 1000)}s (generation ${gid}).` };

      // 4. download.
      try {
        return { kind: "done", bytes: await download(url, opts.resolve) };
      } catch (e) {
        return { kind: "failed", message: `The finished clip could not be downloaded (generation ${gid}): ${describe(e)}` };
      }
    },
  };
}

function describe(e: unknown): string {
  if (e instanceof ImagingError) {
    const said = e.detail ? messageIn(e.detail) : "";
    return vendorWords(said ? `${e.message} ${said}` : e.message, 400);
  }
  if (e instanceof BlockedUrlError) return "the vendor pointed at an address this server will not fetch";
  return vendorWords(e instanceof Error ? e.message : String(e), 300);
}

/** v1 init-image: ask for a presigned slot, then POST the file into it. The
 *  id returned is what `type: "UPLOADED"` refers to. */
async function upload(input: VideoRenderInput, headers: Record<string, string>, resolve?: Resolver): Promise<string> {
  const ext = EXT[input.mime];
  const res = await requestJson<{ uploadInitImage?: { id?: string; url?: string; fields?: unknown } }>(
    "leonardo",
    `${BASE}/init-image`,
    { method: "POST", headers, body: { extension: ext }, attempts: 1 },
  );
  const slot = res?.uploadInitImage;
  if (!slot?.id || !slot.url) throw new Error("no upload slot in the init-image reply");
  const fields = (typeof slot.fields === "string" ? JSON.parse(slot.fields) : slot.fields) as Record<string, string>;

  // Order matters to the storage endpoint: every policy field, THEN the file.
  const form = new FormData();
  for (const [k, v] of Object.entries(fields ?? {})) form.append(k, String(v));
  const bytes = new Uint8Array(input.image);
  form.append("file", new Blob([bytes], { type: input.mime }), `key.${ext}`);
  // An undefined resolver takes safeFetch's default (real DNS).
  const up = await safeFetch(slot.url, { method: "POST", body: form }, resolve);
  if (![200, 201, 204].includes(up.status)) throw new Error(`the upload slot answered ${up.status}`);
  return slot.id;
}

async function download(url: string, resolve?: Resolver): Promise<Uint8Array> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 600_000);
  try {
    const init = { signal: ctl.signal, headers: { "User-Agent": "Mozilla/5.0", Accept: "*/*" } };
    const res = await safeFetch(url, init, resolve);
    if (!res.ok) throw new Error(`the CDN answered ${res.status}`);
    const declared = Number(res.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > MAX_CLIP_BYTES) throw new Error(`the clip is ${declared} bytes`);
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length === 0) throw new Error("the clip is empty");
    if (buf.length > MAX_CLIP_BYTES) throw new Error(`the clip is ${buf.length} bytes`);
    return buf;
  } finally {
    clearTimeout(timer);
  }
}
