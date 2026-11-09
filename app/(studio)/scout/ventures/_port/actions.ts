"use server";

// The ventures screen's one act: the operator's own press births a venture. Who first, then the input's door, then the body.

import { z } from "zod";

import { action } from "../../../../_server/action.ts";
import { actorOf } from "../../../../../lib/principal.ts";
import type { VenturesPort } from "./contract.ts";
import { serverVentures } from "./port.ts";

const line = z.string().trim().min(1).max(200);
const createInput = z.object({ name: z.string().trim().min(1).max(90), tone: line, audience: line, format: line, look: line });
const createAction = action("venture create", createInput, (i, who) => serverVentures().create(i, actorOf(who)));

export async function createVentureAction(input: Parameters<VenturesPort["create"]>[0]): ReturnType<VenturesPort["create"]> {
  return createAction(input);
}
