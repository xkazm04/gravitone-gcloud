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
//     check.json            CheckReport     check (deterministic, no model)
//     check/*.png           screenshots at 390 and 1440 px
//     medium/               paste-ready package, built at landing
//     agent/<step>.json     the seam's receipt per agent turn
//     landing.log           gate output from the registry write-back
//
// ABSENCE IS OMISSION. An optional field that has no value is left out of the
// JSON, never written as `null` — the registry's publication/1 contract uses the
// same convention, and the two meet in lib/articles/registryWrite.ts.

/** Exactly the contract's ten states. Order is the happy path. */
export const ARTICLE_STATUSES = [
  "queued",
  "researching",
  "drafting",
  "checking",
  "awaiting-approval",
  "approved",
  "landing",
  "landed",
  "rejected",
  "failed",
] as const;
export type ArticleStatus = (typeof ARTICLE_STATUSES)[number];

/** The four steps. `outline` and `draft` both run while the status is
 *  `drafting`; `research` is `researching`; `check` is `checking`. */
export const STEP_NAMES = ["research", "outline", "draft", "check"] as const;
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
  approval?: ArticleApproval;
  rejection?: ArticleRejection;
  landing?: ArticleLanding;
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

/** Everything the /articles/[runId] page needs in one read. */
export interface ArticleRunDetail {
  run: ArticleRun;
  sources: Source[];
  claims: Claim[];
  outline?: string;
  meta?: PostMeta;
  check?: CheckReport;
  patches: (RegistryPatch & { diff: string })[];
  /** Run-relative path of the rendered post, when it exists. */
  post?: string;
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
}
