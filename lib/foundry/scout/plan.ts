import { readFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { parseAt } from "@gt/domain/door";

import { writeJsonAtomic } from "../runStore";
import { withRunLock } from "../verdictLog";
import { Refusal, type ActContext } from "./acts";
import type { PlanDoors } from "./planDoors";
import { nightDir, readNight } from "./store";
import { WHY_MAX, type NightId } from "./types";
import { activeWing } from "./wingScope";

// THE NIGHT'S PLAN QUEUE (spark scout-vision S6).
//
// Operator, 2026-10-26: "The nightly process will need dynamic rebalancing mechanism, we did not run whole night
// and did not use the resources well while we have local llms ready to create various content." The seat writes
// the night's remaining work as items in `foundry-out/scout/<night>/plan.json` and ends its turn after the first
// wave; the worker's `night-fill` timer (./nightFill.ts) launches the oldest queued item whose lane is idle while
// the box sits under the band, through the same door the CLI verb calls, and closes the night at its `until`.
//
// PLANNING SPENDS NOTHING. `plan` runs each item's payload through that kind's door parser (./planDoors.ts) and
// appends the batch; a refused item refuses the whole batch, naming its place and the door's sentence, and nothing
// is written. The night must be open, before its `until`, and have one: a plan without an `until` would wait for a
// timer that never fills it.
//
// THE FILE is the night's like night.json: every write is a read-modify-write under the night's run lock (store.ts
// mutateNight's lock), so the CLI appending and the worker moving an item queue instead of losing one. An item
// moves once: queued -> launched | refused | failed | expired. Nothing is retried; a refused item stays refused.

export const PLAN_KINDS = ["storyboards", "ideas", "extract", "scenes", "assets", "sheets", "reels", "draft"] as const;
export type PlanKind = (typeof PLAN_KINDS)[number];

export const PLAN_STATES = ["queued", "launched", "refused", "failed", "expired"] as const;
export type PlanState = (typeof PLAN_STATES)[number];

export type PlanItem = {
  /** `pl-NN`, numbered in the night. */
  readonly id: string;
  readonly kind: PlanKind;
  /** The door's own JSON input, validated by that door's parser when the item is planned. */
  readonly payload: unknown;
  /** One sentence: which rung the item serves. */
  readonly why: string;
  readonly state: PlanState;
  /** ISO time the item last changed state. */
  readonly at: string;
  /** Present once launched. */
  readonly jobId?: string;
  /** Present on refused, failed and expired. */
  readonly reason?: string;
};

export type PlanResult = { readonly items: readonly PlanItem[] };

const PLAN_FILE = "plan.json";

/** The night's plan file. */
export const planFile = (id: NightId): string => path.join(nightDir(id), PLAN_FILE);

const itemSchema = z
  .object({
    kind: z.enum(PLAN_KINDS),
    payload: z.unknown(),
    why: z
      .string()
      .trim()
      .min(1)
      .max(WHY_MAX)
      .refine((s) => !/[\r\n]/.test(s), { message: "one line" }),
  })
  .strict();

const fileSchema = z.object({
  items: z.array(
    z.object({
      id: z.string().regex(/^pl-\d{2,3}$/),
      kind: z.enum(PLAN_KINDS),
      payload: z.unknown(),
      why: z.string(),
      state: z.enum(PLAN_STATES),
      at: z.string(),
      jobId: z.string().optional(),
      reason: z.string().optional(),
    }),
  ),
});

/** The plan as the file holds it; absent is empty. A damaged file is a throw, never an empty queue (it would be overwritten). */
async function readPlanFile(id: NightId): Promise<PlanItem[]> {
  let text: string;
  try {
    text = await readFile(planFile(id), "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error(`the plan of night ${id} is unreadable - inspect ${planFile(id)}`);
  }
  const p = parseAt(`plan of night ${id}`, fileSchema, raw);
  if (!p.ok) throw new Error(`${p.error.message} - inspect ${planFile(id)}`);
  return p.value.items.map((x) => ({ ...x }) as PlanItem);
}

/** The night's queue, oldest first; an absent plan.json is an empty queue. */
export async function readPlan(id: NightId): Promise<readonly PlanItem[]> {
  return readPlanFile(id);
}

/** Is there a plan file at all (the seat handed the night over)? */
export async function hasPlan(id: NightId): Promise<boolean> {
  return readFile(planFile(id)).then(
    () => true,
    () => false,
  );
}

/** Read, change, write the plan under the night's lock; returning the same array writes nothing. */
export async function mutatePlan(id: NightId, fn: (items: readonly PlanItem[]) => readonly PlanItem[] | Promise<readonly PlanItem[]>): Promise<readonly PlanItem[]> {
  return withRunLock(nightDir(id), async () => {
    const before = await readPlanFile(id);
    const after = await fn(before);
    if (after !== before) await writeJsonAtomic(planFile(id), { items: after });
    return after;
  });
}

/** The `pl-NN` after `n` items. */
export const planId = (n: number): string => `pl-${String(n + 1).padStart(2, "0")}`;

/** One item moved to its next state, keyed by id; the others untouched. An item no longer queued is not moved again. */
export function settleItem(items: readonly PlanItem[], itemId: string, next: Pick<PlanItem, "state" | "at" | "jobId" | "reason">): readonly PlanItem[] {
  return items.map((x) =>
    x.id !== itemId || x.state !== "queued" ? x : { id: x.id, kind: x.kind, payload: x.payload, why: x.why, state: next.state, at: next.at, ...(next.jobId === undefined ? {} : { jobId: next.jobId }), ...(next.reason === undefined ? {} : { reason: next.reason }) },
  );
}

/** `scout plan <night> --json`: validate and append items; nothing spent, nothing launched. `doors` is a test's seam. */
export async function planAct(ctx: ActContext, id: NightId, input: unknown, doors?: PlanDoors): Promise<PlanResult> {
  if (activeWing() !== "scout") throw new Refusal(`the ${activeWing()} wing keeps no plan; a plan is a scout night's`);
  if (!Array.isArray(input) || input.length === 0) throw new Refusal("plan: the input is a non-empty JSON array of items {kind, payload, why}");
  const night = await readNight(id);
  const now = ctx.now?.() ?? new Date();
  if (night.state !== "open") throw new Refusal(`night ${id} is ${night.state}${night.stop === undefined ? "" : ` (${night.stop})`}; nothing is planned on it`);
  if (night.deadline === undefined) throw new Refusal(`night ${id} has no until; the night-fill launches a plan only before a night's until (open with --until HH:MM)`);
  if (Date.parse(night.deadline) <= now.getTime()) throw new Refusal(`night ${id} passed its until ${night.deadline}; nothing is planned on it`);
  const door = doors ?? (await import("./planDoors")).planDoors();
  const asked: { kind: PlanKind; payload: unknown; why: string }[] = [];
  for (const [i, raw] of input.entries()) {
    const r = parseAt(`plan item ${i + 1}`, itemSchema, raw);
    if (!r.ok) throw new Refusal(r.error.message);
    const p = await door[r.value.kind].parse(r.value.payload);
    if (!p.ok) throw new Refusal(`plan item ${i + 1} (${r.value.kind}): ${p.error.message}`);
    asked.push({ kind: r.value.kind, payload: r.value.payload, why: r.value.why });
  }
  const at = now.toISOString();
  let added: PlanItem[] = [];
  await mutatePlan(id, (items) => {
    added = asked.map((a, k) => ({ id: planId(items.length + k), kind: a.kind, payload: a.payload, why: a.why, state: "queued", at }));
    return [...items, ...added];
  });
  return { items: added };
}
