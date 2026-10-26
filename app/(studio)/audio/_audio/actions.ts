"use server";

// THE AUDIO LANE COMPOSER'S ACTS - the team's hand on a term, and a seed sent to Suno through a
// receipt - as Server Actions through the one action core (app/_server/action.ts: who first,
// then the input door, then the body, then the wire envelope), with `money` key use: a receipt is
// the first half of a spend.
//
// A SEED IS SENT AS SUNO'S FORM, not as text. The client writes the fields from the seed
// (@gt/ui recipe `sunoFieldsOf`), and this door holds them to Suno's own limits again
// (lib/sound/suno/store.ts `parseFields`, inside the draft) - the client's word is never the
// last word on a form a vendor will be sent. The receipt mints the job id (`sj-lane-…`) and the
// token carries it, the Floor door's shape (../../projects/_port/realLaunch.ts); the confirm
// drafts the proposal and its record under that id and launches the box.chrome job.
import { randomBytes } from "node:crypto";

import { z } from "zod";

import { err, errorMessage, isAppError, ok, type Result } from "@gt/domain/errors";
import type { LaunchedRun, Receipt } from "@gt/domain/produce";
import { ceilingUsdSchema, receiptModeSchema } from "@gt/domain/produce.schema";
import { dryOnlyFrom } from "@gt/kernel/dryrun";

import type { ActionResult } from "../../../_server/actionCore.ts";
import { action } from "../../../_server/action.ts";
import { kernel } from "../../../../lib/kernelStore.ts";
import { launchSunoDraft, sunoKernelId, sunoRunId } from "../../../../lib/producers/suno.ts";
import { setHand as writeHand } from "../../../../lib/sound/hands.ts";
import { SoundError } from "../../../../lib/sound/store.ts";
import { draftJobId } from "../../../../lib/sound/suno/draft.ts";
import type { Confirmed } from "../../projects/_port/contract.ts";
import { actorOf } from "../../../../lib/principal.ts";

const handInput = z.object({
  id: z.string().min(3).max(140),
  stance: z.enum(["prefer", "avoid"]).nullable(),
  phrase: z.string().max(200),
});

const setHandAction = action("audio set hand", handInput, async (i): Promise<Result<{ readonly id: string }>> => {
  try {
    await writeHand(i.id, i.phrase.trim() === "" ? { stance: i.stance } : { stance: i.stance, phrase: i.phrase });
    return ok({ id: i.id });
  } catch (e) {
    return e instanceof SoundError ? err(e.status === 400 ? "invalid" : "unavailable", e.message) : err("internal", errorMessage(e));
  }
});

const fields = z
  .object({
    title: z.string().max(400).optional(),
    style: z.string().trim().min(1).max(1000),
    lyrics: z.string().max(6000).optional(),
    exclude: z.string().max(1000).optional(),
  })
  .strict();

const sendInput = z.object({ fields, mode: receiptModeSchema.optional(), token: z.string().min(8).max(200).optional(), ceilingUsd: ceilingUsdSchema.optional() });

const wrapToken = (jobId: string, r: Receipt): Receipt => ({ ...r, token: `${jobId}:${r.token}` });

/** A receipt (no token) or a confirm (a token this door minted) for one seed sent to Suno. */
const sendAction = action("audio send to suno", sendInput, async (i, who): Promise<Result<Receipt | Confirmed<LaunchedRun>>> => {
  const k = kernel();
  if (!k.ok) return k;
  const mode = i.mode ?? "dry";
  const dryOnly = dryOnlyFrom(process.env);
  if (mode === "live" && dryOnly) return err("refused", "this process may only run dry (GRAVITONE_DRY_ONLY=1); nothing here can be armed live");
  const at = i.token?.lastIndexOf(":") ?? -1;
  if (i.token !== undefined && at <= 0) return err("invalid", "a Suno confirm needs the token its receipt gave");
  const jobId = i.token === undefined ? draftJobId(`lane-${Date.now().toString(36)}${randomBytes(2).toString("hex")}`) : i.token.slice(0, at);
  const f = { style: i.fields.style, ...(i.fields.title === undefined ? {} : { title: i.fields.title }), ...(i.fields.lyrics === undefined ? {} : { lyrics: i.fields.lyrics }), ...(i.fields.exclude === undefined ? {} : { exclude: i.fields.exclude }) };
  try {
    const r = await launchSunoDraft(
      jobId,
      { kind: "fields", fields: f },
      {
        mode,
        actor: actorOf(who),
        dryOnly,
        store: k.value.store,
        ...(i.ceilingUsd === undefined ? {} : { ceilingUsd: i.ceilingUsd }),
        ...(i.token === undefined ? {} : { token: i.token.slice(at + 1) }),
      },
    );
    switch (r.kind) {
      case "receipt":
        return ok(wrapToken(jobId, r.receipt));
      case "stale":
        return ok({ kind: "stale", fresh: wrapToken(jobId, r.fresh) });
      case "launched":
        return ok({ kind: "launched", runId: sunoRunId({ id: jobId }), jobId: sunoKernelId({ id: jobId }) });
    }
  } catch (e) {
    if (isAppError(e)) return { ok: false, error: e };
    if (e instanceof SoundError) return err(e.status === 400 ? "invalid" : e.status === 409 ? "conflict" : "unavailable", e.message);
    throw e;
  }
});

export type SendInput = Omit<z.input<typeof sendInput>, "token">;
export type HandInput = z.input<typeof handInput>;

export async function setHand(input: HandInput): Promise<ActionResult<{ readonly id: string }>> {
  return setHandAction(input);
}

/** The receipt for one seed sent to Suno: priced, nothing written. */
export async function sunoReceipt(input: SendInput): Promise<ActionResult<Receipt>> {
  const r = await sendAction(input);
  if (!r.ok) return r;
  return "kind" in r.value ? { ok: false, error: { error: "a Suno receipt read answered a confirm", code: "internal" } } : { ok: true, value: r.value };
}

/** The confirm of a receipt this door minted: launched, or the fresh receipt when the queue moved. */
export async function sunoConfirm(input: SendInput & { readonly token: string }): Promise<ActionResult<Confirmed<LaunchedRun>>> {
  const r = await sendAction(input);
  if (!r.ok) return r;
  return "kind" in r.value ? { ok: true, value: r.value } : { ok: false, error: { error: "a Suno confirm answered a receipt", code: "internal" } };
}
