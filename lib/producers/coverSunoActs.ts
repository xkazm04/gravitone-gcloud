import { readFile } from "node:fs/promises";

import type { CoverRecord } from "@gt/domain/cover";
import { coverSunoJobId, type CoverSunoSend, type CoverSunoTake, type SunoCoverControls, type SunoCoverTakeN } from "@gt/domain/cover.suno";
import { AppError, errorMessage } from "@gt/domain/errors";
import type { EventData } from "@gt/domain/event";
import type { Job } from "@gt/domain/job";
import type { CallIntent } from "@gt/kernel/dryrun";
import type { Ending, StepContext, StepOutcome } from "@gt/kernel/job-core";
import { assertFence } from "@gt/kernel/lease";
import type { SettleEntry } from "@gt/kernel/spend/ledger";
import { JOB_USD } from "@gt/kernel/spend/meter";
import { COVER_SUNO, coverStep, type CoverSunoPorts, type CoverSunoRequest } from "@gt/producers/cover-suno/define";
import { SUNO_CREDITS } from "@gt/producers/suno/producer";

import type { SunoApi } from "../suno/api/client.ts";
import type { Analysis, Clip, CoverBody, Listen } from "../suno/api/wire.ts";
import { coverFileAbs, mutateCover, readCover } from "../sound/cover/store.ts";
import { CAP_MS, foldRead, phaseOf, POLL_MS, SUNO_LISTEN_QUESTION } from "../sound/suno/sunoRead.ts";

// THE SEND'S ACTS - the ports of packages/producers/src/cover-suno/define.ts over Suno's official API and the cover
// store (spark suno-covers).
//
//   upload    the winner's mp3 to Suno: a session, one PUT, a complete, then the clip polled to `complete`. Skipped when
//             cover.json already names `suno.uploadClipId` (one upload per cover); written once the clip is whole.
//   cover-t   one POST /covers (the owner's style, words, model and sliders; the idempotency key `gt-cover-<id>-<n>-<t>`),
//             then the clip polled to `complete`. The account's song credits are read before and after: the delta is
//             booked on the entry's reason (credits are not dollars) and added to the send's `creditsSpent`. A refusal
//             is Suno's sentence kept verbatim on the take AND the send, and it is never retried around: only a 5xx, a
//             429 or a timeout (`unavailable`) is a vendor failure the kernel's breaker may try again.
//   read-t    Suno's free analysis, alignment and listen of the take, folded (lib/sound/suno/sunoRead.ts foldRead) and
//             kept on the take. A refused read is kept verbatim as `readRefused`; it never fails the send.
//   ended     the send told the job's ending: done when both takes are complete, else failed with the first sentence.
//
// A take the record already holds is the step's (a drive that died between the take and its booking): nothing is bought
// twice. Every cover.json write is fenced against the job's slot first (the cover acts' `fence`).

/** What a test replaces: Suno's API, the clock and the waits. */
export type CoverSunoEngines = {
  readonly api?: SunoActsApi;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly now?: () => number;
  /** Between polls of a clip, ms (Suno's cover takes minutes). */
  readonly pollMs?: number;
  readonly uploadCapMs?: number;
  readonly coverCapMs?: number;
  /** Between polls of a read part, and how long one read waits (lib/sound/suno/sunoRead.ts POLL_MS, CAP_MS). */
  readonly readPollMs?: number;
  readonly readCapMs?: number;
};

export type SunoActsApi = Pick<SunoApi, "usage" | "getClip" | "uploadSession" | "putUpload" | "completeUpload" | "cover" | "analysis" | "alignment" | "listen" | "listenRead">;

export const CLIP_POLL_MS = 5_000;
export const UPLOAD_CAP_MS = 180_000;
export const COVER_CAP_MS = 360_000;
const WINNER_MIME = "audio/mpeg";

const data = (x: unknown): EventData => JSON.parse(JSON.stringify(x)) as EventData;
const produced = (output: unknown): StepOutcome => ({ kind: "produced", output: data(output), costUsd: 0 });
const fatal = (e: unknown): StepOutcome => ({ kind: "fatal", code: e instanceof AppError ? e.code : "internal", message: errorMessage(e) });
const NOT_LIVE = "a cover goes to Suno live; a dry job sends none";

