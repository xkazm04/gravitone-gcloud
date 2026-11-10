"use server";

// THE SUNO ADVISOR'S WRITES (spark suno-advisor), as Server Actions through the one action core:
// `listenAct` runs the priced listener on one uploaded take (quote first; DRY returns a stand-in),
// `keepTasteAct` / `dropTasteAct` file an `audio.taste` event and answer with the profile folded anew.
// The bodies are lib/sound/suno/listen.ts (the listener) and ./taste.ts (the taste writes); this file
// only binds them to the session principal, which is also the actor every receipt and event names.
//
// Spark suno-api: `pullSunoTakeAct` files a song from the person's Suno library as a take and reads
// it (lib/sound/suno/pull.ts), `readSunoTakeAct` asks Suno's free reads of a pulled take again
// (lib/sound/suno/sunoRead.ts), `sunoLibraryAct` lists or searches the library, and
// `sunoConnectionAct` says whether this machine holds a Suno grant (the token file, no network).
// None of them spends.
import { z } from "zod";

import type { StudioTakeFacts, StudioTasteLine } from "@gt/domain/audio.suno";
import { studioTasteRowSchema } from "@gt/domain/audio.studio";
import { studioSessionSchema } from "@gt/domain/audio.studio.events";
import { ok } from "@gt/domain/errors";

import type { ActionResult } from "../../../../_server/actionCore.ts";
import { action } from "../../../../_server/action.ts";
import { kernel } from "../../../../../lib/kernelStore.ts";
import { actorOf } from "../../../../../lib/principal.ts";
import { sunoApi, sunoApiStatus } from "../../../../../lib/suno/api/client.ts";
import { listenDeps, listenWith } from "../../../../../lib/sound/suno/listen.ts";
import { libraryPage, pullDeps, pullSunoTake, type Pulled, type SongPage } from "../../../../../lib/sound/suno/pull.ts";
import { readSunoTake, sunoReadDeps } from "../../../../../lib/sound/suno/sunoRead.ts";
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

/** A Suno song id: the API's uuid, or any id it hands out - no spaces, no path. */
const clipId = z.string().regex(/^[A-Za-z0-9_-]{1,120}$/, "not a suno song id");

const pullInput = z.strictObject({
  session: studioSessionSchema,
  clipId,
  promptId: studioTasteRowSchema.shape.id.optional(),
  clip: z.enum(["a", "b"]).optional(),
});
const pull = action("audio studio pull suno take", pullInput, async (i) => pullSunoTake(i, await pullDeps()));
const read = action("audio studio read suno take", z.strictObject({ takeId: z.string().min(1).max(120) }), async (i) => readSunoTake(i.takeId, await sunoReadDeps()));
const library = action(
  "audio studio suno library",
  z.strictObject({ query: z.string().trim().max(200).optional(), cursor: z.string().min(1).max(500).optional() }),
  async (i) => libraryPage(sunoApi(), i),
);
const connection = action("audio studio suno connection", z.strictObject({}), async () => {
  const s = await sunoApiStatus();
  return ok(s.connected ? { connected: true as const } : { connected: false as const, reason: s.reason });
});

/** Pull one song from the person's Suno library into the conversation as a take, measured and read. */
export async function pullSunoTakeAct(input: { readonly session: string; readonly clipId: string; readonly promptId?: string; readonly clip?: "a" | "b" }): Promise<ActionResult<Pulled>> {
  return pull(input);
}

/** Ask Suno's free reads of a pulled take again (finishes a read saved while a part was still out). */
export async function readSunoTakeAct(input: { readonly takeId: string }): Promise<ActionResult<StudioTakeFacts>> {
  return read(input);
}

/** A page of the person's Suno library: their search when given, else the newest. */
export async function sunoLibraryAct(input: { readonly query?: string; readonly cursor?: string }): Promise<ActionResult<SongPage>> {
  return library(input);
}

/** Whether this machine holds a Suno grant, or why not. */
export async function sunoConnectionAct(): Promise<ActionResult<{ readonly connected: true } | { readonly connected: false; readonly reason: string }>> {
  return connection({});
}

export async function listenAct(input: { readonly takeId: string }): Promise<ActionResult<StudioTakeFacts>> {
  return listen(input);
}

export async function keepTasteAct(input: { readonly line: string; readonly lean: "like" | "dislike"; readonly session?: string; readonly turn?: string }): Promise<ActionResult<readonly StudioTasteLine[]>> {
  return keepTaste(input);
}

export async function dropTasteAct(input: { readonly line: string }): Promise<ActionResult<readonly StudioTasteLine[]>> {
  return dropTaste(input);
}
