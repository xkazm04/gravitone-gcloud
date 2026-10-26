// THE ARTICLE PIPELINE'S WIRE TYPES — shared by the engine, the CLI and the
// /articles surface. Types only: no `node:` import, so a client component may
// import this file without pulling a server module into its bundle.
//
// One run lives in one directory (lib/articles/store.ts):
//
//   foundry-out/articles/<runId>/
//     run.json              ArticleRun — the manifest, rewritten under a lock
//     sources.json          Source[]        research
//     claims.json           Claim[]         research
//     outline.md                            outline
//     post/index.html       the page        draft
//     post/post.md          Medium-ready    draft
//     post/meta.json        PostMeta        draft
//     post/figures/NN-*.svg                 draft
//     patches.json          RegistryPatch[] draft (proposals), diffs by code
//     patches/<id>.patch    unified diff against the registry, made by code
//     critique/reviewers.json                the reviewer panel, snapshot at critique start
//     critique/round-<n>/reviews/<id>.json   Review          one per completed reviewer
//     critique/round-<n>/receipts/<id>.json  ReviewerReceipt one per reviewer that ran
//     critique/round-<n>/closed.json         the round reached quorum
//     critique/round-<n>/dispositions.json   FindingDisposition[]  the writer
//     critique/round-<n>/decision.json       CritiqueDecisionRecord the writer
//     critique/round-<n>/revised.json        the writer revised the post after this round
//     check.json            CheckReport     check (deterministic, no model)
//     check/*.png           screenshots at 390 and 1440 px
//     medium/               paste-ready package, built at landing
//     agent/<step>.json     the seam's receipt per agent turn
//     landing.log           gate output from the registry write-back
//
// ABSENCE IS OMISSION. An optional field that has no value is left out of the
// JSON, never written as `null` — the registry's publication/1 contract uses the
// same convention, and the two meet in lib/articles/registryWrite.ts.

/** The contract's ten states plus `critiquing` (scope amendment 1, the
 *  multi-model critique between the draft and the check). Order is the happy
 *  path. */
export const ARTICLE_STATUSES = [
  "queued",
  "researching",
  "drafting",
  "critiquing",
  "checking",
  "awaiting-approval",
  "approved",
  "landing",
  "landed",
  "rejected",
  "failed",
] as const;
export type ArticleStatus = (typeof ARTICLE_STATUSES)[number];

/** The statuses a driver is working through. With no live driver they are a stalled run, not a
 *  running one (app/articles/runModel.ts phaseOf; the ledger projection reads the same set). */
export const WORKING: readonly ArticleStatus[] = ["queued", "researching", "drafting", "critiquing", "checking", "approved", "landing"];

/** The five steps. `outline` and `draft` both run while the status is
 *  `drafting`; `research` is `researching`; `critique` is `critiquing`;
 *  `check` is `checking`. */
export const STEP_NAMES = ["research", "outline", "draft", "critique", "check"] as const;
export type StepName = (typeof STEP_NAMES)[number];

export type StepStatus = "running" | "done" | "failed";

/** A step is listed once it has started; a step that has not started is not in
 *  the array at all. `endedAt` is absent while it runs. `costUsd` is present
 *  only when the engine reported one (the check step never spends). */
export interface ArticleStep {
  name: StepName;
  status: StepStatus;
  startedAt: string;
  endedAt?: string;
  costUsd?: number;
}

export type EffortLevel = "low" | "medium" | "high" | "xhigh" | "max";
export const EFFORT_LEVELS: readonly EffortLevel[] = ["low", "medium", "high", "xhigh", "max"];

/** What the post is about. `subject` = a registry subject by address;
 *  `free` = the operator's own words. Same shape as publication/1's `topic`. */
export interface ArticleTopic {
  kind: "subject" | "free";
  bundle?: string;
  subject?: string;
  text: string;
  angle?: string;
}

/** The post standard this run was held to, resolved from the registry by
 *  address when the run was created (lib/articles/registryRead.ts). `version`
 *  and `bundleHash` are absent only when the registry could not be reached — in
 *  which case the run is `failed` and says so in `error`. */
