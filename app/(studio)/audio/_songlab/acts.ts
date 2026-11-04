"use server";

// THE SONG LAB'S ACTS (spark yue2-song-lab WP3) - a batch launched, a post-chain run, blind pairs queued,
// a vote recorded - as Server Actions through the one action core (app/_server/action.ts: who, the input
// door, the body, the envelope). There is no screen in S1: these are what S2's song-lab views call, and
// the agent door (app/_server/mcp/tools/songlab.ts) reaches the same lib functions without the vote.
//
// THE DOORS ARE THE DOMAIN'S. A launch's input is held by @gt/domain/audio.yue2.jobs.schema inside
// lib/producers/yue2Jobs.ts; the action's own schema only takes the object and stamps `origin: "lab"`,
// so the screen cannot claim to be the agent. A vote is held by @gt/domain/audio.yue2.schema's
// `abVoteSchema` here, and by lib/yue2/ab.ts again (the defect against the taxonomy).
//
// A REFERENCE IS UPLOADED THROUGH A ROUTE, not an action: POST /audio/songlab/reference
// (../songlab/reference/route.ts). A song is megabytes and a Server Action's body is capped at Next's
// 1 MB default - the reason /audio/studio/take and /audio/return are routes too.
//
// NOTHING HERE SPAWNS. A launch enqueues work on gpu.local; the worker runs it (lib/producers/yue2.ts),
// where `runYue2` is gated by the box's posture (lib/deployment canSpawnLocalBinaries).
import { z } from "zod";

import { AB_SOURCES, YUE2_RECIPE } from "@gt/domain/audio.yue2";
import { abVoteSchema } from "@gt/domain/audio.yue2.schema";
import { err, ok, type Result } from "@gt/domain/errors";
import type { Receipt } from "@gt/domain/produce";

import type { ActionResult } from "../../../_server/actionCore.ts";
import { action } from "../../../_server/action.ts";
import { kernel } from "../../../../lib/kernelStore.ts";
import { actorOf } from "../../../../lib/principal.ts";
import { launchPost, launchRender } from "../../../../lib/producers/yue2Jobs.ts";
import { voteAb as recordVote, type JudgedPair } from "../../../../lib/yue2/ab.ts";
import { queueBlindPairs, type QueuedBlind } from "../../../../lib/yue2/lab.ts";

export type Launched = { readonly jobId: string; readonly receipt: Receipt };

/** The launch form's object, held by the domain door downstream; `origin` is the server's word. */
const form = z.looseObject({});

const batchAction = action("song lab batch", form, async (i, who): Promise<Result<Launched>> => {
  const k = kernel();
  if (!k.ok) return k;
  // The recipe's defaults where the form leaves them out (cot=off, cfg 1.5, best-of-8 from seed 1).
  const seeds = Array.from({ length: YUE2_RECIPE.seeds }, (_, n) => n + 1);
  return launchRender(k.value.store, { cot: YUE2_RECIPE.cot, cfg: YUE2_RECIPE.cfg, seeds, ...i, origin: "lab" }, { actor: actorOf(who) });
});

/** Render a batch of seeds (one take each, every take then scored). Absent cot/cfg/seeds are the measured recipe. */
export async function launchBatch(input: { readonly style: string; readonly lyrics: string; readonly seeds?: readonly number[]; readonly cot?: string; readonly cfg?: number; readonly adapter?: string; readonly adapterStrength?: number }): Promise<ActionResult<Launched>> {
  return batchAction(input);
}

const postAction = action("song lab post", form, async (i, who): Promise<Result<Launched>> => {
  if (i["op"] !== undefined && i["op"] !== "chain") return err("invalid", "a blind window is cut by queuing its pair, not as a post-chain");
  const k = kernel();
  if (!k.ok) return k;
  return launchPost(k.value.store, { ...i, op: "chain", origin: "lab" }, { actor: actorOf(who) });
});

/** Post-chain a take (stems, debuzz, master to a reference): a new take, its parent the source, then scored. */
export async function runPost(input: { readonly takeId: string; readonly stages: readonly string[]; readonly referenceTakeId?: string }): Promise<ActionResult<Launched>> {
  return postAction(input);
}

const pairsInput = z.strictObject({ source: z.enum(AB_SOURCES), limit: z.number().int().min(1).max(20).optional() });

const pairsAction = action("song lab pairs", pairsInput, async (i, who): Promise<Result<readonly QueuedBlind[]>> => {
  const k = kernel();
  if (!k.ok) return k;
  return queueBlindPairs(k.value.store, i.source, i.limit ?? 4, actorOf(who));
});

/** Queue blind pairs of one source and cut both arms' windows (one yue2-post job per arm). */
export async function queuePairs(input: z.input<typeof pairsInput>): Promise<ActionResult<readonly QueuedBlind[]>> {
  return pairsAction(input);
}

const voteAction = action("song lab vote", abVoteSchema, async (i, who): Promise<Result<JudgedPair>> => {
  const k = kernel();
  if (!k.ok) return k;
  const r = recordVote(k.value.store, i, actorOf(who), new Date().toISOString());
  return r.ok ? ok(r.value) : r;
});

/** The owner's verdict on a blind pair; the answer reveals which take played as A. */
export async function voteAb(input: z.input<typeof abVoteSchema>): Promise<ActionResult<JudgedPair>> {
  return voteAction(input);
}
