"use server";

// THE FIXTURE SIDE'S ACTS (spark yue2-song-lab S2, WP-D): the same four presses as the live desk -
// a vote, a direction, keep and remove - over the scripted fixture (./_port/fixture.ts), so the desk
// is driven end to end on any machine. They change this server process's script only and write no
// store; the band says `scripted` while they are in use. Each goes through the one action core.
import { z } from "zod";

import { abVoteSchema } from "@gt/domain/audio.yue2.schema";
import type { LabSay } from "@gt/domain/audio.yue2.lab";
import type { Result } from "@gt/domain/errors";

import type { ActionResult } from "../../../_server/actionCore.ts";
import { action } from "../../../_server/action.ts";
import { fixtureDrop, fixtureKeep, fixtureSay, fixtureVote } from "./_port/fixture.ts";

const voteAction = action("song lab fixture vote", abVoteSchema, (i): Result<{ readonly pairId: string }> => fixtureVote(i));

export async function fixtureVoteAct(input: z.input<typeof abVoteSchema>): Promise<ActionResult<{ readonly pairId: string }>> {
  return voteAction(input);
}

const sayInput = z.strictObject({ text: z.string().max(480), listening: z.boolean() });
const sayAction = action("song lab fixture say", sayInput, (i): Result<LabSay> => fixtureSay(i.text, i.listening));

export async function fixtureSayAct(input: z.input<typeof sayInput>): Promise<ActionResult<LabSay>> {
  return sayAction(input);
}

const decisionInput = z.strictObject({ turnId: z.string().min(1).max(64), proposalId: z.string().min(1).max(64) });
const keepAction = action("song lab fixture keep", decisionInput, (i): Result<{ readonly started: string }> => fixtureKeep(i.turnId, i.proposalId));
const dropAction = action("song lab fixture drop", decisionInput, (i): Result<{ readonly proposalId: string }> => fixtureDrop(i.turnId, i.proposalId));

export async function fixtureKeepAct(input: z.input<typeof decisionInput>): Promise<ActionResult<{ readonly started: string }>> {
  return keepAction(input);
}

export async function fixtureDropAct(input: z.input<typeof decisionInput>): Promise<ActionResult<{ readonly proposalId: string }>> {
  return dropAction(input);
}
