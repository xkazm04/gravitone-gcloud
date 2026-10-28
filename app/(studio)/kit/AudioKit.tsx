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
import { batchProblem, blankBatch, TECHNIQUES, type BatchForm as BatchFormState } from "@gt/ui/components/audio/batch.ts";
import { BatchForm } from "@gt/ui/components/audio/BatchForm.tsx";
import { briefCheck } from "@gt/ui/components/audio/brief.ts";
import { BriefDelta } from "@gt/ui/components/audio/BriefDelta.tsx";
import { buildTree, clickSelect, countsOf, EMPTY_SELECTION, renderPlan, toggleGroup, type AuditionTake, type HuntCardView, type HuntLeafView, type Reach, type Selection } from "@gt/ui/components/audio/hunt.ts";
import { HuntAudition } from "@gt/ui/components/audio/HuntAudition.tsx";
import { HuntMap } from "@gt/ui/components/audio/HuntMap.tsx";
import { HuntRenderBar } from "@gt/ui/components/audio/HuntRenderBar.tsx";
import { HuntIdea, HuntShelf } from "@gt/ui/components/audio/HuntShelf.tsx";
import { evidenceOf, handLesson } from "@gt/ui/components/audio/lesson.ts";
import { LessonForm } from "@gt/ui/components/audio/LessonForm.tsx";
import { LessonList, type LessonRow } from "@gt/ui/components/audio/LessonList.tsx";
import { readRubric, type Ratings } from "@gt/ui/components/audio/rubric.ts";
import { RubricCard } from "@gt/ui/components/audio/Rubric.tsx";
import { cellKey, type Facet, type Sort, type StrengthCell } from "@gt/ui/components/audio/strengths.ts";
import { StrengthHead, StrengthTable } from "@gt/ui/components/audio/Strengths.tsx";

import { inert } from "./ContractHooks.tsx";
import { LocalBandSpecimen } from "./LocalBandSpecimen.tsx";
import { Row, Section, Spec } from "./Spec.tsx";

