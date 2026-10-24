"use server";

// THE BOARD'S SERVER ACTIONS - the BoardPort the desks call (@gt/ui/board/port), over whichever
// side ./port.ts switches to. Each goes through the one action core (app/_server/actionCore.ts):
// who first, then the input through its zod door, then the body, then the wire envelope. Reads
// resolve the principal with `read` key use and every write with `money`, as the Ledger's do:
// a verdict is a mutation, and a mutation on a key set nobody could confirm is refused.

import { z } from "zod";

import { editPlanSchema, pickOutcomeSchema } from "@gt/domain/decision";
import { parseAt } from "@gt/domain/door";
import { ok } from "@gt/domain/errors";
import { packetIdSchema } from "@gt/domain/ids";
import { redriveApply } from "@gt/kernel/decision/apply";
import type { BoardPort } from "@gt/ui/board/port";

import { kickApply } from "../../../../lib/decision/v1/applier.ts";
import { kernel } from "../../../../lib/kernelStore.ts";
import { runAction, type ActionResult } from "../../../_server/actionCore.ts";
import { action } from "../../../_server/action.ts";
import { principal } from "../../../_server/principal.ts";
import { serverBoard } from "./port.ts";
import { actorOf } from "./real.ts";
import { verdictChanges } from "./verdict.ts";

const id = z.string().min(1).max(400);
const rev = z.number().int().nonnegative();

type In<K extends keyof BoardPort> = Parameters<BoardPort[K]>[0];
type Out<K extends keyof BoardPort> = ReturnType<BoardPort[K]>;

const reader = () => principal("read");

export async function loadPacket(input: In<"loadPacket">): Out<"loadPacket"> {
  return runAction("board load", reader, z.object({ id }), (i, who) => serverBoard().loadPacket(i, actorOf(who)), input);
}

export async function listPackets(): Out<"listPackets"> {
  return runAction("board list", reader, z.undefined(), () => serverBoard().listPackets(), undefined);
}

export async function preview(input: In<"preview">): Out<"preview"> {
  return runAction("board preview", reader, z.object({ id }), (i) => serverBoard().preview(i), input);
}

const patchAction = action("board patch", z.object({ id, baseRev: rev, changes: verdictChanges }), (i, who) => serverBoard().patch(i, actorOf(who)));
export async function patch(input: In<"patch">): Out<"patch"> {
  return patchAction(input);
}

const undoAction = action("board undo", z.object({ id, baseRev: rev }), (i, who) => serverBoard().undo(i, actorOf(who)));
export async function undo(input: In<"undo">): Out<"undo"> {
  return undoAction(input);
}

const pickAction = action("board pick", z.object({ id, baseRev: rev, pair: z.string().min(1).max(400), outcome: pickOutcomeSchema }), (i, who) => serverBoard().pick(i, actorOf(who)));
export async function pick(input: In<"pick">): Out<"pick"> {
  return pickAction(input);
}

const commitAction = action("board commit", z.object({ id, rev, token: z.string().min(1).max(200), ticket: z.string().min(8).max(100) }), (i, who) => serverBoard().commit(i, actorOf(who)));
export async function commit(input: In<"commit">): Out<"commit"> {
  return commitAction(input);
}

const returnAction = action("board return", z.object({ id, rev, plan: editPlanSchema }), (i, who) => serverBoard().returnPacket(i, actorOf(who)));
export async function returnPacket(input: In<"returnPacket">): Out<"returnPacket"> {
  return returnAction(input);
}

// THE WAY BACK FROM A STUCK APPLY (decision 2; dead-letter-design: redrive). Not a BoardPort
// verb: the desks never decide through it, and only the decided desk offers it, beside v1's
// sentence. The kernel moves the row back to pending with a fresh budget (one tx, an Event);
// the applier is kicked for that packet at once, so the next render shows where it landed.
const redriveAction = action("board redrive", z.object({ id }), (i, who) => {
  const k = kernel();
  if (!k.ok) return k;
  const store = k.value.store;
  const packetId = parseAt("packet id", packetIdSchema, i.id);
  if (!packetId.ok) return packetId;
  const done = store.tx((t) => redriveApply(t, { by: "operator", surface: "board", ...actorOf(who), packetId: packetId.value }));
  if (!done.ok) return done;
  if (!done.value.ok) return done.value;
  kickApply(store, packetId.value);
  return ok({ id: i.id });
});
export async function redrive(input: { readonly id: string }): Promise<ActionResult<{ readonly id: string }>> {
  return redriveAction(input);
}
