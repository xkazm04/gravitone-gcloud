"use server";

// THE INSIGHT SECTIONS' ACTS - a score on a judged take, and an operator batch through its
// receipt - as Server Actions through the one action core (app/_server/action.ts: who, the input
// door, the body, the envelope). The judgement and the write are lib/sound's (rubric.ts,
// batch.ts); this file binds the kernel, the actor, the clock and the desk's engine registry.
//
// A BATCH IS SENT AS ITS FORM, not as a brief: the server derives the brief (@gt/ui batch.ts
// `batchBrief`) and holds the form to `batchProblem` again, so the client's word is never the
// last word on what a vendor is sent. The receipt mints the batch id and the token carries it
// (`<batch>:<token>`), the Audio lane's Suno door's shape (../_audio/actions.ts).
import { randomBytes } from "node:crypto";

import { z } from "zod";

import { err, ok, type Result } from "@gt/domain/errors";
import type { Receipt, ReceiptMode } from "@gt/domain/produce";
import { ceilingUsdSchema, receiptModeSchema } from "@gt/domain/produce.schema";
import { dryOnlyFrom } from "@gt/kernel/dryrun";
import { BATCH_LIMITS, COUNT, DURATION, TECHNIQUES, TEMPO, type BatchForm } from "@gt/ui/components/audio/batch.ts";
import { SCORE_MAX, SCORE_MIN } from "@gt/ui/components/audio/rubric.ts";

import type { ActionResult } from "../../../_server/actionCore.ts";
import { action } from "../../../_server/action.ts";
import { kernel } from "../../../../lib/kernelStore.ts";
import { actorOf } from "../../../../lib/principal.ts";
import { BATCH_RE, mintBatchId, sendBatch, type BatchOutcome } from "../../../../lib/sound/batch.ts";
import { RATE_OP_RE, rateTake } from "../../../../lib/sound/rubric.ts";
import { deskEngines } from "../_audio/arrangeRead.ts";


/* ── the rubric ──────────────────────────────────────────────────────────── */

const rateInput = z
  .object({
    id: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/),
    ratings: z.record(z.string().regex(/^[a-z_]{1,40}$/), z.number().int().min(SCORE_MIN).max(SCORE_MAX).nullable()),
    opId: z.string().regex(RATE_OP_RE),
  })
  .strict();

export type Scored = { readonly id: string; readonly mean: number | null; readonly ratings: Readonly<Record<string, number | null>> };

const rateAction = action("audio rubric score", rateInput, async (i, who): Promise<Result<Scored>> => {
  const k = kernel();
  if (!k.ok) return k;
  // zod's record spells an absent value as undefined; the door's bag has none.
  const ratings = Object.fromEntries(Object.entries(i.ratings).flatMap(([d, v]) => (v === undefined ? [] : [[d, v] as const])));
  const r = await rateTake(k.value.store, { id: i.id, ratings, opId: i.opId }, actorOf(who), new Date());
  return r.ok ? ok({ id: r.value.take.id, mean: r.value.mean, ratings: r.value.take.ratings }) : r;
});

export type RateInput = z.input<typeof rateInput>;

export async function scoreTake(input: RateInput): Promise<ActionResult<Scored>> {
  return rateAction(input);
}

/* ── the operator batch ──────────────────────────────────────────────────── */

const words = (max: number) => z.string().max(max);
const form = z
  .object({
    prompt: words(BATCH_LIMITS.prompt),
    negative: words(BATCH_LIMITS.negative),
    technique: z.array(z.enum([...new Set([...TECHNIQUES.music, ...TECHNIQUES.sfx])])).max(12),
    genre: words(BATCH_LIMITS.genre),
    mood: words(BATCH_LIMITS.mood),
    instrument: words(BATCH_LIMITS.instrument),
    event: words(BATCH_LIMITS.event),
    material: words(BATCH_LIMITS.material),
    space: words(BATCH_LIMITS.space),
    sfxCategory: words(BATCH_LIMITS.sfxCategory),
    loop: z.boolean(),
    promptInfluence: z.number().min(0).max(1).nullable(),
    durationS: z.number().min(DURATION.sfx.min).max(DURATION.music.max),
    count: z.number().int().min(COUNT.min).max(COUNT.max),
    tempoBpm: z.number().min(TEMPO.min).max(TEMPO.max).nullable(),
    key: words(BATCH_LIMITS.key).nullable(),
  })
  .strict();

