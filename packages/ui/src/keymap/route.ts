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
//   3. A press the active mode declined reaches the GLOBAL layer (keymap.ts), heard last
//      (keyboard-shortcuts: innermost wins). A sheet does not stop it: the claim exists so a
//      key cannot act on the route the sheet hides, and a global row acts on no route - it
//      opens Jump or the key sheet above everything, and leaving a sheet by a jump decides
//      nothing in it (a receipt sheet spends only on its confirm). A claiming dialog or
//      popover does stop it: a confirm or a compose is an act half made, and a second dialog
//      opened over one would leave it unanswered underneath.
//
// Dropped from v1: the DOM sniff itself (`[data-keys-block], dialog[open],
// [aria-modal="true"]`) and the Board-loupe exception it needed. It existed because
// the trays were not on the stack; every overlay now is, so the stack is the truth.

import { chordsOf, type KeyEventLike } from "./chord.ts";
import { GLOBAL, resolve, type Keymap, type Match } from "./keymap.ts";
import type { TargetInfo } from "./target.ts";
import { activeMode, claims, live, top, type LayerStack } from "../layers/stack.ts";

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
    // The shell binds the global layer once and outlives every page; it is never the page.
    if (m !== undefined && m !== GLOBAL && !owned.has(m)) return m;
  }
  return null;
}

/** Does a press the active mode declined reach the global layer? Not past a claiming dialog or popover. */
export function globalReachable(layers: LayerStack): boolean {
  return live(layers).every((e) => e.kind === "sheet" || !claims(e));
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
    // The zoom is a lens with no mode of its own: a field open inside it (the cull's note) still owns Escape.
    // Beneath it is the mode that owns the desk: a sheet's on the Board, where `page` alone reads the bare route.
    const beneath = layer.kind === "zoom" ? activeMode(ctx.layers, ctx.page) : null;
    if (beneath !== null) {
      const field = resolve(map, press, beneath, ctx.facts);
      if (field !== null && field.binding.field !== undefined) return { kind: "binding", match: field };
    }
    return { kind: "close-layer", id: layer.id };
  }
  const mode = activeMode(ctx.layers, ctx.page);
  const match = mode === null ? null : resolve(map, press, mode, ctx.facts);
  if (match !== null) return { kind: "binding", match };
  const global = globalReachable(ctx.layers) ? resolve(map, press, GLOBAL, ctx.facts) : null;
  return global === null ? NONE : { kind: "binding", match: global };
}
