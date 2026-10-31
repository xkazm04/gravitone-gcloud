import "server-only";

// THE TASTE WRITES (spark suno-advisor): a keep or a drop of one taste line, filed as ONE `audio.taste`
// ledger event through its door (@gt/domain/audio.suno.schema parseTasteEvent) on the one subject every
// taste event names (TASTE_SUBJECT), and answered with the profile folded anew (lib/sound/suno/facts.ts
// tasteProfile, the same reader the page and the agent's inbox use). Modelled on ./say.ts appendSay.
//
// Only the person writes taste: an agent PROPOSES a line in a `taste` piece, and the press is a Server
// Action (./sunoActs.ts). A drop names only the line; the lean it drops is the profile's own, so a drop
// of a line the profile does not hold is refused rather than filed as a no-op event.
import type { StudioTasteLine } from "@gt/domain/audio.suno";
import { parseTasteEvent, TASTE_EVENT, TASTE_SUBJECT, tasteEventKey, tasteLineKey } from "@gt/domain/audio.suno.schema";
import { err, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import { appendOnce } from "@gt/kernel/ingest";
import type { Store } from "@gt/kernel/store";

import { tasteProfile } from "../../../../../lib/sound/suno/facts.ts";
import { STUDIO_LANE } from "./say.ts";

export type TasteKeep = { readonly line: string; readonly lean: "like" | "dislike"; readonly session?: string; readonly turn?: string };

type Profile = (store: Store) => Result<readonly StudioTasteLine[]>;

function file(store: Store, data: unknown, at: string, actor: Actor, profile: Profile): Result<readonly StudioTasteLine[]> {
  const p = parseTasteEvent(data);
  if (!p.ok) return p;
  const key = tasteEventKey(p.value.op, p.value.line, at);
  const appended = store.tx((t) => appendOnce(t, { actor, type: TASTE_EVENT, lane: STUDIO_LANE, key, subject: { ...TASTE_SUBJECT }, data: p.value }));
  if (!appended.ok) return appended;
  if (!appended.value.same) return err("conflict", `${TASTE_EVENT}: ${key} is already in the ledger with other words; press again`);
  return profile(store);
}

/** Keep one line in the profile (a like or a dislike). */
export function keepTaste(store: Store, input: TasteKeep, actor: Actor, at: string, profile: Profile = tasteProfile): Result<readonly StudioTasteLine[]> {
  const data = { line: input.line.trim(), lean: input.lean, op: "keep", ...(input.session === undefined ? {} : { session: input.session }), ...(input.turn === undefined ? {} : { turn: input.turn }) };
  return file(store, data, at, actor, profile);
}

/** Drop one line from the profile, whichever lean it holds. */
export function dropTaste(store: Store, line: string, actor: Actor, at: string, profile: Profile = tasteProfile): Result<readonly StudioTasteLine[]> {
  const now = profile(store);
  if (!now.ok) return now;
  const held = now.value.find((l) => tasteLineKey(l.line) === tasteLineKey(line));
  if (held === undefined) return err("not-found", `taste: "${line.trim()}" is not in the profile; nothing to drop`);
  return file(store, { line: held.line, lean: held.lean, op: "drop" }, at, actor, profile);
}
