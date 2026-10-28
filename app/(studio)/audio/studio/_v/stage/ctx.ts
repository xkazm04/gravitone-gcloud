// WHAT EVERY PIECE ON THE STAGE IS HANDED (spark audio-agent-studio, variant "stage"): the visible
// turn, the page's transport, the press (the host's dispatch, plus the stage's hand-off from the
// finished recording to the live band), the strip's picked section and the part under the playhead,
// and which candidate is being auditioned. Pure helpers only; nothing here holds state.
import type { StudioAction, StudioActionOf, StudioNodeOf, StudioTurn } from "@gt/domain/audio.studio";
import { STUDIO_ACTION_GOES } from "@gt/domain/audio.studio.kinds";
import type { Span } from "@gt/ui/components/audio/mix.ts";
import type { MixTransport } from "@gt/ui/components/audio/useMix.ts";

import { soundKey } from "../../_host/press.ts";
import type { Dispatch } from "../../_host/types.ts";

/** A candidate being heard now: which piece, which candidate, alone or stepping into the band. */
export type Audition = { readonly node: string; readonly candidate: string; readonly mode: "alone" | "in_mix" };

export type StageCtx = {
  /** The visible turn: its proposals, its wings, its notes. */
  readonly turn: StudioTurn;
  /** The turn the band on stage comes from: the visible one, or the newest earlier answer that showed
   *  a band (an answer about two basses keeps the band it is about on stage). Its pieces play under its id. */
  readonly stage: StudioTurn;
  readonly transport: MixTransport;
  /** Every press goes through here (never straight to the transport for a proposal). */
  readonly press: Dispatch;
  readonly offline: boolean;
  readonly thinking: boolean;
  readonly stems: StudioNodeOf<"stems"> | null;
  readonly sections: StudioNodeOf<"sections"> | null;
  readonly spans: readonly Span[] | null;
  /** The section picked on the strip, else the one under the playhead; null for neither. */
  readonly focus: number | null;
  readonly picked: number | null;
  readonly pick: (i: number | null) => void;
  readonly live: number | null;
  readonly audition: Audition | null;
  /** The band of this turn is what sounds (its parts, or its finished recording). */
  readonly bandSounding: boolean;
};

/** The node a proposal points at, if any. */
export const targetOf = (a: StudioAction): string | null => ("node" in a ? a.node : null);

/** The turn's proposals that point at one piece (a pull's "lean hopeful", a duel's "B"). */
export const proposalsAt = (turn: StudioTurn, node: string): readonly StudioAction[] => turn.actions.filter((a) => targetOf(a) === node);

/** The proposal that uses this candidate, when the agent offered one. */
export const keepProposal = (turn: StudioTurn, node: string, candidate: string): StudioActionOf<"use_candidate"> | null =>
  turn.actions.find((a): a is StudioActionOf<"use_candidate"> => a.kind === "use_candidate" && a.node === node && a.candidate === candidate) ?? null;

/** Why a proposal cannot be pressed now, in words; null when it can. Local presses always can. */
export function disarmed(a: StudioAction, offline: boolean, thinking: boolean): string | null {
  if (STUDIO_ACTION_GOES[a.kind] === "local") return null;
  if (offline) return "no agent is listening, so this cannot be sent";
  if (thinking) return "the agent is still answering";
  return null;
}

/** What a press will do, read from the action itself (never from its label). */
export function meaning(a: StudioAction): string {
  switch (a.kind) {
    case "play":
      return a.stem === undefined ? "plays here" : "plays one part here";
    case "hear":
      return a.mode === "alone" ? "plays it on its own here" : "plays it with the band here";
    case "mute":
      return a.on ? "one player steps back, here only" : "one player comes back, here only";
    case "solo":
      return a.on ? "one player in the spotlight, here only" : "spotlight off, here only";
    case "level":
      return "changes one part's volume, here only";
    case "pan":
      return "moves one part left or right, here only";
    case "say":
      return `tells the agent: "${a.text}"`;
    case "render":
      return "asks the agent for a fresh recording";
    case "use_candidate":
      return "asks the agent to put this player in the band";
    case "swap_stem":
      return "asks the agent to swap one player";
    case "settle_pull":
      return "tells the agent which way to lean";
    case "pick":
      return "tells the agent which one you like better";
  }
}

/** The candidate being heard now, read off the transport's key against this turn's candidates. */
export function auditionOf(turn: StudioTurn, key: string | null): Audition | null {
  if (key === null) return null;
  for (const n of turn.show) {
    if (n.kind !== "candidates") continue;
    for (const c of n.rows)
      for (const mode of ["alone", "in_mix"] as const) if (soundKey(turn.id, n.id, `${c.id}:${mode}`) === key) return { node: n.id, candidate: c.id, mode };
  }
  return null;
}

/** The mixer kinds: a press of one changes what the band plays, so the band should be what sounds. */
export const isMixPress = (a: StudioAction): boolean => a.kind === "mute" || a.kind === "solo" || a.kind === "level" || a.kind === "pan";