/** A refusal as an outcome: only `unavailable` (a 5xx, a 429, a timeout) is a vendor failure; the rest is fatal. */
const refusal = (e: AppError): StepOutcome => (e.code === "unavailable" ? { kind: "vendor-failure", message: e.message } : { kind: "fatal", code: e.code, message: e.message });

function fence(ctx: StepContext): void {
  const { slot, lease } = ctx.job;
  if (slot === undefined || lease === undefined) throw new AppError("conflict", `job ${ctx.job.id} holds no slot; cover.json is not written`);
  const r = ctx.fx.tx("cover-suno.fence", (t) => assertFence(t, slot, lease.fence));
  if (!r.ok) throw r.error;
}

async function coverOf(req: CoverSunoRequest): Promise<CoverRecord> {
  const c = await readCover(req.coverId);
  if (c === undefined) throw new AppError("not-found", `no cover ${req.coverId}`);
  return c;
}

const sendOf = (c: CoverRecord, n: number): CoverSunoSend | undefined => c.suno?.sends.find((s) => s.n === n);
const takeOf = (s: CoverSunoSend | undefined, take: SunoCoverTakeN): CoverSunoTake | undefined => s?.takes.find((t) => t.take === take);

/** The send as its launch writes it: what a drive that finds none (the launch's record write not yet landed) starts from. */
function sendFrom(req: CoverSunoRequest, at: string): CoverSunoSend {
  const { coverId: _c, n, uploadClipId: _u, takes: _t, by: _b, estimates: _e, ...plan } = req;
  return { n, at, jobId: coverSunoJobId(req.coverId, n), state: "queued", plan, takes: [{ take: 1, state: "pending" }, { take: 2, state: "pending" }] };
}

const withTake = (s: CoverSunoSend, t: CoverSunoTake): CoverSunoSend => ({ ...s, takes: [...s.takes.filter((x) => x.take !== t.take), t].sort((a, b) => a.take - b.take) });

/** One fenced change of the send on the record. */
async function patchSend(req: CoverSunoRequest, ctx: StepContext, now: () => number, f: (s: CoverSunoSend, c: CoverRecord) => CoverSunoSend, uploadClipId?: string): Promise<CoverRecord> {
  fence(ctx);
  return mutateCover(req.coverId, (c) => {
    const sends = c.suno?.sends ?? [];
    const was = sends.find((s) => s.n === req.n) ?? sendFrom(req, new Date(now()).toISOString());
    const next = f(was, c);
    return { ...c, suno: { ...c.suno, ...(uploadClipId === undefined ? {} : { uploadClipId }), sends: [...sends.filter((s) => s.n !== req.n), next].sort((a, b) => a.n - b.n) } };
  });
}

/** The first step a drive performs moves the send to running. */
async function running(req: CoverSunoRequest, ctx: StepContext, now: () => number): Promise<CoverRecord> {
  const c = await coverOf(req);
  const s = sendOf(c, req.n);
  if (s?.state === "running") return c;
  return patchSend(req, ctx, now, (x) => ({ ...x, state: "running" }));
}

const defaults = async (e: CoverSunoEngines): Promise<{ api: SunoActsApi; sleep: (ms: number) => Promise<void>; now: () => number }> => ({
  api: e.api ?? (await import("../suno/api/client.ts")).sunoApi(),
  sleep: e.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))),
  now: e.now ?? Date.now,
});

/** Suno's words for a clip that errored. */
function clipWords(clip: Clip): string {
  const x = clip.error;
  const words = typeof x === "string" ? x : x !== null && typeof x === "object" && "message" in x && typeof x.message === "string" ? x.message : x === undefined || x === null ? "" : JSON.stringify(x);
  return (words.trim() === "" ? `suno answered status ${clip.status} for "${clip.title ?? clip.id}" and no reason` : words).slice(0, 1800);
}

