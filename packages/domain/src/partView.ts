// THE PART VIEW CONTRACT: what a part editor draws, the edits it sends and the generating acts it
// launches (Phase 4 wave C, STEPS-DESIGN §1-§3). ZOD-FREE on purpose - the client holds it, and
// every import here is `import type` (tests/next-gates/client-closure.test.ts holds the line). The
// server side (L36: part records + an append-only op log) implements these shapes as written; the
// UI (L38) was built against a fixture side of the same port.
//
// What v1 had instead, and why each piece is shaped as it is:
//   · v1 read IndexedDB records straight into components (`research-scope`, `script-versions`...),
//     so every editor re-derived wounds, gates and verdicts on its own, against the FIXTURE when
//     its own record was missing (the "Glass Harbor shows Bitcoin" defect). A VIEW is computed on
//     the server from this project's records alone by the v1 intelligence (lib/research/scope.ts,
//     lib/script/gate.ts, lib/script/trailer/structure.ts) - the screen draws, it never derives.
//   · v1 had five undo models (INVENTORY §7.4). Here every edit is a `PartOp` sent with the rev it
//     was made against; the server appends it to the part's op log, and undo appends the inverse of
//     the last op still in effect (linear: a new op after an undo drops what was undone).
//     A stale base is a conflict that carries the current view, never a silent overwrite.
//   · v1 surfaces wrote `progress` by hand and some wrote `done` on mount. A verdict is computed
//     (`PartVerdict`), and READY is the only state that opens the part's gate packet.
//   · Generation is a job behind a receipt (COMMON decision 3): a `PartAct` is priced first and
//     confirmed second; nothing a model writes lands without one.

import type { WorkKind } from "@gt/catalog/recipes";
import type { Discipline } from "@gt/catalog/projects";

import type { Receipt } from "./produce.ts";
import type { AdBriefField, Connector, NoteKind, ResearchData, ScriptData } from "./partView.data.ts";
import { FRAMES_ACTS, MOTION_ACTS, type FramesData, type FramesOp, type MotionData, type MotionOp } from "./partView.frames.ts";
import { CUT_ACTS, SCORE_ACTS, type CutData, type CutOp, type ScoreData, type ScoreOp } from "./partView.finish.ts";
import { ARTICLE_ACTS, RENDER_ACTS, STRIPS_ACTS, VOICE_ACTS, WORDS_ACTS, type AlbumOp, type ArticleData, type ExplainerOp, type RenderData, type StripsData, type VoiceData, type WordsData } from "./partView.album.ts";

export type * from "./partView.data.ts";
export * from "./partView.frames.ts";
export * from "./partView.finish.ts";
export * from "./partView.album.ts";

/* ── kinds ────────────────────────────────────────────────────────────────── */

/** Every part kind a recipe plans (`@gt/catalog/recipes` WORK_KINDS + OPERATOR_KINDS). */
export type PartKind = WorkKind | "gate" | "slot";

/** The kinds whose editor exists. Frames, motion, score and cut join in later lots, each adding
 *  its entry to `PartData`; until then their route is a 404, never an empty editor. */
/* L39 (frames, motion) - its own block; partView.frames.ts holds their data, ops and acts. */
const L39_KINDS = ["frames", "motion"] as const;
/* L40 (score, cut; the album's words and render; the explainer's article, strips and voice) -
   partView.finish.ts and partView.album.ts hold their data, ops and acts. */
const L40_KINDS = ["score", "cut", "words", "render", "article", "strips", "voice"] as const;
export const EDITOR_KINDS = ["research", "script", ...L39_KINDS, ...L40_KINDS] as const satisfies readonly WorkKind[];
export type EditorKind = (typeof EDITOR_KINDS)[number];

export function isEditorKind(kind: string): kind is EditorKind {
  return (EDITOR_KINDS as readonly string[]).includes(kind);
}

