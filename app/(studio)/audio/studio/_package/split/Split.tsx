"use client";

// PACKAGING LAYOUT "split" (spark studio-to-release, WP5): the conversation stays on the left, narrowed but whole -
// its cards, its next steps, the dock that still sends - and the release's step fills the right, so what the agent
// said sits beside what it filled. The seam between them is a window splitter (WAI-ARIA APG "Window Splitter"): a
// focusable separator that drags or takes arrow keys, Home / End for the two limits and Enter to fold; the toggle
// above it folds the conversation to a strip and opens it again. Folding hides the conversation without unmounting
// it, so a half-typed message, the playhead and the open cards survive a fold.
//
// The width and the fold are a viewer's convenience, kept in localStorage behind try/catch and mirrored in memory (a
// private window or blocked storage still moves the seam, and starts at the default next time). They are read
// through useSyncExternalStore, whose server snapshot is the default, so the server render and hydration agree.
//
// How the conversation and the wizard re-flow at a column's width (not the window's) is in split.module.css: both
// key their breakpoints on the viewport today, so this layout restates them on its own containers until they key on
// a container themselves (reported, spark studio-to-release WP5).
import { useId, useRef, useState, useSyncExternalStore, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";

import { Wizard } from "../../../_release/wizard/Wizard.tsx";
import type { PackagingVariantProps } from "../props.ts";
import s from "./split.module.css";

/** The conversation's share of the layout's width, in percent; CSS still holds it between its px floor and the step's. */
const SHARE = { min: 24, max: 64, initial: 36, step: 4, page: 12 } as const;
const STORE_KEY = "gt.audio.package.split";

interface Seam {
  readonly share: number;
  readonly folded: boolean;
}

const clampShare = (n: number): number => Math.round(Math.min(SHARE.max, Math.max(SHARE.min, n)));

const DEFAULT_SEAM: Seam = { share: SHARE.initial, folded: false };

function parseSeam(raw: string | null): Seam {
  if (raw === null) return DEFAULT_SEAM;
  try {
    const v: unknown = JSON.parse(raw);
    if (typeof v !== "object" || v === null) return DEFAULT_SEAM;
    const share = "share" in v && typeof v.share === "number" && Number.isFinite(v.share) ? clampShare(v.share) : SHARE.initial;
    return { share, folded: "folded" in v && v.folded === true };
  } catch {
    return DEFAULT_SEAM;
  }
}

// The kept seam: the raw string is the snapshot (stable between reads), memory first, storage on the first read.
let kept: string | null | undefined;
const listeners = new Set<() => void>();
function keptSeam(): string | null {
  if (kept === undefined) {
    try {
      kept = window.localStorage.getItem(STORE_KEY);
    } catch {
      kept = null;
    }
  }
  return kept;
}
function keepSeam(seam: Seam): void {
  kept = JSON.stringify(seam);
  try {
    window.localStorage.setItem(STORE_KEY, kept);
  } catch {
    // storage refused: memory still holds the seam for this page's life
  }
  for (const f of listeners) f();
}
function onSeam(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

function Chevron({ folded }: { readonly folded: boolean }) {
  return (
    <svg className={s.chev} data-folded={folded ? "" : undefined} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <path d="M10 3.5L5.5 8l4.5 4.5" />
    </svg>
  );
}

export function Split({ url, read, session, thread, newId }: PackagingVariantProps) {
  const threadId = useId();
  const layout = useRef<HTMLDivElement | null>(null);
  const seam = parseSeam(useSyncExternalStore(onSeam, keptSeam, () => null));
  // While the grip is held the share follows the pointer here; it is kept once, on release.
  const [drag, setDrag] = useState<number | null>(null);
  const share = drag ?? seam.share;

  const resize = (next: number): void => keepSeam({ share: clampShare(next), folded: false });
  const toggle = (): void => keepSeam({ ...seam, folded: !seam.folded });

  // The pointer's x over the layout's content box is the conversation's share; the separator keeps the capture.
  const shareAt = (clientX: number): number | null => {
    const el = layout.current;
    if (el === null) return null;
    const box = el.getBoundingClientRect();
    const cs = window.getComputedStyle(el);
    const left = box.left + parseFloat(cs.paddingLeft);
    const width = box.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    return width > 0 ? ((clientX - left) / width) * 100 : null;
  };
  const onPointerDown = (e: PointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.focus();
    setDrag(seam.share);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>): void => {
    if (drag === null) return;
    const at = shareAt(e.clientX);
    if (at !== null) setDrag(clampShare(at));
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>): void => {
    if (drag === null) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    keepSeam({ share: drag, folded: false });
    setDrag(null);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    const by: Readonly<Record<string, number>> = { ArrowLeft: -SHARE.step, ArrowRight: SHARE.step, PageDown: -SHARE.page, PageUp: SHARE.page };
    const delta = by[e.key];
    if (delta !== undefined) resize(share + delta);
    else if (e.key === "Home") resize(SHARE.min);
    else if (e.key === "End") resize(SHARE.max);
    else if (e.key === "Enter") toggle();
    else return;
    e.preventDefault();
  };

  const style = { "--split-share": `${share}%` } as CSSProperties;
  return (
    <div ref={layout} className={s.layout} data-layout="split" data-folded={seam.folded ? "" : undefined} data-dragging={drag !== null ? "" : undefined} style={style}>
      <div id={threadId} className={s.thread} aria-label="conversation" role="region">
        {thread}
      </div>
      <div className={s.seam}>
        <button type="button" className={s.fold} aria-expanded={!seam.folded} aria-controls={threadId} aria-label="conversation" onClick={toggle}>
          <Chevron folded={seam.folded} />
          {seam.folded && (
            <span className={s.foldName} aria-hidden="true">
              conversation
            </span>
          )}
        </button>
        {!seam.folded && (
          <div
            className={s.grip}
            role="separator"
            tabIndex={0}
            aria-orientation="vertical"
            aria-label="conversation width"
            aria-controls={threadId}
            aria-valuemin={SHARE.min}
            aria-valuemax={SHARE.max}
            aria-valuenow={share}
            aria-valuetext={`${share} percent`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onDoubleClick={() => resize(SHARE.initial)}
            onKeyDown={onKeyDown}
          >
            <span className={s.knob} aria-hidden="true" />
          </div>
        )}
      </div>
      <div className={s.step}>
        <Wizard read={read} session={session} newId={newId} {...(url.stage === "release" ? { startStep: "review" as const } : {})} />
      </div>
    </div>
  );
}
