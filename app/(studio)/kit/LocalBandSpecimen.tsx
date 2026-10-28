"use client";

// LOCAL BAND SPECIMEN — /kit registration for LocalBandStudio (@gt/ui/components/audio/LocalBandStudio.tsx)
// plus shared audio specimen helpers keeping AudioKit.tsx under 400 lines.

import { useState } from "react";

import { batchProblem, blankBatch, type BatchForm as BatchFormState } from "@gt/ui/components/audio/batch.ts";
import { BatchForm } from "@gt/ui/components/audio/BatchForm.tsx";
import { briefCheck } from "@gt/ui/components/audio/brief.ts";
import { LocalBandStudio } from "@gt/ui/components/audio/LocalBandStudio.tsx";
import type { LocalInstrumentView, LocalTakeView, LocalTemplateView } from "@gt/ui/components/audio/localBand.ts";
import { readRubric, type Ratings } from "@gt/ui/components/audio/rubric.ts";
import { RubricCard } from "@gt/ui/components/audio/Rubric.tsx";
import { cellKey, type Facet, type Sort, type StrengthCell } from "@gt/ui/components/audio/strengths.ts";
import { StrengthHead, StrengthTable } from "@gt/ui/components/audio/Strengths.tsx";

import { inert } from "./ContractHooks.tsx";
import { Row, Spec } from "./Spec.tsx";

export const BRIEF_MUSIC = briefCheck("music", { tempoBpm: 108, key: "G major", durationS: 45 }, { tempoBpm: 54.2, key: "E minor", durationS: 44.6 });
export const BRIEF_MISSED = briefCheck("music", { tempoBpm: 120, key: "D minor", durationS: 60 }, { tempoBpm: 96, key: "D minor", durationS: 74 });
export const BRIEF_SFX = briefCheck("sfx", { tempoBpm: null, key: null, durationS: 2.5 }, null);
const SFX_RUBRIC = readRubric({ kind: "sfx", loop: true, verdict: "rejected", ratings: { event_match: 4 } });
const NO_DIMS: readonly string[] = [];
const BUSY_DIMS: readonly string[] = ["event_match"];

export function RubricSpecimen({ silence }: { readonly silence: string }) {
  const [ratings, setRatings] = useState<Ratings>({ melody: 8, instrument_choice: 7, instrument_quality: null });
  const [focused, setFocused] = useState(false);
  const rubric = readRubric({ kind: "music", loop: null, verdict: "kept", ratings });
  return (
    <Spec names={["RubricCard"]} source="audio/Rubric.tsx · rubric.ts · v1 app/playground/shared/Rubric.tsx" wide>
      <RubricCard
        take={{ id: "rt-1", title: "Whisper network", provider: "elevenlabs", verdict: "kept", src: silence, rubric, brief: BRIEF_MUSIC }}
        focused={focused}
        dim={2}
        playing={false}
        busy={NO_DIMS}
        onFocus={() => setFocused(true)}
        onPlay={inert}
        onScore={(d, v) => setRatings((r) => ({ ...r, [d]: v }))}
      />
      <RubricCard
        take={{ id: "rt-2", title: "Door slam loop", provider: "elevenlabs", verdict: "rejected", src: null, rubric: SFX_RUBRIC, brief: BRIEF_SFX }}
        focused={false}
        dim={0}
        playing={false}
        busy={BUSY_DIMS}
        onFocus={inert}
        onPlay={inert}
        onScore={inert}
      />
    </Spec>
  );
}

const SPECIMEN_TEMPLATES: readonly LocalTemplateView[] = [
  {
    id: "chill-hiphop",
    label: "Chill Lo-Fi Groove",
    plainIntent: "Relaxed head-nod beat with warm electric keys and thumb bell",
    spec: {
      v: 1,
      title: "Midnight Study Loop",
      style: "chill-hiphop",
      seed: 108,
      tempoBpm: 84,
      key: "A minor",
      loop: false,
      controls: { density: 0.55, brightness: 0.45, lift: 0.7, swing: 0.18, humanise: 0.35 },
      sections: [
        { name: "intro", bars: 2, energy: 0.35 },
        { name: "lift", bars: 4, energy: 0.85 },
        { name: "outro", bars: 2, energy: 0.4 },
      ],
      tracks: [
        { role: "drums", instrument: "kit-808-warm" },
        { role: "bass", instrument: "vital-sub-bass" },
        { role: "chords", instrument: "sample-lofi-keys" },
        { role: "lead", instrument: "sample-ikembe-bell" },
      ],
    },
  },
];

