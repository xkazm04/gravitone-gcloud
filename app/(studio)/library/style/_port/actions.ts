"use server";

// THE STYLE SERVER ACTIONS - the StylePort the atelier calls (./contract.ts), over whichever side
// ./port.ts switches to, each through the one action core (app/_server/actionCore.ts): who first,
// then the input through its zod door (./schema.ts), then the body, then the envelope. The read
// resolves the principal with `read` key use; every write - and a receipt is the first half of
// one - with `money`, the produce port's rule. The op records who acted (the lock's `by`).

import { z } from "zod";

import type { Principal } from "../../../../../lib/principal.ts";
import { runAction } from "../../../../_server/actionCore.ts";
import { action } from "../../../../_server/action.ts";
import { principal } from "../../../../_server/principal.ts";
import type { StylePort } from "./contract.ts";
import { serverStyle } from "./port.ts";
import { receiptModeSchema, styleActSchema, styleOpRequestSchema } from "./schema.ts";

type In<K extends keyof StylePort> = Parameters<StylePort[K]>[0];
type Out<K extends keyof StylePort> = ReturnType<StylePort[K]>;

/** The ledger's actor for an op: the principal's uid; the shared secret names nobody. */
const by = (p: Principal): string => ("uid" in p ? p.uid : "operator");

export async function loadStyle(input: In<"loadStyle">): Out<"loadStyle"> {
  return runAction("style load", () => principal("read"), z.object({ id: z.string().min(1).max(200) }).strict(), (i) => serverStyle().loadStyle(i), input);
}

const opAction = action("style op", styleOpRequestSchema, (i, who) => serverStyle().opStyle(i, by(who)));
export async function opStyle(input: In<"opStyle">): Out<"opStyle"> {
  return opAction(input);
}

const receiptAction = action("style act receipt", z.object({ act: styleActSchema, mode: receiptModeSchema }).strict(), (i) => serverStyle().actReceipt(i));
export async function actReceipt(input: In<"actReceipt">): Out<"actReceipt"> {
  return receiptAction(input);
}

const actAction = action("style act", z.object({ act: styleActSchema, mode: receiptModeSchema, token: z.string().min(8).max(200) }).strict(), (i, who) => serverStyle().act(i, by(who)));
export async function act(input: In<"act">): Out<"act"> {
  return actAction(input);
}
