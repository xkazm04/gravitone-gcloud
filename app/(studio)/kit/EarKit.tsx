"use client";

// STEER BY EAR'S PARTS (2026-10-28): the sentence and its echo, the audition's play mark, and the
// strip of instruments heard in turn - over literal data. Nothing a control does here leaves the
// specimen: a play mark only moves through its states, no audition is requested.
import { useMemo, useState } from "react";

import { ATLAS, atlasById, type AtlasEntry } from "@gt/ui/components/audio/atlas.ts";
import { DuelCard } from "@gt/ui/components/audio/DuelCard.tsx";
import { AXES, type Answer } from "@gt/ui/components/audio/duel.ts";
import { EarButton } from "@gt/ui/components/audio/EarButton.tsx";
import { EarStrip } from "@gt/ui/components/audio/EarStrip.tsx";
import { translate } from "@gt/ui/components/audio/lexicon.ts";
import { SayIt } from "@gt/ui/components/audio/SayIt.tsx";
import { PRESETS, voicesAt, type Level } from "@gt/ui/components/audio/shape.ts";
import { ShapeStrip } from "@gt/ui/components/audio/ShapeStrip.tsx";
import { TrackDrop } from "@gt/ui/components/audio/TrackDrop.tsx";
import type { EarState } from "@gt/ui/components/audio/useEar.ts";

import { inert } from "./ContractHooks.tsx";
import { Row, Section, Spec } from "./Spec.tsx";

// Silent sources: a specimen shows the row, not a track.
const KIT_LAYERS = ([["low", 0.52], ["body", 0.33], ["bite", 0.11], ["air", 0.04]] as const).map(([id, share]) => ({ id, share, href: `data:audio/wav;base64,${id}` }));
const NONE: ReadonlySet<number> = new Set();
const LEARNED = [
  { term: "slap bass", plain: "snappy · funky" },
  { term: "rhodes", plain: "warm · bell-soft" },
];
const BASSES = ATLAS.filter((e) => e.role === "bass" || e.role === "synth");

function SaySpecimen() {
  const [v, setV] = useState("sad but hopeful lullaby for a rave, no drums");
  const heard = useMemo(() => translate(v), [v]);
  const [lit, setLit] = useState<ReadonlySet<number>>(NONE);
  return (
    <Spec names={["SayIt"]} source="audio/SayIt.tsx · lexicon.ts" wide>
      <SayIt value={v} onChange={setV} heard={heard} lit={lit} onTrace={(t) => setLit(t === null ? NONE : new Set(t))} onCompose={inert} onSpare={inert} learned={LEARNED} onLearned={(t) => setV((cur) => `${cur}, ${t}`)} />
    </Spec>
  );
}

function StripSpecimen() {
  const [sounding, setSounding] = useState<string | null>("slap-bass");
  const [blind, setBlind] = useState(false);
  const now = atlasById("upright-bass");
  const stateOf = (e: AtlasEntry): EarState => (e.id === sounding ? "playing" : "idle");
  if (now === undefined) return null;
  return (
    <Spec names={["EarStrip"]} source="audio/EarStrip.tsx · atlas.ts swapsFor" wide>
      <Row label="swap">
        <EarStrip title="swap upright bass" now={now} candidates={BASSES.filter((e) => e.id !== now.id)} stateOf={stateOf} onPlay={(e) => setSounding(e.id === sounding ? null : e.id)} onPick={inert} onClose={inert} blind={blind} onBlind={setBlind} />
      </Row>
      <Row label="blind add">
        <EarStrip title="add by ear" candidates={ATLAS.filter((e) => e.role === "keys")} stateOf={() => "idle"} onPlay={inert} onPick={inert} onClose={inert} blind onBlind={inert} />
      </Row>
    </Spec>
  );
}

const VOICES = ["rhodes", "upright bass", "brushed drums"];

function DuelSpecimen() {
  const [answers, setAnswers] = useState<Readonly<Record<string, Answer>>>({ pace: "a", colour: "skip" });
  const done: Readonly<Record<string, Answer>> = Object.fromEntries(AXES.map((x, i) => [x.id, i === AXES.length - 1 ? "skip" : i % 3 === 1 ? "b" : "a"]));
  const href = (x: { readonly ids: readonly string[] }): string => x.ids.join("+");
  return (
    <Spec names={["DuelCard"]} source="audio/DuelCard.tsx · duel.ts" wide>
      <Row label="a pair">
        <DuelCard axes={AXES} answers={answers} hrefOf={href} stateOf={() => "idle"} onPlay={inert} onAnswer={(axis, a) => setAnswers((m) => ({ ...m, [axis]: a }))} onUse={inert} onAgain={() => setAnswers({})} />
      </Row>
      <Row label="decided">
        <DuelCard axes={AXES} answers={done} hrefOf={href} stateOf={() => "idle"} onPlay={inert} onAnswer={inert} onUse={inert} onAgain={inert} />
      </Row>
    </Spec>
  );
}

function ShapeSpecimen() {
  const [levels, setLevels] = useState<Level[]>([0, 0, 2, 3, 3, 1, 3, 0]);
  return (
    <Spec names={["ShapeStrip"]} source="audio/ShapeStrip.tsx · shape.ts" wide>
      <ShapeStrip
        levels={levels}
        bpm={92}
        onLevels={setLevels}
        voicesOf={(sec) => voicesAt(sec.level, VOICES)}
        presets={PRESETS}
        onPreset={(p) => setLevels(p.levels(levels.length))}
        onLength={(n) => setLevels((l) => (n < l.length ? l.slice(0, n) : [...l, l[l.length - 1] ?? 1]))}
        onClear={inert}
      />
    </Spec>
  );
}

export function EarSection() {
  return (
    <Section id="ear">
      <SaySpecimen />
      <Spec names={["EarButton"]} source="audio/EarButton.tsx · AudioPreview PlayMark">
        <Row label="idle">
          <EarButton state="idle" name="rhodes" onPress={inert} />
        </Row>
        <Row label="loading">
          <EarButton state="loading" name="rhodes" onPress={inert} />
        </Row>
        <Row label="playing">
          <EarButton state="playing" name="rhodes" onPress={inert} big />
        </Row>
      </Spec>
      <StripSpecimen />
      <ShapeSpecimen />
      <DuelSpecimen />
      <Spec names={["TrackDrop"]} source="audio/TrackDrop.tsx · lib/audio/reference.ts" wide>
        <Row label="read">
          <TrackDrop busy={false} read={{ name: "night-drive.mp3", durationS: 214, bpm: 104, key: "F minor", levels: [0, 1, 1, 2, 3, 3, 1, 3, 3, 0], layers: KIT_LAYERS, layersError: null }} error={null} onFile={inert} onUse={inert} stateOf={() => "idle"} onPlay={inert} />
        </Row>
        <Row label="refused">
          <TrackDrop busy={false} read={null} error="ffmpeg decode: Invalid data found when processing input" onFile={inert} onUse={inert} />
        </Row>
      </Spec>
    </Section>
  );
}
