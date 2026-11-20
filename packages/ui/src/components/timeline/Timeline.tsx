"use client";

// THE CUT ON THE TRACK (spark character-cores WP3): a production's takes laid on its track map - sections, beats,
// lyrics - and played as one film against the track (./useMasterClock.ts), with the selected take's verdict and
// direction beside it (./ClipReview.tsx). Props are data and callbacks only: the caller fetches, the caller writes.
//
// Keys, while focus is inside it and not in a field: Space plays or pauses; ← → move between takes and put the
// playhead on the one reached, so playing from any take is two keys. A press on a take does the same.

import { useMemo, useState, type KeyboardEvent } from "react";

import type { TrackMap } from "@gt/domain/productionGraph";

import { targetInfo } from "../../keymap/target.ts";
import { cx } from "../cx.ts";
import type { VerdictReasons } from "../cull/VerdictPick.tsx";
import { LibraryGlyph } from "../library/LibraryGlyph.tsx";
import { ClipReview, type TimelineVerdict } from "./ClipReview.tsx";
import { blockAt, inOrder, lineAt, sectionAt, step, timecode, type TimelineBlock } from "./geometry.ts";
import { Strip } from "./Strip.tsx";
import { useMasterClock } from "./useMasterClock.ts";
import s from "./Timeline.module.css";

export type { TimelineBlock } from "./geometry.ts";
export type { TimelineVerdict } from "./ClipReview.tsx";

export type TimelineProps = {
  readonly track: TrackMap;
  readonly blocks: readonly TimelineBlock[];
  /** The source's reject reasons (a Board source's vocabulary), as VerdictPick reads them. */
  readonly reasons: VerdictReasons;
  /** The longest direction a verdict may carry; 0 draws no direction field. */
  readonly noteMax: number;
  readonly onVerdict: (v: TimelineVerdict) => void;
  /** The take selected on first draw; absent, the first in clock order. */
  readonly initialSelected?: string;
};

export function Timeline({ track, blocks, reasons, noteMax, onVerdict, initialSelected }: TimelineProps) {
  const ordered = useMemo(() => inOrder(blocks), [blocks]);
  const [selected, setSelected] = useState<string | null>(initialSelected ?? ordered[0]?.id ?? null);
  const { audio, videos, showing, current, t, playing, toggle, seek } = useMasterClock({ seconds: track.seconds, audioSrc: track.audio, blocks: ordered });
  const chosen = ordered.find((b) => b.id === selected) ?? null;
  const under = blockAt(ordered, t);
  const line = lineAt(track.lyrics, t);
  const section = sectionAt(track.sections, t);

  const go = (b: TimelineBlock | null) => {
    if (b === null) return;
    setSelected(b.id);
    seek(b.at);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (targetInfo(e.target as HTMLElement).editable || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === " ") toggle();
    else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      const b = step(ordered, selected, e.key === "ArrowRight" ? 1 : -1);
      go(b);
      if (b !== null) (e.currentTarget.querySelector(`[data-block="${CSS.escape(b.id)}"]`) as HTMLElement | null)?.focus();
    } else return;
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div className={s.timeline} role="group" aria-label={`${track.title} cut`} onKeyDown={onKeyDown}>
      <div className={s.top}>
        <div className={s.stage}>
          <div className={s.frame}>
            {videos.map((ref, i) => (
              <video key={i} ref={ref} className={cx(s.take, showing === i && s.on)} muted playsInline preload="auto" aria-hidden={showing !== i} data-active={showing === i ? "" : undefined} />
            ))}
            {/* eslint-disable-next-line @next/next/no-img-element -- a take's own start frame, by the production's file door */}
            {showing === null && under === null && chosen?.poster !== undefined && !playing && <img className={s.take} src={chosen.poster} alt="" />}
            {current !== null && showing !== null && <span className={s.onAir}>{current.label}</span>}
          </div>
          <div className={s.transport}>
            <button type="button" className={s.play} aria-label={playing ? "pause" : "play"} aria-keyshortcuts="Space" onClick={toggle}>
              <LibraryGlyph name={playing ? "pause" : "play"} className={s.playGlyph} />
            </button>
            <span className={s.clock}>
              <b>{timecode(t)}</b> / {timecode(track.seconds)}
            </span>
            {section !== null && <span className={s.now}>{section}</span>}
            {line !== null && <q className={s.line}>{line}</q>}
          </div>
        </div>
        {chosen !== null && <ClipReview block={chosen} reasons={reasons} noteMax={noteMax} onVerdict={onVerdict} />}
      </div>
      <Strip track={track} blocks={ordered} selected={selected} t={t} onSelect={(id) => go(ordered.find((b) => b.id === id) ?? null)} onSeek={seek} />
      {track.audio !== undefined && <audio ref={audio} src={track.audio} preload="auto" data-master="" />}
    </div>
  );
}