type Waited = { readonly kind: "complete"; readonly clip: Clip } | { readonly kind: "error"; readonly clip: Clip } | { readonly kind: "timeout"; readonly clip: Clip };

/** Ask the clip every pollMs until it is complete or errored, or the cap passes. */
async function clipUntil(api: SunoActsApi, id: string, o: { readonly pollMs: number; readonly capMs: number; readonly sleep: (ms: number) => Promise<void>; readonly now: () => number }): Promise<{ readonly ok: true; readonly value: Waited } | { readonly ok: false; readonly error: AppError }> {
  const start = o.now();
  for (;;) {
    const r = await api.getClip(id);
    if (!r.ok) return r;
    const phase = phaseOf(r.value.status);
    if (phase === "complete") return { ok: true, value: { kind: "complete", clip: r.value } };
    if (phase === "unavailable") return { ok: true, value: { kind: "error", clip: r.value } };
    if (o.now() - start + o.pollMs > o.capMs) return { ok: true, value: { kind: "timeout", clip: r.value } };
    await o.sleep(o.pollMs);
  }
}

/* ── upload ───────────────────────────────────────────────────────────────── */

async function uploadAct(e: CoverSunoEngines, req: CoverSunoRequest, ctx: StepContext): Promise<StepOutcome> {
  if (ctx.job.mode.kind !== "live") return { kind: "fatal", code: "refused", message: NOT_LIVE };
  const d = await defaults(e);
  const c = await running(req, ctx, d.now);
  const held = c.suno?.uploadClipId ?? req.uploadClipId;
  if (held !== undefined) return produced({ clipId: held, reused: true });
  if (c.exportFile === undefined) return { kind: "fatal", code: "refused", message: `cover ${c.id} has no winner file to send` };
  const bytes = new Uint8Array(await readFile(coverFileAbs(c.id, c.exportFile)));
  const session = await d.api.uploadSession(c.title.slice(0, 256));
  if (!session.ok) return refusal(session.error);
  const put = await d.api.putUpload(session.value.upload_url, bytes, WINNER_MIME);
  if (!put.ok) return refusal(put.error);
  const done = await d.api.completeUpload(session.value.id);
  if (!done.ok) return refusal(done.error);
  const waited = await clipUntil(d.api, done.value.id, { pollMs: e.pollMs ?? CLIP_POLL_MS, capMs: e.uploadCapMs ?? UPLOAD_CAP_MS, sleep: d.sleep, now: d.now });
  if (!waited.ok) return refusal(waited.error);
  if (waited.value.kind === "error") return { kind: "fatal", code: "refused", message: clipWords(waited.value.clip) };
  if (waited.value.kind === "timeout") return { kind: "vendor-failure", message: `suno is still processing the upload "${done.value.id}" after ${Math.round((e.uploadCapMs ?? UPLOAD_CAP_MS) / 1000)} s` };
  const clipId = done.value.id;
  await patchSend(req, ctx, d.now, (s) => s, clipId);
  return produced({ clipId, reused: false, bytes: bytes.byteLength });
}

/* ── cover-t ──────────────────────────────────────────────────────────────── */

const controlsOf = (c: SunoCoverControls): NonNullable<CoverBody["controls"]> => ({
  ...(c.audioInfluence === undefined ? {} : { audio_influence: c.audioInfluence }),
  ...(c.styleInfluence === undefined ? {} : { style_influence: c.styleInfluence }),
  ...(c.weirdness === undefined ? {} : { weirdness: c.weirdness }),
  ...(c.variety === undefined ? {} : { variety: c.variety }),
});

/** The POST's body: the owner's words, as the plan holds them. Empty lyrics are omitted (an instrumental cover). */
export function coverBodyOf(req: CoverSunoRequest, title: string, take: SunoCoverTakeN): CoverBody {
  return {
    style: req.style,
    ...(req.lyrics.trim() === "" ? {} : { lyrics: req.lyrics }),
    title: `${title.slice(0, 240)} (suno ${take})`,
    ...(req.durationS === undefined ? {} : { duration: req.durationS }),
    model: req.model,
    ...(req.negativeStyle === undefined ? {} : { negative_style: req.negativeStyle }),
    ...(req.controls === undefined || Object.keys(req.controls).length === 0 ? {} : { controls: controlsOf(req.controls) }),
    idempotency_key: `gt-cover-${req.coverId}-${req.n}-${take}`,
  };
}

