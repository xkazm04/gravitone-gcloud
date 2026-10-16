// THE PRODUCE PORT AS THE SCREENS HOLD IT - client-safe (types only): the Server Actions the
// Floor composers, the Plan, Compose and the Runs acts call, and the few shapes they need that
// the domain contract (@gt/domain/produce, L26) does not carry because they are presentation or
// fixture-side reads, not records:
//
//   ComposerChoices / ComposeChoices   what a composer's selects and Compose's offer. In the real
//                                       wiring these come from the Library (styles, takes) and the
//                                       registry (topics); named here so the screens never hold a
//                                       hand list.
//   ProduceJob                          a job as Runs draws and acts on it (the kernel Job's fields
//                                       Runs needs, plus its schedule and its part's options).
//   LaneHoldView                        a held lane (COMMON decision 6) with its job and stage.
//   ActOutcome                          what an act did, in the words its toast says.
//   RerouteResult                       a re-route is a receipt first, then a confirm.
//
// A receipt is read DRY unless the operator arms it live (`mode`); the token binds the mode, so a
// live confirm is a confirm of a live receipt the operator saw (COMMON decision 4). A re-route
// keeps the mode its job was launched in.
//
// Every verb answers the action core's envelope (app/_server/actionCore.ts): `{ok, value}` or
// `{ok, error}`, never a throw.

import type { MediaLane, ResourceLane } from "@gt/domain/lane";
import type { JobState } from "@gt/domain/job.machine";
import type {
  ComposeInput,
  ComposerInput,
  FigureSource,
  LaunchedProject,
  LaunchedRun,
  PartPatch,
  PlanView,
  ProjectList,
  Receipt,
  ReceiptMode,
  RerouteOption,
  StaleReceipt,
} from "@gt/domain/produce";

import type { ActionResult } from "../../../_server/actionCore.ts";

export type Choice = { readonly value: string; readonly label: string };

export type ComposerChoices = {
  readonly image: { readonly candidates: readonly Choice[]; readonly proven: readonly Choice[]; readonly sweep: number };
  readonly article: { readonly topics: readonly (Choice & { readonly bundle: string })[] };
  readonly video: { readonly subjects: readonly Choice[] };
};

export type RecipeChoice = { readonly id: string; readonly label: string; readonly sub: string; readonly icon: MediaLane };

export type ComposeChoices = {
  readonly recipes: readonly RecipeChoice[];
  readonly styles: readonly Choice[];
  readonly takes: readonly Choice[];
  readonly topics: readonly Choice[];
  /** The take no project uses yet - Compose preselects it (projects.js `renderCompose`). */
  readonly freshTake?: string;
};

export type ProduceJob = {
  readonly id: string;
  readonly title: string;
  readonly lane: ResourceLane;
  readonly state: JobState;
  readonly media?: MediaLane;
  readonly projectId?: string;
  readonly projectTitle?: string;
  readonly partId?: string;
  /** The jobs this one waits for (through gates). */
  readonly after: readonly string[];
  readonly s: number;
  readonly e: number;
  readonly queuePos: number | null;
  readonly blocked: boolean;
  readonly held: boolean;
  readonly attempt: number;
  readonly error?: string;
  readonly stage?: string;
  readonly model: string;
  readonly units: number;
  readonly noun: string;
  readonly seconds: number;
  readonly usd: number | null;
  readonly usdRange?: readonly [number, number];
  readonly unpricedReason?: string;
  readonly src: FigureSource;
  readonly mode: "dry" | "live";
  readonly ceilingUsd?: number;
  /** More than one way to make it, and it is not running or done. */
  readonly reroutable: boolean;
};

export type LaneHoldView = { readonly lane: ResourceLane; readonly jobId: string; readonly title: string; readonly stage?: string; readonly since: string };

export type ActOutcome = { readonly jobId: string; readonly note: string };

export type RerouteResult = { readonly kind: "receipt"; readonly receipt: Receipt } | { readonly kind: "done"; readonly act: ActOutcome } | StaleReceipt;

/** A receipt's confirm: launched, or the receipt as it reads now. */
export type Confirmed<T> = ({ readonly kind: "launched" } & T) | StaleReceipt;

type R<T> = Promise<ActionResult<T>>;

/** The port the screens call (./wire.ts gathers the actions into one). */
export type ProducePort = {
  readonly composerChoices: () => R<ComposerChoices>;
  readonly composerReceipt: (i: { readonly input: ComposerInput; readonly mode?: ReceiptMode }) => R<Receipt>;
  readonly launchRun: (i: { readonly input: ComposerInput; readonly token: string; readonly ceilingUsd?: number; readonly mode?: ReceiptMode }) => R<Confirmed<LaunchedRun>>;
  readonly listProjects: () => R<ProjectList>;
  readonly loadPlan: (i: { readonly id: string }) => R<PlanView>;
  readonly composeChoices: () => R<ComposeChoices>;
  readonly compose: (i: ComposeInput) => R<{ readonly id: string }>;
  readonly setPart: (i: { readonly id: string; readonly rev: number; readonly partId: string; readonly patch: PartPatch }) => R<PlanView>;
  readonly rename: (i: { readonly id: string; readonly rev: number; readonly title: string }) => R<PlanView>;
  readonly discard: (i: { readonly id: string; readonly rev: number }) => R<{ readonly id: string }>;
  readonly planReceipt: (i: { readonly id: string; readonly mode?: ReceiptMode }) => R<Receipt>;
  readonly launchPlan: (i: { readonly id: string; readonly rev: number; readonly token: string; readonly ceilingUsd?: number; readonly mode?: ReceiptMode }) => R<Confirmed<LaunchedProject>>;
  readonly pauseJob: (i: { readonly jobId: string }) => R<ActOutcome>;
  readonly resumeJob: (i: { readonly jobId: string }) => R<ActOutcome>;
  readonly retryJob: (i: { readonly jobId: string; readonly ceilingUsd?: number }) => R<ActOutcome>;
  readonly moveJob: (i: { readonly jobId: string; readonly dir: "earlier" | "later" }) => R<ActOutcome>;
  readonly rerouteOptions: (i: { readonly jobId: string }) => R<readonly RerouteOption[]>;
  readonly reroute: (i: { readonly jobId: string; readonly option: string; readonly token?: string; readonly ceilingUsd?: number }) => R<RerouteResult>;
  readonly ackLane: (i: { readonly lane: ResourceLane }) => R<ActOutcome>;
};
