"use client";

// THE TIMELINE (spark character-cores WP3): a synthetic 24 s track map - three sections, a beat every half second at
// 120 bpm, four invented lyric lines - with five takes from the repo's preset clips, one per state and two judged. No
// audio: the specimen's clock is the page's own, so it plays without a file. Verdicts are held here; nothing leaves
// the specimen.

import { useState } from "react";

import type { TrackMap } from "@gt/domain/productionGraph";
import { reasonVocabulary } from "@gt/domain/source";
import { Timeline, type TimelineBlock, type TimelineVerdict } from "@gt/ui/components/timeline/Timeline.tsx";

import { Section, Spec } from "./Spec.tsx";

const BPM = 120;
const SECONDS = 24;
const TRACK: TrackMap = {
  title: "Night Ferry",
  seconds: SECONDS,
  bpm: BPM,
  beats: Array.from({ length: (SECONDS * BPM) / 60 }, (_, i) => i * (60 / BPM)),
  sections: [
    { name: "Intro", start: 0, end: 4 },
    { name: "Verse", start: 4, end: 14 },
    { name: "Chorus", start: 14, end: 22 },
    { name: "Outro", start: 22, end: 24 },
  ],
  lyrics: [
    { t: 4.5, text: "The ferry lights go under one by one" },
    { t: 9, text: "I keep the ticket folded in my glove" },
    { t: 14.2, text: "Carry me over, carry me over" },
    { t: 18.5, text: "The water knows the way" },
  ],
};

const take = (id: string, preset: string, at: number, state: TimelineBlock["state"], extra: Partial<TimelineBlock> = {}): TimelineBlock => ({
  id,
  label: id,
  at,
  dur: 2.9,
  state,
  video: `/clips/presets/${preset}.webm`,
  poster: `/presets/${preset}.jpg`,
  ...extra,
});

const BLOCKS: readonly TimelineBlock[] = [
  take("T01", "blueprint", 4, "made", { verdict: { verdict: "keep", reasons: [] } }),
  take("T02", "paper-relief", 8, "made", { verdict: { verdict: "reject", reasons: ["motion"], note: "hold on the glove, no push-in" } }),
  take("T03", "data-neon", 12, "stale"),
  take("T04", "chalk-argument", 15, "pending"),
  take("T05", "signal-ledger", 19, "failed"),
];

const SCOUT = reasonVocabulary("scout");
const VIDEO_REASONS = { ...SCOUT, list: ["craft", "motion", "style"] };

export function TimelineSection() {
  const [blocks, setBlocks] = useState(BLOCKS);
  const judge = (v: TimelineVerdict) =>
    setBlocks((all) =>
      all.map((b) => {
        if (b.id !== v.node) return b;
        const { verdict: _was, ...rest } = b;
        return v.verdict === null ? rest : { ...rest, verdict: { verdict: v.verdict, reasons: v.reasons, ...(v.note === undefined ? {} : { note: v.note }) } };
      }),
    );
  return (
    <Section id="timeline">
      <Spec names={["Timeline"]} source="spark character-cores WP3 · music-video-production segment-on-the-master-clock" wide>
        <Timeline track={TRACK} blocks={blocks} reasons={VIDEO_REASONS} noteMax={SCOUT.noteMax} onVerdict={judge} initialSelected="T02" />
      </Spec>
    </Section>
  );
}
