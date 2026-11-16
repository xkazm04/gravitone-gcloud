// THE PRODUCTIONS SCREEN'S VIEW - client-safe (types only). The real side reads the kernel's production record
// (./real.ts); the fixture side (GRAVITONE_PRODUCE_SIDE=fixture) is the scripted slate.

import type { ReceiptMode, Receipt } from "@gt/domain/produce";
import type { CastJob, CastRound, MusicRoute, Production, ProductionId, ProductionLesson, ProductionSource, ProductionStage, SoundRoute, TakeKind, VoiceProof, VoiceRoute } from "@gt/domain/production";

import type { ActionResult } from "../../../../_server/actionCore.ts";

/** A board frame, served: `id` is the panel a hero take is asked to animate. */
export type ProductionFrame = { readonly id: string; readonly beat: string; readonly prompt: string; readonly src: string };

/** How far a rendering take's job got; absent when no job can be read. */
export type TakeProgress = { readonly jobState: string; readonly done: number; readonly total: number; readonly step?: string };

/** A concept and everything already decided for it. */
export type ProductionEntry = {
  readonly production: Production;
  readonly logline: string;
  /** A served picture; omitted when the concept has none yet. */
  readonly poster?: string;
  readonly frames: readonly ProductionFrame[];
  readonly progress: Readonly<Record<string, TakeProgress>>;
  readonly rounds: readonly CastRound[];
  /** The latest job of each casting act (`roles`, `audition:<role>`), so the screen can watch and report it. */
  readonly castJobs: Readonly<Record<string, CastJob>>;
  readonly lessons: readonly ProductionLesson[];
  /** How far the latest cut's job got; absent when no job can be read. */
  readonly cutJob?: TakeProgress;
};

/** A concept that is kept and that nobody started: it has a Start button and no record yet. */
export type KeptConcept = {
  readonly source: ProductionSource;
  readonly title: string;
  readonly logline: string;
  readonly beats: readonly string[];
  /** Every ref a Scout graph node may name this concept by (`?from=` lands here). */
  readonly matches: readonly string[];
};

export type VentureOption = { readonly id: string; readonly name: string };

export type ProductionsView = {
  readonly entries: readonly ProductionEntry[];
  readonly kept: readonly KeptConcept[];
  readonly ventures: readonly VentureOption[];
  /** The dialogue route the box offers now: `dub` until the ref-audios proof is stored as held. */
  readonly voiceRoute: "ref-audio" | "dub";
  readonly voiceProof?: VoiceProof;
};

export type TakeRequestInput = { readonly id: ProductionId; readonly kind: TakeKind; readonly frames: readonly string[]; readonly prompt?: string; readonly mode: ReceiptMode; readonly token?: string };

/** A launch's answer: the receipt to confirm, a fresher one, or the take it started, always with the view rebuilt. */
export type TakeLaunchView = { readonly view: ProductionsView; readonly launch: { readonly kind: "receipt" | "stale"; readonly receipt: Receipt } | { readonly kind: "launched"; readonly jobId: string; readonly takeId: string } };

/** A casting launch: the concept's roles, one role's line, a round, a retry of a round's missing designs, or a done production's lessons. */
export type CastLaunchInput = { readonly kind: "roles" | "audition" | "round" | "retry" | "lessons"; readonly id: ProductionId; readonly roleId?: string; readonly roundId?: string; readonly mode: ReceiptMode; readonly token?: string };
export type CastLaunchView = { readonly view: ProductionsView; readonly launch: { readonly kind: "receipt" | "stale"; readonly receipt: Receipt } | { readonly kind: "launched"; readonly jobId: string } };
/** The operator's words for a venture's frame; a proven video or a press names no genre. */
export type VentureWordsInput = { readonly name: string; readonly tone: string; readonly audience: string; readonly format: string; readonly look: string };

export type RoleEditInput = { readonly id?: string; readonly name: string; readonly brief: string; readonly auditionScript?: string };

/** The operator's audio decision, as the panel sends it. */
export type AudioDecisionInput = { readonly id: ProductionId; readonly voice: VoiceRoute; readonly music: MusicRoute; readonly sound: SoundRoute; readonly musicRef?: string; readonly note?: string };

/** A final cut (takes in cut order) or, only once the proof holds, a speaking take. */
export type CutLaunchInput = { readonly kind: "cut" | "speak"; readonly id: ProductionId; readonly takes?: readonly string[]; readonly roleId?: string; readonly mode: ReceiptMode; readonly token?: string };
export type CutLaunchView = { readonly view: ProductionsView; readonly launch: { readonly kind: "receipt" | "stale"; readonly receipt: Receipt } | { readonly kind: "launched"; readonly jobId: string } };

export type ProductionsPort = {
  readonly start: (input: { readonly source: ProductionSource }) => Promise<ActionResult<ProductionsView>>;
  readonly launch: (input: TakeRequestInput) => Promise<ActionResult<TakeLaunchView>>;
  readonly proven: (input: { readonly id: ProductionId; readonly takeId: string }) => Promise<ActionResult<ProductionsView>>;
  readonly drop: (input: { readonly id: ProductionId }) => Promise<ActionResult<ProductionsView>>;
  readonly move: (input: { readonly id: ProductionId; readonly to: ProductionStage }) => Promise<ActionResult<ProductionsView>>;
  readonly refresh: () => Promise<ActionResult<ProductionsView>>;
  readonly castLaunch: (input: CastLaunchInput) => Promise<ActionResult<CastLaunchView>>;
  readonly saveRoles: (input: { readonly id: ProductionId; readonly roles: readonly RoleEditInput[] }) => Promise<ActionResult<ProductionsView>>;
  readonly heard: (input: { readonly id: ProductionId; readonly roundId: string; readonly voiceId: string; readonly at: string }) => Promise<ActionResult<ProductionsView>>;
  readonly pick: (input: { readonly id: ProductionId; readonly roundId: string; readonly character: string; readonly voice: string; readonly saveToLibrary: boolean }) => Promise<ActionResult<ProductionsView>>;
  readonly recast: (input: { readonly id: ProductionId; readonly roleId: string }) => Promise<ActionResult<ProductionsView>>;
  readonly retryVoices: (input: { readonly id: ProductionId; readonly roundId: string }) => Promise<ActionResult<ProductionsView>>;
  readonly retryCreate: (input: { readonly id: ProductionId; readonly roundId: string }) => Promise<ActionResult<ProductionsView>>;
  readonly decideAudio: (input: AudioDecisionInput) => Promise<ActionResult<ProductionsView>>;
  readonly cutLaunch: (input: CutLaunchInput) => Promise<ActionResult<CutLaunchView>>;
  readonly editLesson: (input: { readonly id: ProductionId; readonly lessonId: string; readonly text: string }) => Promise<ActionResult<ProductionsView>>;
  readonly acceptLesson: (input: { readonly id: ProductionId; readonly lessonId: string; readonly text?: string }) => Promise<ActionResult<ProductionsView>>;
  readonly joinVenture: (input: { readonly id: ProductionId; readonly ventureId: string }) => Promise<ActionResult<ProductionsView>>;
  readonly startVenture: (input: { readonly id: ProductionId; readonly words: VentureWordsInput }) => Promise<ActionResult<ProductionsView>>;
};
