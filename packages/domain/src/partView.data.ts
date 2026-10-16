// THE PART VIEW'S PER-KIND DATA: what the research and script editors draw (./partView.ts holds
// the frame, the ops and the acts). Split out only for the 400-line rule; zod-free and type-only
// like its parent. Every field is what a v1 function computed for the screen (named beside it),
// so the server side runs that function and the editor draws its answer.

import type { ReceiptMode } from "./produce.ts";

/** A model turn that already ran, as its receipt recorded it (v1 `Receipt` / `AdEngine`). */
export type EngineView = {
  readonly provider: string;
  readonly model: string;
  readonly usd: number | null;
  readonly unpricedReason?: string;
  readonly seconds: number;
  readonly mode: ReceiptMode;
};

/* ── research ─────────────────────────────────────────────────────────────── */

export type CardKind = "fact" | "mechanism" | "reversal" | "steel-man" | "counter" | "conclusion";
export type Confidence = "high" | "medium" | "low";
/** `not-taken` is a default (conclusions start out), `descoped` a decision (lib/research/scope.ts). */
export type CardScope = "in" | "descoped" | "not-taken";

export type ResearchCard = {
  readonly id: string;
  readonly kind: CardKind;
  readonly dimension: string;
  readonly title: string;
  readonly detail?: string;
  readonly confidence?: Confidence;
  readonly loadBearing: boolean;
  /** The library forbids removal; descope is refused. */
  readonly required: boolean;
  readonly requiredWhy?: string;
  readonly leap?: string;
  readonly hottest: boolean;
  readonly source?: string;
  readonly asOf?: string;
  readonly falsifiableBy?: string;
  readonly dependsOn: readonly string[];
  readonly contests: readonly string[];
  readonly qualifies: readonly string[];
  readonly scope: CardScope;
  readonly liked: boolean;
  readonly deepen: boolean;
  /** Descoping a card this one rests on wounds it (`woundsOf`): broken when nothing survives. */
  readonly wound?: { readonly severity: "broken" | "weakened"; readonly missing: readonly string[] };
  /** Kept-or-cut differs from the confirmed scope (`scopeDiffs`). */
  readonly moved: boolean;
};

export type ResearchDimension = { readonly id: string; readonly label: string; readonly kept: number; readonly total: number };

export type ScopeTally = {
  readonly kept: number;
  readonly total: number;
  readonly descoped: number;
  readonly notTaken: number;
  readonly liked: number;
  readonly deepen: number;
  readonly wounded: number;
  readonly broken: number;
  /** Required cards that are out: the scope cannot be confirmed while any is. */
  readonly requiredGone: readonly string[];
};

export type EffectLanding = "landed" | "already-there" | "no-change" | "no such id here" | "pending" | "rejected";
export type FollowUpEffect = { readonly index: number; readonly kind: string; readonly target: string; readonly note: string; readonly landing: EffectLanding };
export type FollowUpView = {
  readonly id: string;
  readonly kind: "deepen-card" | "question";
  readonly cardId?: string;
  readonly prompt: string;
  /** `unanswered` is terminal: the turn returned nothing (v1 followup.ts). */
  readonly status: "queued" | "running" | "returned" | "unanswered";
  readonly result?: {
    readonly verdict: "strengthened" | "weakened" | "resolved" | "inconclusive";
    readonly summary: string;
    readonly sources: readonly string[];
    readonly effects: readonly FollowUpEffect[];
  };
};

export type NotebookBoard = {
  readonly face: "notebook";
  readonly topic: string;
  /** Where the notebook came from and its identity; a scope decided on another digest is orphaned. */
  readonly source: { readonly kind: "replay" | "reasoned" | "researched"; readonly digest: string; readonly claims: number } | null;
  readonly dimensions: readonly ResearchDimension[];
  readonly cards: readonly ResearchCard[];
  readonly tally: ScopeTally;
  readonly scope: { readonly confirmed: boolean; readonly moved: number; readonly orphan?: { readonly decisions: number } };
  readonly followUps: readonly FollowUpView[];
  readonly engine?: EngineView;
};

