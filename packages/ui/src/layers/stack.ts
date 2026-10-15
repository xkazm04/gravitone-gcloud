// THE LAYER STACK - what is open, in order, who owns the next key, and what one
// Escape closes. Pure: a value in, a value out; the live instance is live.ts.
//
// Absorbed from v1 components/ui/layers.ts, whose header records why it exists:
// Modal, the bell tray and the account panel each owned a private dismissal, so
// nothing could answer "what is on top", one Escape closed the tray AND emptied the
// Board's multi-pick behind it, and two nested Modals closed together. Kept: the
// pure queries (escape goes to the top; an outside press walks down from the top and
// stops at the first layer that contains it, at its anchor, or at a modal), entries
// addressed by identity, a remover that is idempotent.
//
// Upgraded:
//   · A layer declares its KIND and the kind carries the policy (modal-stack
//     dismissal-semantics: light surfaces dismiss lightly, invested ones do not),
//     instead of each consumer passing flags.
//   · A layer may own a keymap MODE: while it is the top claiming layer, its mode is
//     the one the dispatcher resolves (the Board sheet's desk, the calendar month).
//   · A layer's close is ITS OWN ACTION. The Board sheet is a URL (plan §8.2), so its
//     close is "navigate back" and the entry leaves the stack only when the route
//     unmounts it. Between those two moments the entry is LEAVING: it owns no input,
//     so a second Escape reaches the layer below instead of calling back() twice and
//     walking the history two steps (stack-ownership: input authority transfers at
//     pop, not at animation or navigation end).
//   · Closing an entry that has layers above it CASCADES top-down (each closes with
//     the same reason) instead of deleting the middle of the stack under them.
// Dropped: v1's `onKey` trap delivery - non-Escape keys now reach a layer through
// its keymap mode, so there is one routing path instead of two.
//
// The TOOLTIP kind (wave 3) is the disclosure a hover or a focus opens - the Hint's
// tip. WCAG 1.4.13 asks three things of it and the policy row carries all three:
// dismissible without moving the pointer or focus (it is on the stack, so Escape
// routes to it like to any top layer), not claiming the keyboard (the page's rows
// keep firing while a tip is up), and RETURNING NO FOCUS on close - focus never left
// the control that opened it, so "restoring" it would at best do nothing and at
// worst steal it from wherever the user has since moved. v1's Hint dismissed itself
// with private Escape and pointerdown listeners (components/ui/signal/Hint.tsx); a
// second Escape path is exactly what the stack exists to remove.

export type LayerKind = "sheet" | "dialog" | "popover" | "zoom" | "tooltip";
export type DismissReason = "escape" | "outside" | "explicit";

export type LayerPolicy = {
  /** Owns the keyboard: rows of the page beneath stop firing (Escape still routes). */
  readonly claimsKeys: boolean;
  /** An outside press closes it. */
  readonly outside: boolean;
  /** Traps focus and holds the scroll lock; an outside press never walks past it. */
  readonly modal: boolean;
  /** On close, focus goes back to the opener. False only where focus never moved in. */
  readonly returnsFocus: boolean;
};

/**
 * Policy by kind. The sheet and dialogs hold decisions and typed input, so a stray
 * press outside does not discard them; a popover holds nothing and closes lightly.
 * The zoom is a lens over the desk: the desk's keys keep working through it. A
 * tooltip is lighter still: it claims nothing and gives nothing back.
 */
export const POLICY: Readonly<Record<LayerKind, LayerPolicy>> = {
  sheet: { claimsKeys: true, outside: false, modal: true, returnsFocus: true },
  dialog: { claimsKeys: true, outside: false, modal: true, returnsFocus: true },
  popover: { claimsKeys: true, outside: true, modal: false, returnsFocus: true },
  zoom: { claimsKeys: false, outside: false, modal: false, returnsFocus: true },
  tooltip: { claimsKeys: false, outside: true, modal: false, returnsFocus: false },
};

