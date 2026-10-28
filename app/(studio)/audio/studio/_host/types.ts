// THE STUDIO HOST'S CONTRACT WITH A VARIANT (spark audio-agent-studio, stage S1). A variant is
// `(props: VariantProps) => JSX`: everything it draws and every press it can make arrives here,
// and it imports NOTHING from app state (registry schema-driven-ui: a store-free renderer with an
// injected capabilities object). The host (./StudioHost.tsx) owns the conversation, the dock, the
// switcher and the one transport; a variant owns the main frame and the side panels.
//
// Types only: a client module reads the turn's TYPES from @gt/domain/audio.studio, never its zod.
import type { ReactNode } from "react";

import type { StudioAction, StudioDropped } from "@gt/domain/audio.studio";
import type { ParsedTurn } from "@gt/domain/audio.studio.door";
import type { DockState } from "@gt/ui/components/dock/dock.ts";
import type { MixTransport } from "@gt/ui/components/audio/useMix.ts";

export type { ParsedTurn };

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
};

export type HostDock = {
  readonly state: DockState;
  /** The visible agent turn's words. */
  readonly reply: string | null;
  /** The page's one plain line ("the scripted session has no answer to that"); null when none. */
  readonly notice: string | null;
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
};

export type Variant = (props: VariantProps) => ReactNode;