export interface ArticleStandard {
  recipe: "technical-blog-post-authoring";
  version?: string;
  bundle: "technical-writing";
  subjects: string[];
  bundleHash?: string;
}

export interface ArticleApproval {
  at: string;
  /** The patch ids the human approved. The post itself is approved by the act. */
  patches: string[];
}

export interface ArticleRejection {
  at: string;
  note: string;
}

/** The operator sent a draft at the gate back to be written again
 *  (`awaiting-approval -> drafting`, lib/articles/engine.ts `reworkRun`). The
 *  research, the sources and the outline are kept; the run re-does draft,
 *  critique and check. `note` is the instruction the draft turn is given.
 *  `count` is 1 for the first rework and rises by one for each later one, so a
 *  run that was reworked three times says so. Absent on a run never reworked. */
export interface ArticleRework {
  at: string;
  note: string;
  count: number;
}

/** What the registry write-back did. Written while `landing`, completed at
 *  `landed`; on a failed gate it keeps the branch and the worktree so the
 *  operator can look. */
export interface ArticleLanding {
  slug: string;
  branch: string;
  /** The registry worktree the write-back built in. Removed on success. */
  worktree?: string;
  commit?: string;
  prUrl?: string;
  /** Lanes whose gates ran, with their verdicts, in order. */
  gates: { lane: string; mode: "write" | "check"; ok: boolean }[];
  /** Where the paste-ready Medium package is, relative to the run directory. */
  medium?: string;
}

/* ── the critique (scope amendment 1) ──────────────────────────────────────── */

/** The local CLIs a reviewer can run through (lib/agent/cliSeam.ts). A reviewer id is not an engine: `gemini` and `gemini4` both run through agy. */
export const REVIEWER_ENGINES = ["claude", "codex", "agy"] as const;
export type ReviewerEngine = (typeof REVIEWER_ENGINES)[number];

/** What became of one reviewer in one round. `unavailable` and `seat-limit`
 *  are runs that did not happen (a 402, a usage limit, a missing CLI), never a
 *  verdict on the post. */
export const REVIEWER_OUTCOMES = ["completed", "unavailable", "timed-out", "errored", "seat-limit"] as const;
export type ReviewerOutcome = (typeof REVIEWER_OUTCOMES)[number];

export const REVIEW_VERDICTS = ["publish", "revise", "rework"] as const;
export type ReviewVerdict = (typeof REVIEW_VERDICTS)[number];
export const FINDING_KINDS = ["factual", "format", "engagement", "insight", "voice"] as const;
export type FindingKind = (typeof FINDING_KINDS)[number];
export const FINDING_SEVERITIES = ["blocker", "major", "minor"] as const;
export type FindingSeverity = (typeof FINDING_SEVERITIES)[number];
export const DISPOSITIONS = ["accepted", "rejected", "deferred"] as const;
export type Disposition = (typeof DISPOSITIONS)[number];
export const CRITIQUE_DECISIONS = ["keep", "rewrite", "research"] as const;
export type CritiqueDecision = (typeof CRITIQUE_DECISIONS)[number];

/** One reviewer of the panel (pipeline/article-reviewers.json). */
export interface ReviewerSpec {
  /** Kebab-case slug, unique in the panel; the registry publishes it. */
  id: string;
  engine: ReviewerEngine;
  model: string;
  effort: EffortLevel;
  timeoutMin: number;
}

export interface ReviewFinding {
  /** Unique within its review. */
  id: string;
  kind: FindingKind;
  severity: FindingSeverity;
  /** Where in the post: a section and paragraph, a figure, a citation. */
  location: string;
  claim: string;
  /** http(s) URLs the reviewer opened; may be empty. */
  evidence: string[];
  suggestion: string;
}

/** A review as the engine stored it, after validation. `reviewer`, `model`
 *  and `effort` are the engine's (the panel's), never the reviewer's own say. */
export interface Review {
  reviewer: string;
  model: string;
  effort: EffortLevel;
  verdict: ReviewVerdict;
  summary: string;
  findings: ReviewFinding[];
}

