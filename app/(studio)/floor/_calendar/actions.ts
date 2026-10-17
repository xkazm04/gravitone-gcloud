"use server";

// THE CALENDAR'S SERVER ACTIONS - the CalendarPort the Floor's slot level calls (./contract.ts),
// over whichever side ./port.ts switches to. Each goes through the one action core
// (app/_server/actionCore.ts): who first, then the input through its zod door, then the body,
// then the wire envelope. The record is read with `read` key use; the verbs with `money`, as
// every write is - a reschedule on a key set nobody could confirm is refused, not admitted.
// The clock is read here, once per act, and handed to the side as a parameter.

import { z } from "zod";

import { runAction } from "../../../_server/actionCore.ts";
import { action } from "../../../_server/action.ts";
import { principal } from "../../../_server/principal.ts";
import type { CalendarPort } from "./contract.ts";
import { serverCalendar } from "./port.ts";

type In<K extends keyof CalendarPort> = Parameters<CalendarPort[K]>[0];
type Out<K extends keyof CalendarPort> = ReturnType<CalendarPort[K]>;

const id = z.string().min(1).max(400);
const one = z.object({ id });

export async function detail(input: In<"detail">): Out<"detail"> {
  return runAction("calendar detail", () => principal("read"), one, (i) => serverCalendar().detail(i.id, Date.now()), input);
}

const moveAction = action("calendar move", z.object({ id, at: z.iso.datetime() }), (i) => serverCalendar().move(i.id, i.at, Date.now()));
export async function move(input: In<"move">): Out<"move"> {
  return moveAction(input);
}

const cancelAction = action("calendar cancel", one, (i) => serverCalendar().cancel(i.id, Date.now()));
export async function cancel(input: In<"cancel">): Out<"cancel"> {
  return cancelAction(input);
}

const publishAction = action("calendar publish now", one, (i) => serverCalendar().publishNow(i.id, Date.now()));
export async function publishNow(input: In<"publishNow">): Out<"publishNow"> {
  return publishAction(input);
}