export type BeatVariantView = {
  readonly id: string;
  readonly kind: string;
  readonly connector: Connector;
  readonly at: string;
  readonly label: string;
  /** What is on screen. */
  readonly text: string;
  readonly rationale: string;
  readonly risk?: string;
  readonly raises: readonly string[];
  readonly spends: number;
};
export type BeatSlotView = {
  readonly id: string;
  readonly label: string;
  readonly role: string;
  readonly cue?: { readonly label: string; readonly boundary: boolean };
  readonly pick: string | null;
  readonly variants: readonly BeatVariantView[];
};
export type BeatsBoard = {
  readonly face: "beats";
  readonly slots: readonly BeatSlotView[];
  readonly picked: number;
  /** `composed` = the spine was frozen; `moved` = picks differ from the frozen spine. */
  readonly spine: { readonly composed: boolean; readonly moved: boolean };
  /** `fixture` = hand-written slots (n=0), not a generated board. */
  readonly origin: "fixture" | "generated";
};

export type AdBriefField = "product" | "audience" | "proposition" | "tone" | "mustInclude" | "cta" | "platform";
export type AdBriefView = { readonly [F in AdBriefField]: F extends "mustInclude" ? readonly string[] : string };
export type AdIdeaView = {
  readonly id: string;
  readonly angle: string;
  readonly title: string;
  readonly hook: string;
  readonly twist: string;
  readonly whyItWorks: string;
  readonly risk: string;
  readonly truth?: string;
  readonly gateNotes: readonly string[];
  readonly pictureClaim?: string | null;
};
export type AdsBrief = {
  readonly face: "ads";
  readonly brief: AdBriefView;
  /** Required fields still empty; "generate ideas" needs none. */
  readonly missing: readonly AdBriefField[];
  readonly ideas: readonly AdIdeaView[];
  readonly picked: string | null;
  /** The ideas were generated from a different brief than the one on screen. */
  readonly briefChanged: boolean;
  readonly engine?: EngineView;
};

/** A free project chooses its face; the others are fixed (`offers` has one entry). */
export type ResearchData = { readonly offers: readonly ("notebook" | "beats")[] } & (NotebookBoard | BeatsBoard | AdsBrief);

/* ── script ───────────────────────────────────────────────────────────────── */

export type Connector = "BUT" | "THEREFORE" | "AND THEN" | null;
export type Verdict = "pass" | "violation" | "not-engaged" | "unmeasured";
export type Finding = { readonly rule: string; readonly subject: string; readonly verdict: Verdict; readonly detail: string; readonly at?: string; readonly quote?: string };

/** `runGate` over one chain: the honesty rule - nothing unchecked reads as pass. */
export type GateView = {
  readonly blocked: boolean;
  readonly violations: number;
  readonly passes: number;
  readonly unmeasured: number;
  readonly notEngaged: number;
  /** Percent of checkable rules actually executed. */
  readonly enforced: number;
  readonly findings: readonly Finding[];
};

export type LedgerRow = {
  readonly unknownId: string;
  readonly unknown: string;
  readonly state: "honoured" | "at-risk" | "not-engaged" | "unmeasured" | "superseded";
  readonly how: string;
  readonly at?: string;
  readonly quote?: string;
};

export type ScriptBeat = {
  readonly at: string;
  /** This beat's seconds (to the next mark, or to the end). */
  readonly seconds: number;
  readonly kind: string;
  readonly label: string;
  readonly text: string;
  readonly connector: Connector;
  /** Cards the beat states (impact attribution). */
  readonly cards: readonly string[];
};

export type CardUsage = { readonly cardId: string; readonly title: string; readonly use: "spoken" | "cut" | "unused"; readonly seconds: number; readonly beats: readonly string[]; readonly why?: string };

export type Candidate = {
  readonly id: string;
  readonly title: string;
  readonly engine: string;
  readonly durationS: number;
  readonly words: number;
  readonly beats: readonly ScriptBeat[];
  readonly weakness: string;
  readonly gate: GateView;
  readonly ledger: readonly LedgerRow[];
  readonly usage: readonly CardUsage[];
};

export type VersionView = {
  readonly id: string;
  readonly label: string;
  readonly basedOn: string | null;
  readonly at: string;
  readonly notes: number;
  /** The recorded override when it was accepted over a blocking gate. */
  readonly override?: string;
  readonly engine?: EngineView;
};

