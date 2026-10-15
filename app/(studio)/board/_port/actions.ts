"use server";

// THE BOARD'S SERVER ACTIONS - the BoardPort the desks call (@gt/ui/board/port), over whichever
// side ./port.ts switches to. Each goes through the one action core (app/_server/actionCore.ts):
// who first, then the input through its zod door, then the body, then the wire envelope. Reads
// resolve the principal with `read` key use and every write with `money`, as the Ledger's do:
// a verdict is a mutation, and a mutation on a key set nobody could confirm is refused.

import { z } from "zod";

import { editPlanSchema, pickOutcomeSchema } from "@gt/domain/decision";
import type { BoardPort } from "@gt/ui/board/port";

import { runAction } from "../../../_server/actionCore.ts";
import { action } from "../../../_server/action.ts";
import { principal } from "../../../_server/principal.ts";
import { serverBoard } from "./port.ts";

const id = z.string().min(1).max(400);
const rev = z.number().int().nonnegative();
const change = z.object({
  candidate: z.string().min(1).max(400),
  verdict: z.enum(["keep", "reject"]).nullable(),
  reasons: z.array(z.string().min(1).max(64)).max(11),
  note: z.string().min(1).max(2000).optional(),
});

type In<K extends keyof BoardPort> = Parameters<BoardPort[K]>[0];
type Out<K extends keyof BoardPort> = ReturnType<BoardPort[K]>;

const reader = () => principal("read");

export async function loadPacket(input: In<"loadPacket">): Out<"loadPacket"> {
  return runAction("board load", reader, z.object({ id }), (i) => serverBoard().loadPacket(i), input);
}

export async function listPackets(): Out<"listPackets"> {
  return runAction("board list", reader, z.undefined(), () => serverBoard().listPackets(), undefined);
}

export async function preview(input: In<"preview">): Out<"preview"> {
  return runAction("board preview", reader, z.object({ id }), (i) => serverBoard().preview(i), input);
}

const patchAction = action("board patch", z.object({ id, baseRev: rev, changes: z.array(change).min(1).max(500) }), (i) => serverBoard().patch(i));
export async function patch(input: In<"patch">): Out<"patch"> {
  return patchAction(input);
}

const undoAction = action("board undo", z.object({ id, baseRev: rev }), (i) => serverBoard().undo(i));
export async function undo(input: In<"undo">): Out<"undo"> {
  return undoAction(input);
}

const pickAction = action("board pick", z.object({ id, baseRev: rev, pair: z.string().min(1).max(400), outcome: pickOutcomeSchema }), (i) => serverBoard().pick(i));
export async function pick(input: In<"pick">): Out<"pick"> {
  return pickAction(input);
}

const commitAction = action("board commit", z.object({ id, rev, token: z.string().min(1).max(200), ticket: z.string().min(8).max(100) }), (i) => serverBoard().commit(i));
export async function commit(input: In<"commit">): Out<"commit"> {
  return commitAction(input);
}

const returnAction = action("board return", z.object({ id, rev, plan: editPlanSchema }), (i) => serverBoard().returnPacket(i));
export async function returnPacket(input: In<"returnPacket">): Out<"returnPacket"> {
  return returnAction(input);
}
