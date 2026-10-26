"use server";

// THE PART SERVER ACTIONS - the PartPort a part editor calls (./contract.ts), over whichever side
// ./port.ts switches to, each through the one action core (app/_server/actionCore.ts): who
// first, then the input through its zod door (./schema.ts), then the body, then the envelope.
// The read resolves the principal with `read` key use; every write - and a receipt is the first
// half of one - with `money`, the produce port's rule.

import { z } from "zod";

import { runAction } from "../../../../_server/actionCore.ts";
import { action } from "../../../../_server/action.ts";
import { principal } from "../../../../_server/principal.ts";
import type { Principal } from "../../../../../lib/principal.ts";
import type { PartPort } from "./contract.ts";
import { serverPart } from "./port.ts";
import { address, partActSchema, partOpSchema } from "./schema.ts";

type In<K extends keyof PartPort> = Parameters<PartPort[K]>[0];
type Out<K extends keyof PartPort> = ReturnType<PartPort[K]>;

const at = z.object(address).strict();
const rev = z.number().int().positive();
/** Who acts, as the part's op log and its act's job name them: the signed-in principal, the
 *  produce actions' rule (../../_port/actions.ts). */
const as = (p: Principal) => ("uid" in p ? { who: p.uid } : {});

export async function loadPart(input: In<"loadPart">): Out<"loadPart"> {
  return runAction("part load", () => principal("read"), at, (i) => serverPart().loadPart(i), input);
}

const opAction = action("part op", at.extend({ baseRev: rev, op: partOpSchema }), (i, who) => serverPart().opPart(i, as(who)));
export async function opPart(input: In<"opPart">): Out<"opPart"> {
  return opAction(input);
}

const undoAction = action("part undo", at.extend({ baseRev: rev }), (i, who) => serverPart().undoPart(i, as(who)));
export async function undoPart(input: In<"undoPart">): Out<"undoPart"> {
  return undoAction(input);
}

const receiptAction = action("part act receipt", at.extend({ act: partActSchema, target: z.string().min(1).max(200).optional() }), (i, who) => serverPart().actReceipt(i, as(who)));
export async function actReceipt(input: In<"actReceipt">): Out<"actReceipt"> {
  return receiptAction(input);
}

const actAction = action("part act", at.extend({ act: partActSchema, target: z.string().min(1).max(200).optional(), token: z.string().min(8).max(200) }), (i, who) => serverPart().act(i, as(who)));
export async function act(input: In<"act">): Out<"act"> {
  return actAction(input);
}