/** The writer's call on one finding. `action` is omitted when nothing was done. */
export interface FindingDisposition {
  reviewer: string;
  findingId: string;
  disposition: Disposition;
  reason: string;
  action?: string;
}

export interface CritiqueDecisionRecord {
  round: number;
  decision: CritiqueDecision;
  rationale: string;
}

/** One reviewer in the run's summary: its outcome in the last round it ran,
 *  the first error of that round when it did not complete, and its cost across
 *  every round in which the CLI reported one. */
export interface CritiqueReviewer {
  id: string;
  engine: ReviewerEngine;
  model: string;
  effort: EffortLevel;
  outcome: ReviewerOutcome;
  costUsd?: number;
  error?: string;
}

/** The seam's receipt for one reviewer in one round. */
export interface ReviewerReceipt extends CritiqueReviewer {
  round: number;
  /** 1, or 2 after a malformed first answer. */
  attempts: number;
  turns: number;
  durationMs: number;
  errors: string[];
  /** Entries the reviewer left in its read-only workspace (a fence breach,
   *  recorded; nothing it writes is ever read back). Absent when none. */
  wrote?: string[];
  /** Evidence entries dropped because they were not http(s) URLs. */
  dropped?: number;
}

export interface CritiqueCounts {
  total: number;
  accepted: number;
  rejected: number;
  deferred: number;
}

/** `ArticleRun.critique` — the summary the gate, the CLI and the registry's
 *  publication.json `critique` block read. `decision` is absent until the
 *  writer has decided after the first round. */
export interface ArticleCritique {
  rounds: number;
  reviewers: CritiqueReviewer[];
  findings: CritiqueCounts;
  decision?: CritiqueDecision;
}

export interface ArticleRun {
  id: string;
  status: ArticleStatus;
  topic: ArticleTopic;
  promptRef: { file: "pipeline/ARTICLE-POST-PROMPT.md"; sha: string };
  standard: ArticleStandard;
  model: string;
  effort: EffortLevel;
  steps: ArticleStep[];
  createdAt: string;
  updatedAt: string;
  error?: string;
  /** Present once the first critique round has a reviewer outcome. */
  critique?: ArticleCritique;
  approval?: ArticleApproval;
  rejection?: ArticleRejection;
  /** The latest rework; earlier ones are in `rework/<n>/` under the run's directory. */
  rework?: ArticleRework;
  landing?: ArticleLanding;
  /** The private Medium draft the gate reviews. Absent (the key omitted) until the
   *  run first reached the gate; never set by anything but `ensureMediumDraft`. */
  mediumDraft?: MediumDraft;
  /** WHEN THE POST LANDED, as an event: written once, by the `landed`
   *  transition and by nothing else, and absent (not null, not "") before it.
   *  It exists because a retention policy needs a clock that means one thing:
   *  the canvas hides a landed article once it is more than 7 days old, and
   *  `updatedAt` cannot say that, because every write of any kind restamps it.
   *  `updatedAt` is "when did we last touch this", never "when did this land".
   *  A run that landed before this field existed has none; a reader must say
   *  so rather than substitute `updatedAt`. */
  landedAt?: string;
  /** The trial this post was written around (a registry subject's claim measured against an
   *  alternative before the run existed). Absent on a classic run, which the gate labels as
   *  third-party evidence. Written once, by `createRun`. */
  trial?: ArticleTrialRef;
}

/** The Medium draft made for a run at the gate. `ready` carries `url` (the
 *  editor address) and `shot` (run-relative PNG of the draft as Medium rendered
 *  it); `unavailable` carries `reason` verbatim and, when an earlier draft
 *  exists, keeps its `url` so a retry replaces the body instead of starting a
 *  second draft; `creating` is written first so the gate can say so. Absent fields are omitted, never null. */
export interface MediumDraft {
  state: "creating" | "ready" | "unavailable";
  at: string;
  url?: string;
  shot?: string;
  /** Figures the saved draft holds, read back after a reload… */
  figures?: number;
  /** …of the figures the story has; fewer is a draft to fix before publishing. */
  figuresOf?: number;
  reason?: string;
}