const creditsOf = async (api: SunoActsApi): Promise<number | null> => {
  const u = await api.usage();
  const left = u.ok ? u.value.suno_account?.credits_remaining : undefined;
  return typeof left === "number" ? left : null;
};

/** The cover's entry: unpriced, with the credits it spent (before - after, read off the account) in its reason. */
function creditsEntry(model: string, take: number, before: number | null, after: number | null, outcome: "served" | "failed", why?: string): SettleEntry {
  const spent = before !== null && after !== null ? before - after : null;
  const reason = why ?? (spent !== null && spent >= 0 ? `${SUNO_CREDITS}; this cover spent ${spent} credits (${before} -> ${after} left)` : SUNO_CREDITS);
  return { amount: undefined, outcome, basis: "credits", axes: { producer: COVER_SUNO, model, take: String(take) }, reason };
}

type Covered =
  | { readonly kind: "complete"; readonly clip: Clip; readonly spent: number | null }
  | { readonly kind: "error"; readonly clip: Clip; readonly spent: number | null }
  | { readonly kind: "timeout"; readonly clipId: string }
  | { readonly kind: "refused"; readonly error: AppError };

const spentOf = (before: number | null, after: number | null): number | null => (before !== null && after !== null && before - after >= 0 ? before - after : null);

const songUrlOf = (clip: Clip): string => {
  try {
    const u = new URL(clip.song_url ?? "");
    if (u.protocol === "https:" && clip.song_url !== undefined && clip.song_url !== null && clip.song_url.length <= 500) return clip.song_url;
  } catch {
    // no usable page: suno.com's own address for the song
  }
  return `https://suno.com/song/${clip.id}`;
};

