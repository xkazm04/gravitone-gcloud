"use server";

// THE ARRANGE BOARD'S ACTS - a card's move (a finalize is a move with a label) and a row edit, as
// Server Actions through the one action core (app/_server/action.ts: who, the input door, the
// body, the envelope). The door's judgement and the write are lib/sound/arrange.ts's; this file
// binds the kernel, the actor and the clock. The Suno return is a file and travels through the
// route beside this page (../return/route.ts), which a Server Action's body cap would refuse.
import { z } from "zod";

import { STAGES } from "@gt/ui/components/audio/arrange.ts";

import type { ActionResult } from "../../../_server/actionCore.ts";
import { action } from "../../../_server/action.ts";
import { kernel } from "../../../../lib/kernelStore.ts";
import type { Principal } from "../../../../lib/principal.ts";
import { editGroups, moveTake, OP_ID_RE, type GroupsEdited } from "../../../../lib/sound/arrange.ts";

const cell = z.object({ stage: z.enum(STAGES), group: z.string().trim().min(1).max(80).nullable() }).strict();
const opId = z.string().regex(OP_ID_RE);

const moveInput = z.object({ id: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/), from: cell, to: cell, label: z.string().max(120).optional(), opId }).strict();

const name = z.string().trim().min(1).max(80);
const groupInput = z
  .object({
    kind: z.enum(["music", "sfx"]),
    opId,
    op: z.discriminatedUnion("op", [
      z.object({ op: z.literal("add"), name }),
      z.object({ op: z.literal("adopt"), name }),
      z.object({ op: z.literal("rename"), from: name, to: name }),
      z.object({ op: z.literal("move"), name, by: z.union([z.literal(-1), z.literal(1)]) }),
      z.object({ op: z.literal("delete"), name }),
    ]),
  })
  .strict();

const actorOf = (who: Principal) => ({ kind: "operator" as const, id: "uid" in who ? who.uid : "operator" });

export type Moved = { readonly id: string; readonly stage: string; readonly group: string | null; readonly label: string | null; readonly already: boolean };

const moveAction = action("audio arrange move", moveInput, async (i, who) => {
  const k = kernel();
  if (!k.ok) return k;
  const { label, ...rest } = i;
  const r = await moveTake(k.value.store, { ...rest, ...(label === undefined ? {} : { label }) }, actorOf(who), new Date());
  if (!r.ok) return r;
  const t = r.value.take;
  return { ok: true, value: { id: t.id, stage: t.stage ?? "pending", group: t.group, label: t.label, already: r.value.already } };
});

const groupsAction = action("audio arrange groups", groupInput, async (i, who) => {
  const k = kernel();
  if (!k.ok) return k;
  return editGroups(k.value.store, i, actorOf(who), new Date());
});

export type MoveInput = z.input<typeof moveInput>;
export type GroupInput = z.input<typeof groupInput>;

export async function moveCard(input: MoveInput): Promise<ActionResult<Moved>> {
  return moveAction(input);
}

export async function editRows(input: GroupInput): Promise<ActionResult<GroupsEdited>> {
  return groupsAction(input);
}
