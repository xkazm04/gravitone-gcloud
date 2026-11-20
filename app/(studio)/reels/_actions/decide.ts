"use server";

// THE FILM AND RELEASE VERDICTS FROM /reels (spark reel-studio WP4, the act WP3's verdict bar calls). One door to
// the one writer, lib/reel/decide.ts `decideReelStop`, which the Board's apply also reaches: a stop decided here
// reads decided there. The verdict is the operator's, always (`by: "operator"`): this door is reached only
// through a signed-in session, never by an agent.
//
// `of` is the subject sha the screen judged (the film's `filmSubjectSha` as the port read it). The round is read
// from the records here, against that sha: the screen never names a round, so a verdict sent on a film that was
// rendered again since lands as the next round's, and the writer refuses a clash in words.
import { z } from "zod";

import type { Result } from "@gt/domain/errors";
import { err, ok } from "@gt/domain/errors";

import type { ActionResult } from "../../../_server/actionCore.ts";
import { action } from "../../../_server/action.ts";
import { decideReelStop } from "../../../../lib/reel/decide.ts";
import { isReelSlug, readVerdicts, reelDir, roundOf, type ReelPin, type ReelVerdict } from "../../../../lib/reel/store.ts";

const pinSchema = z.strictObject({ t: z.number().nonnegative().max(3600), reasons: z.array(z.string().min(1).max(40)).max(11), text: z.string().max(2000) });

const decideInput = z.strictObject({
  slug: z.string().min(1).max(60).refine(isReelSlug, "not a reel slug"),
  key: z.enum(["film", "release"]),
  verdict: z.enum(["keep", "reject", "drop"]),
  reasons: z.array(z.string().min(1).max(40)).max(11),
  note: z.string().max(4000).optional(),
  pins: z.array(pinSchema).max(200).optional(),
  of: z.string().regex(/^[0-9a-f]{64}$/, "a sha256"),
});

export type DecideInput = {
  readonly slug: string;
  readonly key: "film" | "release";
  readonly verdict: "keep" | "reject" | "drop";
  readonly reasons: readonly string[];
  readonly note?: string;
  readonly pins?: readonly ReelPin[];
  readonly of: string;
};

export type DecideAnswer = { readonly recorded: string; readonly slots?: string[] };

const decide = action("reel decide", decideInput, async (i): Promise<Result<DecideAnswer>> => {
  if (i.verdict === "drop" && i.key !== "film") return err("invalid", "drop is the film stop's answer; a release is kept or sent back");
  if (i.pins !== undefined && i.pins.length > 0 && i.key !== "film") return err("invalid", "pins are notes on the film; the release stop takes reasons and a note");
  const held = (await readVerdicts(reelDir(i.slug))).stops[i.key];
  const { round } = roundOf(held, i.of);
  const note = i.note?.trim();
  const pins = i.pins === undefined ? undefined : [...i.pins].sort((a, b) => a.t - b.t);
  const v: ReelVerdict = {
    verdict: i.verdict,
    reasons: i.reasons,
    ...(note === undefined || note === "" ? {} : { note }),
    ...(pins === undefined || pins.length === 0 ? {} : { pins }),
    by: "operator",
    at: new Date().toISOString(),
    of: i.of,
    round,
  };
  const done = await decideReelStop(i.slug, i.key, v);
  if (!done.ok) return done;
  return ok({ recorded: done.value.recorded, ...(done.value.slots === undefined ? {} : { slots: [...done.value.slots] }) });
});

/** WP3's `ReviewActions["decide"]`. */
export async function decideAction(input: DecideInput): Promise<ActionResult<DecideAnswer>> {
  return decide(input);
}
