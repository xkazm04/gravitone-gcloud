"use client";

// LAYOUT VARIANT "wizard" (spark audio-distribution, S1) - a stub with the final signature; a builder fills it.
import type { VariantProps } from "../props.ts";

export function Wizard({ read, state }: VariantProps) {
  return <div data-variant-body="wizard">{read.shelf.length} / {state.releases.length}</div>;
}