export type LayerEntry = {
  readonly id: string;
  readonly kind: LayerKind;
  /** The keymap mode this layer's keys resolve in while it is on top. */
  readonly mode?: string;
  /** The layer's own close: set a flag, or navigate back. Called at most once per entry. */
  readonly close: (reason: DismissReason) => void;
  /** Is the node inside this layer's panel? */
  readonly contains?: (node: unknown) => boolean;
  /** Is the node the control that opened it? A press there is the trigger's own toggle. */
  readonly anchorContains?: (node: unknown) => boolean;
  /** Read at key time; a specimen seeded open on /kit is on screen but not the user's focus. */
  readonly claimsKeys?: () => boolean;
};

export type LayerStack = { readonly entries: readonly LayerEntry[]; readonly leaving: ReadonlySet<string> };

export const EMPTY_STACK: LayerStack = { entries: [], leaving: new Set() };

export function push(s: LayerStack, entry: LayerEntry): LayerStack {
  if (s.entries.some((e) => e.id === entry.id)) return s;
  return { entries: [...s.entries, entry], leaving: s.leaving };
}

/** Remove by identity; removing what is not there returns `s` itself. */
export function remove(s: LayerStack, id: string): LayerStack {
  if (!s.entries.some((e) => e.id === id)) return s;
  const leaving = new Set(s.leaving);
  leaving.delete(id);
  return { entries: s.entries.filter((e) => e.id !== id), leaving };
}

/** Entries that still own input, bottom first. */
export const live = (s: LayerStack): readonly LayerEntry[] => s.entries.filter((e) => !s.leaving.has(e.id));

export const top = (s: LayerStack): LayerEntry | undefined => live(s).at(-1);

export const claims = (e: LayerEntry): boolean => e.claimsKeys?.() ?? POLICY[e.kind].claimsKeys;

/**
 * Begin closing `id`: it and every live layer above it, top-down, become leaving.
 * Returns the new stack and the entries whose `close` the driver must call, in
 * order. An id that is unknown or already leaving closes nothing.
 */
export function closing(s: LayerStack, id: string): { stack: LayerStack; close: readonly LayerEntry[] } {
  const l = live(s);
  const at = l.findIndex((e) => e.id === id);
  if (at < 0) return { stack: s, close: [] };
  const close = l.slice(at).reverse();
  const leaving = new Set(s.leaving);
  for (const e of close) leaving.add(e.id);
  return { stack: { entries: s.entries, leaving }, close };
}

/** Who one Escape closes: the top live layer, unless something inside already spent the key. */
export function escapeTarget(s: LayerStack, prevented: boolean): string | null {
  if (prevented) return null;
  return top(s)?.id ?? null;
}

/** Which layers a press at `target` dismisses, top first (v1 `outsidePress`, policy-driven). */
export function outsidePress(s: LayerStack, target: unknown): string[] {
  const l = live(s);
  const out: string[] = [];
  for (let i = l.length - 1; i >= 0; i--) {
    const e = l[i];
    if (e === undefined) continue;
    if (e.contains?.(target) === true || e.anchorContains?.(target) === true) break;
    const p = POLICY[e.kind];
    if (p.outside) out.push(e.id);
    if (p.modal || !p.outside) break;
  }
  return out;
}

/** The modal whose focus trap is live: the topmost live modal. */
export function trapOwner(s: LayerStack): string | null {
  const l = live(s);
  for (let i = l.length - 1; i >= 0; i--) {
    const e = l[i];
    if (e !== undefined && POLICY[e.kind].modal) return e.id;
  }
  return null;
}

/**
 * The keymap mode a press resolves in. Walk down from the top: a layer with a mode
 * decides; a layer that claims keys without one blocks the page (null); a layer that
 * does not claim keys (the zoom) lets the walk continue. Below every layer, `page`.
 */
export function activeMode(s: LayerStack, page: string | null): string | null {
  const l = live(s);
  for (let i = l.length - 1; i >= 0; i--) {
    const e = l[i];
    if (e === undefined) continue;
    if (e.mode !== undefined && claims(e)) return e.mode;
    if (claims(e)) return null;
  }
  return page;
}
