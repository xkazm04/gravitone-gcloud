import "server-only";

// THE DOCK'S MESSAGE, INTO THE LEDGER (spark audio-agent-studio, stage S2). The person's words (or a
// proposal they pressed, or "keep this mix") are a user StudioTurn; `appendSay` holds it to the one
// studio event door (@gt/domain/audio.studio.events `parseStudioEvent`) and appends `audio.say`,
// keyed by the turn's id: a retried send finds the message it already filed and appends nothing
// twice, and a DIFFERENT turn under a used id is a conflict, not an overwrite. The outside agent
// reads these through the MCP op `audio_inbox` and answers with `audio.turn`.
//
// Refused, never repaired: an agent turn here (a say holds the user's), a session id the door
// refuses, or a user turn the door had to cut (a user turn shows and proposes nothing).
import { parseStudioEvent, STUDIO_EVENTS, studioEventKey } from "@gt/domain/audio.studio.events";
import { err, ok, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import { appendOnce } from "@gt/kernel/ingest";
import type { Store } from "@gt/kernel/store";

/** The ledger subject every studio event names: one conversation. Package R2's `audio_turn` uses the same. */
export const STUDIO_SUBJECT_KIND = "studio-session";
export const STUDIO_LANE = "audio";

export type SayFiled = { readonly session: string; readonly turnId: string; readonly seq: number; readonly appended: boolean };

export function appendSay(store: Store, input: { readonly session: unknown; readonly turn: unknown }, actor: Actor): Result<SayFiled> {
  const p = parseStudioEvent(STUDIO_EVENTS.say, { session: input.session, turn: input.turn });
  if (!p.ok) return p;
  const { session, parsed } = p.value;
  if (parsed.dropped.length > 0) return err("invalid", `audio.say: the door cut ${parsed.dropped.map((d) => `${d.at} (${d.reason})`).join(", ")}; a message is sent whole or not at all`);
  const turn = parsed.turn;
  const appended = store.tx((t) =>
    appendOnce(t, { actor, type: STUDIO_EVENTS.say, lane: STUDIO_LANE, key: studioEventKey(STUDIO_EVENTS.say, turn.id), subject: { kind: STUDIO_SUBJECT_KIND, id: session }, data: { session, turn } }),
  );
  if (!appended.ok) return appended;
  if (!appended.value.same) return err("conflict", `audio.say: turn ${turn.id} is already in the ledger with other words; a new message needs a new id`);
  return ok({ session, turnId: turn.id, seq: appended.value.event.seq, appended: appended.value.appended });
}

const BASE36 = "0123456789abcdefghijklmnopqrstuvwxyz";

/** A new conversation's id: a short slug and the day, `song-k3x9-20261029`. */
export function mintSessionId(now: Date, random: (n: number) => Uint8Array): string {
  const slug = [...random(4)].map((b) => BASE36[b % 36] ?? "0").join("");
  const day = now.toISOString().slice(0, 10).replace(/-/g, "");
  return `song-${slug}-${day}`;
}