/** One numbered source. `took` is what the post took from it, in a clause. */
export interface Source {
  n: number;
  url: string;
  title: string;
  publisher: string;
  /** ISO date (YYYY, YYYY-MM or YYYY-MM-DD) the source was published or last updated. */
  date: string;
  primary: boolean;
  counter: boolean;
  took: string;
}

export interface Claim {
  text: string;
  /** The `n` of the source that carries it. */
  source: number;
}

/** What the draft turn says about its own post — the parts a deterministic
 *  reader cannot reliably lift out of HTML. */
export interface PostMeta {
  title: string;
  subtitle: string;
  /** Up to five, used for medium/tags.txt. */
  tags: string[];
}

export type PatchKind = "technique" | "application" | "subject" | "law";
export const PATCH_KINDS: readonly PatchKind[] = ["technique", "application", "subject", "law"];

/** A proposed change to the registry, offered at the human gate. The agent
 *  writes the proposed FILE; code writes the diff (`patchFile`), so a patch
 *  that reaches `git apply` was never hand-typed by a model. */
export interface RegistryPatch {
  id: string;
  /** Registry-relative path of the file the patch changes or creates. */
  target: string;
  kind: PatchKind;
  rationale: string;
  sources: number[];
  /** Run-relative, `patches/<id>.patch`. */
  patchFile: string;
  /** Lands with the post whatever the approval names: a trial run's own measurement record,
   *  which the post cites as source 1. Absent on every other patch. */
  required?: true;
}

/* ── the check ─────────────────────────────────────────────────────────────── */

/** The owner's seven quality dimensions. A deterministic check can measure
 *  five of them in part; `storytelling` and `depth` are the human's alone and
 *  are reported as not measured rather than passed. */
export const CHECK_DIMENSIONS = [
  "structure",
  "storytelling",
  "depth",
  "figures",
  "voice",
  "medium-fidelity",
  "truth",
] as const;
export type CheckDimension = (typeof CHECK_DIMENSIONS)[number];

export type CheckStatus = "pass" | "fail" | "not-measured";

export interface CheckItem {
  id: string;
  dimension: CheckDimension;
  label: string;
  status: CheckStatus;
  /** What was measured, as a short string or number ("6", "17.5px", "none"). */
  value?: string | number;
  /** The bar it was held to ("≥ 5", "≥ 18px"). */
  expected?: string;
  /** Specifics: the offending words, the unresolved citations, the reason a
   *  measurement could not be taken. */
  detail?: string[];
}

export interface CheckReport {
  schema: "article-check/1";
  at: string;
  /** Only dimensions with at least one measurement are present. A dimension
   *  fails when any of its measured items fails. */
  dimensions: Partial<Record<CheckDimension, "pass" | "fail">>;
  notMeasured: CheckDimension[];
  items: CheckItem[];
  /** Run-relative screenshot paths. */
  screenshots: string[];
}

/** One run of the deterministic check between writer turns (after the draft, after each
 *  critique revision), as `checks/<label>-<pass>.json` holds it. The failures it found are
 *  handed to the writer as mandatory fixes; `fixed` is true once that fix turn has run. */
export interface CheckPassRecord {
  /** "draft" or "round-<n>". */
  label: string;
  /** 1 is the check of the text as the writer left it; each fix turn adds one. */
  pass: number;
  at: string;
  failed: { id: string; dimension: CheckDimension; label: string; value?: string | number; expected?: string; detail?: string[] }[];
  fixed: boolean;
  /** The fix turn failed (the post is left as it was); the run goes on to the gate. */
  fixError?: string;
}