async function coverAct(e: CoverSunoEngines, req: CoverSunoRequest, take: SunoCoverTakeN, ctx: StepContext): Promise<StepOutcome> {
  if (ctx.job.mode.kind !== "live") return { kind: "fatal", code: "refused", message: NOT_LIVE };
  const d = await defaults(e);
  const c = await running(req, ctx, d.now);
  const was = takeOf(sendOf(c, req.n), take);
  // A drive that died between the take and the booking: the take is the cover's.
  if (was?.state === "complete" && was.clipId !== undefined) return produced({ take, clipId: was.clipId, held: true });
  const upload = c.suno?.uploadClipId ?? req.uploadClipId;
  if (upload === undefined) return { kind: "fatal", code: "internal", message: `cover ${c.id} has no upload on Suno to cover take ${take} from` };
  const wait = { pollMs: e.pollMs ?? CLIP_POLL_MS, capMs: e.coverCapMs ?? COVER_CAP_MS, sleep: d.sleep, now: d.now };
  const keep = (t: CoverSunoTake, extra?: (s: CoverSunoSend) => CoverSunoSend): Promise<CoverRecord> => patchSend(req, ctx, d.now, (s) => (extra ?? ((x) => x))(withTake(s, t)));

  let covered: Covered;
  if (was?.clipId !== undefined) {
    // A cover Suno already took (the POST landed, the poll did not finish): asked again, never bought again.
    const w = await clipUntil(d.api, was.clipId, wait);
    if (!w.ok) return refusal(w.error);
    covered = w.value.kind === "timeout" ? { kind: "timeout", clipId: was.clipId } : { ...w.value, spent: null };
  } else {
    const intent: CallIntent<Covered> = {
      provider: "suno",
      model: req.model,
      usage: {},
      quote: { usd: null, basis: "unpriced", note: SUNO_CREDITS },
      payload: { cover: req.coverId, send: req.n, take, upload, body: coverBodyOf(req, c.title, take) },
      subject: { kind: "job", id: ctx.job.id },
    };
    const r = await ctx.meter.paid(JOB_USD, 0, intent, async () => {
      const before = await creditsOf(d.api);
      const made = await d.api.cover(upload, coverBodyOf(req, c.title, take));
      if (!made.ok) return { value: { kind: "refused", error: made.error } satisfies Covered, entries: [creditsEntry(req.model, take, before, null, "failed", `suno refused the cover: ${made.error.message}`)] };
      const clipId = made.value.clipIds[0];
      if (clipId === undefined) return { value: { kind: "refused", error: new AppError("unavailable", "suno answered the cover with no clip") } satisfies Covered, entries: [creditsEntry(req.model, take, before, null, "failed", "suno answered the cover with no clip")] };
      // The clip is Suno's from here on: kept at once, so a drive that dies in the poll asks for it again, never buys it again.
      try {
        await keep({ take, state: "streaming", clipId });
      } catch {
        // the final write below carries it; a record that cannot be written must not hide a spend
      }
      const w = await clipUntil(d.api, clipId, wait);
      const after = await creditsOf(d.api);
      const spent = spentOf(before, after);
      if (!w.ok) return { value: { kind: "refused", error: w.error } satisfies Covered, entries: [creditsEntry(req.model, take, before, after, "served")] };
      const value: Covered = w.value.kind === "timeout" ? { kind: "timeout", clipId } : { ...w.value, spent };
      return { value, entries: [creditsEntry(req.model, take, before, after, w.value.kind === "error" ? "failed" : "served")] };
    });
    if (!r.ok) return { kind: "fatal", code: r.error.code, message: r.error.message };
    covered = r.value;
  }

  if (covered.kind === "refused") {
    if (covered.error.code === "unavailable") return refusal(covered.error);
    const message = covered.error.message.slice(0, 2000);
    await keep({ take, state: "failed", error: message }, (s) => ({ ...s, error: s.error ?? message }));
    return { kind: "fatal", code: covered.error.code, message };
  }
  if (covered.kind === "timeout") return { kind: "vendor-failure", message: `suno is still making take ${take} (clip ${covered.clipId}) after ${Math.round(wait.capMs / 1000)} s` };
  if (covered.kind === "error") {
    const message = clipWords(covered.clip);
    await keep({ take, state: "failed", clipId: covered.clip.id, error: message }, (s) => ({ ...s, error: s.error ?? message, ...(covered.spent === null ? {} : { creditsSpent: (s.creditsSpent ?? 0) + covered.spent }) }));
    return { kind: "fatal", code: "refused", message };
  }
  const clip = covered.clip;
  const duration = clip.metadata?.duration;
  const title = (clip.title ?? "").trim() === "" ? `${c.title} (suno ${take})` : (clip.title ?? "").trim().slice(0, 256);
  await keep(
    { take, state: "complete", clipId: clip.id, title, ...(typeof duration === "number" && duration > 0 ? { durationS: duration } : {}), songUrl: songUrlOf(clip) },
    (s) => (covered.spent === null ? s : { ...s, creditsSpent: (s.creditsSpent ?? 0) + covered.spent }),
  );
  return produced({ take, clipId: clip.id, creditsSpent: covered.spent, held: false, step: coverStep(take) });
}

/* ── read-t ───────────────────────────────────────────────────────────────── */

type Part<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: AppError };

