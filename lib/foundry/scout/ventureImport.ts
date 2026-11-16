import type { Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import { channelVentureProposal, mintSlugId, type Venture, type VentureFrame } from "@gt/domain/genre";
import type { Store } from "@gt/kernel/store";
import { bornVenture, listVentures } from "@gt/kernel/ventures/store";

import type { ChannelFile } from "./channels.ts";
import { lookOf } from "./channelLook.ts";

// CHANNELS AS VENTURES (spark concept-casting-stages S6): the importer of pipeline/ventures-import.mts. Each channel file becomes
// a kernel venture of kind `channel`, its `proposal` `channel/<id>` and its `channelId` the link back. The CHANNEL FILE STAYS THE
// SOURCE for nights until parity is proven (./genres.ts headsOf keeps these ventures away from them): a venture's frame is
// fixed at birth and the file may move on, so the screen reads the live card and this frame only says what was imported.
//
// IDEMPOTENT ON `proposal`: a second run finds the first's row and changes nothing.

/** What the channel's card holds, without adding a word: the family as the tone, what is true about the medium as the format. */
export function channelFrame(f: ChannelFile): VentureFrame {
  const c = f.channel;
  return { tone: c.group, audience: c.audience, format: c.medium === "reel" ? "a real-data reel" : "a drawn storyboard episode", look: lookOf(c) ?? "no look set on the channel", genres: [] };
}

export type ChannelImport = { readonly channelId: string; readonly ventureId: string; readonly name: string; readonly outcome: "imported" | "already-there" };

/** What a dry run would do over `files`, with nothing opened or written. `taken` are the ids a store already holds. */
export function dryImport(files: readonly ChannelFile[], held: ReadonlyMap<string, string>, taken: ReadonlySet<string>): readonly ChannelImport[] {
  const ids = new Set(taken);
  return files.map((f) => {
    const had = held.get(f.channel.id);
    if (had !== undefined) return { channelId: f.channel.id, ventureId: had, name: f.channel.name, outcome: "already-there" };
    const ventureId = mintSlugId("vn", f.channel.name, ids);
    ids.add(ventureId);
    return { channelId: f.channel.id, ventureId, name: f.channel.name, outcome: "imported" };
  });
}

export const heldChannels = (ventures: readonly Venture[]): ReadonlyMap<string, string> => new Map(ventures.flatMap((v) => (v.channelId === undefined ? [] : [[v.channelId, v.id] as const])));

/** One transaction per channel. A channel already imported is named and left alone. */
export function importChannels(store: Store, files: readonly ChannelFile[], actor: Actor): Result<readonly ChannelImport[]> {
  return store.tx((t) => {
    const heldNow = heldChannels(listVentures(t));
    const out: ChannelImport[] = [];
    for (const f of files) {
      const id = f.channel.id;
      const had = heldNow.get(id);
      if (had !== undefined) {
        out.push({ channelId: id, ventureId: had, name: f.channel.name, outcome: "already-there" });
        continue;
      }
      const v = bornVenture(t, { name: f.channel.name, kind: "channel", frame: channelFrame(f), proposal: channelVentureProposal(id), ground: "channel", channelId: id }, actor);
      out.push({ channelId: id, ventureId: v.id, name: v.name, outcome: "imported" });
    }
    return out;
  });
}
