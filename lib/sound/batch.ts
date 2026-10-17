// THE OPERATOR BATCH'S DOOR - N identical briefs to one engine, priced through a receipt and
// confirmed by its token, so the takes that come back differ only by the provider's variance
// (Phase 6, L66; v1 app/playground/triage/Batch.tsx, which spent on the press with no receipt).
//
// WHICH ENGINE is the desk's registry's answer (lib/sound/engines.ts `can`), never this file's:
//   music  Suno, the desk's live music maker since Phase 5 - N drafts of ONE form, each its own
//          box.chrome job, all N priced on one receipt (lib/producers/sound.ts `launchJobs`)
//          and drafted only on the confirm (lib/sound/suno/draft.ts `ensureDraftJob`), the
//          single-draft door's order (lib/producers/suno.ts `launchSunoDraft`) for N;
//   sfx    ElevenLabs, as ONE Run of N clips under the catalog's `sfx` producer (./sfxJob.ts):
//          the records' receipt (kernel records/launch `runReceipt`) over the composer's own
//          input, keyed by a digest of the brief so a token cannot confirm another brief, and
//          `launchRun` on the confirm after the brief is filed in the sound store.
// v1's batch rendered music on ElevenLabs. Nothing on the desk launches an ElevenLabs music
// render (engines.ts NO_DESK_PRODUCER: the catalog gives that work to the `score` part producer),
// so a music batch measures Suno's variance until one does; the registry says which, and a
// withheld engine is refused here with the registry's own reason.
//
// The receipt writes nothing (no draft, no brief file, no record); the confirm re-reads it and a
// moved queue answers the fresh receipt with nothing launched - and the drafts a stale Suno
// confirm wrote are taken back out (`dropUnlaunched`).
import { createHash } from "node:crypto";