export type NoteKind = "more-focus" | "less-focus" | "descope" | "move-earlier" | "move-later" | "custom";
export type NoteView = { readonly id: string; readonly cardId: string; readonly cardTitle: string; readonly kind: NoteKind; readonly label: string; readonly text?: string };

/** Descoped in Research but still spoken by a candidate (scopeConflicts.ts). */
export type ScopeConflict = { readonly cardId: string; readonly title: string; readonly spokenBy: readonly { readonly candidateId: string; readonly seconds: number }[] };

export type ScriptDocument = {
  readonly face: "document";
  readonly targetS: number | null;
  readonly writtenAgainst: { readonly claims: number; readonly loadBearing: number; readonly mechanisms: number; readonly reversals: number; readonly kept: number };
  readonly candidates: readonly Candidate[];
  readonly adopted: string | null;
  /** The weakest candidate's coverage and the blocking ones (`gateChains`). */
  readonly rollup: { readonly enforced: number; readonly blocking: readonly string[] };
  readonly versions: readonly VersionView[];
  /** A recalibrated version waiting for accept, with its gate over the new chains. */
  readonly staged?: VersionView & { readonly gate: { readonly blocked: boolean; readonly blocking: readonly string[] }; readonly refusals: readonly string[] };
  readonly notes: readonly NoteView[];
  readonly noteKinds: readonly { readonly kind: NoteKind; readonly label: string }[];
  readonly conflicts: readonly ScopeConflict[];
};

export type TrailerBeatView = {
  readonly id: string;
  readonly movement: string;
  readonly at: string;
  readonly kind: string;
  readonly connector: Connector;
  readonly label: string;
  readonly text: string;
  readonly raises: readonly string[];
  readonly spends: readonly string[];
  /** Changed since it was dealt from the spine (reset-beat restores it). */
  readonly edited: boolean;
};
export type MovementView = { readonly id: string; readonly role: string; readonly label: string; readonly cue?: string };
/** A structure finding with the work's sentence only: citations and developer text never cross. */
export type StructureFinding = Finding & { readonly beatId?: string; readonly advisory: boolean };
export type TrailerCutView = {
  readonly face: "trailer";
  readonly targetS: number | null;
  /** The last beat's mark, the cut's own length as written. */
  readonly runtimeS: number | null;
  readonly cue?: { readonly title: string; readonly frozen: boolean };
  readonly lane: "wide-release" | "specialty";
  readonly movements: readonly MovementView[];
  readonly beats: readonly TrailerBeatView[];
  /** A shape derived from the declared roles (cut.ts `energyPoints`), never a measurement. */
  readonly energy: readonly { readonly beatId: string; readonly x: number; readonly y: number }[];
  readonly structure: {
    /** null on the specialty lane, where the spine is not graded. */
    readonly malformed: boolean | null;
    readonly violations: number;
    readonly passes: number;
    readonly unmeasured: number;
    readonly notEngaged: number;
    readonly enforced: number;
    readonly findings: readonly StructureFinding[];
  };
  readonly spineMoved: boolean;
  readonly origin: "fixture" | "generated";
};

export type AdShotView = { readonly id: string; readonly durationS: number; readonly image: string; readonly motion: string; readonly super: string | null };
export type AdScenarioView = {
  readonly id: string;
  readonly title: string;
  readonly logline: string;
  readonly shots: readonly AdShotView[];
  readonly endCard: { readonly cta: string; readonly line: string | null; readonly holdS: number };
  readonly runtimeS: number;
  readonly musicMood: string;
};
export type AdsScenarios = {
  readonly face: "ads";
  readonly idea: { readonly id: string; readonly title: string; readonly angle: string } | null;
  /** The scenarios were written for an idea other than the one picked now. */
  readonly ideaChanged: boolean;
  readonly targetS: number | null;
  readonly range: readonly [number, number];
  readonly scenarios: readonly AdScenarioView[];
  readonly picked: string | null;
  readonly engine?: EngineView;
};

export type ScriptData = ScriptDocument | TrailerCutView | AdsScenarios;
