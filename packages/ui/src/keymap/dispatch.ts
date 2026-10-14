"use client";

// THE APP'S ONLY KEYDOWN LISTENER (next-structure exempts exactly this file).
//
// v1 had 30 raw keydown listeners plus three keymaps, so a press was decided by
// subscription order: Escape closed the bell tray AND cleared the Board's pick;
// Ctrl+K stamped a keep. Here the listener does three things and decides none of
// them: read the event into data (`targetInfo`), ask `route()` (pure, tested), and
// run what it answers - a layer's close, or the handler a screen registered for the
// matched row's verb. A screen never sees a KeyboardEvent; it registers verbs.
//
// A handler may return `false` to decline: the press is then not preventDefaulted,
// so the browser's own meaning for the key survives (v1 `useKeymap`'s rule).

import { useEffect, useRef } from "react";

import { KEYMAP } from "./bindings.ts";
import { pageMode, route } from "./route.ts";
import { targetInfo, type ElementLike } from "./target.ts";
import { closeLayer, layerStack } from "../layers/live.ts";

export type KeyHit = { readonly cap: string; readonly index: number };
export type KeyHandler = (hit: KeyHit) => void | false;
export type KeyHandlers = Readonly<Partial<Record<string, KeyHandler>>>;

type Scope = {
  readonly mode: string;
  readonly handlers: { current: KeyHandlers };
  readonly facts: { current: readonly string[] };
};

const scopes: Scope[] = [];
let installed = false;

function factsNow(): ReadonlySet<string> {
  const out = new Set<string>();
  for (const s of scopes) for (const f of s.facts.current) out.add(f);
  return out;
}

function onKeyDown(e: KeyboardEvent): void {
  const el: ElementLike | null = e.target instanceof Element ? e.target : null;
  const layers = layerStack();
  const decision = route(
    KEYMAP,
    { key: e.key, code: e.code, shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey, repeat: e.repeat, defaultPrevented: e.defaultPrevented, target: targetInfo(el) },
    { layers, page: pageMode(scopes, layers), facts: factsNow() },
  );
  if (decision.kind === "close-layer") {
    e.preventDefault();
    closeLayer(decision.id, "escape");
    return;
  }
  if (decision.kind !== "binding") return;
  const { binding, cap, index } = decision.match;
  for (let i = scopes.length - 1; i >= 0; i--) {
    const s = scopes[i];
    if (s === undefined || s.mode !== binding.mode) continue;
    const run = s.handlers.current[binding.verb];
    if (run === undefined) continue;
    if (run({ cap, index }) !== false) e.preventDefault();
    return;
  }
}

/** Install the listener once, for the life of the page. Idempotent; a no-op on the server. */
export function ensureDispatcher(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("keydown", onKeyDown);
}

/**
 * Bind `mode`'s verbs while mounted. `handlers` and `facts` are read at key time
 * through refs, so an inline object does not re-register on every render (the
 * re-register gap would drop a press that lands between unbind and bind).
 * `facts` are the names the table's `when` rows test: `["audio"]`, `["job"]`.
 */
export function useKeys(mode: string, handlers: KeyHandlers, opts: { facts?: readonly string[]; enabled?: boolean } = {}): void {
  const enabled = opts.enabled ?? true;
  const h = useRef(handlers);
  const f = useRef<readonly string[]>(opts.facts ?? []);
  useEffect(() => {
    h.current = handlers;
    f.current = opts.facts ?? [];
  });
  useEffect(() => {
    if (!enabled) return;
    ensureDispatcher();
    const scope: Scope = { mode, handlers: h, facts: f };
    scopes.push(scope);
    return () => {
      const at = scopes.indexOf(scope);
      if (at >= 0) scopes.splice(at, 1);
    };
  }, [mode, enabled]);
}
