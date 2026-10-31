"use server";

// THE STUDIO'S TWO WRITES, as Server Actions through the one action core (app/_server/action.ts:
// the session principal first, then the input through the door): `sayAct` files the dock's message
// as an `audio.say` event (./say.ts), `newSessionAct` names a new conversation. A new conversation
// writes nothing until its first message: an empty song is not an act worth a ledger row.
import { randomBytes } from "node:crypto";

import { z } from "zod";

import { ok } from "@gt/domain/errors";

import type { ActionResult } from "../../../../_server/actionCore.ts";
import { action } from "../../../../_server/action.ts";
import { kernel } from "../../../../../lib/kernelStore.ts";
import { actorOf } from "../../../../../lib/principal.ts";
import { appendSay, mintSessionId, type SayFiled } from "./say.ts";

// The shape only: the studio event door (parseStudioEvent, in appendSay) is what judges the turn.
const sayInput = z.strictObject({ session: z.string().max(64), turn: z.unknown() });

const say = action("audio studio say", sayInput, async (i, who) => {
  const k = kernel();
  if (!k.ok) return k;
  return appendSay(k.value.store, { session: i.session, turn: i.turn }, actorOf(who));
});

const newSession = action("audio studio new session", z.strictObject({}), async () => ok({ session: mintSessionId(new Date(), (n) => randomBytes(n)) }));

export async function sayAct(input: { readonly session: string; readonly turn: unknown }): Promise<ActionResult<SayFiled>> {
  return say(input);
}

export async function newSessionAct(): Promise<ActionResult<{ readonly session: string }>> {
  return newSession({});
}
