"use client";

// THE CANVAS'S KIND -> COMPONENT REGISTRY (spark audio-agent-studio WP3; registry schema-driven-ui
// registry-mapping). One table maps each of the eight node kinds to the card slot it lives in and
// the component that realizes it; a card renders a piece by LOOKUP, never by a growing switch. Each
// component owns its degraded state (missing audio, rows without sound), and each renders inside its
// own containment boundary, so a piece that throws becomes one line in its own slot and its
// siblings play on. An unknown kind never arrives here: the door dropped it, and the card's footer
// (this variant's place for system notes) says so.
import { Component, type ReactNode } from "react";

import type { StudioAction, StudioNodeKind, StudioNodeOf, StudioTurn } from "@gt/domain/audio.studio";
import type { MixTransport } from "@gt/ui/components/audio/useMix.ts";

import { Hero, Band } from "./pieces/Hero.tsx";
import { Parts } from "./pieces/Parts.tsx";
import { Shelf } from "./pieces/Shelf.tsx";
import { Duel, Pull } from "./pieces/Choice.tsx";
import { Heard, Measures } from "./pieces/Words.tsx";
import s from "./pieces/pieces.module.css";

/** Where a piece sits in its turn's card, top to bottom. */
export const SLOTS = ["header", "hero", "band", "parts", "inline", "footer"] as const;
export type Slot = (typeof SLOTS)[number];

/** What every piece of one card shares: its turn, the page's transport, presses bound to this turn. */
export type PieceCtx = {
  readonly turn: StudioTurn;
  /** The newest card (the one the side panel speaks for). */
  readonly latest: boolean;
  readonly transport: MixTransport;
  /** A press against THIS card's turn (an older card's pieces stay playable). */
  readonly press: (a: StudioAction) => void;
  /** null when an agent press can be sent now; else why not, in words. */
  readonly askBlocked: string | null;
  readonly renders: "ready" | "missing";
  /** The track's length in seconds when known (lines the sections band up under the waveform). */
  readonly lengthS: number | null;
  /** A stem's plain name, from this turn or an earlier one. */
  readonly stemName: (id: string) => string | null;
};

export type PieceProps<K extends StudioNodeKind> = { readonly node: StudioNodeOf<K>; readonly ctx: PieceCtx };
type Entry<K extends StudioNodeKind> = {
  readonly slot: Slot;
  readonly View: (p: PieceProps<K>) => ReactNode;
  /** What the kind is for, in one line (the emitter-facing description). */
  readonly about: string;
};

export const KIND_VIEWS: { readonly [K in StudioNodeKind]: Entry<K> } = {
  heard: { slot: "header", View: Heard, about: "the person's words, each linked to what it became" },
  track: { slot: "hero", View: Hero, about: "the take this answer made, played as one mix" },
  sections: { slot: "band", View: Band, about: "the parts of the song in order; press one to hear it from there" },
  stems: { slot: "parts", View: Parts, about: "the instruments, each playable alone, with its own on/off, level and side" },
  candidates: { slot: "inline", View: Shelf, about: "instruments to choose between by ear: alone, in the song, use" },
  duel: { slot: "inline", View: Duel, about: "two whole takes side by side; say which one is better" },
  pull: { slot: "inline", View: Pull, about: "two wishes that pull apart; hear each and lean one way" },
  measures: { slot: "footer", View: Measures, about: "what was measured on the take, as chips" },
};

/** The slot a node's kind lives in. */
export const slotOf = (kind: StudioNodeKind): Slot => KIND_VIEWS[kind].slot;

function render<K extends StudioNodeKind>(kind: K, node: StudioNodeOf<K>, ctx: PieceCtx): ReactNode {
  const { View } = KIND_VIEWS[kind];
  return <View node={node} ctx={ctx} />;
}

type BoundaryProps = { readonly kind: string; readonly id: string; readonly children: ReactNode };

/** One piece's containment: a throw becomes one plain line in the piece's own slot. */
class PieceBoundary extends Component<BoundaryProps, { readonly error: string | null }> {
  override state: { readonly error: string | null } = { error: null };
  static getDerivedStateFromError(e: unknown): { readonly error: string } {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  override render(): ReactNode {
    if (this.state.error === null) return this.props.children;
    return (
      <p className={s.broken} role="note">
        {`This ${this.props.kind} piece could not be drawn (${this.state.error}). The rest of the answer still works.`}
      </p>
    );
  }
}

/** A piece, realized by lookup inside its own boundary. */
export function Piece({ node, ctx }: { readonly node: StudioTurn["show"][number]; readonly ctx: PieceCtx }) {
  return (
    <PieceBoundary kind={node.kind} id={node.id}>
      {render(node.kind, node, ctx)}
    </PieceBoundary>
  );
}
