// THE STUDIO'S TURN PORT (spark audio-agent-studio): the one seam the page reads a conversation
// through. Two sides: the ledger (./ledger.ts, live: the dock's `audio.say` events and the outside
// agent's `audio.turn` answers) and the fixture (./fixture.ts, scripted sessions for `&source=fixture`
// and tests). Types only, so the host island can name them without loading a server module.
import type { ParsedTurn } from "@gt/domain/audio.studio.door";
import type { StudioTakeFacts, StudioTasteLine } from "@gt/domain/audio.suno";

import type { StudioSource } from "../url.ts";

export type { StudioSource };

/** A recorded event the turn door refused: shown as one line in its conversation, never skipped. */
export type RefusedTurn = { readonly seq: number; readonly at: string; readonly from: "user" | "agent"; readonly reason: string };

export type StudioPortSession = {
  readonly id: string;
  readonly title: string;
  readonly turns: readonly ParsedTurn[];
  /** Live only: recorded events of this conversation the door refused, oldest first. */
  readonly refused?: readonly RefusedTurn[];
  /** Live only: who wrote the conversation's newest event (`user` = a message waits for an answer). */
  readonly lastFrom?: "user" | "agent";
};

export type StudioRead = {
  readonly source: StudioSource;
  readonly renders: "ready" | "missing";
  readonly note?: string;
  readonly sessions: readonly StudioPortSession[];
  /** Live only: the ledger's newest seq, where the page's live feed continues from. */
  readonly head?: number;
  /** Spark suno-advisor: what this server knows of every take a user turn uploaded, by takeId. */
  readonly takes?: Readonly<Record<string, StudioTakeFacts>>;
  /** Spark suno-advisor: the confirmed taste profile (folded `audio.taste` events), oldest first. */
  readonly taste?: readonly StudioTasteLine[];
};

export type StudioPort = { readonly read: () => Promise<StudioRead> };
