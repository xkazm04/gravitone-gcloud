// ONE KEYMAP, DECLARED ONCE: bind, guard and draw from the same object.
//
// <Keycaps> used to draw a table while a hand-rolled `switch` bound the keys
// somewhere else behind its own private guard, so what was DRAWN and what was
// BOUND drifted independently (Ctrl+K stamped a keep on the cull; the cull
// refused no repeat; a checkbox lost its Enter). A keymap is now one value:
//
//   defineKeymap({ id, bindings })   the declaration
//   resolveKey(map, e, { overlay })  the pure resolver (node-testable)
//   useKeymap(map, handlers)         ONE window listener per map, registered
//   keycapsRows(map)                 the disclosure, derived from the bindings
//
// THE POLICY is the Board's guard (lib/board/keys.ts), promoted:
//   · TYPING   a letter in a text field, or in an OPEN combobox, is text.
//   · OVERLAY  a dialog or shell layer owns the keyboard (the Board's own loupe
//              excepted, via LOUPE_MARK).
//   · REPEAT   a held key decides ONE item. A binding opts in with `repeat`
//              (arrows, J/K); the default is refused.
//   · MODIFIER Ctrl/Cmd/Alt+key belongs to the browser and the OS. A binding
//              opts in with `modifiers`; the default is refused.
//   · ENTER    Enter on a focused control (button, link, tab, checkbox ...) is
//              the control's, never the grid's. One rule for every keymap.
//   · ESCAPE   closes ONE thing: it yields to the layer stack and to an Escape
//              the stack already spent (preventDefault).
//
// `keys` are the CAPS a person reads (`["←","→"]`, `["Enter"]`, `["K"]`); the
// event keys they match are derived from them (`eventKeys`), so there is no
// second spelling to keep in step. Several caps on one binding are alternatives
// that resolve to the same action; the handler receives the event to tell them
// apart.

import { useEffect, useRef } from "react";

import { claimsKeys, openLayers, type LayerEntry } from "../layers";

/** One row of the disclosure. `KeyBinding` in Keycaps.tsx is this type. */
export interface KeyRow {
  /** The caps, in press order — `["←", "→"]`, `["Enter"]`. */
  keys: string[];
  /** What it does. One or two words. */
  does: string;
}

export interface Binding<A extends string = string> extends KeyRow {
  /** What a resolved press means; the handler map is keyed by it. */
  action: A;
  /** A held key keeps firing. Default: refused, so a held K decides one item. */
  repeat?: boolean;
  /** Ctrl/Cmd/Alt+key still counts. Default: refused (the chord is the browser's). */
  modifiers?: boolean;
}

export interface Keymap<A extends string = string> {
  id: string;
  bindings: readonly Binding<A>[];
}

export function defineKeymap<A extends string>(def: { id: string; bindings: readonly Binding<A>[] }): Keymap<A> {
  return { id: def.id, bindings: def.bindings };
}

/** The disclosure rows, derived: adding a binding changes what is drawn with no second edit. */
export function keycapsRows(map: Keymap): KeyRow[] {
  return map.bindings.map(({ keys, does }) => ({ keys, does }));
}

/* ── the guard ────────────────────────────────────────────────────────────── */

export interface KeyLike {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  repeat?: boolean;
  target?: EventTarget | null;
  /** Set when the layer stack already spent this key (a dismissing Escape). */
  defaultPrevented?: boolean;
}

/** Anything a test can stand in for a DOM node with. */
export interface ElementLike {
  tagName?: string;
  isContentEditable?: boolean;
  closest?: (selector: string) => unknown;
  getAttribute?: (n: string) => string | null;
}

/** Is the event aimed at something the owner types into? */
export function typing(target: EventTarget | null | undefined): boolean {
  const el = (target ?? null) as ElementLike | null;
  if (!el || typeof el !== "object") return false;
  if (el.isContentEditable) return true;
  const tag = (el.tagName ?? "").toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  // An OPEN combobox (components/ui/Select) takes printable keys as type-ahead,
  // so a verdict key pressed while its list is open is typing, not a decision.
  return (
    typeof el.closest === "function" &&
    Boolean(el.closest("input, textarea, select, [contenteditable='true'], [role='combobox'][aria-expanded='true']"))
  );
}

/** Enter on a focused control is the control's (a button, a link, a tab), not
 *  the grid's — the lesson the cull learned after Enter stopped working on every
 *  button of the page. Checked by tag and by role: Enter is delivered to the
 *  focused element itself, so there is no ancestor walk. */
export function enterBelongsToTarget(target: EventTarget | ElementLike | null | undefined): boolean {
  const el = (target ?? null) as ElementLike | null;
  if (!el || typeof el !== "object") return false;
  const tag = (el.tagName ?? "").toUpperCase();
  if (["BUTTON", "A", "SUMMARY", "SELECT", "INPUT", "TEXTAREA"].includes(tag)) return true;
  const role = el.getAttribute?.("role");
  return role === "button" || role === "link" || role === "tab" || role === "menuitem" || role === "checkbox" || role === "radio";
}

