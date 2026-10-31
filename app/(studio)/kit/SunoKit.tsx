"use client";

// THE SUNO ADVISOR'S PIECES (spark suno-advisor): the prompt card (with taste chips, with lineage,
// instrumental with no slider set), the lineage alone, the dock's verdict row (fresh, a take attached,
// off), taste rows (proposed and kept, one mid-write and one refused), and a take's facts in every
// Listen state. Literal data; copy goes through the page's one copy act, and nothing here reaches
// suno.com or files anything.
import type { ReactNode } from "react";

import type { StudioNodeOf } from "@gt/domain/audio.studio";
import type { StudioListen, StudioTakeFacts, StudioTasteLine } from "@gt/domain/audio.suno";
import { Lineage } from "@gt/ui/components/suno/Lineage.tsx";
import { SunoPromptCard } from "@gt/ui/components/suno/SunoPromptCard.tsx";
import { TakeFacts } from "@gt/ui/components/suno/TakeFacts.tsx";
import { TasteChips } from "@gt/ui/components/suno/TasteChips.tsx";
import { VerdictBar } from "@gt/ui/components/suno/VerdictBar.tsx";

import { copyText } from "../_shell/clipboard.ts";
import { Section, Spec } from "./Spec.tsx";
import k from "./kit.module.css";

const copy = async (text: string): Promise<string | null> => {
  const r = await copyText(text);
  return r.ok ? null : r.error;
};
const went = async (): Promise<string | null> => null;
const never = (): Promise<string | null> => new Promise(() => undefined);

function At({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className={k.col}>
      <span className={k.lab}>{label}</span>
      {children}
    </div>
  );
}

const lyrics = (chorus: string): string => ["[Verse]", "Streetlights count the miles for me", "Windows down, the city breathes", "", "[Chorus]", chorus, "Neon in the rain"].join("\n");

const P1: StudioNodeOf<"suno_prompt"> = {
  id: "p1", kind: "suno_prompt", promptId: "p1", name: "Neon Overpass", instrumental: false, model: "v6",
  style: "synthwave, 1980s retro, nocturnal and wistful, steady driving pulse, analog bass arpeggio, gated reverb drums, shimmering poly pads, airy female vocal, tape-saturated mix, 112 bpm, D minor",
  lyrics: lyrics("Overpass, we're glowing"), exclude: "trap hi-hats, EDM drop", settings: { weirdness: 35, styleInfluence: 70, variety: 0 },
};
const BECAUSE = "A is close, but it rushes and the voice is too breathy and buried.";
const CHANGES: NonNullable<StudioNodeOf<"suno_prompt">["changes"]> = [
  { field: "style", was: "steady driving pulse", now: "112 bpm steady half-time feel", why: "take a rushed past the tempo asked" },
  { field: "style", was: "airy female vocal", now: "clear upfront female vocal, close-mic", why: "the voice was breathy and buried" },
  { field: "exclude", now: "breathy whisper vocal", why: "fence the breathy read out" },
];
const P2: StudioNodeOf<"suno_prompt"> = {
  ...P1, id: "p2", promptId: "p2", parent: "p1", lyrics: lyrics("Overpass, we're glowing (glowing)"), exclude: "trap hi-hats, EDM drop, breathy whisper vocal",
  style: "synthwave, 1980s retro, nocturnal and wistful, 112 bpm steady half-time feel, analog bass arpeggio, gated reverb drums, shimmering poly pads, clear upfront female vocal, close-mic, tape-saturated mix, D minor",
  changes: CHANGES, because: BECAUSE,
};
const BED: StudioNodeOf<"suno_prompt"> = {
  id: "p9", kind: "suno_prompt", promptId: "p9", name: "Rain Study Bed", instrumental: true, model: "v6-mini", settings: {},
  style: "lo-fi hip hop, mellow and rainy, dusty boom-bap drums, felt piano, warm sub bass, vinyl crackle, 78 bpm", lyrics: "[Instrumental]",
};

const TASTE: readonly StudioTasteLine[] = [
  { line: "heavy autotune", lean: "dislike", since: "2026-10-21T20:14:00Z" },
  { line: "analog synth bass", lean: "like", since: "2026-10-22T19:02:00Z" },
];

