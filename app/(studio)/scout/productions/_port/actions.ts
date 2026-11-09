"use server";

// THE PRODUCTIONS SCREEN'S SERVER ACTIONS - the ProductionsPort the island calls (./contract.ts), over whichever side
// ./port.ts switches to. Each goes through the one action wrapper (app/_server/action.ts): who first (`money` key use: a
// launch spends GPU time and a Start writes a record), then the input's door, then the body.

import { z } from "zod";

import { RECEIPT_MODES } from "@gt/domain/produce";
import { PRODUCTION_SOURCE_KINDS, TAKE_KINDS, productionIdSchema, productionStageSchema, type ProductionId, type ProductionSource } from "@gt/domain/production";

import { action } from "../../../../_server/action.ts";
import { actorOf } from "../../../../../lib/principal.ts";
import type { CastLaunchInput, ProductionsPort, RoleEditInput, TakeRequestInput } from "./contract.ts";
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
const castKinds = ["roles", "audition", "round", "retry"] as const;
const castLaunchInput = z.object({ kind: z.enum(castKinds), id: productionIdSchema, roleId: z.string().min(1).max(80).optional(), roundId: z.string().min(1).max(120).optional(), mode: z.enum(RECEIPT_MODES), token: z.string().min(1).optional() });
const castLaunchAction = action("cast launch", castLaunchInput, (i, who) => serverProductions().castLaunch(i as unknown as CastLaunchInput, actorOf(who)));
const roleEdit = z.object({ id: z.string().min(1).max(60).optional(), name: z.string().min(1).max(60), brief: z.string().min(1).max(2000), auditionScript: z.string().min(1).max(1000).optional() });
const saveRolesInput = z.object({ id: productionIdSchema, roles: z.array(roleEdit).min(1).max(8) });
const saveRolesAction = action("cast roles", saveRolesInput, (i, who) => serverProductions().saveRoles(i.id as ProductionId, i.roles as readonly RoleEditInput[], actorOf(who)));
const heardInput = z.object({ id: productionIdSchema, roundId: z.string().min(1).max(120), voiceId: z.string().min(1).max(40), at: z.string().min(1).max(40) });
const heardAction = action("cast heard", heardInput, (i, who) => serverProductions().heard(i.id as ProductionId, i.roundId, i.voiceId, i.at, actorOf(who)));
const pickInput = z.object({ id: productionIdSchema, roundId: z.string().min(1).max(120), character: z.string().min(1).max(40), voice: z.string().min(1).max(40), saveToLibrary: z.boolean() });
const pickAction = action("cast pick", pickInput, (i, who) => serverProductions().pick(i.id as ProductionId, i.roundId, i.character, i.voice, i.saveToLibrary, actorOf(who)));
const recastInput = z.object({ id: productionIdSchema, roleId: z.string().min(1).max(80) });
const recastAction = action("cast recast", recastInput, (i, who) => serverProductions().recast(i.id as ProductionId, i.roleId, actorOf(who)));
const roundInput = z.object({ id: productionIdSchema, roundId: z.string().min(1).max(120) });
const retryVoicesAction = action("cast retry voices", roundInput, (i, who) => serverProductions().retryVoices(i.id as ProductionId, i.roundId, actorOf(who)));
const retryCreateAction = action("cast retry voice", roundInput, (i, who) => serverProductions().retryCreate(i.id as ProductionId, i.roundId, actorOf(who)));

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

export async function castLaunchAction_(input: In<"castLaunch">): Out<"castLaunch"> {
  return castLaunchAction(input);
}

export async function saveRolesAction_(input: In<"saveRoles">): Out<"saveRoles"> {
  return saveRolesAction(input);
}

export async function heardAction_(input: In<"heard">): Out<"heard"> {
  return heardAction(input);
}

export async function pickCastAction(input: In<"pick">): Out<"pick"> {
  return pickAction(input);
}

export async function recastAction_(input: In<"recast">): Out<"recast"> {
  return recastAction(input);
}

export async function retryVoicesAction_(input: In<"retryVoices">): Out<"retryVoices"> {
  return retryVoicesAction(input);
}

export async function retryCreateAction_(input: In<"retryCreate">): Out<"retryCreate"> {
  return retryCreateAction(input);
}

export async function refreshProductionsAction(): Out<"refresh"> {
  return viewAction({});
}