async function readAct(e: CoverSunoEngines, req: CoverSunoRequest, take: SunoCoverTakeN, ctx: StepContext): Promise<StepOutcome> {
  const d = await defaults(e);
  const c = await running(req, ctx, d.now);
  const t = takeOf(sendOf(c, req.n), take);
  if (t === undefined || t.state !== "complete" || t.clipId === undefined) return produced({ take, skipped: true, why: `take ${take} was not made` });
  if (t.read !== undefined && t.read.status === "complete") return produced({ take, held: true });
  const clipId = t.clipId;
  const pollMs = e.readPollMs ?? POLL_MS;
  const capMs = e.readCapMs ?? CAP_MS;
  const start = d.now();
  /** Ask, then ask again every pollMs while the answer is still out, until the cap. */
  const polled = async <T extends { readonly status: string }>(first: () => Promise<Part<T>>, again: () => Promise<Part<T>>): Promise<Part<T>> => {
    let r = await first();
    while (r.ok && phaseOf(r.value.status) === "processing" && d.now() - start + pollMs <= capMs) {
      await d.sleep(pollMs);
      r = await again();
    }
    return r;
  };
  let listenId = "";
  const [analysis, listen, alignment] = await Promise.all([
    polled<Analysis>(
      () => d.api.analysis(clipId),
      () => d.api.analysis(clipId),
    ),
    polled<Listen>(
      async () => {
        const asked = await d.api.listen(clipId, SUNO_LISTEN_QUESTION);
        if (asked.ok) listenId = asked.value.id;
        return asked;
      },
      () => d.api.listenRead(listenId),
    ),
    d.api.alignment(clipId),
  ]);
  if (!analysis.ok || !listen.ok || !alignment.ok) {
    const refused = (!analysis.ok ? analysis.error : !listen.ok ? listen.error : !alignment.ok ? alignment.error : undefined)?.message ?? "suno refused the read";
    await patchSend(req, ctx, d.now, (s) => withTake(s, { ...t, readRefused: refused.slice(0, 2000) }));
    return produced({ take, refused: refused.slice(0, 300) });
  }
  const read = foldRead(new Date(d.now()).toISOString(), analysis.value, { kind: "read", value: { ...listen.value, id: listenId || listen.value.id } }, alignment.value, undefined);
  const { readRefused: _gone, ...kept } = t;
  await patchSend(req, ctx, d.now, (s) => withTake(s, { ...kept, read }));
  return produced({ take, read: read.status, bpm: read.bpm, key: read.key });
}

/* ── ended ────────────────────────────────────────────────────────────────── */

/** The state a finished job leaves its send in, or null when the ending leaves it as it is (an interruption or a stop:
 *  the job may yet resume). */
export function settledSend(s: CoverSunoSend, job: { readonly id: string; readonly error?: { readonly message: string } }, ending: Ending): CoverSunoSend | null {
  if (ending !== "done" && ending !== "failed") return null;
  if (s.jobId !== job.id) return null;
  const both = s.takes.length === 2 && s.takes.every((t) => t.state === "complete");
  if (ending === "done" && both) return { ...s, state: "done" };
  const why = s.error ?? s.takes.find((t) => t.error !== undefined)?.error ?? job.error?.message ?? `the send ended with its takes unfinished`;
  return { ...s, state: "failed", error: why.slice(0, 2000) };
}

async function ended(req: CoverSunoRequest, job: Job, ending: Ending): Promise<void> {
  const c = await readCover(req.coverId);
  const s = c === undefined ? undefined : sendOf(c, req.n);
  if (s === undefined || settledSend(s, job, ending) === null) return;
  await mutateCover(req.coverId, (x) => ({
    ...x,
    suno: { ...x.suno, sends: (x.suno?.sends ?? []).map((y) => (y.n === req.n ? (settledSend(y, job, ending) ?? y) : y)) },
  }));
}

const guarded =
  <A extends unknown[]>(f: (...a: A) => Promise<StepOutcome>) =>
  async (...a: A): Promise<StepOutcome> => {
    try {
      return await f(...a);
    } catch (x) {
      return fatal(x);
    }
  };

export function coverSunoActs(e: CoverSunoEngines = {}): Pick<CoverSunoPorts, "upload" | "cover" | "read" | "ended"> {
  return {
    upload: guarded((req: CoverSunoRequest, ctx: StepContext) => uploadAct(e, req, ctx)),
    cover: guarded((req: CoverSunoRequest, take: SunoCoverTakeN, ctx: StepContext) => coverAct(e, req, take, ctx)),
    read: guarded((req: CoverSunoRequest, take: SunoCoverTakeN, ctx: StepContext) => readAct(e, req, take, ctx)),
    ended,
  };
}