/** Everything the /articles/[runId] page needs in one read. */
export interface ArticleRunDetail {
  run: ArticleRun;
  sources: Source[];
  claims: Claim[];
  outline?: string;
  meta?: PostMeta;
  check?: CheckReport;
  /** The checks that ran between writer turns, oldest first. */
  checkPasses?: CheckPassRecord[];
  patches: (RegistryPatch & { diff: string })[];
  /** Run-relative path of the rendered post, when it exists. */
  post?: string;
  /** The critique's files, read back; absent before the critique step began. */
  critique?: CritiqueDetail;
  /** The trial's files under `<run>/experiment/`, read back; absent on a classic run. */
  trial?: TrialDetail;
}

/** One critique round as its files hold it. A field is absent until its file
 *  exists: no dispositions before the writer has answered. */
export interface CritiqueRoundDetail {
  round: number;
  receipts: ReviewerReceipt[];
  reviews: Review[];
  /** The round reached quorum (`closed.json`). */
  closed: boolean;
  dispositions?: FindingDisposition[];
  decision?: CritiqueDecisionRecord;
  /** The writer revised the post after this round. */
  revised?: { at: string; research: boolean };
}

export interface CritiqueDetail {
  reviewers: ReviewerSpec[];
  maxRounds: number;
  minCompleted: number;
  rounds: CritiqueRoundDetail[];
}

/** A registry subject offered as a topic. */
export interface TopicSubject {
  bundle: string;
  slug: string;
  category: string;
  file: string;
}

export interface CreateRunInput {
  topic: ArticleTopic;
  model?: string;
  effort?: EffortLevel;
  /** A closed trial's id. The topic then comes from the trial's subject and the angle from its
   *  prereg `question`. */
  trial?: string;
}

/** WHAT STARTING A RUN COSTS, so a surface can say it before it spends it.
 *
 *  Measured, not modelled: the observed range over the runs of 2026-10, the
 *  same observation `lib/articles/loop.ts` sizes its ceilings against. It
 *  carries its date because a figure without one is read as a constant, and
 *  this one will move the next time the model or the critique roster changes.
 *
 *  Lives here rather than in loop.ts because a client component may import
 *  this file and may not import that one, and a confirm dialog that states a
 *  price must read it from one place. A second spelling of a price is how two
 *  surfaces come to disagree about what the user is about to be charged. */
export const RUN_COST_HINT = {
  usdLow: 47,
  usdHigh: 92,
  turnsLow: 26,
  turnsHigh: 32,
  measured: "2026-10",
} as const;

/**
 * The longest a rejection or rework note may be. It lives HERE, not in
 * engine.ts, because the client needs it: a textarea that lets the operator
 * type 2,400 characters and then shows them a 400 from the route has wasted
 * their note. engine.ts re-exports it and still enforces it - the bound is the
 * server's, the hint is the client's, and there is one number.
 */
export const NOTE_MAX_CHARS = 2000;

/* ── the status machine ────────────────────────────────────────────────────── */

/**
 * Every legal move. `failed` is reachable from every working state and leaves
 * only through `resume`, which goes back to the state whose step failed —
 * hence its wide row. `rejected` and `landed` are terminal.
 *
 * `approved` is reachable ONLY from `awaiting-approval` (the human's act) and
 * from `failed` when the failure happened during landing (a resume re-lands;
 * it never re-approves). Pushing to the registry is reachable only through
 * `approved -> landing`, so nothing that has not passed the gate can land.
 *
 * `awaiting-approval -> drafting` is the rework edge: the operator sends the
 * draft back with an instruction (`reworkRun`). It is the ONLY way back from
 * the gate, and `rejected` stays terminal: a reject throws the piece away, a
 * rework keeps the research and the outline and writes the post again.
 *
 * `critiquing` (scope amendment 1) sits between `drafting` and `checking` and
 * is the only way to `checking`: no draft reaches the gate unreviewed. A
 * critique that fails its quorum is `failed` with `critique-quorum`, and a
 * resume goes back into `critiquing`.
 */
export const TRANSITIONS: Record<ArticleStatus, readonly ArticleStatus[]> = {
  queued: ["researching", "failed"],
  researching: ["drafting", "failed"],
  drafting: ["critiquing", "failed"],
  critiquing: ["checking", "failed"],
  checking: ["awaiting-approval", "failed"],
  "awaiting-approval": ["approved", "rejected", "drafting"],
  approved: ["landing", "failed"],
  landing: ["landed", "failed"],
  landed: [],
  rejected: [],
  failed: ["queued", "researching", "drafting", "critiquing", "checking", "approved"],
};

