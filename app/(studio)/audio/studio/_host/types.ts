// THE STUDIO HOST'S CONTRACT WITH THE VIEW (spark audio-agent-studio; stage S1 named it a variant,
// stage S2 keeps one view). The view is `(props: VariantProps) => JSX`: everything it draws and every
// press it can make arrives here, and it imports NOTHING from app state (registry schema-driven-ui: a
// store-free renderer with an injected capabilities object). The host (./StudioHost.tsx) owns the
// conversation (live: the ledger relay; `&source=fixture`: the script), the dock and the one
// transport; the view owns the main frame and the side panels.
//
// Types only: a client module reads the turn's TYPES from @gt/domain/audio.studio, never its zod.
import type { ReactNode } from "react";

import type { StudioAction, StudioDropped, StudioTurn } from "@gt/domain/audio.studio";
import type { StudioTakeFacts, StudioTasteLine, TasteLean } from "@gt/domain/audio.suno";
import type { ParsedTurn } from "@gt/domain/audio.studio.door";
import type { RefusedTurn, StudioSource } from "../_port/port.ts";
import type { DockState } from "@gt/ui/components/dock/dock.ts";
import type { MixTransport } from "@gt/ui/components/audio/useMix.ts";

export type { ParsedTurn, RefusedTurn, StudioSource };

/** The session as far as the conversation has got. */
export type HostSession = {
  readonly id: string;
  readonly title: string;
  /** Every turn shown so far, user and agent, oldest first (`all.slice(0, cursor)`). */
  readonly turns: readonly ParsedTurn[];
  /** How many of the session's turns are shown. */
  readonly cursor: number;
  /** The turn the dock and the side panels speak for: the newest agent turn shown; null before one. */
  readonly visible: ParsedTurn | null;
  /** S2: where the turns come from - the ledger (live) or the scripted sessions. */
  readonly source: StudioSource;
  /** S2, live: recorded events of this conversation the door refused (the host also lists them). */
  readonly refused: readonly RefusedTurn[];
};

export type HostDock = {
  readonly state: DockState;
  /** The visible agent turn's words. */
  readonly reply: string | null;
  /** The page's one plain line ("the scripted session has no answer to that"); null when none. */
  readonly notice: string | null;
  /** S2: is the outside agent listening ("nobody": a message waits in the inbox for its next look). */
  readonly presence: "listening" | "nobody";
};

/**
 * A press. `local` kinds (STUDIO_ACTION_GOES) go to the transport, `agent` kinds to the
 * conversation. `turnId` names the turn whose pieces the action points at (default: the visible
 * one) - a variant that keeps older turns playable (canvas) passes the older turn's id.
 * A variant may build its own local action (a play mark on a stem row) with ./press.ts.
 */
export type Dispatch = (action: StudioAction, turnId?: string) => void;

export type VariantProps = {
  readonly session: HostSession;
  readonly dock: HostDock;
  readonly dispatch: Dispatch;
  /** The page's one transport (@gt/ui audio/useMix.ts): state, clock, duration, peaks, live mix. */
  readonly transport: MixTransport;
  /** What the door dropped from the visible turn (the dock already discloses it). */
  readonly dropped: readonly StudioDropped[];
  /** "missing": the fixture renders are not in the store (the host shows the banner). */
  readonly renders: "ready" | "missing";
  /**
   * S2 "keep this mix": sends the agent a user turn whose `mix` is the transport's live mix of the
   * newest stems piece (by stem id), for it to bake into the score and re-render. Live only; the
   * scripted sessions answer with a notice.
   */
  readonly keepMix: () => void;
  /** What `keepMix` would change, one plain line per stem ("warm finger bass muted, at -3 dB");
   *  empty when the live mix is what was rendered (nothing to keep). */
  readonly mixChanges: readonly string[];
  /** Spark suno-advisor: the Suno advisor's facts and presses. */
  readonly suno: SunoHost;
};

/**
 * Spark suno-advisor: what the view knows and can do about Suno. Every function resolves with the
 * refusal in words, or null when it went; none of them reaches suno.com.
 */
export type SunoHost = {
  /** Facts per uploaded take, by takeId (measured here; `listened` after a priced Listen). */
  readonly takes: Readonly<Record<string, StudioTakeFacts>>;
  /** The confirmed taste profile. */
  readonly taste: readonly StudioTasteLine[];
  /** Run the priced listener on one take (receipt first; DRY returns a stand-in). */
  readonly listen: (takeId: string) => Promise<string | null>;
  /** Confirm a proposed taste line (from the turn that proposed it). */
  readonly keepTaste: (row: { readonly line: string; readonly lean: TasteLean }, turnId?: string) => Promise<string | null>;
  /** Remove a line from the profile. */
  readonly dropTaste: (line: string) => Promise<string | null>;
  /** Send a verdict on a prompt as the person's next message, uploading a take first when a file is given. */
  readonly sendVerdict: (v: { readonly verdict: NonNullable<StudioTurn["verdict"]>; readonly text: string; readonly file?: File; readonly clip?: "a" | "b" }) => Promise<string | null>;
};

export type Variant = (props: VariantProps) => ReactNode;
