"use server";

// THE PRODUCE SERVER ACTIONS - the ProducePort the Floor composers, the Plan, Compose and the
// Runs acts call (./contract.ts), over whichever side ./port.ts switches to. Each goes through
// the one action core (app/_server/actionCore.ts): who first, then the input through its zod
// door, then the body, then the wire envelope. Reads resolve the principal with `read` key use;
// every write - and a receipt is the first half of one - with `money`, as the Board's do: a
// launch spends, and a spend on a key set nobody could confirm is refused.
//
// The doors are the domain's (@gt/domain/produce.schema, L26) where it has one. The composer's
// RECEIPT takes an empty first sentence (the estimate is drawn before a word is typed, the
// prototype's `Estimate()` on every input); its LAUNCH does not.

import { z } from "zod";

import { composeInputSchema, composerEstimateSchema, composerInputSchema, ceilingUsdSchema, partPatchSchema, receiptModeSchema } from "@gt/domain/produce.schema";
import { RESOURCE_LANES } from "@gt/domain/lane";

import type { Principal } from "../../../../lib/principal.ts";
import { runAction } from "../../../_server/actionCore.ts";
import { action } from "../../../_server/action.ts";
import { principal } from "../../../_server/principal.ts";
import type { ProducePort } from "./contract.ts";
import { serverProduce } from "./port.ts";

type In<K extends keyof ProducePort> = Parameters<ProducePort[K]>[0];
type Out<K extends keyof ProducePort> = ReturnType<ProducePort[K]>;

const reader = () => principal("read");
const id = z.string().min(1).max(200);
const rev = z.number().int().positive();
const token = z.string().min(8).max(200);
const ceilingUsd = ceilingUsdSchema.optional();
const mode = receiptModeSchema.optional();
/** Who acts, as the job events name the operator (the Board's `as`). */
const as = (p: Principal) => ("uid" in p ? { who: p.uid } : {});

export async function composerChoices(): Out<"composerChoices"> {
  return runAction("produce composer choices", reader, z.undefined(), () => serverProduce().composerChoices(), undefined);
}

const composerReceiptAction = action("produce composer receipt", z.object({ input: composerEstimateSchema, mode }), (i, who) => serverProduce().composerReceipt(i, as(who)));
export async function composerReceipt(input: In<"composerReceipt">): Out<"composerReceipt"> {
  return composerReceiptAction(input);
}

const launchRunAction = action("produce launch run", z.object({ input: composerInputSchema, token, ceilingUsd, mode }), (i, who) => serverProduce().launchRun(i, as(who)));
export async function launchRun(input: In<"launchRun">): Out<"launchRun"> {
  return launchRunAction(input);
}

export async function listProjects(): Out<"listProjects"> {
  return runAction("produce list", reader, z.undefined(), () => serverProduce().listProjects(), undefined);
}

export async function loadPlan(input: In<"loadPlan">): Out<"loadPlan"> {
  return runAction("produce plan", reader, z.object({ id }), (i) => serverProduce().loadPlan(i), input);
}

export async function composeChoices(): Out<"composeChoices"> {
  return runAction("produce compose choices", reader, z.undefined(), () => serverProduce().composeChoices(), undefined);
}

const composeAction = action("produce compose", composeInputSchema, (i, who) => serverProduce().compose(i, as(who)));
export async function compose(input: In<"compose">): Out<"compose"> {
  return composeAction(input);
}

const setPartAction = action("produce set part", z.object({ id, rev, partId: id.max(400), patch: partPatchSchema }), (i, who) => serverProduce().setPart(i, as(who)));
export async function setPart(input: In<"setPart">): Out<"setPart"> {
  return setPartAction(input);
}

const renameAction = action("produce rename", z.object({ id, rev, title: z.string().trim().min(1).max(200) }), (i, who) => serverProduce().rename(i, as(who)));
export async function rename(input: In<"rename">): Out<"rename"> {
  return renameAction(input);
}

const discardAction = action("produce discard", z.object({ id, rev }), (i, who) => serverProduce().discard(i, as(who)));
export async function discard(input: In<"discard">): Out<"discard"> {
  return discardAction(input);
}

const planReceiptAction = action("produce plan receipt", z.object({ id, mode }), (i, who) => serverProduce().planReceipt(i, as(who)));
export async function planReceipt(input: In<"planReceipt">): Out<"planReceipt"> {
  return planReceiptAction(input);
}

const launchPlanAction = action("produce launch plan", z.object({ id, rev, token, ceilingUsd, mode }), (i, who) => serverProduce().launchPlan(i, as(who)));
export async function launchPlan(input: In<"launchPlan">): Out<"launchPlan"> {
  return launchPlanAction(input);
}

const job = z.object({ jobId: id.max(400) });
const pauseAction = action("produce pause", job, (i, who) => serverProduce().pauseJob(i, as(who)));
export async function pauseJob(input: In<"pauseJob">): Out<"pauseJob"> {
  return pauseAction(input);
}

const resumeAction = action("produce resume", job, (i, who) => serverProduce().resumeJob(i, as(who)));
export async function resumeJob(input: In<"resumeJob">): Out<"resumeJob"> {
  return resumeAction(input);
}

const retryAction = action("produce retry", job.extend({ ceilingUsd }), (i, who) => serverProduce().retryJob(i, as(who)));
export async function retryJob(input: In<"retryJob">): Out<"retryJob"> {
  return retryAction(input);
}

const moveAction = action("produce move", job.extend({ dir: z.enum(["earlier", "later"]) }), (i, who) => serverProduce().moveJob(i, as(who)));
export async function moveJob(input: In<"moveJob">): Out<"moveJob"> {
  return moveAction(input);
}

export async function rerouteOptions(input: In<"rerouteOptions">): Out<"rerouteOptions"> {
  return runAction("produce reroute options", reader, job, (i) => serverProduce().rerouteOptions(i), input);
}

const rerouteAction = action("produce reroute", job.extend({ option: z.string().min(1).max(200), token: token.optional(), ceilingUsd }), (i, who) => serverProduce().reroute(i, as(who)));
export async function reroute(input: In<"reroute">): Out<"reroute"> {
  return rerouteAction(input);
}

const ackAction = action("produce ack lane", z.object({ lane: z.enum(RESOURCE_LANES) }), (i, who) => serverProduce().ackLane(i, as(who)));
export async function ackLane(input: In<"ackLane">): Out<"ackLane"> {
  return ackAction(input);
}
