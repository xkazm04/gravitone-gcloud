"use client";

// LAYOUT VARIANT "desk" (spark audio-distribution, S1) - a stub with the final signature; a builder fills it.
import type { VariantProps } from "../props.ts";

export function Desk({ read, state }: VariantProps) {
  return <div data-variant-body="desk">{read.shelf.length} / {state.releases.length}</div>;
}
