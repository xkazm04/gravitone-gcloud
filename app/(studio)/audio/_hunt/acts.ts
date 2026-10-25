"use server";

// THE HUNT'S ACTS - a map drafted, a render priced then confirmed, a take crowned, a lesson
// drafted - as Server Actions through the one action core (app/_server/action.ts: who, the input
// door, the body, the envelope; `money` key use, because a render spends). The judgement and the
// writes are lib/sound/{huntDesk,huntRender,lessons}.ts's; this file binds the kernel, the actor,
// the clock and the text engine (lib/sound/huntEngine.ts: the stub under SOUND_HUNT_ENGINE=stub).
//
// A RENDER IS A RECEIPT, THEN A CONFIRM (the flow every launch on the desk uses,
// ../../projects/_plan/receipt.tsx): no token returns the receipt in seconds of audio and writes
// nothing; the token confirms exactly what was priced, writes the Run and its job, and kicks one
// drive on this process; the worker carries whatever that drive did not finish
// (lib/sound/huntRender.ts). DRY unless the operator arms it on the receipt.
import { z } from "zod";

import { err, ok, type Result } from "@gt/domain/errors";
import type { Receipt } from "@gt/domain/produce";
import { receiptModeSchema } from "@gt/domain/produce.schema";

import type { ActionResult } from "../../../_server/actionCore.ts";
import { action } from "../../../_server/action.ts";
import { kernel } from "../../../../lib/kernelStore.ts";
import { actorOf } from "../../../../lib/principal.ts";
import { crownLeaf, draftMap, HUNT_DESK_OP_RE, type Crowned } from "../../../../lib/sound/huntDesk.ts";
import { huntReason } from "../../../../lib/sound/huntEngine.ts";
import { driveHuntRender, launchHuntRender } from "../../../../lib/sound/huntRender.ts";
import { draftLesson, handDraft, type LessonDraft } from "../../../../lib/sound/lessons.ts";
import { deskEngines } from "../_audio/arrangeRead.ts";

const id = z.string().regex(/^[A-Za-z0-9_-]{1,80}$/);
const opId = z.string().regex(HUNT_DESK_OP_RE);
const kind = z.enum(["music", "sfx"]);


const draftInput = z.object({ kind, idea: z.string().trim().min(1, "a hunt needs an idea: the problem to solve, in your words").max(2000), opId }).strict();
const renderInput = z.object({ huntId: id, leafIds: z.array(id).min(1).max(48), mode: receiptModeSchema, opId, token: z.string().min(8).max(200).optional() }).strict();
const crownInput = z.object({ huntId: id, nodeId: id, takeId: id, on: z.boolean(), opId }).strict();
const lessonInput = z.object({ huntId: id, engine: z.boolean() }).strict();

export type Drafted = { readonly id: string; readonly leaves: number; readonly already: boolean };
/** The render's answer: the receipt, the fresh one when the queue moved, or what the job came to. */
export type Rendered =
  | { readonly kind: "receipt"; readonly receipt: Receipt }
  | { readonly kind: "stale"; readonly fresh: Receipt }
  | { readonly kind: "launched"; readonly runId: string; readonly jobId: string; readonly leaves: number; readonly outcome: string; readonly reason?: string };

const draftAction = action("audio hunt draft", draftInput, async (i, who): Promise<Result<Drafted>> => {
  const k = kernel();
  if (!k.ok) return k;
  const r = await draftMap(k.value.store, { kind: i.kind, idea: i.idea, opId: i.opId }, actorOf(who), huntReason(), new Date());
  return r.ok ? ok({ id: r.value.hunt.id, leaves: r.value.hunt.nodes.filter((n) => n.prompt !== "").length, already: r.value.already }) : r;
});

const renderAction = action("audio hunt render", renderInput, async (i, who): Promise<Result<Rendered>> => {
  const k = kernel();
  if (!k.ok) return k;
  const store = k.value.store;
  const r = await launchHuntRender(store, { huntId: i.huntId, leafIds: i.leafIds, mode: i.mode, opId: i.opId, engines: deskEngines(), ...(i.token === undefined ? {} : { token: i.token }) }, actorOf(who), new Date());
  if (!r.ok) return r;
  if (r.value.kind !== "launched") return ok(r.value);
  const d = await driveHuntRender(store, r.value.jobId);
  if (!d.ok) return err(d.error.code, `the render is queued (${r.value.jobId}) and did not drive: ${d.error.message}`);
  return ok({ kind: "launched", runId: r.value.runId, jobId: r.value.jobId, leaves: r.value.leaves.length, outcome: d.value.outcome, ...(d.value.reason === undefined ? {} : { reason: d.value.reason }) });
});

const crownAction = action("audio hunt crown", crownInput, async (i, who): Promise<Result<Crowned>> => {
  const k = kernel();
  if (!k.ok) return k;
  return crownLeaf(k.value.store, i, actorOf(who), new Date());
});

const lessonAction = action("audio hunt lesson draft", lessonInput, async (i): Promise<Result<LessonDraft>> => (i.engine ? draftLesson(i.huntId, huntReason()) : handDraft(i.huntId)));

export type DraftInput = z.input<typeof draftInput>;
export type RenderInput = z.input<typeof renderInput>;
export type CrownInput = z.input<typeof crownInput>;
export type LessonDraftInput = z.input<typeof lessonInput>;

export async function draftHuntMap(input: DraftInput): Promise<ActionResult<Drafted>> {
  return draftAction(input);
}

export async function renderLeaves(input: RenderInput): Promise<ActionResult<Rendered>> {
  return renderAction(input);
}

export async function crownTake(input: CrownInput): Promise<ActionResult<Crowned>> {
  return crownAction(input);
}

export async function draftHuntLesson(input: LessonDraftInput): Promise<ActionResult<LessonDraft>> {
  return lessonAction(input);
}
