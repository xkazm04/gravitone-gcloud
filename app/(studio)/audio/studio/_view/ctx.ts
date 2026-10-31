// WHAT EVERY PIECE OF ONE CARD IS HANDED (spark audio-agent-studio, stage S2): the host's props, the
// card's turn and its pieces after the carry-over rule, the timeline's columns, and the few presses
// the view adds on top of dispatch. A piece draws from this and presses through it; it imports
// nothing from app state.
import type { ReactNode } from "react";

import type { StudioAction, StudioNode, StudioNodeKind, StudioTurn } from "@gt/domain/audio.studio";
import type { DeskAxis, DeskPieces } from "@gt/ui/components/studio-desk/desk.ts";

import { localPlay, nodeSound, type Sound } from "../_host/press.ts";
import type { ParsedTurn, VariantProps } from "../_host/types.ts";

export type CardCtx = {
  readonly v: VariantProps;
  /** This card's own turn and its proposals (a control presses the matching one). */
  readonly turn: StudioTurn;
  readonly actions: readonly StudioAction[];
  /** The newest answered card (the one the side panel speaks for, the one "keep this mix" lives on). */
  readonly latest: boolean;
  /** The card's pieces after the carry-over rule. */
  readonly desk: DeskPieces;
  /** The timeline's columns (null: no sections) and the track's length in seconds when known. */
  readonly axis: DeskAxis | null;
  readonly totalS: number | null;
  /** Can a press reach the agent now; else why not, in words. */
  readonly agentOpen: boolean;
  readonly blocked: string | null;
  /** Where the arrangement's playhead stands, 0..1, while this card sounds; null when silent. */
  readonly head: number | null;
  /** Draw the pieces of one kind where the caller stands (the registry's lookup). */
  readonly slot: (kind: StudioNodeKind, only?: (node: StudioNode) => boolean) => ReactNode;
  /** Press a proposal or a control (default: against this card's turn); a mix change while the finished mix plays moves to the parts. */
  readonly press: (a: StudioAction, turnId?: string) => void;
  /** Play every part from a second (the finished mix when no part has audio). */
  readonly playFrom: (s: number) => void;
};

export const turnOf = (v: VariantProps, id: string): ParsedTurn["turn"] | undefined => v.session.turns.find((t) => t.turn.id === id)?.turn;

/** The sound of every part together on the card, else its finished mix; null when neither plays. */
export function cardSound(v: VariantProps, desk: DeskPieces): Sound | null {
  const stems = desk.stems[0];
  const st = stems === undefined ? undefined : turnOf(v, stems.turnId);
  const parts = stems === undefined || st === undefined ? null : nodeSound(st, stems.node);
  if (parts !== null) return parts;
  const track = desk.track[0];
  const tt = track === undefined ? undefined : turnOf(v, track.turnId);
  return track === undefined || tt === undefined ? null : nodeSound(tt, track.node);
}

/** The card's finished mix as a local action against the turn it came from. */
export function mixPlay(desk: DeskPieces): { readonly a: StudioAction; readonly turnId: string } | null {
  const t = desk.track[0];
  return t === undefined ? null : { a: localPlay(t.node.id), turnId: t.turnId };
}

/** The transport keys that belong to this card's arrangement (its track's and its parts'). */
export function arrangementKeys(desk: DeskPieces): readonly string[] {
  const t = desk.track[0];
  const st = desk.stems[0];
  return [...(t === undefined ? [] : [`${t.turnId}/${t.node.id}`]), ...(st === undefined ? [] : [`${st.turnId}/${st.node.id}`])];
}

/** The presses the view adds on top of dispatch (see CardCtx). */
export function cardPresses(v: VariantProps, desk: DeskPieces, turnId: string): Pick<CardCtx, "press" | "playFrom"> {
  const { transport, dispatch } = v;
  const track = desk.track[0];
  const tt = track === undefined ? undefined : turnOf(v, track.turnId);
  const mixKey = track === undefined || tt === undefined ? null : (nodeSound(tt, track.node)?.key ?? null);
  const playFrom = (s: number): void => {
    const snd = cardSound(v, desk);
    if (snd !== null) transport.play(snd.key, snd.layers, { from: s, spans: snd.spans, name: snd.name });
  };
  const press = (a: StudioAction, at: string = turnId): void => {
    dispatch(a, at);
    const mix = a.kind === "mute" || a.kind === "solo" || a.kind === "level" || a.kind === "pan";
    if (mix && mixKey !== null && transport.sounding?.key === mixKey && transport.state === "playing") {
      const parts = cardSound(v, desk);
      if (parts !== null && parts.key !== mixKey) transport.play(parts.key, parts.layers, { from: transport.position(), spans: parts.spans, name: parts.name });
    }
  };
  return { press, playFrom };
}