export function canTransition(from: ArticleStatus, to: ArticleStatus): boolean {
  return from === to || TRANSITIONS[from].includes(to);
}

/* ── the trial: a measured claim the post is written around ───────────────── */
//
// A trial is made BEFORE its run exists, by an agent with a shell working in
// `<store parent>/article-trials/<id>/` (lib/articles/trial/store.ts):
//
//   trial.json     TrialRecord     the manifest
//   brief/         the subject as the registry holds it, written by `trial open`
//   frame.md       the prior (written first), the validity check, the alternatives weighed
//   validity.json  TrialValidity
//   prereg.json    TrialPrereg     sealed before any measured command
//   seal.json      TrialSeal
//   harness/       the code that measures both arms
//   exec.jsonl     TrialExecRecord per `trial exec`
//   results.json   TrialResults
//   verdict.json   TrialVerdict    computed by code from prereg + results
//   REPORT.md      the agent's account of the experiment
//
// A closed trial whose verdict is not `void` becomes a run (`createRun({trial})`),
// which copies the bundle to `<run>/experiment/` and cites it as source 1.

export const TRIAL_STATUSES = ["open", "framed", "sealed", "closed"] as const;
export type TrialStatus = (typeof TRIAL_STATUSES)[number];

/** `upheld`: the golden path won. `challenged`: the alternative won. `null`: no difference
 *  beyond the declared band with every control held. `void`: a control failed or an arm fell
 *  short of `n`; nothing was measured, so nothing is written. */
export const TRIAL_VERDICTS = ["upheld", "challenged", "null", "void"] as const;
export type TrialVerdictKind = (typeof TRIAL_VERDICTS)[number];

export const VALIDITY_STATES = ["current", "stale", "untestable"] as const;
export type ValidityState = (typeof VALIDITY_STATES)[number];

export const TRIAL_ARM_IDS = ["golden", "alternative"] as const;
export type TrialArmId = (typeof TRIAL_ARM_IDS)[number];

export interface TrialArm {
  id: TrialArmId;
  label: string;
  description: string;
}

/** The ONE optimized metric (eval-harness/metric-role-contract): every other number is a guard. */
export interface TrialMetric {
  id: string;
  label: string;
  unit: string;
  direction: "higher" | "lower";
}

/** A guard each arm must clear to be eligible to win. `metric` keys `TrialArmResult.guards`. */
export interface TrialThreshold {
  metric: string;
  op: ">=" | "<=";
  value: number;
  label: string;
}

export interface TrialSourceRef {
  url: string;
  title: string;
  /** ISO date (YYYY, YYYY-MM or YYYY-MM-DD). */
  date: string;
}

/** `prereg.json`, declared and sealed before the first measured command. */
export interface TrialPrereg {
  schema: "article-trial-prereg/1";
  subject: { bundle: string; slug: string };
  /** The technique slug whose rule is under test. */
  technique: string;
  /** The rule under test, quoted from the technique or the golden path. */
  claim: string;
  alternative: { name: string; description: string; source: TrialSourceRef };
  /** What the agent expected before its first search (prior-declaration-and-steel-man). */
  prior: string;
  /** One sentence; becomes the run's angle. */
  question: string;
  /** `golden` first, then `alternative`. */
  arms: [TrialArm, TrialArm];
  metric: TrialMetric;
  /** The smallest difference that counts: an absolute amount, or a share of the golden arm's mean. */
  minEffect: { kind: "absolute" | "relative"; value: number };
  thresholds: TrialThreshold[];
  /** Observations per arm. Also the floor: an arm with fewer is a `void` trial. */
  n: number;
  /** Conditions that must hold across both arms (same load, same model, cold cache ...). */
  controls: { id: string; statement: string }[];
  /** The application's stack (`node`, `python`, `claude-code` ...). */
  stack: string;
  /** `<stack>@<version>`, the application's `verified_against`. */
  environment: string;
  budget: { wallMin: number; modelCalls: number };
}