/** Which face a part's editor wears, decided by the project's discipline (STEPS-DESIGN §2). A
 *  free project chooses its research face (v1 ModeChooser) and Script follows the choice. */
export type ResearchFace = "notebook" | "beats" | "ads";
export type ScriptFace = "document" | "trailer" | "ads";

export function researchFaceOf(discipline: Discipline, freeChoice: "notebook" | "beats" = "beats"): ResearchFace | null {
  if (discipline === "educational") return "notebook";
  if (discipline === "trailer") return "beats";
  if (discipline === "ads") return "ads";
  if (discipline === "free") return freeChoice;
  return null; // music-video plans no research part (album recipe: still, words, render)
}

export function scriptFaceOf(discipline: Discipline, freeChoice: "notebook" | "beats" = "beats"): ScriptFace | null {
  const r = researchFaceOf(discipline, freeChoice);
  return r === null ? null : r === "notebook" ? "document" : r === "beats" ? "trailer" : "ads";
}

/* ── the frame every view shares ──────────────────────────────────────────── */

export type VerdictState = "empty" | "working" | "ready" | "blocked";
/** A reason, with a stable code a test and a packet adapter can key on. The text is the work's
 *  own sentence ("3 cards moved since the scope was confirmed"), never an explanation of the app. */
export type VerdictCode = { readonly code: string; readonly text: string };
export type PartVerdict = { readonly state: VerdictState; readonly codes: readonly VerdictCode[] };

export type PartRef = { readonly partId: string; readonly key: string; readonly kind: PartKind; readonly label: string };

/** One tab of the part rail, in recipe order. `verdict` is null for a gate or the slot (they are
 *  Board acts, drawn as ◆) and for a work part whose editor does not exist yet (`editor: false`). */
export type PartTab = PartRef & { readonly verdict: VerdictState | null; readonly editor: boolean };

export type PartProject = {
  readonly id: string;
  readonly title: string;
  readonly recipe: string;
  readonly recipeLabel: string;
  readonly discipline: Discipline;
  /** The project's clock (the template's target, or the album take). v1's Script never read it. */
  readonly targetS: number | null;
};

/** One applied edit in the part's op log, newest first. `by` is `operator` or a job id. */
export type PartOpLine = { readonly n: number; readonly label: string; readonly by: string; readonly at: string };

/** The bound on `ops` a view carries; the log itself is append-only and unbounded. */
export const OPS_SHOWN = 20;

/** A generating act as the header offers it: ready, or what it still needs ("product", "cta"). */
export type PartActView = { readonly act: PartActKind; readonly label: string; readonly needs: readonly string[] };

/** A job this part launched and has not finished. */
export type PartRunning = { readonly jobId: string; readonly act: PartActKind; readonly since: string; readonly stage?: string };

type ViewBase<K extends EditorKind> = {
  readonly projectId: string;
  /** `<projectId>/<key>` (@gt/domain/part ids). */
  readonly partId: string;
  readonly key: string;
  readonly kind: K;
  /** The part record's revision; every op and undo names the rev it was made against. */
  readonly rev: number;
  readonly project: PartProject;
  readonly verdict: PartVerdict;
  /** Upstream parts this one reads that are not READY, in recipe order. */
  readonly upstream: { readonly missing: readonly PartRef[] };
  readonly tabs: readonly PartTab[];
  /** The undo trail: the ops in effect, newest first, at most OPS_SHOWN. Undo reverts `ops[0]` by
   *  APPENDING its inverse to the log (registry undo-history/execution-emitted-inverse: a server log
   *  is data and never shrinks), so an undone op leaves this list and the log keeps both lines. */
  readonly ops: readonly PartOpLine[];
  readonly acts: readonly PartActView[];
  readonly running: readonly PartRunning[];
};

