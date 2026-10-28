"use client";

// SHAPE IT - the piece's energy over time, the composer's last row (@gt/ui shape.ts, ShapeStrip).
// None by default: Suno decides form, as it always has. A preset, a drawn column, or a sentence
// that says a length or a use ("90 seconds", "trailer", "loop") gives the piece sections, and then
// the seed carries them out two ways: Suno's lyrics field as section tags (unverified - whether
// Suno honours them on an instrumental cannot be checked without spending), and an ElevenLabs
// music_v2 plan, quoted in credits through lib/music/pricing.ts (13.75 credits per asked second,
// measured) - quoted only: the desk has no ElevenLabs producer (lib/sound/engines.ts), and DRY.
import { useState, type ReactNode } from "react";

import { atlasFor, playableBpm, sketchHref } from "@gt/ui/components/audio/atlas.ts";
import { EarButton } from "@gt/ui/components/audio/EarButton.tsx";
import type { Translation } from "@gt/ui/components/audio/lexicon.ts";
import type { Seed } from "@gt/ui/components/audio/recipe.ts";
import type { Ear } from "@gt/ui/components/audio/useEar.ts";
import { clock, columnsFor, groupSeconds, planSeconds, presetForWords, PRESETS, sectionsOf, sectionsToPlan, sunoLyricsOf, voicesAt, type Level, type Preset } from "@gt/ui/components/audio/shape.ts";
import { ShapeStrip } from "@gt/ui/components/audio/ShapeStrip.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { count } from "@gt/ui/components/tally/count.ts";

import { priceCall } from "../../../../lib/music/pricing.ts";
import s from "./audio.module.css";

/** What a piece is when nothing says otherwise: a minute and a half. */
const DEFAULT_LENGTH_S = 90;

export type ShapeState = {
  readonly node: ReactNode;
  /** Suno's lyrics field for the shape; undefined while Suno decides the form. */
  readonly lyrics: string | undefined;
  /** The ElevenLabs plan's sections as lines (name, seconds, styles); undefined with no shape. */
  readonly plan: string | undefined;
  /** A composed sentence that says a length or a use reshapes the piece. */
  readonly adopt: (t: Translation) => void;
  /** A reference track's contour becomes the painted levels. */
  readonly adoptLevels: (levels: readonly Level[]) => void;
};

export function useShape(seed: Seed, ear: Ear, can: ReadonlySet<string>): ShapeState {
  const [levels, setLevels] = useState<Level[] | null>(null);
  const bpm = playableBpm(seed.bpm);
  // The sketch: the seed's playable instruments together, over the shape, or one full four bars
  // while Suno still decides the form. Free and local; the same ear as every audition.
  const ids = [...new Set(seed.instruments.map((t) => atlasFor(t)?.id).filter((id): id is string => id !== undefined && can.has(id)))].slice(0, 5);
  const hear = (cols: readonly Level[]): ReactNode => {
    if (ids.length === 0) return null;
    const href = sketchHref(ids, cols, bpm, seed.key);
    const st = ear.stateOf(href);
    return (
      <span className={s.hear}>
        <EarButton state={st} name={cols.length === 1 ? "the instruments together" : "the shape"} onPress={() => ear.toggle(href)} big />
        <span className={s.hearWord}>{cols.length === 1 ? `together · ${clock(groupSeconds(bpm))}` : `the shape · ${clock(groupSeconds(bpm) * cols.length)}`}</span>
      </span>
    );
  };
  const startWith = (p: Preset, columns?: number): void => setLevels(p.levels(columns ?? levels?.length ?? columnsFor(DEFAULT_LENGTH_S, bpm)));

  const adopt = (t: Translation): void => {
    const preset = presetForWords(t.tokens.filter((x) => x.kind === "cue").map((x) => x.text.toLowerCase()));
    if (t.lengthS === null && preset === undefined) return;
    const fallback = PRESETS[0];
    const p = preset ?? fallback;
    if (p !== undefined) startWith(p, columnsFor(t.lengthS?.value ?? DEFAULT_LENGTH_S, playableBpm(t.seed.bpm)));
  };

  const adoptLevels = (next: readonly Level[]): void => setLevels(next.length === 0 ? null : next.slice(0, 32));

  if (levels === null) {
    const node = (
      <div className={s.row}>
        {hear([3])}
        {PRESETS.map((p) => (
          <Chip key={p.id} label={p.label} casing="lower" ghost name={`shape: ${p.label}`} onPress={() => startWith(p)} />
        ))}
      </div>
    );
    return { node, lyrics: undefined, plan: undefined, adopt, adoptLevels };
  }

  const sections = sectionsOf(levels, bpm);
  const plan = sectionsToPlan(seed, sections);
  const seconds = planSeconds(plan);
  const quote = priceCall({ op: "compose", seconds });
  const resize = (n: number): void => {
    const next = levels.slice(0, n);
    while (next.length < n) next.push(next[next.length - 1] ?? 1);
    setLevels(next);
  };
  const node = (
    <>
      <ShapeStrip levels={levels} bpm={bpm} onLevels={setLevels} voicesOf={(sec) => voicesAt(sec.level, seed.instruments)} presets={PRESETS} onPreset={(p) => startWith(p)} onLength={resize} onClear={() => setLevels(null)} />
      <div className={s.row}>
        {hear(levels)}
        <Chip label="suno" value={`${sections.length} section ${sections.length === 1 ? "tag" : "tags"} · unverified`} casing="lower" tone="amber" />{" "}
        <Chip label="elevenlabs plan" value={`${plan.sections.length} ${plan.sections.length === 1 ? "section" : "sections"} · ${Math.round(seconds)} s · ${quote.credits === undefined ? "unpriced" : `${count(Math.round(quote.credits))} credits`} · dry`} casing="lower" />
      </div>
    </>
  );
  const planText = plan.sections.map((p) => `[${p.name} · ${Math.round(p.durationMs / 1000)} s] ${p.positiveStyles.join(", ")}`).join("\n");
  return { node, lyrics: sunoLyricsOf(sections), plan: planText, adopt, adoptLevels };
}
