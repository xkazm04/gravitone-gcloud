"use server";

// THE CALENDAR'S SERVER ACTIONS - the CalendarPort the Floor's slot level and schedule sheet
// call (./contract.ts), over whichever side ./port.ts switches to. Each goes through the one
// action core (app/_server/actionCore.ts): who first, then the input through its zod door, then
// the body, then the wire envelope. The record and the schedulable items are read with `read`
// key use; the verbs with `money`, as every write is - a reschedule on a key set nobody could
// confirm is refused, not admitted. The clock is read here, once per act, and handed to the side
// as a parameter; so is who acted, which the slot's ledger event names.
//
// THE SCHEDULE DOOR, for a caller that is not this sheet (the Board's "Approve -> calendar",
// L64; a Library item's Schedule act): `schedule({item, channel, at, title, description, tags})`
// - `item` a Library item id (`video:export:<id>`), `channel` youtube | tiktok | instagram, `at`
// an ISO instant - answers the new slot's SlotView or the engine's refusal verbatim. A blog slot
// is refused here: it is made by the article approve itself.

import { z } from "zod";

import type { Principal } from "../../../../lib/principal.ts";
import { runAction } from "../../../_server/actionCore.ts";
import { action } from "../../../_server/action.ts";
import { principal } from "../../../_server/principal.ts";
import type { CalendarPort } from "./contract.ts";
import { serverCalendar, type Act } from "./port.ts";

type In<K extends keyof CalendarPort> = Parameters<CalendarPort[K]>[0];
type Out<K extends keyof CalendarPort> = ReturnType<CalendarPort[K]>;

const id = z.string().min(1).max(400);
const baseRev = z.number().int().positive().optional();
const one = z.object({ id });
const verb = z.object({ id, baseRev });

const actOf = (who: Principal, rev: number | undefined): Act => ({ nowMs: Date.now(), who: "uid" in who ? { who: who.uid } : {}, ...(rev === undefined ? {} : { baseRev: rev }) });

export async function detail(input: In<"detail">): Out<"detail"> {
  return runAction("calendar detail", () => principal("read"), one, (i) => serverCalendar().detail(i.id, Date.now()), input);
}

const moveAction = action("calendar move", verb.extend({ at: z.iso.datetime() }), (i, who) => serverCalendar().move(i.id, i.at, actOf(who, i.baseRev)));
export async function move(input: In<"move">): Out<"move"> {
  return moveAction(input);
}

const cancelAction = action("calendar cancel", verb, (i, who) => serverCalendar().cancel(i.id, actOf(who, i.baseRev)));
export async function cancel(input: In<"cancel">): Out<"cancel"> {
  return cancelAction(input);
}

const publishAction = action("calendar publish now", verb, (i, who) => serverCalendar().publishNow(i.id, actOf(who, i.baseRev)));
export async function publishNow(input: In<"publishNow">): Out<"publishNow"> {
  return publishAction(input);
}

const draft = z.object({
  item: z.string().min(1).max(400),
  channel: z.string().min(1).max(32),
  at: z.iso.datetime(),
  title: z.string().trim().min(1).max(100),
  description: z.string().max(5000),
  tags: z.array(z.string().trim().min(1).max(100)).max(50),
});
const scheduleAction = action("calendar schedule", draft, (i, who) => serverCalendar().schedule(i, actOf(who, undefined)));
export async function schedule(input: In<"schedule">): Out<"schedule"> {
  return scheduleAction(input);
}

export async function items(): Out<"items"> {
  return runAction("calendar items", () => principal("read"), z.undefined(), () => serverCalendar().items(), undefined);
}
