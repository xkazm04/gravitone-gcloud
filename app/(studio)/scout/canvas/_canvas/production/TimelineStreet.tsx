"use client";

// THE TIMELINE STREET - the production's street (the river of stations and the film strip it was drawn beside were
// retired 2026-11-20, WP9). The track's master clock IS the street: its sections, beats (every fourth a bar) and lyric
// lines run along the bottom, and the stations stand above it as lanes - the look's plates where each is first used,
// the cast across the whole track, every keyframe at the moment it plays, the takes and the cut as spans. A stale
// keyframe sits where it plays, so a swap's damage reads as a stretch of the song. The ripple runs along the clock.
// Every node on it is a press that opens the node's overlay (S1.5 WP7): the keyframes, the plates and the look, the
// takes, the cut; the cast opens the core picker. The street's rows never grow.
//
// The ruler is drawn here, minimally: @gt/ui's track-locked Timeline (spark character-cores WP3) did not exist when this
// street was drawn. When it lands, this ruler is the one to replace with it (a recorded duplication).

import type { CSSProperties } from "react";

import type { Production, ProductionNode } from "@gt/domain/productionGraph";

import { cx } from "../ui/kit.tsx";
import { caption, clock, countLine, counts, lanesOf, NODE_STATE, nodeName, posterOf, rulerOf, STATION_NAME, type Lane } from "./model.ts";
import { Tile } from "./Tile.tsx";
import v from "./timeline.module.css";

export type StreetProps = {
  readonly p: Production;
  readonly focus: string | null;
  /** The ids the last accept made stale, while the ripple plays. */
  readonly rippling: ReadonlySet<string> | null;
  readonly onPick: (n: ProductionNode) => void;
  /** The cast's door: the core picker. */
  readonly onSwap: () => void;
};

/** The ripple runs the clock's length in this long. */
const RUN_MS = 1500;
const LYRIC_GAP = 0.085;
const pct = (x: number): string => `${(x * 100).toFixed(3)}%`;

function LaneRow({ lane, props }: { readonly lane: Lane; readonly props: StreetProps }) {
  const { p, focus, rippling, onPick } = props;
  const name = STATION_NAME[lane.station];
  const c = counts(lane.items.map((i) => i.node));
  const ripple = (id: string, x: number): number | null => (rippling?.has(id) === true ? Math.round(x * RUN_MS) : null);
  return (
    <>
      <div className={v.lname} aria-hidden="true">
        <span className={v.h3}>{name}</span>
      </div>
      <div className={cx(v.lane, v[lane.station === "keyframe" ? "kf" : lane.station])} role="group" aria-label={`${name}, ${countLine(c)}`}>
        {lane.items.map(({ node: n, x0, x1: end }, i) => {
          // A take overlaps the next one's start (the takes chain): drawn up to it, so no take hides the one before.
          const x1 = lane.station === "clip" ? Math.min(end, lane.items[i + 1]?.x0 ?? end) : end;
          if (lane.station === "cast") {
            return (
              <button key={n.id} type="button" className={cx(v.span, n.state !== "made" && v[n.state])} style={{ left: 0, right: 0 }} onClick={props.onSwap} aria-label={`${p.cast.name}, cast across the track, ${NODE_STATE[n.state].word}; swap`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.cast.portrait} alt="" />
                {p.cast.name}
              </button>
            );
          }
          if (n.id === "look") {
            return (
              <button key={n.id} type="button" className={cx(v.span, v.lookSpan, n.state !== "made" && v[n.state], focus === n.id && v.spanOn)} onClick={() => onPick(n)} aria-label={nodeName(n)} data-node={n.id}>
                {n.label}
              </button>
            );
          }
          if (lane.station === "clip" || lane.station === "cut") {
            const style: CSSProperties = { left: pct(x0), width: pct(Math.max(0.004, x1 - x0)) };
            if (lane.station === "cut") {
              return (
                <button key={n.id} type="button" className={cx(v.span, n.state !== "made" && v[n.state], focus === n.id && v.spanOn)} style={style} onClick={() => onPick(n)} aria-label={nodeName(n)} data-node={n.id}>
                  {n.label} · {clock(n.dur ?? 0)}
                  {n.state !== "made" && <b className={v.amberText}>{NODE_STATE[n.state].word}</b>}
                </button>
              );
            }
            return (
              <span key={n.id} className={v.clipSpan} style={style}>
                <Tile n={n} on={focus === n.id} ripple={ripple(n.id, x0)} caption={`${n.label} ${clock(n.at ?? 0)}`} poster={posterOf(p, n)} onPick={onPick} />
              </span>
            );
          }
          return (
            <span key={n.id} className={v.at} style={{ left: `calc(${pct(x0)} - ${lane.station === "look" ? 33 : 27}px)` }}>
              <Tile n={n} on={focus === n.id} ripple={ripple(n.id, x0)} caption={caption(n)} compact onPick={onPick} />
            </span>
          );
        })}
      </div>
    </>
  );
}

function Ruler({ props }: { readonly props: StreetProps }) {
  const t = props.p.track;
  const r = rulerOf(t);
  // A lyric line's words where they fit: at least LYRIC_GAP of the track after the last one shown.
  const shown = new Set<number>();
  let last = -1;
  r.lyrics.forEach((l, i) => {
    if (last < 0 || l.x - last >= LYRIC_GAP) {
      shown.add(i);
      last = l.x;
    }
  });
  return (
    <>
      <div className={v.lname} aria-hidden="true">
        <span className={v.h3}>Track</span>
      </div>
      <div className={v.ruler} role="img" aria-label={`${t.title}, ${clock(t.seconds)} at ${Math.round(t.bpm)} bpm: ${t.sections.map((s) => `${s.name} ${clock(s.start)}`).join(", ")}`}>
        {r.sections.map((s, i) => (
          <span key={`s${i}`} className={v.sec} style={{ left: pct(s.x0), width: pct(s.x1 - s.x0) }}>
            {s.name}
          </span>
        ))}
        {r.beats.map((b, i) => (
          <i key={`b${i}`} className={cx(v.beat, b.bar && v.bar)} style={{ left: pct(b.x) }} />
        ))}
        {r.lyrics.map((l, i) => (
          <span key={`l${i}`}>
            <i className={v.lyric} style={{ left: pct(l.x) }} />
            {shown.has(i) && (
              <span className={v.lyricText} style={{ left: pct(l.x) }}>
                {l.text}
              </span>
            )}
          </span>
        ))}
        {r.marks.map((m) => (
          <span key={m.label} className={v.clockMark} style={{ left: pct(m.x) }}>
            {m.label}
          </span>
        ))}
      </div>
    </>
  );
}

export function TimelineStreet(props: StreetProps) {
  const lanes = lanesOf(props.p).reverse();
  return (
    <div className={v.tl}>
      {lanes.map((lane) => (
        <LaneRow key={lane.station} lane={lane} props={props} />
      ))}
      <Ruler props={props} />
    </div>
  );
}
