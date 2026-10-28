"use client";

// THE SHAPE STRIP - energy painted over four-bar columns (./shape.ts). Drag across the columns to
// paint, or focus one and use the arrows; runs of one level become named sections drawn above,
// each with its time, its bars, its level in words and the instruments the arrangement gives it.
// The seconds follow the tempo; the bars do not - a shape is a structure, not a stopwatch.
import { useRef, type PointerEvent } from "react";

import { Button } from "../button/Button.tsx";
import { Chip } from "../chip/Chip.tsx";
import { clock, LEVEL_WORDS, sectionsOf, type Level, type Preset, type Section } from "./shape.ts";
import s from "./Shape.module.css";

export type ShapeStripProps = {
  readonly levels: readonly Level[];
  readonly bpm: number;
  readonly onLevels: (next: Level[]) => void;
  /** The instruments a section's arrangement carries. */
  readonly voicesOf: (sec: Section) => readonly string[];
  readonly presets: readonly Preset[];
  readonly onPreset: (p: Preset) => void;
  /** Four bars more or fewer. */
  readonly onLength: (columns: number) => void;
  readonly onClear: () => void;
};

const clampLevel = (n: number): Level => (Math.max(0, Math.min(3, n)) as Level);

export function ShapeStrip({ levels, bpm, onLevels, voicesOf, presets, onPreset, onLength, onClear }: ShapeStripProps) {
  const painting = useRef(false);
  const sections = sectionsOf(levels, bpm);
  const total = sections.at(-1)?.endS ?? 0;
  const n = levels.length;
  const cols = { gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` };

  const paint = (e: PointerEvent<HTMLDivElement>): void => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.min(n - 1, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * n)));
    const l = clampLevel(Math.floor((1 - (e.clientY - r.top) / r.height) * 4));
    if (levels[i] === l) return;
    const next = [...levels];
    next[i] = l;
    onLevels(next);
  };

  return (
    <section className={s.shape} aria-label="shape">
      <div className={s.secs} style={cols}>
        {sections.map((sec) => (
          <div key={sec.from} className={s.sec} data-level={sec.level} style={{ gridColumn: `${sec.from + 1} / ${sec.to + 1}` }}>
            <b className={s.secName}>{sec.label}</b>
            <span className={s.secMeta}>{`${clock(sec.startS)}–${clock(sec.endS)} · ${sec.bars} bars`}</span>
            <span className={s.secMeta}>{[LEVEL_WORDS[sec.level], ...voicesOf(sec)].join(" · ")}</span>
          </div>
        ))}
      </div>
      <div
        className={s.cols}
        style={cols}
        onPointerDown={(e) => {
          painting.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          paint(e);
        }}
        onPointerMove={(e) => {
          if (painting.current) paint(e);
        }}
        onPointerUp={() => {
          painting.current = false;
        }}
        onPointerCancel={() => {
          painting.current = false;
        }}
      >
        {levels.map((l, i) => (
          <div
            key={i}
            className={s.col}
            data-level={l}
            role="slider"
            tabIndex={0}
            aria-label={`bars ${i * 4 + 1} to ${i * 4 + 4}`}
            aria-valuemin={0}
            aria-valuemax={3}
            aria-valuenow={l}
            aria-valuetext={LEVEL_WORDS[l]}
            onKeyDown={(e) => {
              const d = e.key === "ArrowUp" ? 1 : e.key === "ArrowDown" ? -1 : 0;
              if (d === 0) return;
              e.preventDefault();
              const next = [...levels];
              next[i] = clampLevel(l + d);
              onLevels(next);
            }}
          >
            <span className={s.fill} style={{ height: `${((l + 1) / 4) * 100}%` }} />
          </div>
        ))}
      </div>
      <div className={s.foot}>
        {presets.map((p) => (
          <Chip key={p.id} label={p.label} casing="lower" ghost name={`shape: ${p.label}`} onPress={() => onPreset(p)} />
        ))}
        <span className={s.grow} />
        <Button label="−4 bars" size="sm" disabled={n <= 2} onPress={() => onLength(n - 1)} />
        <span className={s.len}>{`${clock(total)} · ${n * 4} bars`}</span>
        <Button label="+4 bars" size="sm" disabled={n >= 32} onPress={() => onLength(n + 1)} />
        <Button label="Clear" size="sm" onPress={onClear} />
      </div>
    </section>
  );
}
