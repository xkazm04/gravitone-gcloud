// WHO GETS THIS PRESS - the dispatcher's whole decision, pure.
//
// One listener (dispatch.ts) turns a KeyboardEvent into a `Press` and asks this
// function; everything that used to be decided by which of 30 listeners subscribed
// first is decided here, in one order:
//
//   1. Escape with a layer open goes to the TOP live layer: one press closes one
//      thing (v1 layers.ts). Its owner may first back out of an inner state with an
//      Escape row in the layer's own mode (the calendar clears a selected day before
//      the month closes). An Escape some inner control already spent
//      (defaultPrevented: a native select, a combobox) closes nothing.
//   2. Every other press resolves in the ACTIVE MODE: the top claiming layer's mode,
//      or the page's mode when no layer claims the keyboard. A claiming layer with no
//      mode (a confirm dialog) leaves nothing to resolve - v1's `overlayOpen()` guard,
//      now a query on the stack instead of a DOM sniff for aria-modal.
//
// Dropped from v1: the DOM sniff itself (`[data-keys-block], dialog[open],
// [aria-modal="true"]`) and the Board-loupe exception it needed. It existed because
// the trays were not on the stack; every overlay now is, so the stack is the truth.

import { chordsOf, type KeyEventLike } from "./chord.ts";
import { resolve, type Keymap, type Match } from "./keymap.ts";
import type { TargetInfo } from "./target.ts";
import { activeMode, top, type LayerStack } from "../layers/stack.ts";

export type KeyInput = KeyEventLike & {
  readonly repeat?: boolean;
  readonly defaultPrevented?: boolean;
  readonly target: TargetInfo;
};

export type Decision =
  | { readonly kind: "binding"; readonly match: Match }
  | { readonly kind: "close-layer"; readonly id: string }
  | { readonly kind: "none" };

const NONE: Decision = { kind: "none" };

/**
 * The page's mode: the most recently mounted scope whose mode no open layer owns.
 * A layer-owned mode (the sheet's desk) is reachable only THROUGH its layer, so
 * while the sheet is leaving - closed, waiting for the route to unmount it - its
 * desk's K no longer stamps a verdict.
 */
export function pageMode(scopes: readonly { readonly mode: string }[], layers: LayerStack): string | null {
  const owned = new Set(layers.entries.map((e) => e.mode));
  for (let i = scopes.length - 1; i >= 0; i--) {
    const m = scopes[i]?.mode;
    if (m !== undefined && !owned.has(m)) return m;
  }
  return null;
}

export function route(
  map: Keymap,
  e: KeyInput,
  ctx: { readonly layers: LayerStack; readonly page: string | null; readonly facts: ReadonlySet<string> },
): Decision {
  const chords = chordsOf(e);
  const first = chords[0];
  if (first === undefined) return NONE;
  const press = { chords, repeat: e.repeat === true, target: e.target };
  const layer = top(ctx.layers);
  if (first.key === "Escape" && !first.mod && layer !== undefined) {
    if (e.defaultPrevented === true) return NONE;
    if (layer.mode !== undefined) {
      const inner = resolve(map, press, layer.mode, ctx.facts);
      if (inner !== null) return { kind: "binding", match: inner };
    }
    return { kind: "close-layer", id: layer.id };
  }
  const mode = activeMode(ctx.layers, ctx.page);
  if (mode === null) return NONE;
  const match = resolve(map, press, mode, ctx.facts);
  return match === null ? NONE : { kind: "binding", match };
}
