"use client";

// THE AUDIO PARTS (Phase 5, L52; owner ruling 2026-10-17: v1's Recipe Book rebuilt in the kit).
// Two families over literal data: what the Library detail draws for an audio item (preview,
// prompt, measured) - the prototype's library.js :512-554 - and the Audio lane composer's parts
// (terms, composer, variations, drafts, references), which the prototype never drew; their
// source is v1 app/library/audio. Nothing a control does here leaves the specimen.

import { useMemo, useState } from "react";

import { AudioMeasures } from "@gt/ui/components/audio/AudioMeasures.tsx";
import { AudioPreview, PlayMark } from "@gt/ui/components/audio/AudioPreview.tsx";
import { AudioPrompt } from "@gt/ui/components/audio/AudioPrompt.tsx";
import { rowsFor, stackVersions, type Stack } from "@gt/ui/components/audio/arrange.ts";
import { ArrangeBoard } from "@gt/ui/components/audio/ArrangeBoard.tsx";
import { EngineList, type EngineRow } from "@gt/ui/components/audio/EngineList.tsx";
import { LabelPrompt } from "@gt/ui/components/audio/LabelPrompt.tsx";
import { RoundTrip } from "@gt/ui/components/audio/RoundTrip.tsx";
import { RowFoot, RowHead } from "@gt/ui/components/audio/RowHead.tsx";
import { TakeCard, type CardTake } from "@gt/ui/components/audio/TakeCard.tsx";
import { DraftList, type DraftRow } from "@gt/ui/components/audio/DraftList.tsx";
import { ReferenceList, type ReferenceRow } from "@gt/ui/components/audio/ReferenceList.tsx";
import { handsOf, termId, type Hand, type Seed, type Term } from "@gt/ui/components/audio/recipe.ts";
import { SeedComposer } from "@gt/ui/components/audio/SeedComposer.tsx";
import { TermRail } from "@gt/ui/components/audio/TermRail.tsx";
import { VariationList } from "@gt/ui/components/audio/VariationList.tsx";
import { variationsOfSeed } from "@gt/ui/components/audio/variations.ts";

import { inert } from "./ContractHooks.tsx";
import { Row, Section, Spec } from "./Spec.tsx";