/** Marks the Board's own loupe; an aria-modal containing it does not block. */
export const LOUPE_MARK = "data-board-loupe";
const BLOCKERS = '[data-keys-block], dialog[open], [aria-modal="true"]';

interface RootLike {
  querySelectorAll(selector: string): ArrayLike<{ querySelector(selector: string): unknown; hasAttribute?(n: string): boolean }>;
}

/** Is a dialog or a shell layer open that is not the Board's loupe? `root` and
 *  `layers` are seams for tests; callers pass neither. */
export function overlayOpen(
  root: RootLike | null = typeof document === "undefined" ? null : document,
  layers: readonly LayerEntry[] = openLayers(),
): boolean {
  if (claimsKeys(layers)) return true;
  if (!root) return false;
  const list = root.querySelectorAll(BLOCKERS);
  for (let i = 0; i < list.length; i++) {
    const el = list[i];
    if (el.hasAttribute?.(LOUPE_MARK)) continue;
    if (el.querySelector(`[${LOUPE_MARK}]`)) continue;
    return true;
  }
  return false;
}

/* ── the resolver ─────────────────────────────────────────────────────────── */

const CAP_TO_EVENT_KEY: Record<string, string> = {
  "←": "ArrowLeft",
  "→": "ArrowRight",
  "↑": "ArrowUp",
  "↓": "ArrowDown",
  Esc: "Escape",
  Space: " ",
};

/** The `KeyboardEvent.key` values a cap matches: single characters compare
 *  case-insensitively (caps lock is not a different verb). */
export function eventKeys(keys: readonly string[]): string[] {
  return keys.map((c) => CAP_TO_EVENT_KEY[c] ?? (c.length === 1 ? c.toLowerCase() : c));
}

export interface ResolveOptions {
  /** `overlayOpen()` — passed in so this stays pure. Default: nothing is open. */
  overlay?: boolean;
  /** The shell's layer stack; default the live one. */
  layers?: readonly LayerEntry[];
}

/** What a press means in this keymap, or null when it is not the keymap's. */
export function resolveKey<A extends string>(map: Keymap<A>, e: KeyLike, opts: ResolveOptions = {}): A | null {
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  const binding = map.bindings.find((b) => eventKeys(b.keys).includes(k));
  if (!binding) return null;
  if ((e.ctrlKey || e.metaKey || e.altKey) && !binding.modifiers) return null;
  if (typing(e.target)) return null;
  if (k === "Escape") {
    // Honoured past a DOM-sniffed dialog (closing is never a decision), but not
    // past the layer stack: one press closes ONE thing. A layer still open will
    // take it; a layer the stack already popped preventDefaulted it on the
    // document, before this window-level guard runs.
    const layers = opts.layers ?? openLayers();
    return e.defaultPrevented || layers.length > 0 ? null : binding.action;
  }
  if (opts.overlay) return null;
  if (e.repeat && !binding.repeat) return null;
  if (k === "Enter" && enterBelongsToTarget(e.target)) return null;
  return binding.action;
}

/* ── what is bound right now ──────────────────────────────────────────────── */

const live = new Map<string, number>();

/** The ids of the keymaps with a window listener this moment. */
export function activeKeymaps(): string[] {
  return [...live.keys()];
}

/* ── the binding ──────────────────────────────────────────────────────────── */

/** A handler may return `false` to decline the press: it is then not
 *  preventDefaulted, so the browser's own behaviour for the key survives. */
export type KeyHandler = (e: KeyboardEvent) => void | false;
export type KeyHandlers<A extends string> = Partial<Record<A, KeyHandler>>;

/** ONE window listener for `map` while `enabled`. The latest handlers are read
 *  at key time: rebinding on every render would drop a press that lands between
 *  unbind and bind. */
export function useKeymap<A extends string>(map: Keymap<A>, handlers: KeyHandlers<A>, opts: { enabled?: boolean } = {}): void {
  const enabled = opts.enabled ?? true;
  const ref = useRef(handlers);
  useEffect(() => {
    ref.current = handlers;
  });

  useEffect(() => {
    if (!enabled) return;
    live.set(map.id, (live.get(map.id) ?? 0) + 1);
    const onKey = (e: KeyboardEvent) => {
      const action = resolveKey(map, e, { overlay: overlayOpen() });
      if (!action) return;
      const run = ref.current[action];
      if (!run) return;
      if (run(e) === false) return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      const n = (live.get(map.id) ?? 1) - 1;
      if (n > 0) live.set(map.id, n);
      else live.delete(map.id);
    };
  }, [enabled, map]);
}
