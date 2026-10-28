"use client";

// THE CARD'S HERO (canvas, WP3): the answer's take as one big play mark over its waveform, with the
// playhead running while the take - or any part of it - sounds; and the thin band of the song's
// sections under it, each section a press that plays from its start. Degraded: a waveform not yet
// decoded draws the kit's dashed midline and says why; a band whose seconds are unknown is laid out
// by bars and does not jump.
import type { CSSProperties } from "react";

import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { EarButton } from "@gt/ui/components/audio/EarButton.tsx";
import { SourceTag } from "@gt/ui/components/source/SourceTag.tsx";
import { Wave } from "@gt/ui/components/wave/Wave.tsx";
import { clockOf } from "@gt/ui/components/audio/mix.ts";

import { localPlay, nodeSound, spansOf } from "../../../_host/press.ts";
import { bandCells, nodeOf } from "../model.ts";
import { playFrom, soundsUnder, usePlayhead } from "../live.ts";
import type { PieceProps } from "../registry.tsx";
import s from "./pieces.module.css";

const at = (frac: number): CSSProperties => ({ left: `${Math.max(0, Math.min(1, frac)) * 100}%` });

const keyWords = (key: string): string => (/minor/i.test(key) ? `${key}, moody` : /major/i.test(key) ? `${key}, bright` : key);

export function Hero({ node, ctx }: PieceProps<"track">) {
  const { turn, transport } = ctx;
  const title = node.title ?? "the track";
  const snd = nodeSound(turn, node);
  const stems = nodeOf(turn, "stems");
  const active = soundsUnder(transport, turn.id, node.id) || (stems !== undefined && soundsUnder(transport, turn.id, stems.id));
  const pos = usePlayhead(transport, active);
  const len = (active ? transport.duration : null) ?? ctx.lengthS;
  const frac = active && len !== null && len > 0 ? pos / len : undefined;
  const peaks = transport.peaks(node.mix.href, 140);
  const length = node.lengthS ?? node.mix.durationS;
  return (
    <section className={s.hero} aria-label={`the take ${title}`} data-provisional={node.source === "illustrative" || undefined}>
      <div className={s.heroHead}>
        <h3 className={s.heroTitle}>{title}</h3>
        {node.bpm !== undefined && <Chip label="speed" value={`${node.bpm} beats a minute`} casing="lower" />}
        {node.key !== undefined && <Chip label="key" value={keyWords(node.key)} casing="lower" />}
        {length !== undefined && <Chip label="length" value={clockOf(length)} casing="lower" />}
        {node.source !== undefined && <SourceTag kind={node.source} />}
      </div>
      <div className={s.heroPlay}>
        <EarButton big state={snd === null ? "idle" : transport.stateOf(snd.key)} name={title} onPress={() => ctx.press(localPlay(node.id))} />
        <div className={s.heroWave}>
          <Wave peaks={peaks ?? []} width={700} height={64} tone="cyan" stretch {...(frac !== undefined ? { played: frac } : {})} />
          {frac !== undefined && <span className={s.head} style={at(frac)} aria-hidden="true" />}
        </div>
      </div>
      {peaks === null && (
        <p className={s.quiet}>{ctx.renders === "missing" ? "This take's sound is not on this machine yet, so it cannot play." : "The shape of the sound appears once it has loaded."}</p>
      )}
    </section>
  );
}

const energyStep = (e: number): 0 | 1 | 2 | 3 => (e >= 0.8 ? 3 : e >= 0.55 ? 2 : e >= 0.3 ? 1 : 0);

export function Band({ node, ctx }: PieceProps<"sections">) {
  const { turn, transport } = ctx;
  const track = nodeOf(turn, "track");
  const stems = nodeOf(turn, "stems");
  const spans = spansOf(turn);
  const cells = bandCells(node.rows, spans, ctx.lengthS);
  const partsOn = stems !== undefined && soundsUnder(transport, turn.id, stems.id);
  const target = partsOn ? stems : (track ?? stems);
  const sounding = target !== undefined && soundsUnder(transport, turn.id, target.id);
  const now = sounding && spans !== null ? spans.findIndex((sp) => transport.clock >= sp.startS && transport.clock < sp.endS) : -1;
  const jump = spans !== null && target !== undefined;
  return (
    <div className={s.bandWrap} data-hero={track !== undefined || undefined}>
      <ol className={s.band} aria-label="the parts of the song, in order" data-provisional={node.source === "illustrative" || undefined}>
        {node.rows.map((r, i) => {
          const c = cells[i];
          const style: CSSProperties = c === undefined ? {} : { left: `${c.left * 100}%`, width: `${c.width * 100}%` };
          const sp = spans?.[i];
          return (
            <li key={`${r.name}-${i}`} className={s.cell} style={style} data-energy={energyStep(r.energy)} data-now={i === now || undefined}>
              {jump && sp !== undefined && target !== undefined ? (
                <button type="button" className={s.cellBtn} aria-label={`play from ${r.name}`} onClick={() => playFrom(transport, turn, target, sp.startS, r.name)}>
                  {r.name}
                </button>
              ) : (
                <span className={s.cellBtn}>{r.name}</span>
              )}
            </li>
          );
        })}
      </ol>
      {node.source === "illustrative" && (
        <p className={s.bandNote}>
          <SourceTag kind="illustrative" />
          {"this order of parts is the plan; the engine cannot play it this way yet"}
        </p>
      )}
      {!jump && <p className={s.bandNote}>{"Lengths are by bars here, so the parts cannot be jumped to."}</p>}
    </div>
  );
}
