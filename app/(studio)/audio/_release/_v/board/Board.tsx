"use client";

// LAYOUT VARIANT "board" (spark audio-distribution, S1) - a stub with the final signature; a builder fills it.
import type { VariantProps } from "../props.ts";

export function Board({ read, state }: VariantProps) {
  return <div data-variant-body="board">{read.shelf.length} / {state.releases.length}</div>;
}