const batchInput = z
  .object({ kind: z.enum(["music", "sfx"]), form, mode: receiptModeSchema.optional(), token: z.string().min(8).max(240).optional(), ceilingUsd: ceilingUsdSchema.optional() })
  .strict();

export type Launched = { readonly engine: "suno" | "elevenlabs"; readonly runIds: readonly string[]; readonly jobIds: readonly string[] };
type Confirmed = { readonly kind: "launched"; readonly value: Launched } | { readonly kind: "stale"; readonly fresh: Receipt };

const wrap = (batch: string, r: Receipt): Receipt => ({ ...r, token: `${batch}:${r.token}` });

const batchAction = action("audio batch", batchInput, async (i, who): Promise<Result<Receipt | Confirmed>> => {
  const k = kernel();
  if (!k.ok) return k;
  const mode = i.mode ?? "dry";
  const dryOnly = dryOnlyFrom(process.env);
  if (mode === "live" && dryOnly) return err("refused", "this process may only run dry (GRAVITONE_DRY_ONLY=1); nothing here can be armed live");
  const at = i.token?.indexOf(":") ?? -1;
  if (i.token !== undefined && at <= 0) return err("invalid", "a batch confirm needs the token its receipt gave");
  const now = Date.now();
  const batch = i.token === undefined ? mintBatchId(now, randomBytes(3).toString("hex")) : i.token.slice(0, at);
  if (!BATCH_RE.test(batch)) return err("invalid", "a batch confirm needs the token its receipt gave");
  const r: Result<BatchOutcome> = await sendBatch(
    { kind: i.kind, form: i.form, batch },
    deskEngines(),
    { mode, actor: actorOf(who), dryOnly, now, store: k.value.store, ...(i.ceilingUsd === undefined ? {} : { ceilingUsd: i.ceilingUsd }), ...(i.token === undefined ? {} : { token: i.token.slice(at + 1) }) },
  );
  if (!r.ok) return r;
  switch (r.value.kind) {
    case "receipt":
      return ok(wrap(batch, r.value.receipt));
    case "stale":
      return ok({ kind: "stale", fresh: wrap(batch, r.value.fresh) });
    case "launched":
      return ok({ kind: "launched", value: { engine: r.value.engine, runIds: r.value.runIds, jobIds: r.value.jobIds } });
  }
});

/** What the client sends: the form as @gt/ui holds it. The door above is the parse. */
export type BatchInput = { readonly kind: "music" | "sfx"; readonly form: BatchForm; readonly mode?: ReceiptMode; readonly ceilingUsd?: number };

/** The receipt for a batch: priced, nothing written. */
export async function batchReceipt(input: BatchInput): Promise<ActionResult<Receipt>> {
  const r = await batchAction(input);
  if (!r.ok) return r;
  return "kind" in r.value ? { ok: false, error: { error: "a batch receipt read answered a confirm", code: "internal" } } : { ok: true, value: r.value };
}

/** The confirm of a receipt this door minted: launched, or the fresh receipt when the queue moved. */
export async function batchConfirm(input: BatchInput & { readonly token: string }): Promise<ActionResult<Confirmed>> {
  const r = await batchAction(input);
  if (!r.ok) return r;
  return "kind" in r.value ? { ok: true, value: r.value } : { ok: false, error: { error: "a batch confirm answered a receipt", code: "internal" } };
}