import { err, isAppError, ok, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import type { ComposerInput, Receipt, ReceiptMode } from "@gt/domain/produce";
import { launchRun, runReceipt } from "@gt/kernel/records/launch";
import type { Store } from "@gt/kernel/store";
import { batchBrief, batchProblem, type BatchBrief, type BatchForm, type BatchKind } from "@gt/ui/components/audio/batch.ts";

import { launchJobs, type LaunchSpec } from "../producers/sound.ts";
import { SUNO_PRODUCER, sunoKernelId, sunoLine } from "../producers/suno.ts";
import { can, engineById, makeOp, type EngineDef } from "./engines.ts";
import { sfxRunId, writeBrief } from "./sfxJob.ts";
import { SoundError } from "./store.ts";
import { draftJobId, dropUnlaunched, ensureDraftJob, FLOOR_LANE, sentenceStand } from "./suno/draft.ts";
import { withSuno } from "./suno/store.ts";
import type { SunoFields, SunoJob } from "../suno/types.ts";

export const BATCH_RE = /^b[a-z0-9]{6,30}$/;

/** A batch id: `b` + base-36 time + hex, minted by the receipt and carried by its token. */
export const mintBatchId = (now: number, hex: string): string => `b${now.toString(36)}${hex}`.slice(0, 31);

export type BatchOptions = {
  readonly mode: ReceiptMode;
  readonly ceilingUsd?: number;
  /** Absent: the receipt, nothing written. */
  readonly token?: string;
  readonly actor: Actor;
  readonly dryOnly: boolean;
  readonly now: number;
  readonly store: Store;
};

export type BatchOutcome =
  | { readonly kind: "receipt"; readonly receipt: Receipt }
  | { readonly kind: "stale"; readonly fresh: Receipt }
  | { readonly kind: "launched"; readonly engine: "suno" | "elevenlabs"; readonly runIds: readonly string[]; readonly jobIds: readonly string[] };

export type BatchSend = { readonly kind: BatchKind; readonly form: BatchForm; readonly batch: string };

/** The engine a batch of `kind` runs on, when the registry says it can make that kind here; else
 *  the registry's own reason it cannot (a withheld op's sentence), verbatim. */
export function batchEngine(reg: readonly EngineDef[], kind: BatchKind): Result<"suno" | "elevenlabs"> {
  const id = kind === "music" ? "suno" : "elevenlabs";
  const op = makeOp(kind);
  const e = engineById(reg, id);
  if (can(e, op)) return ok(id);
  const why = e?.withheld.find((w) => w.op === op)?.reason;
  return err("unavailable", `${e?.name ?? id} makes no ${kind} batch on this desk${why === undefined ? "" : `: ${why}`}`);
}

const guarded = async <T>(fn: () => Promise<Result<T>>): Promise<Result<T>> => {
  try {
    return await fn();
  } catch (e) {
    if (isAppError(e)) return { ok: false, error: e };
    if (e instanceof SoundError) return err(e.status === 400 ? "invalid" : e.status === 409 ? "conflict" : "unavailable", e.message);
    throw e;
  }
};

/** The receipt for a batch (no token), or its confirm (the token the receipt gave). */
export async function sendBatch(send: BatchSend, reg: readonly EngineDef[], o: BatchOptions): Promise<Result<BatchOutcome>> {
  if (!BATCH_RE.test(send.batch)) return err("invalid", `${JSON.stringify(send.batch)} is not a batch id`);
  const problem = batchProblem(send.kind, send.form);
  if (problem !== null) return err("invalid", problem);
  const engine = batchEngine(reg, send.kind);
  if (!engine.ok) return engine;
  const brief = batchBrief(send.kind, send.form);
  return guarded(() => (engine.value === "suno" ? sunoBatch(send.batch, brief, send.form.count, o) : sfxBatch(send.batch, brief, send.form.count, o)));
}

/* ── music: N Suno drafts of one form ──────────────────────────────────── */

/** The form every draft of the batch sends: the brief's words, instrumental, its negatives as Suno's exclude. */
export function batchFields(brief: BatchBrief): SunoFields {
  const stand = sentenceStand(brief.prompt);
  return brief.negative === null ? stand : { ...stand, exclude: brief.negative };
}

const draftIds = (batch: string, n: number): string[] => Array.from({ length: n }, (_, i) => draftJobId(`${batch}-${i + 1}`));

function sunoSpec(ids: readonly string[], fields: SunoFields): LaunchSpec {
  const n = ids.length;
  const lines = ids.map((id, i) => {
    // A record that does not exist yet, as far as the line reads it (id and words only).
    const stub: SunoJob = { id, proposalId: "", fields, lane: FLOOR_LANE, state: "queued", models: [], enqueuedAt: 0, clipIds: [] };
    const line = sunoLine(stub);
    return { ...line, label: `${line.label} · ${i + 1}/${n}` };
  });
  return { producer: SUNO_PRODUCER, media: "audio", lines };
}

async function sunoBatch(batch: string, brief: BatchBrief, n: number, o: BatchOptions): Promise<Result<BatchOutcome>> {
  const fields = batchFields(brief);
  const ids = draftIds(batch, n);
  const spec = sunoSpec(ids, fields);
  const { token, ...read } = o;
  const pre = launchJobs(spec, read);
  if (pre.kind !== "receipt") return err("internal", `a batch receipt read answered ${pre.kind}`);
  if (token === undefined) return ok({ kind: "receipt", receipt: pre.receipt });
  if (pre.receipt.token !== token) return ok({ kind: "stale", fresh: pre.receipt });
  for (const id of ids) await ensureDraftJob(id, { kind: "fields", fields }, { dry: o.mode === "dry", now: o.now });
  const r = launchJobs(spec, { ...read, token });
  if (r.kind === "stale") {
    for (const id of ids) await dropUnlaunched(id);
    return ok({ kind: "stale", fresh: r.fresh });
  }
  if (r.kind !== "launched") return err("internal", "a batch confirm answered a receipt");
  const launched = new Set(r.jobIds);
  // The records name the kernel job that drives them (lib/producers/suno.ts `nameJobs`).
  await withSuno((f) => {
    for (const j of f.jobs) if (launched.has(sunoKernelId(j))) j.job = sunoKernelId(j);
  });
  return ok({ kind: "launched", engine: "suno", runIds: ids.map((id) => `suno.${id}`), jobIds: r.jobIds });
}

/* ── sfx: one Run of N clips ───────────────────────────────────────────── */

/** What the receipt's token is bound to: the brief itself, so a token confirms only this brief. */
export const briefDigest = (b: BatchBrief): string => createHash("sha256").update(JSON.stringify(b)).digest("hex").slice(0, 16);

async function sfxBatch(batch: string, brief: BatchBrief, n: number, o: BatchOptions): Promise<Result<BatchOutcome>> {
  const input: ComposerInput = { lane: "audio", text: brief.prompt, kind: "sfx" };
  const quote = { key: `sfx:${briefDigest(brief)}`, label: `${brief.terms.sfxCategory ?? "effect"} × ${n}` };
  const opts = { mode: o.mode, units: n, quote, ...(o.ceilingUsd === undefined ? {} : { ceilingUsd: o.ceilingUsd }) };
  const pre = runReceipt(o.store, input, opts, { now: o.now });
  if (!pre.ok) return pre;
  if (o.token === undefined) return ok({ kind: "receipt", receipt: pre.value });
  // A token for another brief (or a moved queue) is stale BEFORE anything is filed: the brief
  // file is written once per batch and never under a brief nobody confirmed.
  if (pre.value.token !== o.token) return ok({ kind: "stale", fresh: pre.value });
  const id = sfxRunId(batch, n);
  // The brief before the job: a job that exists always finds the brief it renders.
  await writeBrief(id, brief);
  const l = launchRun(o.store, { input, token: o.token, ...opts }, o.actor, { now: o.now, dryOnly: o.dryOnly, id });
  if (l.ok) return ok({ kind: "launched", engine: "elevenlabs", runIds: [l.value.runId], jobIds: [l.value.jobId] });
  if (l.fresh !== undefined) return ok({ kind: "stale", fresh: l.fresh });
  return { ok: false, error: l.error };
}
