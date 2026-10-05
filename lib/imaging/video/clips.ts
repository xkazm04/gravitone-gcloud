// THE CLIP RUNNER — request in, a stored record that walks to a terminal state.
// Server-only.
//
//   startClip(req)
//     validate            → 400, nothing written, nothing held
//     configured?         → 503 "no video vendor key on this server"
//     reserve the hold    → 402 over-budget, BEFORE the adapter is called
//     write `queued`      → the id the caller polls
//     run (detached)      → rendering → done | failed | refused
//
// The route answers 202 with the id as soon as the record exists; the run is a
// promise the route hands to `after()` so the platform keeps the instance for
// it. Failed and refused are both terminal and both carry the vendor's words,
// and they are different states because they want different next moves: a
// failure may be worth another press, a refusal will refuse again.
//
// MONEY. The hold is settled with the vendor's figure once the vendor ACCEPTED
// the job (served or not — a generation that started and then failed was still
// charged at start, v2 reports the charge "alongside" the job id), and released
// untouched when the vendor never took it.
//
// THE SEAM. `setVideoAdapterForTests` swaps the adapter; nothing else in this
// file knows which vendor is behind it.

import { scrub } from "@/lib/imaging/log";

import { releaseVideo, reserveVideo, settleVideo, type VideoHold } from "./budget";
import { VideoError } from "./errors";
import { leonardoVideoAdapter, MAX_VIDEO_PROMPT_CHARS, VIDEO_SIZE, type VideoAccepted, type VideoAdapter, type VideoOutcome } from "./leonardo";
import { clipPriceTable, estimateClipUsd, gateHoldUsd } from "./pricing";
import { mintClipId, patchClipRecord, readClipRecord, writeClipBytes, writeClipRecord } from "./store";
import {
  CLIP_DURATIONS,
  OFFERED_VIDEO_MODELS,
  VIDEO_MODELS,
  type ClipDuration,
  type ClipRecord,
  type VideoCapability,
  type VideoClipRequest,
  type VideoModel,
} from "./types";

/* ── the adapter seam ─────────────────────────────────────────────────────── */

let override: VideoAdapter | null = null;

/** Probes only: run every clip through `a` instead of the vendor. `null`
 *  restores the real adapter. */
export function setVideoAdapterForTests(a: VideoAdapter | null): void {
  override = a;
}

function adapter(): VideoAdapter {
  return override ?? leonardoVideoAdapter();
}

/** What the Animate button needs before it is pressed. Discloses whether a key
 *  is configured, so the route that serves it is access-gated. */
export function videoCapability(): VideoCapability {
  const configured = adapter().configured();
  return { configured, models: configured ? [...OFFERED_VIDEO_MODELS] : [], priceUsd: clipPriceTable() };
}

/* ── validation ───────────────────────────────────────────────────────────── */

const PROJECT_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;
const MIMES = ["image/png", "image/jpeg", "image/webp"] as const;
/** A 1472px key image is ~3 MB as PNG; 20 MB of decoded bytes bounds a body
 *  that is not a key image at all. */
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

const bad = (m: string) => new VideoError(m, "bad-request");

/** The body as a typed request, or a 400 naming the first field that is wrong. */
export function parseClipRequest(body: unknown): VideoClipRequest {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw bad("The body must be a JSON object.");
  const b = body as Record<string, unknown>;
  if (typeof b.projectId !== "string" || !PROJECT_ID_RE.test(b.projectId)) throw bad("`projectId` is required.");
  const image = typeof b.image === "string" ? b.image.replace(/^data:[^;]+;base64,/, "") : "";
  if (!image) throw bad("`image` (base64) is required.");
  if (!(MIMES as readonly unknown[]).includes(b.mime)) throw bad(`\`mime\` must be one of ${MIMES.join(", ")}.`);
  if (typeof b.motion !== "string" || !b.motion.trim()) throw bad("`motion` is required.");
  if (b.motion.length > MAX_VIDEO_PROMPT_CHARS) throw bad(`\`motion\` is longer than ${MAX_VIDEO_PROMPT_CHARS} characters.`);
  if (!(CLIP_DURATIONS as readonly unknown[]).includes(b.durationS))
    throw bad(`\`durationS\` must be one of ${CLIP_DURATIONS.join(", ")}.`);
  if (typeof b.aspect !== "string" || !(b.aspect in VIDEO_SIZE))
    throw bad(`\`aspect\` must be one of ${Object.keys(VIDEO_SIZE).join(", ")}.`);
  if (!(VIDEO_MODELS as readonly unknown[]).includes(b.model)) throw bad(`\`model\` must be one of ${VIDEO_MODELS.join(", ")}.`);
  return {
    projectId: b.projectId,
    image,
    mime: b.mime as VideoClipRequest["mime"],
    motion: b.motion,
    durationS: b.durationS as ClipDuration,
    aspect: b.aspect as VideoClipRequest["aspect"],
    model: b.model as VideoModel,
  };
}

/* ── live runs ────────────────────────────────────────────────────────────── */

// On globalThis so a dev-server module reload does not forget a run that is
// still going and then report it as interrupted.
const LIVE_KEY = Symbol.for("gravitone.video.liveClips");
const live: Set<string> = ((globalThis as Record<symbol, unknown>)[LIVE_KEY] as Set<string> | undefined) ??
  ((globalThis as Record<symbol, unknown>)[LIVE_KEY] = new Set<string>());