export type PartData = { readonly research: ResearchData; readonly script: ScriptData } & L39Data & L40Data;
/* L40 */
type L40Data = { readonly score: ScoreData; readonly cut: CutData; readonly words: WordsData; readonly render: RenderData; readonly article: ArticleData; readonly strips: StripsData; readonly voice: VoiceData };
/* L39 */
type L39Data = { readonly frames: FramesData; readonly motion: MotionData };
export type PartView<K extends EditorKind = EditorKind> = { readonly [P in K]: ViewBase<P> & { readonly data: PartData[P] } }[K];

/* ── edits ────────────────────────────────────────────────────────────────── */

export type ResearchOp =
  | { readonly op: "descope"; readonly cardId: string }
  | { readonly op: "restore"; readonly cardId: string }
  | { readonly op: "like"; readonly cardId: string; readonly on: boolean }
  | { readonly op: "deepen"; readonly cardId: string; readonly on: boolean }
  | { readonly op: "confirm-scope" }
  | { readonly op: "queue-follow-up"; readonly prompt: string; readonly cardId?: string }
  | { readonly op: "drop-follow-up"; readonly id: string }
  | { readonly op: "decide-effect"; readonly followUpId: string; readonly index: number; readonly decision: "applied" | "rejected" }
  | { readonly op: "set-face"; readonly face: "notebook" | "beats" }
  | { readonly op: "pick-beat"; readonly slotId: string; readonly variantId: string | null }
  | { readonly op: "compose-spine" }
  | { readonly op: "set-brief"; readonly field: AdBriefField; readonly value: string | readonly string[] }
  | { readonly op: "pick-idea"; readonly ideaId: string };

export type ScriptOp =
  | { readonly op: "adopt"; readonly candidateId: string | null }
  | { readonly op: "note-add"; readonly cardId: string; readonly kind: NoteKind; readonly text?: string }
  | { readonly op: "note-remove"; readonly noteId: string }
  | { readonly op: "accept"; readonly versionId: string }
  /** Accept a staged version whose gate blocks: the override is recorded on the version. */
  | { readonly op: "accept-over-gate"; readonly versionId: string }
  | { readonly op: "discard-staged"; readonly versionId: string }
  /** Restore-forward: mints a NEW staged version from an old one; history never rewinds. */
  | { readonly op: "restore-version"; readonly versionId: string }
  | { readonly op: "patch-beat"; readonly beatId: string; readonly label?: string; readonly text?: string }
  | { readonly op: "set-connector"; readonly beatId: string; readonly connector: Exclude<Connector, null> }
  | { readonly op: "reset-beat"; readonly beatId: string }
  | { readonly op: "pick-scenario"; readonly scenarioId: string };

export type PartOps = { readonly research: ResearchOp; readonly script: ScriptOp } & L39Ops & L40Ops;
/* L40 - the explainer's article and strips are their producers' runs: no edit lands on them here. */
type L40Ops = { readonly score: ScoreOp; readonly cut: CutOp; readonly words: AlbumOp; readonly render: AlbumOp; readonly article: never; readonly strips: never; readonly voice: ExplainerOp };
/* L39 */
type L39Ops = { readonly frames: FramesOp; readonly motion: MotionOp };
export type PartOp<K extends EditorKind = EditorKind> = PartOps[K];

/** What an op (or an undo) came to. A stale `baseRev` writes nothing and hands back the view as
 *  it is now, so the editor redraws from the truth and the operator decides again. A refused op
 *  (descoping a required card, picking an unknown idea) is the `Result`'s error, not this. */
export type PartOpResult<K extends EditorKind = EditorKind> = { readonly kind: "applied"; readonly view: PartView<K> } | { readonly kind: "conflict"; readonly current: PartView<K> };

/* ── generating acts ──────────────────────────────────────────────────────── */

