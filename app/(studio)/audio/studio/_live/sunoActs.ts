"use server";

// THE SUNO ADVISOR'S WRITES (spark suno-advisor), as Server Actions through the one action core:
// `listenAct` runs the priced listener on one uploaded take (quote first; DRY returns a stand-in),
// `keepTasteAct` / `dropTasteAct` file an `audio.taste` event and answer with the profile folded anew.
// The bodies are lib/sound/suno/listen.ts (the listener) and ./taste.ts (the taste writes); this file
// only binds them to the session principal, which is also the actor every receipt and event names.
import { z } from "zod";

import type { StudioTakeFacts, StudioTasteLine } from "@gt/domain/audio.suno";
import { studioSessionSchema } from "@gt/domain/audio.studio.events";

import type { ActionResult } from "../../../../_server/actionCore.ts";
import { action } from "../../../../_server/action.ts";
import { kernel } from "../../../../../lib/kernelStore.ts";
import { actorOf } from "../../../../../lib/principal.ts";
import { listenDeps, listenWith } from "../../../../../lib/sound/suno/listen.ts";
import { dropTaste as dropLine, keepTaste as keepLine } from "./taste.ts";

const listen = action("audio studio listen", z.strictObject({ takeId: z.string().min(1).max(120) }), async (i, who) => listenWith(i.takeId, await listenDeps(actorOf(who))));

const tasteRow = z.strictObject({
  line: z.string().trim().min(1).max(120),
  lean: z.enum(["like", "dislike"]),
  session: studioSessionSchema.optional(),
  turn: z.string().min(1).max(64).optional(),
});
const keepTaste = action("audio studio keep taste", tasteRow, async (i, who) => {
  const k = kernel();
  if (!k.ok) return k;
  return keepLine(k.value.store, i, actorOf(who), new Date().toISOString());
});
const dropTaste = action("audio studio drop taste", z.strictObject({ line: z.string().trim().min(1).max(120) }), async (i, who) => {
  const k = kernel();
  if (!k.ok) return k;
  return dropLine(k.value.store, i.line, actorOf(who), new Date().toISOString());
});

export async function listenAct(input: { readonly takeId: string }): Promise<ActionResult<StudioTakeFacts>> {
  return listen(input);
}

export async function keepTasteAct(input: { readonly line: string; readonly lean: "like" | "dislike"; readonly session?: string; readonly turn?: string }): Promise<ActionResult<readonly StudioTasteLine[]>> {
  return keepTaste(input);
}

export async function dropTasteAct(input: { readonly line: string }): Promise<ActionResult<readonly StudioTasteLine[]>> {
  return dropTaste(input);
}