const SPECIMEN_CATALOG: readonly LocalInstrumentView[] = [
  { id: "kit-808-warm", name: "808 Boom-Bap Kit", role: "drums", engine: "sample-pack", plainLabel: "Deep sub kick, crisp snare, warm vinyl hats", character: "warm", licence: "Local DAW sample pack", status: "ready", lufsAtVel100: -15.4, loadMs: 12, renderMs: 38, deterministic: true, refusalReason: null },
  { id: "vital-sub-bass", name: "Vital Warm Sub Bass", role: "bass", engine: "vital-vst3", plainLabel: "Deep, smooth low-end anchor from Vital synth", character: "deep", licence: "Vital Audio EULA", status: "ready", lufsAtVel100: -14.2, loadMs: 2960, renderMs: 240, deterministic: true, refusalReason: null },
  { id: "sample-lofi-keys", name: "Lo-Fi Electric Keys", role: "chords", engine: "sample-pack", plainLabel: "Warm vintage electric piano with gentle warble", character: "warm", licence: "Local DAW sample pack", status: "ready", lufsAtVel100: -15.6, loadMs: 19, renderMs: 50, deterministic: true, refusalReason: null },
  { id: "sample-ikembe-bell", name: "Kalimba Thumb Bell", role: "lead", engine: "sample-pack", plainLabel: "Organic metallic thumb piano with woody resonance", character: "warm", licence: "Local DAW sample pack", status: "ready", lufsAtVel100: -16.4, loadMs: 15, renderMs: 42, deterministic: true, refusalReason: null },
  { id: "minigrand-vst3", name: "AIR MiniGrand VST3", role: "chords", engine: "vital-vst3", plainLabel: "Acoustic piano plugin; refused by silent render gate", character: "bright", licence: "AIR Music Tech EULA", status: "refused", lufsAtVel100: null, loadMs: 1420, renderMs: 180, deterministic: true, refusalReason: "instrument render is silent (note-on C4 vel 100 measured null LUFS)" },
  { id: "hybrid-vst3", name: "AIR Hybrid 3 VST3", role: "lead", engine: "vital-vst3", plainLabel: "Subtractive synth plugin; refused by load and licence gate", character: "punchy", licence: "", status: "refused", lufsAtVel100: -19.21, loadMs: 77600, renderMs: 420, deterministic: false, refusalReason: "cold load 77.6 s exceeds 5.0 s ceiling and licence note is empty" },
];

const SPECIMEN_TAKES: readonly LocalTakeView[] = [
  {
    id: "st-local01",
    title: "Midnight Study Loop",
    tempoBpm: 84,
    key: "A minor",
    durationS: 23.36,
    loop: false,
    lufs: -14.0,
    truePeakDb: -2.39,
    mixUrl: "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=",
    rppUrl: "#rpp",
    peaks: [0.3, 0.5, 0.7, 0.85, 0.9, 0.75, 0.4, 0.2],
    reusedRoles: ["drums", "bass", "chords"],
    renderedRoles: ["lead"],
    totalRenderMs: 680,
    bitIdentical: true,
    maxAbsDiff: 0,
    mixSha256: "b62003db966789abcdef",
    triageFlagged: 0,
    triageFindings: [
      { check: "clipping", verdict: "pass", value: 0, unit: "samples" },
      { check: "true-peak-over", verdict: "pass", value: -2.39, unit: "dBTP" },
      { check: "loudness-range", verdict: "pass", value: -14.0, unit: "LUFS" },
      { check: "tempo-instability", verdict: "pass", value: 0.05, unit: "bpm" },
      { check: "section-boundary", verdict: "pass", value: 0.1, unit: "s" },
    ],
    stems: [
      { role: "drums", instrument: "kit-808-warm", instrumentName: "808 Boom-Bap Kit", source: "sample-pack:ableton+fl", sha256: "70c1be08a1", reused: true, noteCount: 96, renderMs: 0, integratedLufs: -16.8, truePeakDb: -3.1, gainDb: -1.5, pan: 0, muted: false, solo: false, audioUrl: "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=", midiUrl: "#mid-drums" },
      { role: "bass", instrument: "vital-sub-bass", instrumentName: "Vital Warm Sub Bass", source: "vital-vst3:Vital.vst3", sha256: "9b44fe12c3", reused: true, noteCount: 24, renderMs: 0, integratedLufs: -15.9, truePeakDb: -2.8, gainDb: -2.0, pan: 0, muted: false, solo: false, audioUrl: "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=", midiUrl: "#mid-bass" },
      { role: "chords", instrument: "sample-lofi-keys", instrumentName: "Lo-Fi Electric Keys", source: "sample-pack:Lo Fi Voodoo E2.aif", sha256: "3d81ca77e2", reused: true, noteCount: 48, renderMs: 0, integratedLufs: -17.4, truePeakDb: -4.2, gainDb: -3.0, pan: -0.1, muted: false, solo: false, audioUrl: "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=", midiUrl: "#mid-chords" },
      { role: "lead", instrument: "sample-ikembe-bell", instrumentName: "Kalimba Thumb Bell", source: "sample-pack:Ikembe C3.aif", sha256: "1a99df04b8", reused: false, noteCount: 28, renderMs: 42, integratedLufs: -18.2, truePeakDb: -4.5, gainDb: -3.5, pan: 0.12, muted: false, solo: false, audioUrl: "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=", midiUrl: "#mid-lead" },
    ],
    spec: SPECIMEN_TEMPLATES[0]!.spec,
    stage: null,
    verdict: "unjudged",
  },
];