export const PART_ACTS = {
  research: ["run-research", "follow-up", "generate-ideas"],
  script: ["compose-candidates", "recalibrate", "generate-scenarios"],
  /* L39 */
  frames: FRAMES_ACTS,
  motion: MOTION_ACTS,
  /* L40 */
  score: SCORE_ACTS,
  cut: CUT_ACTS,
  words: WORDS_ACTS,
  render: RENDER_ACTS,
  article: ARTICLE_ACTS,
  strips: STRIPS_ACTS,
  voice: VOICE_ACTS,
} as const satisfies { readonly [K in EditorKind]: readonly string[] };
export type PartActKind = (typeof PART_ACTS)[EditorKind][number];
/** `target` names one unit of the part (a plate, a cue, a clip) for the per-unit acts of later
 *  editors (L37); research and script acts take none and a side ignores it there. */
export type PartAct = { readonly act: PartActKind; readonly target?: string };

export function actBelongs(kind: EditorKind, act: string): act is PartActKind {
  return (PART_ACTS[kind] as readonly string[]).includes(act);
}

/** A part act's receipt: the domain receipt, about one part at one revision. */
export type PartReceipt = Omit<Receipt, "subject"> & {
  readonly subject: { readonly kind: "part"; readonly projectId: string; readonly partId: string; readonly rev: number; readonly act: PartActKind };
};
export type PartActResult = { readonly kind: "launched"; readonly jobId: string; readonly view: PartView } | { readonly kind: "stale"; readonly fresh: PartReceipt };

/* ── the op trail's words ─────────────────────────────────────────────────── */

/** The words the undo trail shows for an op - one place, so the server's log and a test agree.
 *  A later kind's ops are labelled by its module (_part/kinds.ts `label`); the name stands in here. */
export function opLabel(op: PartOp): string {
  const name: string = op.op;
  if (!isCoreOp(op)) return name;
  switch (op.op) {
    case "descope":
    case "restore":
      return `${op.op} ${op.cardId}`;
    case "like":
    case "deepen":
      return `${op.on ? "" : "un"}${op.op} ${op.cardId}`;
    case "queue-follow-up":
      return `queue ${op.cardId ?? "question"}`;
    case "drop-follow-up":
      return `drop ${op.id}`;
    case "decide-effect":
      return `${op.decision === "applied" ? "apply" : "reject"} effect ${op.index + 1}`;
    case "set-face":
      return `face ${op.face}`;
    case "pick-beat":
      return op.variantId === null ? `unpick ${op.slotId}` : `pick ${op.variantId}`;
    case "set-brief":
      return `brief ${op.field}`;
    case "pick-idea":
      return `pick ${op.ideaId}`;
    case "adopt":
      return op.candidateId === null ? "unadopt" : `adopt ${op.candidateId}`;
    case "note-add":
      return `note ${op.cardId}`;
    case "note-remove":
      return `remove ${op.noteId}`;
    case "accept":
    case "accept-over-gate":
    case "discard-staged":
    case "restore-version":
      return `${op.op} ${op.versionId}`;
    case "patch-beat":
    case "reset-beat":
      return `${op.op === "patch-beat" ? "edit" : "reset"} ${op.beatId}`;
    case "set-connector":
      return `${op.connector.toLowerCase()} ${op.beatId}`;
    case "pick-scenario":
      return `pick ${op.scenarioId}`;
    case "confirm-scope":
    case "compose-spine":
      return op.op.replace("-", " ");
  }
}

const CORE_OPS: ReadonlySet<string> = new Set<(ResearchOp | ScriptOp)["op"]>([
  "descope", "restore", "like", "deepen", "confirm-scope", "queue-follow-up", "drop-follow-up", "decide-effect", "set-face", "pick-beat", "compose-spine", "set-brief", "pick-idea",
  "adopt", "note-add", "note-remove", "accept", "accept-over-gate", "discard-staged", "restore-version", "patch-beat", "set-connector", "reset-beat", "pick-scenario",
]);
const isCoreOp = (op: PartOp): op is ResearchOp | ScriptOp => CORE_OPS.has(op.op);
