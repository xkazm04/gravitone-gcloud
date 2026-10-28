"use client";

// FROM A TRACK - the composer's third door: a track a person likes, dropped or chosen, read for
// what the composer can steer - its tempo, its key, and its energy over time as a row of levels
// (the shape it would paint, ./shape.ts `levelsOfContour`). Use carries those three into the seed
// and keeps the seed's words: the structure of the track, the sound of your own choosing.
import { useRef, useState } from "react";

import { Button } from "../button/Button.tsx";
import { Chip } from "../chip/Chip.tsx";
import { ErrorLine } from "../errorline/ErrorLine.tsx";
import { CapsHeading } from "../heading/CapsHeading.tsx";
import { EarButton } from "./EarButton.tsx";
import { LAYER_BANDS, percents, type Layer } from "./layers.ts";
import { clock, LEVEL_WORDS, type Level } from "./shape.ts";
import type { EarState } from "./useEar.ts";
import s from "./Ear.module.css";

export type TrackRead = {
  readonly name: string;
  readonly durationS: number;
  readonly bpm: number | null;
  readonly key: string | null;
  readonly levels: readonly Level[];
  readonly layers: readonly Layer[];
  readonly layersError: string | null;
};

export type TrackDropProps = {
  readonly busy: boolean;
  readonly read: TrackRead | null;
  readonly error: string | null;
  readonly onFile: (file: File) => void;
  readonly onUse: () => void;
  /** The lane's one ear: a layer sounds through it like any audition. */
  readonly stateOf?: (href: string) => EarState;
  readonly onPlay?: (href: string) => void;
};

export function TrackDrop({ busy, read, error, onFile, onUse, stateOf, onPlay }: TrackDropProps) {
  const pick = useRef<HTMLInputElement | null>(null);
  const [over, setOver] = useState(false);
  return (
    <section className={s.strip} aria-label="from a track" aria-busy={busy}>
      <div
        className={s.drop}
        data-over={over}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const f = e.dataTransfer.files[0];
          if (f !== undefined) onFile(f);
        }}
      >
        <input
          ref={pick}
          type="file"
          accept="audio/*,.mp3,.wav,.aif,.aiff,.flac,.ogg,.m4a"
          className={s.fileInput}
          aria-label="a track you like"
          onChange={(e) => {
            const f = e.currentTarget.files?.[0];
            if (f !== undefined) onFile(f);
            e.currentTarget.value = "";
          }}
        />
        <Button label={busy ? "Reading…" : "Choose a track"} disabled={busy} onPress={() => pick.current?.click()} />
        <span className={s.termWord}>mp3 · wav · aiff · flac</span>
      </div>
      {error !== null && <ErrorLine message={error} />}
      {read !== null && (
        <div className={s.trackRead}>
          <div className={s.stripHead}>
            <CapsHeading text={read.name} variant="section" level={4} />
            <Chip label="length" value={clock(read.durationS)} casing="lower" />
            <Chip label="tempo" value={read.bpm === null ? "unheard" : `${read.bpm} bpm`} casing="lower" />
            <Chip label="key" value={read.key ?? "unheard"} casing="lower" />
            <span className={s.grow} />
            <Button label="Use" tone="cyan" size="sm" disabled={read.bpm === null && read.key === null && read.levels.length === 0} onPress={onUse} />
          </div>
          {read.levels.length > 0 && (
            <div className={s.contour} role="img" aria-label={`energy every four bars: ${read.levels.map((l) => LEVEL_WORDS[l]).join(", ")}`}>
              {read.levels.map((l, i) => (
                <span key={i} className={s.bar} data-level={l} />
              ))}
            </div>
          )}
          {read.layers.length > 0 && stateOf !== undefined && onPlay !== undefined && <Layers layers={read.layers} stateOf={stateOf} onPlay={onPlay} />}
          {read.layersError !== null && <ErrorLine message={read.layersError} />}
        </div>
      )}
    </section>
  );
}

const AUDIBLE_SHARE = 0.01;

/** The track's four bands, each playable alone, each with its part of the track's energy. */
function Layers({ layers, stateOf, onPlay }: { readonly layers: readonly Layer[]; readonly stateOf: (href: string) => EarState; readonly onPlay: (href: string) => void }) {
  const pct = percents(layers.map((l) => l.share));
  return (
    <div className={s.layers} aria-label="layers">
      {layers.map((l, i) => {
        const words = LAYER_BANDS.find((b) => b.id === l.id)?.words ?? "";
        return (
          <div key={l.id} className={s.layer}>
            {/* Under a percent there is nothing to hear but the floor, levelled up into hiss. */}
            {l.share >= AUDIBLE_SHARE ? <EarButton state={stateOf(l.href)} name={`the ${l.id} layer`} onPress={() => onPlay(l.href)} /> : <span className={s.earGap} />}
            <span className={s.words}>
              <span className={s.plain}>{l.id}</span>
              <span className={s.termWord}>{words}</span>
            </span>
            <span className={s.termWord}>{pct[i] ?? 0}%</span>
            <span className={s.share} role="img" aria-label={`${l.id}: ${pct[i] ?? 0}% of the energy`}>
              <span className={s.shareFill} style={{ inlineSize: `${pct[i] ?? 0}%` }} />
            </span>
          </div>
        );
      })}
    </div>
  );
}
