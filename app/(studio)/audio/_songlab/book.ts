"use server";

// THE DRAW'S TWO OWNER ACTS THE DESK NEEDS (spark yue2-song-lab S2, WP-D): draw the main field when
// there is no draw yet, and book the next round after a vote. lib/yue2/draw.ts has both
// (`drawFor`, `bookNext`) but nothing in S2 calls them from outside: the agent's MCP family has no
// draw op, and a vote (acts.ts voteAb) records the verdict without booking the match its winner
// advances into. Booking is idempotent (bookNext queues only matches with no pair), so the desk calls
// it after every vote; drawing is the empty desk's one act. Both run through the one action core.
import { z } from "zod";

import type { Draw } from "@gt/domain/audio.yue2.lab";
import type { Result } from "@gt/domain/errors";

import type { ActionResult } from "../../../_server/actionCore.ts";
import { action } from "../../../_server/action.ts";
import { kernel } from "../../../../lib/kernelStore.ts";
import { actorOf } from "../../../../lib/principal.ts";
import { bookNext, drawFor } from "../../../../lib/yue2/draw.ts";

const drawInput = z.strictObject({});

const drawAction = action("song lab draw", drawInput, async (_i, who): Promise<Result<Draw>> => {
  const k = kernel();
  if (!k.ok) return k;
  return drawFor(k.value.store, "main", [], actorOf(who));
});

/** Draw the main field (the lyric-gate passers, seeded by SongEval) and book its first round. */
export async function drawMain(): Promise<ActionResult<Draw>> {
  return drawAction({});
}

const bookInput = z.strictObject({ drawId: z.string().regex(/^[0-9a-f]{12}$/) });

const bookAction = action("song lab book", bookInput, async (i, who): Promise<Result<readonly string[]>> => {
  const k = kernel();
  if (!k.ok) return k;
  return bookNext(k.value.store, i.drawId, actorOf(who));
});

/** Book every match whose two entrants are now known (after a vote); returns the pair ids queued. */
export async function bookDraw(input: z.input<typeof bookInput>): Promise<ActionResult<readonly string[]>> {
  return bookAction(input);
}
