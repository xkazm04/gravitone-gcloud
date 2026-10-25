import { err, ok, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import type { Estimate } from "@gt/domain/estimate";
import { LANE_CAPACITY, type ResourceLane } from "@gt/domain/lane";
import type { ModelOption, Receipt, ReceiptMode } from "@gt/domain/produce";
import type { Style } from "@gt/domain/style";
import { blockDigest, PROOF_CAP, sheetCoverage, STYLE_TRIALS } from "@gt/domain/style.ratchet";
import type { StyleAct } from "@gt/domain/styleView";
import { armLive, DRY } from "@gt/kernel/dryrun";
import { append } from "@gt/kernel/events";
import { enqueueIn } from "@gt/kernel/job";
import { quote } from "@gt/kernel/pricing/quote";
import { modelOptions } from "@gt/kernel/records/options";
import { readQueue } from "@gt/kernel/records/read";
import { receiptFor, type PlanLine } from "@gt/kernel/records/receipt";
import { TABLES } from "@gt/kernel/router/tables";
import type { Reader, Store } from "@gt/kernel/store";
import { readStyleIn } from "@gt/kernel/styles/driver";
import { STYLE_PRODUCER, STYLE_REQUEST, type StyleRequest } from "@gt/producers/style/define";

// A STYLE ACT'S RECEIPT, THEN ITS CONFIRM (Phase 4 COMMON decision 3, the produce flow's shape):
// no token returns the RECEIPT - the lines priced from the kernel's own table (`modelOptions`
// joined with `quote`, the arithmetic the meter books against), the lane's queue as read, the
// ETA - and writes nothing; the token confirms it. The token digests the lines, and every line's
// key names the style AT ITS REVISION, so any write to the style between the read and the
// confirm makes the receipt stale: the confirm answers the fresh receipt and launches nothing.
//
// ONE CONFIRM, ONE JOB (hitl-approval: resume-after-decision, "a duplicate of the same verdict
// finds the work already done"): the job id is derived from the token, so a double ⏎ or a
// retried request finds the job its first confirm made and answers it, never a second render.
//
// v1 priced neither act: the Playground showed a per-image figure and called the vendor from
// the browser; the Foundry's adopt spent its recognize call on a button.

/** The proof plates' option: the frames kind's Nano Banana row (router lane, quoted price). */
export function imageOption(day: string): ModelOption | undefined {
  return modelOptions("frames", day).find((o) => o.provider === "google");
}

/** Where both acts run: the image option's lane (cloud.google: Gemini renders and reads). */
export const STYLE_LANE: ResourceLane = imageOption(new Date().toISOString().slice(0, 10))?.lane ?? "cloud.google";

/** The palette read: the router's recognize model for Google, priced by the table (tokens are
 *  counted after the call, so the quote says why there is no figure). */
export function recognizeOption(day: string): ModelOption {
  const model = TABLES.image.candidates.find((c) => c.provider === "google")?.models["recognize"] ?? "recognize";
  const q = quote({ provider: "google", model, usage: {}, on: day });
  return {
    key: `style/google/${model}`,
    lane: STYLE_LANE,
    provider: "google",
    model,
    label: "palette readback",
    secondsPerUnit: 8,
    usdPerUnit: q.usd,
    ...(q.usd === null ? { unpricedReason: q.note } : {}),
    src: "illustrative",
    basis: { seconds: { src: "illustrative", note: "assumed: one recognize call off one kept plate" }, usd: { src: "real", note: q.note } },
  };
}

export type StyleActOptions = {
  readonly mode: ReceiptMode;
  readonly now: number;
  /** adopt only: the ledger holds a kept plate to read the palette from (v1 `palettePlate`). */
  readonly kept?: boolean;
};

const styleIdOf = (act: StyleAct): string => (act.kind === "adopt" ? act.fromStyleId : act.styleId);

/** Why the act cannot run on this style as it stands, in the work's words; null when it can. */
export function actRefusal(act: StyleAct, s: Style, kept: boolean): string | null {
  if (act.kind === "adopt") {
    if (s.block !== undefined) return `${s.name} already has a look — duplicate it to start another`;
    if (s.status === "candidate") return `${s.name} is a candidate; only a proven style is adopted`;
    return kept ? null : `${s.name} has no kept plate to read a palette from`;
  }
  if (s.block === undefined) return `${s.name} has no block yet — adopt it or write its four slots first`;
  const unknown = act.trialIds.filter((t) => !STYLE_TRIALS.some((x) => x.id === t));
  if (unknown.length > 0) return `no trial ${unknown.join(", ")}`;
  const approved = s.proofs.filter((p) => p.state === "approved").length - sheetCoverage(s).stale.size;
  return approved >= PROOF_CAP ? "the reference window is full — reject an approval to make room" : null;
}

/** A request before the confirm names who confirmed it (distributed over the two acts). */
type Unsigned = StyleRequest extends infer R ? (R extends unknown ? Omit<R, "by"> : never) : never;
type Read = { readonly receipt: Receipt; readonly request: Unsigned };

function readIn(r: Reader, act: StyleAct, o: StyleActOptions): Result<Read> {
  const row = readStyleIn(r, styleIdOf(act));
  if (row === undefined) return err("not-found", `no style ${styleIdOf(act)}`);
  const s = row.style;
  const why = actRefusal(act, s, o.kept ?? false);
  if (why !== null) return err("refused", why);
  const day = new Date(o.now).toISOString().slice(0, 10);
  const at = `${s.id}@${row.rev}`;
  let lines: PlanLine[];
  let request: Unsigned;
  if (act.kind === "adopt") {
    const option = recognizeOption(day);
    lines = [{ key: `${at}/palette`, label: "palette readback", lane: option.lane, units: 1, option, after: [], order: 0, status: "pending" }];
    request = { kind: "adopt", styleId: s.id, rev: row.rev, estimate: estimateOf(option) };
  } else {
    const option = imageOption(day);
    if (option === undefined) return err("internal", "the frames catalog offers no Google image option to price a proof with");
    lines = act.trialIds.map((t, i) => {
      const trial = STYLE_TRIALS.find((x) => x.id === t);
      return { key: `${at}/${t}`, label: `${trial?.label ?? t} · ${trial?.problem ?? "free"}`, lane: option.lane, units: 1, option, after: [], order: i, status: "pending" };
    });
    // actRefusal already refused a style with no block.
    const block = s.block;
    if (block === undefined) return err("refused", `${s.name} has no block yet`);
    request = { kind: "generate-proofs", styleId: s.id, rev: row.rev, digest: blockDigest(block), trialIds: [...act.trialIds], estimate: estimateOf(option) };
  }
  const receipt = receiptFor({ subject: { kind: "run", lane: "image" }, lines, plan: lines, queue: readQueue(r), capacity: LANE_CAPACITY, now: o.now, mode: o.mode });
  return ok({ receipt, request });
}

function estimateOf(o: ModelOption): Estimate {
  return o.usdPerUnit === null ? { seconds: o.secondsPerUnit, usd: null, unpricedReason: o.unpricedReason ?? "unpriced" } : { seconds: o.secondsPerUnit, usd: o.usdPerUnit };
}

/** The receipt, written nowhere. */
export function styleActReceipt(store: Store, act: StyleAct, o: StyleActOptions): Result<Receipt> {
  const r = store.read((x) => readIn(x, act, o));
  if (!r.ok) return r;
  return r.value.ok ? ok(r.value.value.receipt) : r.value;
}

/** The job a confirmed token makes: one per receipt, so a second confirm finds the first. */
export const styleJobId = (styleId: string, token: string): string => `job:style:${styleId}:${token.slice(0, 12)}`;

export type StyleLaunch = { readonly kind: "launched"; readonly jobId: string; readonly again: boolean } | { readonly kind: "stale"; readonly fresh: Receipt };

/**
 * The confirm: in ONE transaction, the receipt read again (a stale token answers the fresh one),
 * the mode armed (live is refused under GRAVITONE_DRY_ONLY, in armLive's words), the job enqueued
 * and its request recorded beside it - the request is what the job renders, whatever the style
 * becomes while it waits.
 */
export function launchStyleAct(store: Store, act: StyleAct, token: string, o: StyleActOptions & { readonly actor: Actor; readonly dryOnly: boolean }): Result<StyleLaunch> {
  const jobId = styleJobId(styleIdOf(act), token);
  const out = store.tx((t): Result<StyleLaunch> => {
    if (t.get("SELECT 1 AS x FROM jobs WHERE id = ?", jobId) !== undefined) return ok({ kind: "launched", jobId, again: true });
    const read = readIn(t, act, o);
    if (!read.ok) return read;
    if (read.value.receipt.token !== token) return ok({ kind: "stale", fresh: read.value.receipt });
    const mode = o.mode === "dry" ? ok(DRY) : armLive(o.actor, t.at, `receipt ${token.slice(0, 12)} confirmed`, { dryOnly: o.dryOnly });
    if (!mode.ok) return mode;
    const job = enqueueIn(t, { id: jobId, of: { kind: "run", id: `style:${styleIdOf(act)}` }, producer: STYLE_PRODUCER, lane: STYLE_LANE, mode: mode.value }, o.actor);
    append(t, { actor: o.actor, type: STYLE_REQUEST, subject: { kind: "job", id: job.id }, data: { ...read.value.request, by: o.actor.id } });
    return ok({ kind: "launched", jobId, again: false });
  });
  return out.ok ? out.value : out;
}
