"use server";

// THE SUNO ADVISOR'S WRITES (spark suno-advisor), as Server Actions through the one action core:
// `listenAct` runs the priced listener on one uploaded take (quote first; DRY returns a stand-in),
// `keepTasteAct` / `dropTasteAct` file an `audio.taste` event and answer with the profile folded anew.
// WP0 STUBS: the signatures are the contract; WP2 fills the bodies (lib/sound/suno/listen.ts, the taste fold).
import { z } from "zod";

import type { StudioTakeFacts, StudioTasteLine } from "@gt/domain/audio.suno";
import { err } from "@gt/domain/errors";

import type { ActionResult } from "../../../../_server/actionCore.ts";
import { action } from "../../../../_server/action.ts";

const NOT_YET = "not built yet (spark suno-advisor WP2)";

const listen = action("audio studio listen", z.strictObject({ takeId: z.string().min(1).max(120) }), async () => err<StudioTakeFacts>("unavailable", `listen: ${NOT_YET}`));

const tasteRow = z.strictObject({
  line: z.string().trim().min(1).max(120),
  lean: z.enum(["like", "dislike"]),
  session: z.string().max(64).optional(),
  turn: z.string().max(64).optional(),
});
const keepTaste = action("audio studio keep taste", tasteRow, async () => err<readonly StudioTasteLine[]>("unavailable", `keep taste: ${NOT_YET}`));
const dropTaste = action("audio studio drop taste", z.strictObject({ line: z.string().trim().min(1).max(120) }), async () => err<readonly StudioTasteLine[]>("unavailable", `drop taste: ${NOT_YET}`));

export async function listenAct(input: { readonly takeId: string }): Promise<ActionResult<StudioTakeFacts>> {
  return listen(input);
}

export async function keepTasteAct(input: { readonly line: string; readonly lean: "like" | "dislike"; readonly session?: string; readonly turn?: string }): Promise<ActionResult<readonly StudioTasteLine[]>> {
  return keepTaste(input);
}

export async function dropTasteAct(input: { readonly line: string }): Promise<ActionResult<readonly StudioTasteLine[]>> {
  return dropTaste(input);
}
