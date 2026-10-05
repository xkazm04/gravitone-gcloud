// Wire types for the sound store — the Sound lab's three modules (Triage,
// Arrangement, Hunt), the Library's Audio tab, and the headless CLI an agent
// drives (pipeline/sound.mts) all read and write these shapes
// (platform-consolidation spark, round 4, 2026-10-05).
//
// The store is FILE-BACKED (foundry-out/sound/, behind /api/sound/*) because
// agents must be able to generate into Triage and pick from Finalized without a
// browser; the verdict/lesson ledger is git-tracked (pipeline/sound/ledger.json)
// so what the team learned about prompting travels between machines.
//
// Absent-value convention: `null` = unknown / not measured / not set. Never 0,
// never an omitted key.

export type SoundKind = "music" | "sfx";
export type ProviderId = "elevenlabs" | "suno" | "local";

/** Who put the take in the store. `fixture` rows are design samples: shown, but
 *  excluded from the ledger, the insights and the agents' default listing. */
export type TakeOrigin = "agent" | "lab" | "hunt" | "import" | "suno-return" | "fixture";

/** `proven` is never stored — it is read off a kept take's mean score (≥ 7). */
export type Verdict = "unjudged" | "kept" | "rejected";

/** Arrangement's x-axis. A take enters `pending` when it is kept. `remaster`
 *  and `edit` are MANUAL stages today: the operator takes the file to Suno's
 *  studio and drops the result back, which lands as a new version (parentId). */
export type Stage = "pending" | "remaster" | "edit" | "finalized";
export const STAGES: readonly Stage[] = ["pending", "remaster", "edit", "finalized"];

/** How a provider produced the take. */
export type SoundOp = "compose" | "plan" | "section-edit" | "sfx" | "manual";

/** Rubric dimensions per kind, each scored 1–10 or null. */
export const RUBRIC: Record<SoundKind, readonly string[]> = {
  music: ["melody", "instrument_choice", "instrument_quality"],
  sfx: ["event_match", "sound_quality", "loop_seam"],
};

/** Reject reasons: the registry's generated-audio defect taxonomy
 *  (media-generation / generated-music-acceptance / generated-audio-defect-taxonomy),
 *  plus two brief-level misses. Codes are the wire values. */
export const DEFECTS = [
  "smeared-transients",
  "vocal-garble",
  "section-bleed",
  "tempo-instability",
  "broken-ending",
  "loop-seam",
  "spectral-imbalance",
  "phase-width",
  "confident-hallucination",
  "off-brief",
  "wrong-event",
] as const;
export type DefectCode = (typeof DEFECTS)[number];

/** Prompt techniques a take was briefed with — the registry's technique slugs
 *  (music-prompt-composition, sound-effect-generation) plus plain forms.
 *  This is the axis the lessons are learned along. */
export const TECHNIQUES: Record<SoundKind, readonly string[]> = {
  music: [
    "single-sentence",
    "tag-list",
    "section-plan-as-the-brief",
    "sonic-style-vocabulary",
    "negative-styles",
    "duration-and-tempo-locking",
    "reference-track-anchoring",
    "lyrics-for-singability",
  ],
  sfx: ["single-sentence", "envelope-first-briefing", "layered-element-assembly", "loop-seam-acceptance", "picture-as-timing-brief"],
};

export interface SoundTerms {
  genre: string[];
  mood: string[];
  instrument: string[];
  /** sfx only. */
  sfxCategory: string | null;
}

export interface SoundFile {
  /** Relative to the store root; served by GET /api/sound/takes/[id]/file. */
  path: string;
  mime: string;
  bytes: number;
}

export interface MeasuredSound {
  tempoBpm: number | null;
  key: string | null;
  /** RMS of the analysed window, 0..1 (app/library/audio/analysis.ts). The
   *  Library's band word (high / medium / low) is read off this number, never
   *  stored beside it. */
  energy: number | null;
  /** The decoded file's length in seconds — what the bytes ARE, beside the
   *  take's `durationS` (what the brief asked for). Closeout r4, additive. */
  durationS: number | null;
  /** Integrated loudness / true peak, when measured (ffprobe/ebur128 or browser). */
  lufs: number | null;
  truePeakDb: number | null;
}

