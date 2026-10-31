import { z } from "zod";

import { parseStudioTurn, type ParsedTurn } from "./audio.studio.door.ts";
import { parseAt } from "./door.ts";
import { err, ok, type Result } from "./errors.ts";

// THE STUDIO'S TWO LEDGER EVENTS (spark audio-agent-studio, stage S2). The dock's message is an
// `audio.say` event; the outside agent's answer is an `audio.turn` event. Both carry the session
// and the raw turn, and both are read back through the one turn door (./audio.studio.door.ts), so a
// turn stored in the ledger is held to exactly what a page renders. The ledger checks only a type's
// shape (./event.ts); this module is these two types' own schema.

export const STUDIO_EVENTS = { say: "audio.say", turn: "audio.turn" } as const;
export type StudioEventType = (typeof STUDIO_EVENTS)[keyof typeof STUDIO_EVENTS];

/** A conversation's id: one song being made. */
export const studioSessionSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{2,47}$/, "a session id is 3-48 lower-case letters, digits and -");

export const studioEventDataSchema = z.strictObject({ session: studioSessionSchema, turn: z.unknown() });

/** The ledger key: kind `audio-say` / `audio-turn` (a key kind takes no dot), then the turn id. */
export const studioEventKey = (type: StudioEventType, turnId: string): string => `${type === STUDIO_EVENTS.say ? "audio-say" : "audio-turn"}:${turnId}`;

export type StudioEvent = { readonly session: string; readonly parsed: ParsedTurn };

/** Reads one studio event's data: the session, then the turn through the turn door. A `say` holds a
 *  user turn and a `turn` an agent turn - the other way round is refused, not repaired. */
export function parseStudioEvent(type: StudioEventType, data: unknown): Result<StudioEvent> {
  const env = parseAt(type, studioEventDataSchema, data);
  if (!env.ok) return env;
  const turn = parseStudioTurn(env.value.turn);
  if (!turn.ok) return turn;
  const want = type === STUDIO_EVENTS.say ? "user" : "agent";
  if (turn.value.turn.from !== want) return err("invalid", `${type}: carries a turn from the ${turn.value.turn.from}, expected one from the ${want}`);
  return ok({ session: env.value.session, parsed: turn.value });
}