export interface TrialSeal {
  /** sha256 (hex) of prereg.json's bytes as sealed. */
  sha256: string;
  at: string;
}

/** One `trial exec`. A pilot runs before the seal and never counts as a measurement. */
export interface TrialExecRecord {
  at: string;
  cmd: string[];
  pilot: boolean;
  exitCode: number | null;
  durationMs: number;
  timedOut: boolean;
}

export interface TrialArmResult {
  id: TrialArmId;
  /** The optimized metric, one value per observation. */
  observations: number[];
  /** One value per threshold metric. */
  guards: Record<string, number>;
}

/** `results.json`, written by the harness. */
export interface TrialResults {
  schema: "article-trial-results/1";
  arms: [TrialArmResult, TrialArmResult];
  controls: { id: string; held: boolean; evidence: string }[];
  /** Model calls the harness made, against `prereg.budget.modelCalls`. */
  modelCalls: number;
  notes?: string;
}

export interface TrialArmSummary {
  id: TrialArmId;
  n: number;
  mean: number;
  sd: number;
  guardsCleared: boolean;
}

/** `verdict.json`, computed by `computeVerdict` and never written by a model. */
export interface TrialVerdict {
  schema: "article-trial-verdict/1";
  verdict: TrialVerdictKind;
  reason: string;
  arms: [TrialArmSummary, TrialArmSummary];
  /** Alternative mean minus golden mean, signed so that a positive delta favours the alternative. */
  delta: number;
  /** The declared minimum effect, resolved to the metric's unit. */
  band: number;
  /** Seeded bootstrap interval of `delta`: reported, never decisive. Absent for a void trial. */
  deltaCi95?: [number, number];
  at: string;
}

/** `validity.json`: is the subject's claim still the practice, and can it be tested here? */
export interface TrialValidity {
  state: ValidityState;
  reasons: string[];
  sources: TrialSourceRef[];
}

/** `trial.json`. */
export interface TrialRecord {
  schema: "article-trial/1";
  id: string;
  status: TrialStatus;
  subject: { bundle: string; slug: string; file: string; digest?: string; revision?: number; changedAt?: string };
  createdAt: string;
  updatedAt: string;
  seal?: TrialSeal;
  verdict?: TrialVerdictKind;
  closedAt?: string;
  /** The run written around this trial, once there is one. */
  runId?: string;
}

/** `ArticleRun.trial`: what the run needs to cite and land the trial. */
export interface ArticleTrialRef {
  id: string;
  verdict: Exclude<TrialVerdictKind, "void">;
  technique: string;
  /** The alternative's name. */
  alternative: string;
  /** The metric's label. */
  metric: string;
  n: number;
  /** The source number the experiment holds in sources.json: always 1. */
  sourceN: 1;
  /** Registry-relative path of the application record the post cites. */
  applicationPath: string;
}

/** The trial as the gate reads it back from `<run>/experiment/`. */
export interface TrialDetail {
  prereg: TrialPrereg;
  verdict: TrialVerdict;
  results: TrialResults;
  validity?: TrialValidity;
  execs: TrialExecRecord[];
  /** REPORT.md, verbatim. */
  report?: string;
  /** Context names in this repo's `.ai/registry-map.json` that the subject governs. */
  governsHere: string[];
}

/** A subject ranked for a trial (`trial candidates`). */
export interface TrialCandidate {
  bundle: string;
  slug: string;
  title: string;
  file: string;
  revision?: number;
  changedAt?: string;
  /** Contexts in this repo the subject governs. */
  governsHere: number;
  /** Applications whose `ab_verdict` is `not-better`. */
  contested: number;
  /** Applications whose currency clock runs out inside the horizon. */
  atRisk: number;
  /** The subject's volatile-fact score from `check-currency --volatile`. */
  volatile: number;
  score: number;
  /** The trial or run id that already holds this subject. */
  claimed?: string;
}
