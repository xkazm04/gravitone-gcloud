// A FILM AS A ROW OF ITS OWN FRAMES (spark reel-studio): twelve stills spread across a film, in film order, so a
// reel is recognised by its picture before its title. One shape for three places: a reel's row on the overview
// (inert stills, a hovered frame lifts to a larger still), the strip under the reel's players (each frame a button
// that seeks to its moment, the playhead and the pinned notes drawn over it), and the kit.
//
// Frame i stands for the film's i-th twelfth; its moment is the middle of that span, `(i + 0.5) / n` of the film,
// the same spread the thumbnailer cuts at. A strip with no frames yet keeps its shape: `count` empty cells, so a
// reel that is still being made sits in the same row height as one that is finished.
//
// No "use client": the overview renders it on the server with no handlers; the review hands it `onPick` from its
// client island. Motion: the cells rise in on mount one after another and the loupe scales a hovered still; both
// stand still under reduced motion.
import type { CSSProperties } from "react";

import { cx } from "../cx.ts";
import s from "./Filmstrip.module.css";

export type FilmstripMark = {
  /** Where on the film, 0..1. */
  readonly at: number;
  /** The mark's spoken name (`note at 0:42: legibility`). */
  readonly label: string;
};

export type FilmstripProps = {
  /** Image URLs, in film order. */
  readonly frames: readonly string[];
  /** The strip's accessible name: whose film it is. */
  readonly label: string;
  /** Cells drawn when `frames` is empty. */
  readonly count?: number;
  /** `row` sits in a list; `rail` runs under a player at full width. */
  readonly size?: "row" | "rail";
  /** The playhead, 0..1. Absent: none drawn. */
  readonly at?: number;
  readonly marks?: readonly FilmstripMark[];
  /** The film's length in seconds: frame buttons speak their moment. */
  readonly seconds?: number;
  /** A frame was chosen: its index and its moment, 0..1. Absent: the stills are inert. */
  readonly onPick?: (index: number, at: number) => void;
  /** A hovered still lifts to a larger one. */
  readonly loupe?: boolean;
  /** The aspect of one still: `wide` 16:9, `tall` 9:16. */
  readonly aspect?: "wide" | "tall";
};

/** The middle of frame `i`'s span, 0..1. */
export const frameAt = (i: number, n: number): number => (n <= 0 ? 0 : (i + 0.5) / n);

/** The frame a moment falls in. */
export const frameOf = (at: number, n: number): number => (n <= 0 ? 0 : Math.min(n - 1, Math.max(0, Math.floor(at * n))));

/** `m:ss` from seconds. */
export const mss = (t: number): string => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

/** One still of a film, lazy, decorative (its name is the strip's or the link's): the frame's own bytes, already cut
 *  to size by the thumbnailer, so there is nothing for an image optimiser to do. */
export function Still({ src, className }: { readonly src: string; readonly className?: string | undefined }) {
  // eslint-disable-next-line @next/next/no-img-element -- a film's stills are served as their own bytes (see above)
  return <img className={className} src={src} alt="" loading="lazy" decoding="async" draggable={false} />;
}

const pct = (x: number): string => `${(Math.min(1, Math.max(0, x)) * 100).toFixed(3)}%`;

export function Filmstrip({ frames, label, count = 12, size = "row", at, marks = [], seconds, onPick, loupe = false, aspect = "wide" }: FilmstripProps) {
  const n = frames.length;
  const lit = at === undefined || n === 0 ? -1 : frameOf(at, n);
  const cells = n === 0 ? Array.from({ length: count }, () => null) : frames;
  return (
    <div className={cx(s.strip, size === "rail" && s.rail, aspect === "tall" && s.tall, loupe && s.loupe)} role="group" aria-label={label} data-empty={n === 0 ? "" : undefined}>
      <ol className={s.cells}>
        {cells.map((src, i) => {
          const style = { "--i": i } as CSSProperties;
          if (src === null) return <li key={i} className={cx(s.cell, s.blank)} style={style} aria-hidden="true" />;
          const still = <Still src={src} className={s.img} />;
          const moment = seconds === undefined ? `frame ${i + 1} of ${n}` : `${mss(frameAt(i, n) * seconds)}`;
          return (
            <li key={src} className={cx(s.cell, i === lit && s.lit)} style={style}>
              {onPick === undefined ? (
                still
              ) : (
                <button type="button" className={s.pick} onClick={() => onPick(i, frameAt(i, n))} aria-label={`seek ${moment}`} aria-current={i === lit ? "true" : undefined}>
                  {still}
                </button>
              )}
            </li>
          );
        })}
      </ol>
      {at !== undefined && n > 0 && <span className={s.head} style={{ left: pct(at) }} aria-hidden="true" />}
      {marks.map((m) => (
        <span key={`${m.at}:${m.label}`} className={s.mark} style={{ left: pct(m.at) }} role="img" aria-label={m.label} />
      ))}
    </div>
  );
}