export interface SoundTake {
  id: string;
  kind: SoundKind;
  title: string;
  provider: ProviderId;
  op: SoundOp;
  origin: TakeOrigin;
  technique: string[];
  prompt: string;
  negative: string | null;
  terms: SoundTerms;
  /** What the brief ASKED for. */
  tempoBpm: number | null;
  key: string | null;
  durationS: number | null;
  loop: boolean | null;
  /** null for a fixture row that never had bytes. */
  file: SoundFile | null;
  peaks: number[] | null;
  measured: MeasuredSound | null;
  ratings: Record<string, number | null>;
  verdict: Verdict;
  reasons: DefectCode[];
  note: string | null;
  /** null until kept. */
  stage: Stage | null;
  /** Arrangement's y-axis row (a genre group, or an sfx category group). */
  group: string | null;
  /** The library label a finalized take carries — what agents select by. */
  label: string | null;
  parentId: string | null;
  huntId: string | null;
  nodeId: string | null;
  songId: string | null;
  /** The provider's composition plan, verbatim (lib/music WirePlan), when it gave one. */
  plan: unknown | null;
  /* ── the Library's facts (closeout r4, additive) — once kept per browser in
   *    app/library/audio/soundAnnex.ts (deleted), now on the take itself so
   *    every reader on every machine sees the same links. ── */
  /** The reference track (app/library/audio/audioRefs.ts id) the brief was anchored on. */
  referenceTrackId: string | null;
  /** The prompt round (app/library/audio/book.ts Round id) the take was drafted in. */
  promptRound: string | null;
  /** The Suno draft a returned file answers. */
  draftId: string | null;
  /** The one change a fan-out made to produce this take. */
  variation: { axis: string; diff: string[] } | null;
  /** A section edit's per-section modes, as the lab sent them. */
  editModes: string[] | null;
  /** The file's name as it arrived (an upload, a return), verbatim. */
  fileName: string | null;
  createdAt: string;
  judgedAt: string | null;
  finalizedAt: string | null;
}

export type TakePatch = Partial<
  Pick<
    SoundTake,
    | "title"
    | "ratings"
    | "verdict"
    | "reasons"
    | "note"
    | "stage"
    | "group"
    | "label"
    | "peaks"
    | "measured"
    | "referenceTrackId"
    | "promptRound"
    | "draftId"
    | "variation"
    | "editModes"
    | "fileName"
  >
>;

export interface GenerateRequest {
  kind: SoundKind;
  provider: "elevenlabs";
  op: Exclude<SoundOp, "manual">;
  prompt: string;
  negative: string | null;
  durationS: number;
  loop: boolean | null;
  /** sfx only: the vendor's prompt_influence, 0..1 (low = fishing, high = to
   *  the letter). null = the vendor's default. Closeout r4, additive. */
  promptInfluence: number | null;
  technique: string[];
  terms: SoundTerms;
  tempoBpm: number | null;
  key: string | null;
  origin: Extract<TakeOrigin, "agent" | "lab" | "hunt">;
  /** section-edit only. */
  sourceTakeId: string | null;
  editModes: string[] | null;
  /** plan only: a drafted plan to render. */
  plan: unknown | null;
  huntId: string | null;
  nodeId: string | null;
  title: string | null;
}

/** One cell of the strengths map: how a provider fares on one term or technique. */
export interface InsightCell {
  kind: SoundKind;
  provider: ProviderId;
  facet: "genre" | "mood" | "instrument" | "sfxCategory" | "technique";
  value: string;
  n: number;
  kept: number;
  rejected: number;
  /** Mean of rubric means over judged takes; null when none scored. */
  meanScore: number | null;
  topDefect: DefectCode | null;
}

export interface Lesson {
  id: string;
  kind: SoundKind;
  source: "triage" | "hunt";
  provider: ProviderId | null;
  huntId: string | null;
  /** One sentence: "when X, brief Y, because Z". */
  claim: string;
  technique: string[];
  evidence: { n: number; keepRate: number | null; meanScore: number | null; takeIds: string[] };
  /** Who confirmed it — a lesson is never written without a human. */
  confirmedAt: string;
}

export type HuntNodeState = "idea" | "rendering" | "rendered" | "awaiting-return" | "failed";

export interface HuntNode {
  id: string;
  parentId: string | null;
  /** What this branch varies, e.g. "tempo", "instrument swap", "technique". */
  axis: string;
  label: string;
  rationale: string;
  provider: ProviderId;
  technique: string[];
  prompt: string;
  negative: string | null;
  durationS: number;
  /* ── what the leaf asks for, as fields (closeout r4, additive) — drafted by
   *    the sound-hunt turn so a render never re-reads its own prompt text.
   *    A hunt stored before these existed reads them as null / empty. ── */
  /** sfx: a seamless loop (true) or a one-shot (false); music: null. */
  loop: boolean | null;
  terms: SoundTerms;
  /** music: the tempo the prompt locks; sfx: always null. */
  tempoBpm: number | null;
  /** music: the key the prompt names; sfx: always null. */
  key: string | null;
  state: HuntNodeState;
  takeIds: string[];
  winner: boolean;
  error: string | null;
}

export interface Hunt {
  id: string;
  kind: SoundKind;
  /** The operator's problem or idea, verbatim. */
  idea: string;
  createdAt: string;
  nodes: HuntNode[];
  /** The text engine's provenance for the drafted map (lib/text). */
  draftedBy: string | null;
  lessonId: string | null;
}

export interface SoundGroups {
  music: string[];
  sfx: string[];
}