const HEARD: StudioListen = {
  model: "gemini-3.8-flash", at: "2026-10-28T18:03:40Z", genre: ["synthwave", "retro pop"], mood: ["nocturnal", "wistful"], bpm: 62, key: "F major",
  vocals: { heard: true, character: "breathy female lead, set back behind the pads" },
  instruments: [
    { name: "analog bass arpeggio", role: "bass", prominence: "lead" },
    { name: "gated reverb drums", role: "drums", prominence: "supporting" },
    { name: "tape hiss", role: "texture", prominence: "background" },
  ],
  sections: [
    { name: "intro", startS: 0, endS: 14, says: "pads and arpeggio alone" },
    { name: "chorus", startS: 52, endS: 84, says: "drums open up, the vocal stays back" },
  ],
};
const TAKE: StudioTakeFacts = {
  takeId: "suno-nd-p1-a", name: "Neon Overpass (a).mp3", durationS: 167.4, href: "/api/sound/takes/none/file", promptId: "p1", clip: "a",
  measured: { bpm: 124, bpmAlt: [62, 248], key: "D minor", keyStrength: 0.71, lufs: -9.6, truePeakDb: -0.8, lra: 5.4 },
  listenUsd: 0.0062,
};
const { listenUsd: _price, ...UNPRICED } = TAKE;
const STAND_IN: StudioListen = { ...HEARD, model: "dry stand-in", standIn: true, bpm: 124, key: "D minor" };

function PromptSpecimen() {
  return (
    <Spec names={["SunoPromptCard", "Lineage"]} source="suno/SunoPromptCard.tsx · Lineage.tsx · suno.ts" wide>
      <At label="taste chip in exclude">
        <SunoPromptCard node={P1} taste={TASTE} copy={copy} />
      </At>
      <At label="a version with its parent">
        <SunoPromptCard node={P2} taste={TASTE} copy={copy} />
      </At>
      <At label="instrumental · no slider set">
        <SunoPromptCard node={BED} taste={[]} copy={copy} />
      </At>
      <At label="lineage alone">
        <Lineage changes={CHANGES} because={BECAUSE} />
      </At>
    </Spec>
  );
}

function VerdictSpecimen() {
  return (
    <Spec names={["VerdictBar"]} source="suno/VerdictBar.tsx · dock/Dock.tsx" wide>
      <At label="fresh">
        <VerdictBar promptId="p1" text="" onSend={went} />
      </At>
      <At label="a take attached">
        <VerdictBar promptId="p1" text="it rushes" onSend={went} seedFile={{ name: "Neon Overpass (a).mp3", size: 4_404_019 }} />
      </At>
      <At label="dock thinking">
        <VerdictBar promptId="p2" text="" disabled onSend={went} />
      </At>
    </Spec>
  );
}

function TasteSpecimen() {
  return (
    <Spec names={["TasteChips"]} source="suno/TasteChips.tsx" wide>
      <At label="proposed and kept">
        <TasteChips
          proposed={[
            { id: "t3", line: "clear upfront female vocal", lean: "like" },
            { id: "t5", line: "breathy whisper vocals", lean: "dislike" },
            { id: "t6", line: "Heavy autotune", lean: "dislike" },
          ]}
          kept={TASTE}
          onKeep={went}
          onDrop={went}
        />
      </At>
      <At label="mid-write · refused">
        <TasteChips
          proposed={[
            { id: "t4", line: "half-time synthwave drums", lean: "like" },
            { id: "t7", line: "festival drops", lean: "dislike" },
          ]}
          kept={[]}
          onKeep={never}
          onDrop={went}
          seed={{ "half-time synthwave drums": { kind: "pending" }, "festival drops": { kind: "refused", reason: "keep taste: the ledger refused the write (disk full)" } }}
        />
      </At>
    </Spec>
  );
}

function TakeSpecimen() {
  return (
    <Spec names={["TakeFacts"]} source="suno/TakeFacts.tsx · suno.ts" wide>
      <At label="measured · priced">
        <TakeFacts facts={TAKE} onListen={never} />
      </At>
      <At label="unpriced">
        <TakeFacts facts={UNPRICED} onListen={never} />
      </At>
      <At label="listening">
        <TakeFacts facts={TAKE} onListen={never} seed={{ kind: "working" }} />
      </At>
      <At label="refused">
        <TakeFacts facts={TAKE} onListen={never} seed={{ kind: "refused", reason: "listen: google answered 429 RESOURCE_EXHAUSTED (quota)" }} />
      </At>
      <At label="heard">
        <TakeFacts facts={{ ...TAKE, listened: HEARD }} onListen={never} />
      </At>
      <At label="stand-in">
        <TakeFacts facts={{ ...TAKE, listened: STAND_IN }} onListen={never} />
      </At>
    </Spec>
  );
}

export function SunoSection() {
  return (
    <Section id="suno">
      <PromptSpecimen />
      <VerdictSpecimen />
      <TasteSpecimen />
      <TakeSpecimen />
    </Section>
  );
}