/** A quarter second of silence as a WAV data URL: a source the browser can open, so the play control is real. */
function silentWav(): string {
  const rate = 8000;
  const n = rate / 4;
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

/* ── the hunt, the rubric, the strengths, the lessons, the batch (Phase 6, L65-L66) ──────── */

const leaf = (id: string, parentId: string | null, axis: string, label: string, over: Partial<HuntLeafView> = {}): HuntLeafView => ({
  id,
  parentId,
  axis,
  label,
  rationale: "",
  provider: "elevenlabs",
  technique: [],
  prompt: "",
  durationS: 30,
  state: "idea",
  takeIds: [],
  winner: false,
  error: null,
  negative: null,
  tempoBpm: null,
  key: null,
  loop: null,
  ...over,
});

const HUNT_NODES: readonly HuntLeafView[] = [
  leaf("h-root", null, "idea", "a tense but hopeful underscore for a 60s explainer about inflation"),
  leaf("b-tempo", "h-root", "tempo", "which pulse carries the voice-over?", { rationale: "a narrator reads at ~150 wpm; the pulse must sit under it, not race it" }),
  leaf("l-90", "b-tempo", "tempo", "90 bpm, pizzicato pulse", { tempoBpm: 90, key: "D minor", technique: ["duration-and-tempo-locking"], prompt: "Tense but hopeful pizzicato underscore, 90 BPM, D minor, no drums.", state: "rendered", takeIds: ["ht-1"], winner: true, rationale: "slow enough to leave the words room" }),
  leaf("l-120", "b-tempo", "tempo", "120 bpm, driving strings", { tempoBpm: 120, key: "D minor", technique: ["duration-and-tempo-locking", "tag-list"], prompt: "driving strings, tense, hopeful, 120 bpm, D minor", state: "rendered", takeIds: ["ht-2"] }),
  leaf("l-70", "b-tempo", "tempo", "70 bpm, held pads", { tempoBpm: 70, technique: ["single-sentence"], prompt: "Held string pads that lift in the last ten seconds, 70 BPM.", state: "failed", error: "ElevenLabs 422: duration_seconds must be between 10 and 300" }),
  leaf("b-tex", "h-root", "texture", "what carries the hope?", { rationale: "the turn from tense to hopeful has to be audible without a key change" }),
  leaf("l-suno", "b-tex", "texture", "felt piano enters at 0:40", { provider: "suno", technique: ["section-plan-as-the-brief"], prompt: "[0:00] low cello ostinato [0:40] felt piano enters, major lift", state: "awaiting-return", durationS: 60 }),
  leaf("l-glock", "b-tex", "texture", "glockenspiel motif over cello", { technique: ["sonic-style-vocabulary"], prompt: "Cello ostinato, a four-note glockenspiel motif answering it, hopeful.", durationS: 45 }),
];

const HUNT_TAKES: Readonly<Record<string, AuditionTake>> = {
  "ht-1": { id: "ht-1", title: "90 bpm, pizzicato pulse", src: SILENCE, peaks: PEAKS, lengthS: 31.2, verdict: "kept", stage: "pending" },
  "ht-2": { id: "ht-2", title: "120 bpm, driving strings", src: SILENCE, peaks: PEAKS.slice(8), lengthS: 29.8, verdict: "unjudged", stage: null },
};

const HUNT_REACH: Readonly<Record<string, Reach>> = { elevenlabs: "render", suno: "hand" };

const miniOf = (nodes: readonly HuntLeafView[]): HuntCardView["mini"] =>
  buildTree(nodes).columns.map((c) => ({ axis: c.axis, leaves: c.rows.flatMap((r) => (r.kind === "leaf" ? [{ state: r.node.state, winner: r.node.winner }] : [])) }));

const SFX_NODES: readonly HuntLeafView[] = [
  leaf("s-1", null, "attack", "soft click", { state: "rendered", takeIds: ["st-1"], durationS: 0.6 }),
  leaf("s-2", null, "attack", "glass tick", { state: "rendered", takeIds: ["st-2"], durationS: 0.6, winner: true }),
  leaf("s-3", null, "tail", "short room", { state: "failed", durationS: 1 }),
];

const HUNTS: readonly HuntCardView[] = [
  { id: "hunt-a", idea: "a tense but hopeful underscore for a 60s explainer about inflation", createdAt: "2026-10-16T09:30:00.000Z", counts: countsOf(HUNT_NODES), lessonId: null, mini: miniOf(HUNT_NODES) },
  { id: "hunt-b", idea: "a satisfying UI confirm sound", createdAt: "2026-10-14T15:02:00.000Z", counts: countsOf(SFX_NODES), lessonId: "lesson-2", mini: miniOf(SFX_NODES) },
];

const NO_CROWNS: ReadonlySet<string> = new Set();

function HuntSpecimen() {
  const [nodes, setNodes] = useState<readonly HuntLeafView[]>(HUNT_NODES);
  const order = useMemo(() => buildTree(nodes).leaves.map((l) => l.id), [nodes]);
  const [sel, setSel] = useState<Selection>(() => clickSelect(clickSelect(EMPTY_SELECTION, order, "l-suno"), order, "l-glock", { toggle: true }));
  const [playing, setPlaying] = useState<string | null>(null);
  const plan = renderPlan(nodes, sel.ids, (p) => HUNT_REACH[p] ?? "none");
  const heard = buildTree(nodes).leaves.filter((l) => l.state === "rendered");
  const crown = (l: HuntLeafView, _take: string, on: boolean): void => setNodes((ns) => ns.map((n) => (n.id === l.id ? { ...n, winner: on } : n)));
  const play = (t: AuditionTake): void => setPlaying((p) => (p === t.id ? null : t.id));
  return (
    <>
      <Spec names={["HuntIdea", "HuntShelf"]} source="audio/HuntShelf.tsx · hunt.ts · v1 app/playground/hunt/Start.tsx">
        <HuntIdea kind="music" busy={false} error={null} onDraft={inert} />
        <HuntShelf hunts={HUNTS} open="hunt-a" hrefOf={(id) => `#${id}`} />
      </Spec>
      <Spec names={["HuntMap", "HuntRenderBar"]} source="audio/HuntMap.tsx · HuntRenderBar.tsx · v1 hunt/{Board,Inspector}.tsx" wide>
        <HuntRenderBar plan={plan} picked={sel.ids.length} busy={false} liveBlock="GRAVITONE_DRY_ONLY" onRender={inert} onClear={() => setSel(EMPTY_SELECTION)} />
        <HuntMap
          nodes={nodes}
          takes={HUNT_TAKES}
          selection={sel}
          reach={HUNT_REACH}
          playing={playing}
          crowning={NO_CROWNS}
          onPick={(id, m) => setSel((cur) => clickSelect(cur, order, id, m))}
          onBranch={(ids) => setSel((cur) => toggleGroup(cur, order, ids))}
          onPlay={play}
          onCrown={crown}
          onCopy={inert}
          returning={NO_CROWNS}
          onReturn={inert}
        />
      </Spec>
      <Spec names={["HuntAudition"]} source="audio/HuntAudition.tsx · v1 hunt/Audition.tsx" wide>
        <HuntAudition heard={heard} takes={HUNT_TAKES} playing={playing} crowning={NO_CROWNS} onPlay={play} onCrown={crown} />
      </Spec>
    </>
  );
}

const HUNT_EVIDENCE = evidenceOf(HUNT_NODES);
const PROPOSAL = {
  ...handLesson({ id: "hunt-a", kind: "music", nodes: HUNT_NODES }, 7.5),
  claim: "When an underscore sits under a narrator, brief the tempo at 90 bpm or below, because the 120 bpm take crowded the words.",
};

const LESSONS: readonly LessonRow[] = [
  { id: "lesson-1", claim: "When the brief's genre is lo-fi, send it to Suno, because it kept 7 of 9 (mean 7.4).", source: "triage", provider: "suno", technique: ["tag-list"], n: 9, keepRate: 0.78, meanScore: 7.4, confirmedAt: "2026-10-15T11:20:00.000Z" },
  {
    id: "lesson-2",
    claim: "When a UI confirm must feel physical, brief the material before the event, because the glass tick won over the soft click.",
    source: "hunt",
    provider: "elevenlabs",
    technique: ["envelope-first-briefing"],
    n: 2,
    keepRate: 0.5,
    meanScore: null,
    confirmedAt: "2026-10-14T16:00:00.000Z",
    hunt: { id: "hunt-b", idea: "a satisfying UI confirm sound" },
  },
];

function LessonSpecimen() {
  const [round, setRound] = useState(0);
  return (
    <Spec names={["LessonForm", "LessonList"]} source="audio/LessonForm.tsx · LessonList.tsx · lesson.ts · v1 hunt/Lesson.tsx">
      <LessonForm
        key={round}
        proposal={PROPOSAL}
        axes={HUNT_EVIDENCE.axes}
        techniques={HUNT_EVIDENCE.techniques}
        known={TECHNIQUES.music}
        draftedBy="claude-haiku"
        engineError={null}
        busy={false}
        error={null}
        onSign={inert}
        onDiscard={() => setRound((k) => k + 1)}
      />
      <LessonList lessons={LESSONS} huntHref={(id) => `#${id}`} />
    </Spec>
  );
}

const BRIEF_MUSIC = briefCheck("music", { tempoBpm: 108, key: "G major", durationS: 45 }, { tempoBpm: 54.2, key: "E minor", durationS: 44.6 });
const BRIEF_MISSED = briefCheck("music", { tempoBpm: 120, key: "D minor", durationS: 60 }, { tempoBpm: 96, key: "D minor", durationS: 74 });
const BRIEF_SFX = briefCheck("sfx", { tempoBpm: null, key: null, durationS: 2.5 }, null);
const SFX_RUBRIC = readRubric({ kind: "sfx", loop: true, verdict: "rejected", ratings: { event_match: 4 } });
const NO_DIMS: readonly string[] = [];
const BUSY_DIMS: readonly string[] = ["event_match"];

function RubricSpecimen() {
  const [ratings, setRatings] = useState<Ratings>({ melody: 8, instrument_choice: 7, instrument_quality: null });
  const [focused, setFocused] = useState(false);
  const rubric = readRubric({ kind: "music", loop: null, verdict: "kept", ratings });
  return (
    <Spec names={["RubricCard"]} source="audio/Rubric.tsx · rubric.ts · v1 app/playground/shared/Rubric.tsx" wide>
      <RubricCard
        take={{ id: "rt-1", title: "Whisper network", provider: "elevenlabs", verdict: "kept", src: SILENCE, rubric, brief: BRIEF_MUSIC }}
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

function StrengthSpecimen() {
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

function BatchSpecimen() {
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
      <BatchSpecimen />
      <Spec names={["BriefDelta"]} source="audio/BriefDelta.tsx · brief.ts">
        <Row label="octave · missed · held">
          <BriefDelta check={BRIEF_MUSIC} label="Whisper network brief" />
        </Row>
        <Row label="missed">
          <BriefDelta check={BRIEF_MISSED} label="Harbor glass brief" />
        </Row>
        <Row label="unmeasured">
          <BriefDelta check={BRIEF_SFX} label="Door slam brief" />
        </Row>
      </Spec>
      <RubricSpecimen />
      <StrengthSpecimen />
      <HuntSpecimen />
      <LessonSpecimen />
      <LocalBandSpecimen />
    </Section>
  );
}