export function LocalBandSpecimen() {
  return (
    <Spec names={["LocalBandStudio"]} source="audio/LocalBandStudio.tsx · D6 + A2 + C6 local band">
      <LocalBandStudio
        templates={SPECIMEN_TEMPLATES}
        catalog={SPECIMEN_CATALOG}
        takes={SPECIMEN_TAKES}
        onRender={inert}
        onReceipt={inert}
        onSwapStem={inert}
        onAudition={inert}
        onPromote={inert}
      />
    </Spec>
  );
}

const cell = (provider: StrengthCell["provider"], facet: Facet, value: string, n: number, kept: number, meanScore: number | null, topDefect: string | null = null): StrengthCell => ({
  kind: "music",
  provider,
  facet,
  value,
  n,
  kept,
  rejected: n - kept,
  meanScore,
  topDefect,
});

const LOFI_SUNO = cell("suno", "genre", "lo-fi", 9, 7, 7.4, "tempo-instability");
const CHAMBER_SUNO = cell("suno", "genre", "chamber", 2, 1, null);
const CELLS: readonly StrengthCell[] = [
  cell("elevenlabs", "genre", "chamber", 6, 5, 7.6),
  CHAMBER_SUNO,
  cell("elevenlabs", "genre", "lo-fi", 4, 1, 4.2, "broken-ending"),
  LOFI_SUNO,
  cell("elevenlabs", "genre", "ambient", 1, 1, null),
  cell("elevenlabs", "mood", "tense", 3, 2, 6.8),
  cell("suno", "instrument", "pizzicato", 5, 2, 5.1, "thin-mix"),
  cell("elevenlabs", "technique", "tag-list", 7, 3, 5.9, "ignored-exclude"),
];

export function StrengthSpecimen() {
  const [facet, setFacet] = useState<Facet>("genre");
  const [sort, setSort] = useState<Sort>({ key: "value", provider: null, dir: "asc" });
  const [picked, setPicked] = useState<StrengthCell>(LOFI_SUNO);
  return (
    <Spec names={["StrengthTable", "StrengthHead"]} source="audio/Strengths.tsx · strengths.ts · v1 app/playground/triage/Strengths.tsx" wide>
      <StrengthTable kind="music" cells={CELLS} facet={facet} sort={sort} picked={cellKey(picked)} onFacet={setFacet} onSort={setSort} onPick={setPicked} />
      <Row label="measured">
        <StrengthHead cell={picked} />
      </Row>
      <Row label="waiting">
        <StrengthHead cell={CHAMBER_SUNO} />
      </Row>
    </Spec>
  );
}

export function BatchSpecimen() {
  const [music, setMusic] = useState<BatchFormState>(() => ({
    ...blankBatch("music"),
    prompt: "Playful conspiratorial pizzicato, a caper in miniature.",
    genre: "chamber",
    mood: "tense",
    instrument: "pizzicato",
    negative: "vocals",
    tempoBpm: 108,
    key: "G major",
    technique: ["duration-and-tempo-locking"],
  }));
  const [sfx, setSfx] = useState<BatchFormState>(() => blankBatch("sfx"));
  return (
    <Spec names={["BatchForm"]} source="audio/BatchForm.tsx · batch.ts · v1 shared/price.tsx" wide>
      <BatchForm kind="music" form={music} onForm={setMusic} problem={batchProblem("music", music)} engine="elevenlabs" busy={false} onPrice={inert} />
      <BatchForm kind="sfx" form={sfx} onForm={setSfx} problem={batchProblem("sfx", sfx)} engine="elevenlabs" busy={false} onPrice={inert} />
    </Spec>
  );
}
