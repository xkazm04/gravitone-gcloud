"use client";

// THE CORE PICKER (spark character-cores S1.5) - every core a production can cast, over the whole page under the
// studio header, the way the operator asked for it: the 420 px tray was too small to judge a face in, so the cards are
// twice its size (a column of at least 236 px), each with her portrait, her reference sheet beside it when the core has
// one, her name, where she came from and her identity block verbatim (the work's own words, so they show in full).
//
// A modal dialog on the layer stack (@gt/ui useLayer, kind "dialog"): it claims the keyboard, so the canvas keymap
// beneath is paused while it is open, and Esc reaches it as the stack's close. Focus is moved to the cast control
// first, so the stack captures THAT as the opener and returns focus there on every close (C opens the picker with
// focus anywhere on the map). Tab is held inside; the grid is one tab stop and the arrows walk it by its drawn rows.
// A pick is `previewCore`, unchanged: the picker closes and the swap's preview opens. The picker is the only way to
// swap: the drop-a-core-on-the-cast-card target lived in the river and film-strip streets, retired 2026-11-20 (WP9).

import { useEffect, useId, useRef, useState, type KeyboardEvent, type RefObject } from "react";

import { useLayer } from "@gt/ui/layers/useLayer";
import type { CoreRef } from "@gt/domain/productionGraph";

import { Chip, Gl, Kbd } from "../ui/kit.tsx";
import s from "./picker.module.css";

type Props = {
  readonly cores: readonly CoreRef[];
  readonly cast: string;
  /** The cast control in the street's bar: focus returns there on close. */
  readonly castRef: RefObject<HTMLElement | null>;
  readonly onPick: (core: string) => void;
  readonly onClose: () => void;
};

const cardsIn = (grid: HTMLElement | null): HTMLElement[] => [...(grid?.querySelectorAll<HTMLElement>('[data-role="core-card"]') ?? [])];

const TABBABLE = 'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** The card `key` moves to from `at`, by the grid as drawn: ↑ ↓ keep the column (the nearest left edge in the next
 *  drawn row), ← → step in reading order, Home / End go to the ends. Null for a key the grid does not walk by. */
function stepTo(cards: readonly HTMLElement[], at: number, key: string): number | null {
  const last = cards.length - 1;
  if (key === "ArrowLeft") return Math.max(0, at - 1);
  if (key === "ArrowRight") return Math.min(last, at + 1);
  if (key === "Home") return 0;
  if (key === "End") return last;
  if (key !== "ArrowUp" && key !== "ArrowDown") return null;
  const here = cards[at];
  if (here === undefined) return null;
  const dir = key === "ArrowDown" ? 1 : -1;
  const rowTop = (y: number): boolean => (dir > 0 ? y > here.offsetTop + 1 : y < here.offsetTop - 1);
  let row: number | null = null;
  let best: number | null = null;
  for (let i = at + dir; i >= 0 && i <= last; i += dir) {
    const c = cards[i];
    if (c === undefined || !rowTop(c.offsetTop)) continue;
    if (row === null) row = c.offsetTop;
    if (c.offsetTop !== row) break;
    const b = best === null ? undefined : cards[best];
    if (b === undefined || Math.abs(c.offsetLeft - here.offsetLeft) < Math.abs(b.offsetLeft - here.offsetLeft)) best = i;
  }
  return best ?? at;
}

function Card({ c, cast, tab, onPick, onFocus }: { readonly c: CoreRef; readonly cast: boolean; readonly tab: boolean; readonly onPick: () => void; readonly onFocus: () => void }) {
  const idn = useId();
  return (
    <button
      type="button"
      className={s.card}
      data-role="core-card"
      data-core={c.id}
      tabIndex={tab ? 0 : -1}
      aria-current={cast ? true : undefined}
      aria-disabled={cast ? true : undefined}
      aria-label={`${c.name}${cast ? ", cast now" : ""}; ${c.origin}`}
      aria-describedby={idn}
      onFocus={onFocus}
      onClick={() => {
        if (!cast) onPick();
      }}
    >
      <span className={s.pics}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={s.portrait} src={c.portrait} alt="" loading="lazy" decoding="async" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {c.sheet !== undefined && <img className={s.sheet} src={c.sheet} alt="" loading="lazy" decoding="async" />}
      </span>
      <span className={s.name}>
        <b>{c.name}</b>
        {cast && <Chip tone="cyan">cast now</Chip>}
      </span>
      <small className={s.origin}>{c.origin}</small>
      <span id={idn} className={s.identity}>
        {c.identity}
      </span>
    </button>
  );
}

export function CorePicker({ cores, cast, castRef, onPick, onClose }: Props) {
  const head = useId();
  const panel = useRef<HTMLElement | null>(null);
  const grid = useRef<HTMLDivElement | null>(null);
  const first = Math.max(0, cores.findIndex((c) => c.id !== cast));
  const [at, setAt] = useState(first);

  // Before the layer captures its opener: the cast control is where every close returns.
  useEffect(() => {
    castRef.current?.focus({ preventScroll: true });
  }, [castRef]);
  useLayer(true, { kind: "dialog", panelRef: panel, onClose: () => onClose(), landmark: () => castRef.current });
  useEffect(() => {
    // Once, on open (`first` is read once): the arrows own the focus from here.
    cardsIn(grid.current)[first]?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onKey = (e: KeyboardEvent<HTMLElement>): void => {
    if (e.key === "Tab") {
      const stops = [...(panel.current?.querySelectorAll<HTMLElement>(TABBABLE) ?? [])].filter((el) => el.tabIndex >= 0);
      const a = stops[0];
      const z = stops[stops.length - 1];
      if (a === undefined || z === undefined) return;
      if (e.shiftKey && document.activeElement === a) {
        e.preventDefault();
        z.focus();
      } else if (!e.shiftKey && document.activeElement === z) {
        e.preventDefault();
        a.focus();
      }
      return;
    }
    const all = cardsIn(grid.current);
    const from = all.indexOf(e.target as HTMLElement);
    if (from < 0) return;
    const to = stepTo(all, from, e.key);
    if (to === null) return;
    e.preventDefault();
    setAt(to);
    all[to]?.focus();
  };

  return (
    <section ref={panel} className={s.picker} role="dialog" aria-modal="true" aria-labelledby={head} data-role="core-picker" onKeyDown={onKey}>
      <div className={s.head}>
        <h2 id={head}>Cores · {cores.length}</h2>
        <span className={s.grow} />
        <button type="button" className={s.close} onClick={onClose} aria-label="Close cores">
          <Gl name="x" />
          <Kbd verb="up" />
        </button>
      </div>
      <div ref={grid} className={s.grid} role="group" aria-labelledby={head}>
        {cores.map((c, i) => (
          <Card key={c.id} c={c} cast={c.id === cast} tab={i === at} onPick={() => onPick(c.id)} onFocus={() => setAt(i)} />
        ))}
      </div>
    </section>
  );
}
