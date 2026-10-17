"use server";

// THE LESSON'S CONFIRM - the only write a lesson has, as a Server Action through the one action
// core. The operator's sign: a proposal (a hunt's draft, a hand draft, a strengths cell's) with
// the claim they wrote or accepted, the op id that keys it, and - for a hunt - the evidence key
// the draft was counted over. lib/sound/lessons.ts recounts the hunt, refuses a draft the hunt
// has moved past, appends the lesson and links it in one store transaction, then records it.
//
// L66's strengths cells call THIS (`confirmLessonAct`) with @gt/ui lesson.ts `cellLesson`'s
// proposal and the signer's claim.
import { z } from "zod";

import type { ActionResult } from "../../../_server/actionCore.ts";
import { action } from "../../../_server/action.ts";
import { kernel } from "../../../../lib/kernelStore.ts";
import { confirmLesson, LESSON_OP_RE, type Confirmed } from "../../../../lib/sound/lessons.ts";

const evidence = z
  .object({
    n: z.number().int().nonnegative(),
    keepRate: z.number().min(0).max(1).nullable(),
    meanScore: z.number().min(0).max(10).nullable(),
    takeIds: z.array(z.string().regex(/^[A-Za-z0-9_-]{1,80}$/)).max(200),
  })
  .strict();

const confirmInput = z
  .object({
    kind: z.enum(["music", "sfx"]),
    source: z.enum(["triage", "hunt"]),
    provider: z.string().max(40).nullable(),
    huntId: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/).nullable(),
    claim: z.string().max(2000),
    technique: z.array(z.string().max(80)).max(16),
    evidence,
    opId: z.string().regex(LESSON_OP_RE),
    key: z.string().max(4000).optional(),
  })
  .strict();

export type ConfirmLessonInput = z.input<typeof confirmInput>;

const confirmAction = action("audio lesson confirm", confirmInput, async (i, who) => {
  const k = kernel();
  if (!k.ok) return k;
  const { key, ...rest } = i;
  return confirmLesson(k.value.store, { ...rest, ...(key === undefined ? {} : { key }) }, { kind: "operator", id: "uid" in who ? who.uid : "operator" }, new Date());
});

export async function confirmLessonAct(input: ConfirmLessonInput): Promise<ActionResult<Confirmed>> {
  return confirmAction(input);
}
