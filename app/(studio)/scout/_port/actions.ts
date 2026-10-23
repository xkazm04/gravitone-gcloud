"use server";

// THE SCOUT'S SERVER ACTIONS - the ScoutPort the route calls (./contract.ts), over whichever side ./port.ts
// switches to. Each goes through the one action wrapper (app/_server/action.ts): who first, with `money` key use
// (a pause or a split is a write the next night obeys), then the input through its zod door, then the body. The
// door here checks only shape; the steer's own door (steer.ts checkSplit) speaks for what a split may be, so its
// refusal reaches the screen in its words.

import { z } from "zod";

import { action } from "../../../_server/action.ts";
import type { Principal } from "../../../../lib/principal.ts";
import type { SteerSplit } from "../../../../lib/foundry/scout/types.ts";
import type { ScoutPort } from "./contract.ts";
import { serverScout } from "./port.ts";

const ref = z.object({ ref: z.string().min(1).max(64) });
const shares = z.record(z.string().min(1).max(200), z.number());
const split = z.object({ audience: shares, genre: z.record(z.string().min(1).max(64), shares).optional() });

type In<K extends keyof ScoutPort> = Parameters<ScoutPort[K]>[0];
type Out<K extends keyof ScoutPort> = ReturnType<ScoutPort[K]>;

/** The steer's history names the principal's uid; the shared secret names nobody, so the operator. */
const by = (p: Principal): string => ("uid" in p ? p.uid : "operator");

// The door's keys are free strings; steer.ts checkSplit refuses an audience it does not know, in its own words.
const asSplit = (i: unknown): SteerSplit => i as SteerSplit;

const pauseAction = action("scout pause", ref, (i, who) => serverScout().pause(i.ref, by(who)));
const resumeAction = action("scout resume", ref, (i, who) => serverScout().resume(i.ref, by(who)));
const splitAction = action("scout split", split, (i, who) => serverScout().split(asSplit(i), by(who)));

export async function pauseBranchAction(input: In<"pause">): Out<"pause"> {
  return pauseAction(input);
}

export async function resumeBranchAction(input: In<"resume">): Out<"resume"> {
  return resumeAction(input);
}

export async function setSplitAction(input: In<"split">): Out<"split"> {
  return splitAction(input);
}