/** One second of silence as a WAV data URL: a source the browser can open, so the play control is real. */
function silentWav(): string {
  const rate = 8000;
  const n = rate;
  const b = new Uint8Array(44 + n);
  const v = new DataView(b.buffer);
  const str = (o: number, x: string): void => {
    for (let i = 0; i < x.length; i++) b[o + i] = x.charCodeAt(i);
  };
  str(0, "RIFF");
  v.setUint32(4, 36 + n, true);
  str(8, "WAVEfmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate, true);
  v.setUint16(32, 1, true);
  v.setUint16(34, 8, true);
  str(36, "data");
  v.setUint32(40, n, true);
  b.fill(128, 44);
  let bin = "";
  for (const x of b) bin += String.fromCharCode(x);
  return `data:audio/wav;base64,${btoa(bin)}`;
}
const SILENCE = silentWav();

const PEAKS = Array.from({ length: 64 }, (_, i) => Math.round((0.35 + 0.5 * Math.abs(Math.sin(i * 0.37)) * (1 - i / 90)) * 100) / 100);

const t = (facet: Term["facet"], term: string, n: number, kept: number, over: Partial<Term> = {}): Term => ({
  id: termId(facet, term),
  term,
  facet,
  n,
  kept,
  rejected: n - kept,
  keepRate: n === 0 ? null : kept / n,
  stance: null,
  phrase: "",
  topDefect: null,
  ...over,
});

const TERMS: readonly Term[] = [
  t("genre", "chamber", 6, 5, { stance: "prefer" }),
  t("genre", "lo-fi", 9, 7, { topDefect: "broken-ending" }),
  t("mood", "light", 4, 1, { stance: "avoid" }),
  t("mood", "tense", 3, 3),
  t("instrument", "pizzicato", 6, 5, { phrase: "plucked strings" }),
  t("instrument", "kazoo", 5, 0),
  t("instrument", "cello", 4, 4, { stance: "prefer" }),
  t("sfxCategory", "whoosh", 3, 2),
];

const SEED: Seed = { genres: ["chamber"], moods: ["light"], instruments: ["pizzicato", "kazoo"], bpm: 108, key: "G major", avoid: [] };

const DRAFTS: readonly DraftRow[] = [
  { id: "sp-a", title: "Whisper network", style: "chamber, tense, plucked strings, cello, 108 bpm, G major", exclude: "vocals", origin: "custom", state: "running", detail: "creating v6-wild", at: "2026-10-16T09:12:00.000Z", clips: [] },
  { id: "sp-b", title: "Harbor glass", style: "ambient, warm, felt piano, 72 bpm", origin: "llm", state: "done", at: "2026-10-16T08:40:00.000Z", clips: [{ id: "sc-1", title: "Harbor glass", model: "v6", verdict: "keep" }, { id: "sc-2", title: "Harbor glass", model: "v6-wild", verdict: null }] },
  { id: "sp-c", title: "Breakwater", style: "dub, melodica, tape echo", origin: "riff", state: "failed", detail: "Suno: the Create button never enabled (credits exhausted?)", at: "2026-10-16T07:05:00.000Z", clips: [] },
];

const REFS: readonly ReferenceRow[] = [
  {
    id: "ref-french79-4807",
    artist: "French 79",
    title: "4807",
    truth: { tempo: 115, key: "F major" },
    methods: [
      { id: "librosa", label: "librosa", tempo: 112.3, key: "G minor" },
      { id: "fft_autocorr", label: "fft autocorr", tempo: 117.5, key: "G minor" },
    ],
    kept: 3,
    rejected: 1,
  },
];

const card = (id: string, title: string, stage: CardTake["stage"], group: string | null, over: Partial<CardTake> = {}): CardTake => ({
  id,
  title,
  kind: "music",
  stage,
  group,
  label: null,
  parentId: null,
  createdAt: "2026-10-16T09:00:00.000Z",
  loop: null,
  terms: { genre: ["chamber"], mood: ["tense"], instrument: ["pizzicato"], sfxCategory: null },
  verdict: "kept",
  src: SILENCE,
  peaks: PEAKS,
  lengthS: 45,
  prompt: "Playful conspiratorial pizzicato, a caper in miniature.",
  origin: "lab",
  fileName: null,
  ...over,
});
const CARDS: readonly CardTake[] = [
  card("k1", "Whisper network", "pending", "chamber"),
  card("k2", "Harbor glass", "remaster", "chamber"),
  card("k3", "Harbor glass", "edit", "chamber", { parentId: "k2", origin: "suno-return", fileName: "harbor-glass-remaster.wav", createdAt: "2026-10-16T10:00:00.000Z" }),
  card("k4", "Breakwater", "finalized", null, { label: "Dub · night · melodica", peaks: [] }),
];
const STACKS = stackVersions(CARDS);
const ROWS = rowsFor(["chamber"], STACKS);
const ENGINES: readonly EngineRow[] = [
  { id: "suno", name: "Suno", transport: "browser", state: "live", ops: ["compose", "prompt-copy", "file-return"], withheld: [] },
  { id: "elevenlabs", name: "ElevenLabs", transport: "api", state: "copy-only", ops: ["prompt-copy"], withheld: ["compose", "plan", "section-edit", "sfx"].map((op) => ({ op, reason: "no desk producer: renders run as Score cues or sound.mts generate" })) },
  { id: "local", name: "Local", transport: "none", state: "not-installed", ops: [], withheld: [], needs: ["a GPU runner on this machine", "a licence decision per model"] },
];

function ArrangeSpecimen() {
  const [open, setOpen] = useState(false);
  const one = (s: Stack<CardTake>) => (
    <TakeCard stack={s} focused={false} pending={false} playing={null} open={open && s.versions.length > 1} onFocus={inert} onPointerDown={inert} onPlay={inert} onVersions={() => setOpen((o) => !o)} />
  );
  const edit = STACKS.find((s) => s.head.stage === "edit");
  return (
    <>
      <Spec names={["ArrangeBoard", "TakeCard", "RowHead", "RowFoot", "PlayMark"]} source="audio/ArrangeBoard.tsx · TakeCard.tsx · RowHead.tsx · v1 app/playground/arrange" wide>
        <ArrangeBoard stacks={STACKS} rows={ROWS} over={null} renderCard={one} renderRowHead={(row, held) => <RowHead row={row} held={held} first last onEdit={inert} />} />
        <RowFoot suggestions={[{ name: "dub", n: 1 }]} busy={false} onEdit={inert} />
        <Row label="play mark">
          <PlayMark on={false} />
          <PlayMark on />
        </Row>
      </Spec>
      <Spec names={["RoundTrip", "LabelPrompt"]} source="audio/RoundTrip.tsx · LabelPrompt.tsx · v1 arrange/RoundTrip.tsx, LabelPrompt.tsx">
        {edit !== undefined && (
          <TakeCard stack={edit} focused={false} pending={false} playing={null} open={false} onFocus={inert} onPointerDown={inert} onPlay={inert} onVersions={inert}>
            <RoundTrip kind="music" title={edit.head.title} stage="edit" next="finalized" download={{ href: SILENCE, name: "harbor-glass.wav" }} busy={false} onCopyPrompt={inert} onFile={inert} />
          </TakeCard>
        )}
        <LabelPrompt title="Harbor glass → finalized" initial="Chamber · tense · pizzicato" busy={false} onConfirm={inert} onCancel={inert} />
      </Spec>
      <Spec names={["EngineList"]} source="audio/EngineList.tsx · lib/sound/engines.ts · v1 app/playground/engines.ts">
        <EngineList engines={ENGINES} label="engines" />
      </Spec>
    </>
  );
}

function ComposerSpecimen() {
  const [seed, setSeed] = useState<Seed>(SEED);
  const [hands, setHands] = useState<Readonly<Record<string, Hand>>>(() => handsOf(TERMS));
  const terms = useMemo(() => TERMS.map((x) => ({ ...x, stance: hands[x.id]?.stance ?? null, phrase: hands[x.id]?.phrase ?? "" })), [hands]);
  return (
    <>
      <Spec names={["TermRail"]} source="audio/TermRail.tsx · v1 app/library/audio/Terms.tsx">
        <TermRail terms={terms} onPick={inert} onHand={(id, h) => setHands((m) => ({ ...m, [id]: h }))} />
      </Spec>
      <Spec names={["SeedComposer"]} source="audio/SeedComposer.tsx · v1 InspectorComposer.tsx" wide>
        <SeedComposer seed={seed} terms={terms} hands={hands} from="Whisper network" keys={["G major", "E minor"]} onSeed={setSeed} onSend={inert} busy={false} onCopy={inert} />
      </Spec>
      <Spec names={["VariationList"]} source="audio/VariationList.tsx · v1 InspectorVariations.tsx" wide>
        <VariationList list={variationsOfSeed(seed, terms)} onLoad={(v) => setSeed(v.seed)} onSend={inert} busy={false} />
      </Spec>
    </>
  );
}

export function AudioSection() {
  return (
    <Section id="audio">
      <Spec names={["AudioPreview"]} source="audio/AudioPreview.tsx · library.js preview :512">
        <Row label="file">
          <AudioPreview src={SILENCE} peaks={PEAKS} title="Whisper network" durationS={154} />
        </Row>
        <Row label="no file">
          <AudioPreview src={null} peaks={PEAKS.slice(0, 40)} title="Salt lines" durationS={92} />
        </Row>
      </Spec>
      <Spec names={["AudioPrompt", "AudioMeasures"]} source="audio/AudioPrompt.tsx · AudioMeasures.tsx · library.js :550-554">
        <AudioPrompt prompt="Playful conspiratorial pizzicato with a bassoon countermelody and finger snaps, a caper in miniature. Lock the tempo at 108 BPM." negative="vocals, brass" reasons={["tempo-instability", "broken-ending"]} />
        <AudioMeasures facts={{ asked: { tempoBpm: 108, key: "G major", durationS: 45 }, measured: { tempoBpm: 54.2, key: "G major", durationS: 44.6, lufs: -15.6, truePeakDb: -3.9, energy: 0.1357 } }} />
        <AudioMeasures facts={{ asked: { tempoBpm: 90, key: null, durationS: 60 }, measured: null }} />
      </Spec>
      <ComposerSpecimen />
      <Spec names={["DraftList"]} source="audio/DraftList.tsx · v1 InspectorDrafts.tsx">
        <DraftList drafts={DRAFTS} triageHref="#audio" />
      </Spec>
      <Spec names={["ReferenceList"]} source="audio/ReferenceList.tsx · v1 References.tsx">
        <ReferenceList refs={REFS} onSeed={inert} />
      </Spec>
      <ArrangeSpecimen />
    </Section>
  );
}
