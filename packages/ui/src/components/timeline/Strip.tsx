"use client";

// THE STRIP: the track on one axis - its sections as bands, its beats as ticks (a bar's first beat taller), its
// lyric lines where they are sung, the takes as blocks where they sit, and the playhead. Every layer is placed by
// the same `at01`, so a block edge and the beat it was cut on are the same x. A press on the bands or ticks seeks;
// a press on a block selects it. Drawn wider than its box when the track is long: the strip scrolls, the page
// does not.

import { memo, type CSSProperties, type PointerEvent } from "react";

import type { TrackMap } from "@gt/domain/productionGraph";

import { cx } from "../cx.ts";
import { at01, beatTicks, timecode, type TimelineBlock } from "./geometry.ts";
import s from "./Timeline.module.css";

/** The strip is at least this many pixels a second, and wide enough that the shortest take keeps its label. */
const PX_PER_SECOND = 10;
const PX_SHORTEST_BLOCK = 64;

function stripWidth(seconds: number, blocks: readonly TimelineBlock[]): number {
  const shortest = Math.min(...blocks.map((b) => b.dur).filter((d) => d > 0));
  const byBlock = Number.isFinite(shortest) ? (seconds * PX_SHORTEST_BLOCK) / shortest : 0;
  return Math.round(Math.max(seconds * PX_PER_SECOND, byBlock));
}

const xVar = (x: number) => ({ "--x": String(x) }) as CSSProperties;
const spanVar = (x: number, w: number) => ({ "--x": String(x), "--w": String(w) }) as CSSProperties;

export function blockName(b: TimelineBlock): string {
  const v = b.verdict === undefined ? "" : `, ${b.verdict.verdict === "keep" ? "kept" : "rejected"}`;
  return `${b.label}, ${timecode(b.at)} to ${timecode(b.at + b.dur)}, ${b.state}${v}`;
}

const Ground = memo(function Ground({ track }: { readonly track: TrackMap }) {
  const sec = track.seconds;
  return (
    <>
      <div className={s.sections} aria-hidden="true">
        {track.sections.map((x, i) => (
          <span key={`${x.name}-${x.start}`} className={cx(s.section, i % 2 === 1 && s.alt)} style={spanVar(at01(x.start, sec), at01(x.end, sec) - at01(x.start, sec))}>
            {x.name}
          </span>
        ))}
      </div>
      <div className={s.beats} aria-hidden="true">
        {beatTicks(track.beats).map((b) => (
          <i key={b.t} className={cx(s.tick, b.bar && s.bar)} style={xVar(at01(b.t, sec))} />
        ))}
      </div>
      <div className={s.lyrics} aria-hidden="true">
        {track.lyrics.map((l, i) => {
          const end = track.lyrics[i + 1]?.t ?? sec;
          return (
            <span key={`${l.t}`} className={s.lyric} style={spanVar(at01(l.t, sec), at01(end, sec) - at01(l.t, sec))}>
              {l.text}
            </span>
          );
        })}
      </div>
    </>
  );
});

export type StripProps = {
  readonly track: TrackMap;
  readonly blocks: readonly TimelineBlock[];
  readonly selected: string | null;
  readonly t: number;
  readonly onSelect: (id: string) => void;
  readonly onSeek: (t: number) => void;
};

export function Strip({ track, blocks, selected, t, onSelect, onSeek }: StripProps) {
  const seekAt = (e: PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button") !== null) return;
    const r = e.currentTarget.getBoundingClientRect();
    if (r.width > 0) onSeek(((e.clientX - r.left) / r.width) * track.seconds);
  };
  return (
    <div className={s.scroll}>
      <div className={s.strip} style={{ minWidth: `${stripWidth(track.seconds, blocks)}px` }} onPointerDown={seekAt}>
        <Ground track={track} />
        <div className={s.blocks}>
          {blocks.map((b) => (
            <button
              key={b.id}
              type="button"
              data-block={b.id}
              className={cx(s.block, s[b.state], b.id === selected && s.sel)}
              style={spanVar(at01(b.at, track.seconds), at01(b.at + b.dur, track.seconds) - at01(b.at, track.seconds))}
              aria-pressed={b.id === selected}
              aria-label={blockName(b)}
              tabIndex={b.id === selected || (selected === null && b === blocks[0]) ? 0 : -1}
              onClick={() => onSelect(b.id)}
            >
              <span className={s.blockLabel}>{b.label}</span>
              {b.verdict !== undefined && <span className={cx(s.mark, b.verdict.verdict === "keep" ? s.kept : s.rejected)} aria-hidden="true" />}
            </button>
          ))}
        </div>
        <div className={s.head} style={xVar(at01(t, track.seconds))} aria-hidden="true" />
      </div>
    </div>
  );
}
