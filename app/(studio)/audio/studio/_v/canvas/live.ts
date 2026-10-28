"use client";

// THE CANVAS'S LIVE HELPERS (spark audio-agent-studio WP3): the reduced-motion preference, a
// playhead read at frame rate while a piece sounds (four times a second under reduced motion, from
// the transport's own clock), and the plays the host's vocabulary has no action for (a duel's side
// B, a pull's sides, a section heard from its start) - every one through the page's one transport,
// so the one-ear rule still holds.
import { useEffect, useState, useSyncExternalStore } from "react";

import type { MixTransport } from "@gt/ui/components/audio/useMix.ts";

import { nodeSound, soundKey } from "../../_host/press.ts";
import type { StudioNode, StudioTurn } from "@gt/domain/audio.studio";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(fn: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => undefined;
  const m = window.matchMedia(QUERY);
  m.addEventListener("change", fn);
  return () => m.removeEventListener("change", fn);
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => typeof window.matchMedia === "function" && window.matchMedia(QUERY).matches,
    () => false,
  );
}

/** Seconds into what sounds while `active`, else 0: frame rate normally, the 4 Hz clock under reduced motion. */
export function usePlayhead(transport: MixTransport, active: boolean): number {
  const reduced = useReducedMotion();
  const [pos, setPos] = useState(0);
  const { position } = transport;
  useEffect(() => {
    if (!active || reduced) return;
    let id = 0;
    const tick = (): void => {
      setPos(position());
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [active, reduced, position]);
  if (!active) return 0;
  return reduced ? transport.clock : pos;
}

/** Is anything under this turn's piece sounding (the piece itself, a stem of it, a side of it). */
export const soundsUnder = (transport: MixTransport, turnId: string, nodeId: string): boolean => {
  const k = transport.sounding?.key;
  const base = soundKey(turnId, nodeId);
  return k !== undefined && transport.state !== "idle" && (k === base || k.startsWith(`${base}/`));
};

/** A raw href heard under a part key of a piece (a duel's side B, a pull's side). */
export function hrefPart(turnId: string, nodeId: string, part: string, href: string, name: string) {
  const key = soundKey(turnId, nodeId, part);
  return { key, toggle: (t: MixTransport) => t.toggle(key, [{ id: part, href }], { name }) };
}

/** Play a piece (or every part of a stems piece) from a second: a section heard from its start. */
export function playFrom(transport: MixTransport, turn: Pick<StudioTurn, "id" | "show">, node: StudioNode, fromS: number, what: string): boolean {
  const snd = nodeSound(turn, node);
  if (snd === null) return false;
  transport.play(snd.key, snd.layers, { from: fromS, spans: snd.spans, name: `${snd.name}, from ${what}` });
  return true;
}
