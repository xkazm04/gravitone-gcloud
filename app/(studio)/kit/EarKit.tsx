"use client";

// STEER BY EAR'S PARTS (2026-10-28): the sentence and its echo, the audition's play mark, and the
// strip of instruments heard in turn - over literal data. Nothing a control does here leaves the
// specimen: a play mark only moves through its states, no audition is requested.
import { useMemo, useState } from "react";

import { ATLAS, atlasById, type AtlasEntry } from "@gt/ui/components/audio/atlas.ts";
import { EarButton } from "@gt/ui/components/audio/EarButton.tsx";
import { EarStrip } from "@gt/ui/components/audio/EarStrip.tsx";
import { translate } from "@gt/ui/components/audio/lexicon.ts";
import { SayIt } from "@gt/ui/components/audio/SayIt.tsx";
import type { EarState } from "@gt/ui/components/audio/useEar.ts";

import { inert } from "./ContractHooks.tsx";
import { Row, Section, Spec } from "./Spec.tsx";

const NONE: ReadonlySet<number> = new Set();
const BASSES = ATLAS.filter((e) => e.role === "bass" || e.role === "synth");

function SaySpecimen() {
  const [v, setV] = useState("something like a heist movie but chill, no drums");
  const heard = useMemo(() => translate(v), [v]);
  const [lit, setLit] = useState<ReadonlySet<number>>(NONE);
  return (
    <Spec names={["SayIt"]} source="audio/SayIt.tsx · lexicon.ts" wide>
      <SayIt value={v} onChange={setV} heard={heard} lit={lit} onTrace={(t) => setLit(t === null ? NONE : new Set(t))} onCompose={inert} onSpare={inert} />
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
    </Section>
  );
}
