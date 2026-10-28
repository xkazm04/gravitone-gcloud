// WHAT EVERY DESK PIECE IS HANDED (spark audio-agent-studio, variant "desk"): the host's props, the
// pieces standing on the desk, the timeline's columns, and the few presses the desk adds on top of
// dispatch. A piece draws from this and presses through it; it imports nothing from app state.
import type { ReactNode } from "react";

import type { StudioAction, StudioNode, StudioNodeKind } from "@gt/domain/audio.studio";
import type { DeskAxis, DeskPieces } from "@gt/ui/components/studio-desk/desk.ts";

import { localPlay, nodeSound } from "../../_host/press.ts";
import type { ParsedTurn, VariantProps } from "../../_host/types.ts";

export type DeskCtx = {
  readonly v: VariantProps;
  readonly desk: DeskPieces;
  /** The visible turn's id and its proposals (a desk control presses the matching one). */
  readonly visibleId: string;
  readonly actions: readonly StudioAction[];
  /** The timeline's columns (null: no sections on the desk) and its length in seconds when known. */
  readonly axis: DeskAxis | null;
  readonly totalS: number | null;
  /** Can a press reach the agent now (the dock is listening). */
  readonly agentOpen: boolean;
  /** Draw the pieces of one kind where the caller stands (the registry's lookup). */
  readonly slot: (kind: StudioNodeKind, only?: (node: StudioNode) => boolean) => ReactNode;
  /** Where the arrangement's playhead stands, 0..1, while it sounds (4 Hz); null when silent. */
  readonly head: number | null;
  /** Press a proposal or a desk control; a mix change while the finished mix plays moves to the parts. */
  readonly press: (a: StudioAction, turnId?: string) => void;
  /** Play every part from a second (the finished mix when no part has audio). */
  readonly playFrom: (s: number) => void;
};

export const turnOf = (v: VariantProps, id: string): ParsedTurn["turn"] | undefined => v.session.turns.find((t) => t.turn.id === id)?.turn;

/** The sound of every part together on the desk, else the finished mix; null when neither plays. */
export function deskSound(v: VariantProps, desk: DeskPieces) {
  const stems = desk.stems[0];
  const st = stems === undefined ? undefined : turnOf(v, stems.turnId);
  const parts = stems === undefined || st === undefined ? null : nodeSound(st, stems.node);
  if (parts !== null) return parts;
  const track = desk.track[0];
  const tt = track === undefined ? undefined : turnOf(v, track.turnId);
  return track === undefined || tt === undefined ? null : nodeSound(tt, track.node);
}

/** The presses the desk adds on top of dispatch (see DeskCtx). */
export function deskPresses(v: VariantProps, desk: DeskPieces): Pick<DeskCtx, "press" | "playFrom"> {
  const { transport, dispatch } = v;
  const track = desk.track[0];
  const tt = track === undefined ? undefined : turnOf(v, track.turnId);
  const mixKey = track === undefined || tt === undefined ? null : nodeSound(tt, track.node)?.key ?? null;
  const playFrom = (s: number): void => {
    const snd = deskSound(v, desk);
    if (snd === null) return;
    transport.play(snd.key, snd.layers, { from: s, spans: snd.spans, name: snd.name });
  };
  const press = (a: StudioAction, turnId?: string): void => {
    dispatch(a, turnId);
    const mix = a.kind === "mute" || a.kind === "solo" || a.kind === "level" || a.kind === "pan";
    if (mix && mixKey !== null && transport.sounding?.key === mixKey && transport.state === "playing") {
      const parts = deskSound(v, desk);
      if (parts !== null && parts.key !== mixKey) transport.play(parts.key, parts.layers, { from: transport.position(), spans: parts.spans, name: parts.name });
    }
  };
  return { press, playFrom };
}

/** The finished mix's own play mark, as a local action against the turn it came from. */
export const mixPlay = (desk: DeskPieces): { readonly a: StudioAction; readonly turnId: string } | null => {
  const t = desk.track[0];
  return t === undefined ? null : { a: localPlay(t.node.id), turnId: t.turnId };
};