const TERMINAL = new Set<ClipRecord["status"]>(["done", "failed", "refused"]);

/**
 * The record as a reader should see it. A clip left `queued`/`rendering` by a
 * process that is no longer running it (a restart mid-render) can never move
 * again, so it is closed as `failed` with that said — rather than polled
 * forever as if something were still happening.
 */
export async function readClip(clipId: string): Promise<ClipRecord | null> {
  const rec = await readClipRecord(clipId);
  if (!rec || TERMINAL.has(rec.status) || live.has(clipId)) return rec;
  return patchClipRecord(clipId, (r) =>
    TERMINAL.has(r.status)
      ? r
      : {
          ...r,
          status: "failed",
          error: `The server stopped while this clip was ${r.status}${r.vendorJobId ? ` (vendor generation ${r.vendorJobId})` : ""}; it was never collected.`,
          finishedAt: Date.now(),
        },
  );
}

/* ── start ────────────────────────────────────────────────────────────────── */

export interface StartedClip {
  clipId: string;
  /** Settles when the clip reaches a terminal state. Never rejects. */
  done: Promise<ClipRecord>;
}

export async function startClip(req: VideoClipRequest, now: number = Date.now()): Promise<StartedClip> {
  const a = adapter();
  if (!a.configured()) throw new VideoError("No video vendor key on this server.", "no-key");

  const image = Buffer.from(req.image, "base64");
  if (image.length === 0) throw bad("`image` is not base64.");
  if (image.length > MAX_IMAGE_BYTES) throw bad(`\`image\` is ${Math.round(image.length / 1048576)} MB; the ceiling is 20 MB.`);

  // THE PRE-GATE. Throws over-budget before anything is written or dispatched.
  const hold = reserveVideo(gateHoldUsd(req.model, req.durationS), now);

  const clipId = mintClipId(now);
  const est = estimateClipUsd(req.model, req.durationS);
  const rec: ClipRecord = {
    clipId,
    projectId: req.projectId,
    status: "queued",
    model: req.model,
    durationS: req.durationS,
    aspect: req.aspect,
    motion: req.motion,
    vendorJobId: null,
    costUsd: est.usd,
    costBasis: est.basis,
    error: null,
    createdAt: now,
    finishedAt: null,
  };
  try {
    await writeClipRecord(rec);
  } catch (e) {
    releaseVideo(hold);
    throw e;
  }
  live.add(clipId);
  console.log(`[video] clip queued id=${clipId} project=${req.projectId} model=${req.model} durationS=${req.durationS} hold=$${hold.amount.toFixed(2)}`);
  const done = run(a, rec, image, req.mime, hold).finally(() => live.delete(clipId));
  return { clipId, done };
}

async function run(
  a: VideoAdapter,
  rec: ClipRecord,
  image: Buffer,
  mime: VideoClipRequest["mime"],
  hold: VideoHold,
): Promise<ClipRecord> {
  const { clipId } = rec;
  let accepted: VideoAccepted | null = null;
  let outcome: VideoOutcome;
  try {
    await patchClipRecord(clipId, (r) => ({ ...r, status: "rendering" }));
    outcome = await a.render(
      {
        image: new Uint8Array(image),
        mime,
        prompt: rec.motion,
        durationS: rec.durationS,
        aspect: rec.aspect,
        model: rec.model,
      },
      async (acc) => {
        accepted = acc;
        await patchClipRecord(clipId, (r) => ({
          ...r,
          vendorJobId: acc.vendorJobId,
          // The vendor's figure replaces the estimate only when it HAS one.
          ...(acc.costUsd !== null ? { costUsd: acc.costUsd, costBasis: acc.costBasis } : {}),
        }));
      },
    );
    if (outcome.kind === "done") await writeClipBytes(clipId, outcome.bytes);
  } catch (e) {
    outcome = { kind: "failed", message: `The clip run failed: ${scrub(e instanceof Error ? e.message : String(e)).slice(0, 300)}` };
  }

  // Money first, so a record write that throws below cannot leave a hold alive.
  const acc = accepted as VideoAccepted | null;
  if (acc) {
    settleVideo(hold, {
      usd: acc.costUsd,
      project: rec.projectId,
      provider: a.id,
      model: rec.model,
      outcome: outcome.kind === "done" ? "served" : "failed",
      basis: acc.costBasis,
    });
  } else releaseVideo(hold);

  const finished = Date.now();
  let out: ClipRecord;
  try {
    out = await patchClipRecord(clipId, (r) => ({
      ...r,
      status: outcome.kind,
      error: outcome.kind === "done" ? null : outcome.message,
      finishedAt: finished,
    }));
  } catch (e) {
    console.error(`[video] clip record write failed id=${clipId} ${scrub(String(e)).slice(0, 200)}`);
    out = { ...rec, status: outcome.kind, error: outcome.kind === "done" ? null : outcome.message, finishedAt: finished };
  }
  console.log(
    `[video] clip ${outcome.kind} id=${clipId} model=${rec.model} vendorJob=${acc?.vendorJobId ?? "-"} ` +
      `cost=${acc?.costUsd != null ? `$${acc.costUsd.toFixed(4)}` : "unpriced"} ms=${finished - rec.createdAt}`,
  );
  return out;
}
