"use server";

// A MUSIC VIDEO'S TWO ACTS FROM RUNS (Phase 6, owner ruling 2): Regenerate and Send to Calendar,
// which v1 offered only on the Foundry's Pipeline canvas (gone with v1). Both are the acts in
// lib/producers/mvActs.ts - a Regenerate is a receipt then a confirm, as every launch is; a send
// puts a slot on the kernel calendar through L57's write door. Every call is `money` key use (the
// action wrapper): a receipt read is the first half of a spend, as the produce port's are.

import { z } from "zod";

import { err, ok, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import type { Receipt } from "@gt/domain/produce";
import { ceilingUsdSchema, receiptModeSchema } from "@gt/domain/produce.schema";
import { channelSchema } from "@gt/domain/slot";
import { dryOnlyFrom } from "@gt/kernel/dryrun";

import { kernel } from "../../../../../lib/kernelStore.ts";
import type { Principal } from "../../../../../lib/principal.ts";
import { regenerateMvAct, sendMvToCalendarAct } from "../../../../../lib/producers/mvActs.ts";
import { action } from "../../../../_server/action.ts";
import type { ActionResult } from "../../../../_server/actionCore.ts";

const track = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,80}$/);
const ask = { part: z.enum(["image", "motion", "metadata"]), note: z.string().max(500).optional(), prompt: z.string().max(1400).optional() };
const actorOf = (p: Principal): Actor => ({ kind: "operator", id: "uid" in p ? p.uid : "operator" });

/** A throw from the act (v1's validator, the record's guard) as the action's Result. */
async function caught<T>(fn: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await fn();
  } catch (e) {
    const code = typeof e === "object" && e !== null && "code" in e && typeof e.code === "string" ? e.code : undefined;
    const status = typeof e === "object" && e !== null && "status" in e && typeof e.status === "number" ? e.status : undefined;
    const known = code === "not-found" || code === "conflict" || code === "invalid" || code === "refused" ? code : status === 400 ? "invalid" : status === 404 ? "not-found" : status === 409 ? "conflict" : "internal";
    return err(known, e instanceof Error ? e.message : String(e), { cause: e });
  }
}

export type MvRegenerateRead = { readonly receipt: Receipt; readonly at: number };
export type MvRegenerateDone = { readonly kind: "launched"; readonly jobId: string; readonly note: string } | { readonly kind: "stale"; readonly fresh: Receipt; readonly at: number };

const readAction = action("mv regenerate receipt", z.object({ track, ...ask, mode: receiptModeSchema }), (i, who) =>
  caught(async (): Promise<Result<MvRegenerateRead>> => {
    const k = kernel();
    if (!k.ok) return k;
    const { track: id, mode, ...body } = i;
    const r = await regenerateMvAct(id, body, { mode, actor: actorOf(who), dryOnly: dryOnlyFrom(process.env), store: k.value.store });
    return r.kind === "receipt" ? ok({ receipt: r.receipt, at: r.at }) : err("internal", `a regenerate read answered ${r.kind}`);
  }),
);

export async function mvRegenerateReceipt(input: { readonly track: string; readonly part: "image" | "motion" | "metadata"; readonly note?: string; readonly prompt?: string; readonly mode: "dry" | "live" }): Promise<ActionResult<MvRegenerateRead>> {
  return readAction(input);
}

const confirmAction = action(
  "mv regenerate",
  z.object({ track, ...ask, mode: receiptModeSchema, token: z.string().min(8).max(200), at: z.number().int().positive(), ceilingUsd: ceilingUsdSchema.optional() }),
  (i, who) =>
    caught(async (): Promise<Result<MvRegenerateDone>> => {
      const k = kernel();
      if (!k.ok) return k;
      const { track: id, mode, token, at, ceilingUsd, ...body } = i;
      const r = await regenerateMvAct(id, body, { mode, token, at, actor: actorOf(who), dryOnly: dryOnlyFrom(process.env), store: k.value.store, ...(ceilingUsd === undefined ? {} : { ceilingUsd }) });
      if (r.kind === "stale") return ok({ kind: "stale", fresh: r.fresh, at: r.at });
      if (r.kind !== "launched") return err("internal", "a regenerate confirm answered a receipt");
      const jobId = r.jobIds[0] ?? "";
      return ok({ kind: "launched", jobId, note: `${id} · ${body.part} · ${jobId} queued ${mode}` });
    }),
);

export async function mvRegenerate(input: { readonly track: string; readonly part: "image" | "motion" | "metadata"; readonly note?: string; readonly prompt?: string; readonly mode: "dry" | "live"; readonly token: string; readonly at: number; readonly ceilingUsd?: number }): Promise<ActionResult<MvRegenerateDone>> {
  return confirmAction(input);
}

const scheduleAction = action("mv send to calendar", z.object({ track, channel: channelSchema, publishAt: z.iso.datetime() }), (i, who) =>
  caught(async (): Promise<Result<{ readonly slotId: string; readonly at: string }>> => {
    const k = kernel();
    if (!k.ok) return k;
    const r = await sendMvToCalendarAct(i.track, { channel: i.channel, publishAt: i.publishAt }, actorOf(who), k.value.store);
    return r.ok ? ok({ slotId: r.value.slot.id, at: r.value.slot.at }) : r;
  }),
);

export async function mvSchedule(input: { readonly track: string; readonly channel: "youtube" | "tiktok" | "instagram"; readonly publishAt: string }): Promise<ActionResult<{ readonly slotId: string; readonly at: string }>> {
  return scheduleAction(input);
}
