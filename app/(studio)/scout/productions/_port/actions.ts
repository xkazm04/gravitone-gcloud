"use server";

// THE PRODUCTIONS SCREEN'S SERVER ACTIONS - the ProductionsPort the island calls (./contract.ts), over whichever side
// ./port.ts switches to. Each goes through the one action wrapper (app/_server/action.ts): who first (`money` key use: a
// launch spends GPU time and a Start writes a record), then the input's door, then the body.

import { z } from "zod";

import { RECEIPT_MODES } from "@gt/domain/produce";
import { PRODUCTION_SOURCE_KINDS, TAKE_KINDS, productionIdSchema, productionStageSchema, type ProductionId, type ProductionSource } from "@gt/domain/production";

import { action } from "../../../../_server/action.ts";
import { actorOf } from "../../../../../lib/principal.ts";
import type { ProductionsPort, TakeRequestInput } from "./contract.ts";
import { serverProductions } from "./port.ts";

const sourceInput = z.object({ source: z.object({ kind: z.enum(PRODUCTION_SOURCE_KINDS), ref: z.string().min(1).max(200) }) });
const idInput = z.object({ id: productionIdSchema });
const takeInput = z.object({
  id: productionIdSchema,
  kind: z.enum(TAKE_KINDS),
  frames: z.array(z.string().min(1).max(40)).max(5),
  prompt: z.string().max(4000).optional(),
  mode: z.enum(RECEIPT_MODES),
  token: z.string().min(1).optional(),
});
const provenInput = z.object({ id: productionIdSchema, takeId: z.string().min(1).max(40) });
const moveInput = z.object({ id: productionIdSchema, to: productionStageSchema });

type In<K extends keyof ProductionsPort> = Parameters<ProductionsPort[K]>[0];
type Out<K extends keyof ProductionsPort> = ReturnType<ProductionsPort[K]>;

const startAction = action("production start", sourceInput, (i, who) => serverProductions().start(i.source as ProductionSource, actorOf(who)));
const launchAction = action("production launch", takeInput, (i, who) => serverProductions().launch(i as unknown as TakeRequestInput, actorOf(who)));
const provenAction = action("production proven", provenInput, (i, who) => serverProductions().proven(i.id as ProductionId, i.takeId, actorOf(who)));
const dropAction = action("production drop", idInput, (i, who) => serverProductions().drop(i.id as ProductionId, actorOf(who)));
const moveAction = action("production move", moveInput, (i, who) => serverProductions().move(i.id as ProductionId, i.to, actorOf(who)));
const viewAction = action("production view", z.object({}).strict(), () => serverProductions().view());

export async function startProductionAction(input: In<"start">): Out<"start"> {
  return startAction(input);
}

export async function launchTakeAction(input: In<"launch">): Out<"launch"> {
  return launchAction(input);
}

export async function markProvenAction(input: In<"proven">): Out<"proven"> {
  return provenAction(input);
}

export async function dropProductionAction(input: In<"drop">): Out<"drop"> {
  return dropAction(input);
}

export async function moveProductionAction(input: In<"move">): Out<"move"> {
  return moveAction(input);
}

export async function refreshProductionsAction(): Out<"refresh"> {
  return viewAction({});
}
