"use client";

// THE LATER EDITORS (Phase 4 wave C, L39 + L40): the part kinds after research and script, one
// line per kind, so the island (./PartEditor.tsx) routes to an editor without a third arm on its
// research|script choice. The server-side twin is ../../_part/kinds.ts.
//
// EACH ONE IS ITS OWN CHUNK, fetched by kind. A part screen draws exactly one editor, and the
// static imports this file used to carry made all nine first-load JS on every part
// (pipeline/bundle-budget.json: the part route stood ~47 KB over the shared floor). The server
// still renders the editor, so the part arrives as HTML and only its hydration waits for the
// chunk (the device of ../../../../audio/_audio/Lazy.tsx, measured there: a plain import() costs
// nothing per route, next/dynamic added 668 B to every one).
//
// Why `use()` on one cached promise per kind and not React.lazy: a lazy component resolves only
// once it has been RENDERED, so an editor warmed in the background still suspends for a tick the
// first time it is drawn. The promise here is stamped settled the moment its chunk lands (the
// thenable fields `use()` reads: `status`, `value`), so a draw after that is synchronous; and
// `use()` is called on every draw, loaded or not, because React refuses a component that
// suspended on `use()` and then finished without it (measured: the hydration retry threw "did
// not call use() when it finished").
//
// Why NO Suspense boundary of its own (2026-11-09, measured on a production build): React 19.3's
// server renderer outlines every boundary whose content passes 500 bytes (react-dom-server
// `isEligibleForOutlining`), so a boundary here streamed its fallback first and the editor after
// it on EVERY hard load, warm server or not - a Ghost frame painted before every part. Without
// one, a draw that waits suspends to the segment's boundary: a hard load keeps the server's HTML
// while hydration waits for the chunk, and `[` `]` (a router transition) keep the part on screen
// until the next one can draw - or the segment's loading frame, where the route has one.
import { createElement, use, useEffect, type ComponentType } from "react";

import type { EditorKind, PartTab, PartView } from "@gt/domain/partView";

import type { EditorProps } from "./PartEditor.tsx";

export type LaterKind = Exclude<EditorKind, "research" | "script">;
type Editor<K extends LaterKind> = ComponentType<EditorProps<PartView<K>>>;
type Settled<T> = Promise<T> & { status?: "fulfilled"; value?: T };
/** A kind's chunk: how to fetch it, and the one fetch, stamped once it lands. Module state, per
 *  realm: the browser session's, or the server process's (where it only turns a later request's
 *  render synchronous - the tree is the same either way). */
type Cell<K extends LaterKind> = { readonly fetch: () => Promise<Editor<K>>; pending?: Settled<Editor<K>> };
const cell = <K extends LaterKind>(fetch: () => Promise<Editor<K>>): Cell<K> => ({ fetch });

/** One line per kind. */
const CELLS: { readonly [K in LaterKind]: Cell<K> } = {
  /* L39 */
  frames: cell(() => import("./Frames.tsx").then((m) => m.FramesEditor)),
  motion: cell(() => import("./Motion.tsx").then((m) => m.MotionEditor)),
  /* L40 */
  score: cell(() => import("./Score.tsx").then((m) => m.ScoreEditor)),
  cut: cell(() => import("./Cut.tsx").then((m) => m.CutEditor)),
  words: cell(() => import("./Words.tsx").then((m) => m.WordsEditor)),
  render: cell(() => import("./Render.tsx").then((m) => m.RenderEditor)),
  article: cell(() => import("./Article.tsx").then((m) => m.ArticleEditor)),
  strips: cell(() => import("./Strips.tsx").then((m) => m.StripsEditor)),
  voice: cell(() => import("./Voice.tsx").then((m) => m.VoiceEditor)),
};

function load<K extends LaterKind>(kind: K): Promise<Editor<K>> {
  const c: Cell<K> = CELLS[kind];
  if (c.pending !== undefined) return c.pending;
  const p: Settled<Editor<K>> = c.fetch().then((editor) => {
    p.status = "fulfilled";
    p.value = editor;
    return editor;
  });
  // A failed fetch is not kept: the next draw or warm asks again; the draw's own error surfaces.
  p.catch(() => {
    c.pending = undefined;
  });
  c.pending = p;
  return p;
}

const isLater = (kind: string): kind is LaterKind => Object.hasOwn(CELLS, kind);

/** Warm the chunks of every editor this project's tabs open, once the part has painted and the
 *  browser is idle - so `[` `]` land on an editor whose code is already here. */
function useWarm(tabs: readonly PartTab[]): void {
  const kinds = [...new Set(tabs.filter((t) => t.editor).map((t) => t.kind))].filter(isLater).join(" ");
  useEffect(() => {
    const go = (): void => {
      for (const k of kinds.split(" ")) if (isLater(k)) void load(k).catch(() => undefined);
    };
    const ric = (globalThis as { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
    if (ric !== undefined) ric(go);
    else setTimeout(go, 200);
  }, [kinds]);
}

export function LaterEditor(p: EditorProps<PartView<LaterKind>>) {
  useWarm(p.view.tabs);
  // A module-level component picked by kind (stable identity), so createElement, not a JSX tag
  // the static-components rule would read as a component made during render.
  return createElement(use(load(p.view.kind)), p);
}
