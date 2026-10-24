import "server-only";

import { err, ok, type Result } from "@gt/domain/errors";
import { EDITOR_KINDS, type EditorKind, type PartActKind, type PartActView, type PartData, type PartOp, type PartVerdict, type PartView } from "@gt/domain/partView";

import type { Ctx } from "./fixture.ts";
import type { ResearchRec } from "./fixtureResearch.ts";
import type { ScriptRec } from "./fixtureScript.ts";
import { digest } from "./hash.ts";
import { changed } from "./realRecs.ts";
import { FRAMES_KIND, type FramesRec } from "./fixtureFrames.ts";
import { MOTION_KIND, type MotionRec } from "./fixtureMotion.ts";
import { SCORE_KIND } from "./fixtureScore.ts";
import type { ScoreRec } from "./fixtureScoreRecs.ts";
import { CUT_KIND, type CutRec } from "./fixtureCut.ts";
import { RENDER_KIND, WORDS_KIND, type RenderRec, type WordsRec } from "./fixtureAlbum.ts";
import { ARTICLE_KIND, STRIPS_KIND, VOICE_KIND, type ArticleRec, type StripsRec, type VoiceRec } from "./fixtureExplainer.ts";

// THE PART KINDS AFTER RESEARCH AND SCRIPT (Phase 4 wave C, L39 + L40): one contract every later
// editor kind's module meets, and one registry the two sides dispatch through, so a lot adds a
// kind with a line here instead of a third arm on every research|script ternary in ./fixture.ts,
// ./real.ts and the editor island. Research and script stay on L38's own paths, untouched.
//
// A module is pure over its WORKING record (the shape its editor reasons in) and the context:
// this project's plan and clock, and `rec(kind)` - any editor kind's working record in the SAME
// project, read the way the side reads it (the fixture's in-memory record; the real side's
// records mapped through that kind's `fromRecords` over one snapshot). A module never reads
// another project and never falls back to a fixture (v1's "Glass Harbor shows Bitcoin").
//
// `toRecords` may name keys another kind owns (motion grows `frames`, the step registry's GROWS):
// the real side writes whatever changed and the kernel's `planWrites` refuses what the part may
// not write. Every kind's records are declared in @gt/domain/steps (L43 added the album's and the
// explainer's; ./realScene.ts `sceneOf` does not compile for an editor kind without them).

export type Obj = Readonly<Record<string, unknown>>;
/** A typed record (an interface has no index signature) as the store's plain object. */
export const asObj = (o: object): Obj => ({ ...o });
export type Recs = ReadonlyMap<string, Obj>;

/** The later kinds' working records, ONE LINE PER KIND, added with the kind's EDITOR_KINDS entry
 *  (L39: frames, motion, still; L40: score, cut, words, render, voice, article, strips). A kind in
 *  EDITOR_KINDS without its line here fails the type of `RecOf` - the forcing function. */
export type LaterRecs = L39Recs & L40Recs;
/* L39 */
type L39Recs = { readonly frames: FramesRec; readonly motion: MotionRec };
/* L40 */
type L40Recs = { readonly score: ScoreRec; readonly cut: CutRec; readonly words: WordsRec; readonly render: RenderRec; readonly article: ArticleRec; readonly strips: StripsRec; readonly voice: VoiceRec };

/** Every editor kind's working record. */
export type RecOf = { readonly research: ResearchRec; readonly script: ScriptRec } & LaterRecs;

export type LaterKind = Exclude<EditorKind, "research" | "script">;

export function isLaterKind(kind: string): kind is LaterKind {
  return (EDITOR_KINDS as readonly string[]).includes(kind) && kind !== "research" && kind !== "script";
}

/** The context a later module reads: L38's `Ctx` plus every editor kind's working record, and the
 *  project's STEP RECORDS as the kernel would hold them (real: the snapshot; fixture: every planned
 *  later kind's `toRecords` plus script's ads-scenarios) - what lib/parts/verdict reads, so a
 *  verdict is computed one way on both sides. A module's SEED must not call `records()`: it maps
 *  every planned kind, and a kind still seeding would be asked for itself. */
export type KCtx = Ctx & { readonly rec: <K extends EditorKind>(kind: K) => RecOf[K]; readonly records: () => Recs };

/** One later editor kind. Every function is pure; `at` and `jobId` are parameters. */
export type KindModule<K extends LaterKind> = {
  /** The op names this kind accepts; anything else is refused before `apply` sees it. */
  readonly ops: readonly string[];
  readonly seed: (ctx: KCtx) => RecOf[K];
  readonly apply: (ctx: KCtx, rec: RecOf[K], op: PartOp<K>) => Result<RecOf[K]>;
  /** The undo trail's words for an op (the part's log line). */
  readonly label: (op: PartOp<K>) => string;
  readonly verdict: (ctx: KCtx, rec: RecOf[K]) => PartVerdict;
  readonly acts: (ctx: KCtx, rec: RecOf[K]) => PartActView[];
  /** The act's units as the receipt prices them; a refusal names what the act still needs.
   *  `target` names one unit (a plate, a cue, an aspect) for a per-unit act. */
  readonly units: (ctx: KCtx, rec: RecOf[K], act: PartActKind, target?: string) => Result<number>;
  /** A dry job's stand-in output landed on the record (`by` = the job id on the log). */
  readonly land: (ctx: KCtx, rec: RecOf[K], act: PartActKind, at: number, jobId: string, target?: string) => Result<RecOf[K]>;
  readonly data: (ctx: KCtx, rec: RecOf[K]) => PartData[K];
  /** The receipt line's label for an act ("cue render"). */
  readonly actLabel: (act: PartActKind) => string;
  /** Real side: the project's decoded step records -> this kind's working record. */
  readonly fromRecords: (recs: Recs, ctx: Ctx) => RecOf[K];
  /** Real side: the working record -> the step records it is stored as, by key. */
  readonly toRecords: (rec: RecOf[K]) => Record<string, Obj>;
};

/** The registry: one line per kind. */
export type Registry = { readonly [K in LaterKind]: KindModule<K> };
export const LATER: Registry = {
  /* L39 */
  frames: FRAMES_KIND,
  motion: MOTION_KIND,
  /* L40 */
  score: SCORE_KIND,
  cut: CUT_KIND,
  words: WORDS_KIND,
  render: RENDER_KIND,
  article: ARTICLE_KIND,
  strips: STRIPS_KIND,
  voice: VOICE_KIND,
};

/** The frame a view shares with every kind (L38's ViewBase), built by the side. */
export type ViewFrame = Omit<PartView, "kind" | "data" | "verdict" | "acts">;

/** A later kind's module with its record type closed over, so a side holding `kind: LaterKind`
 *  and records it stores as `unknown` can run it without a cast at every call. */
export type Erased = {
  readonly kind: LaterKind;
  readonly seed: (ctx: KCtx) => unknown;
  readonly fromRecords: (recs: Recs, ctx: Ctx) => unknown;
  readonly verdict: (ctx: KCtx) => PartVerdict;
  readonly view: (ctx: KCtx, frame: ViewFrame) => PartView;
  /** The next working record for an operator's op, and its log label. */
  readonly apply: (ctx: KCtx, op: PartOp) => Result<{ readonly next: unknown; readonly label: string }>;
  readonly units: (ctx: KCtx, act: PartActKind, target?: string) => Result<number>;
  readonly land: (ctx: KCtx, act: PartActKind, at: number, jobId: string, target?: string) => Result<unknown>;
  readonly actLabel: (act: PartActKind) => string;
  /** Real side: the step records `next` changes against the record as it is now. */
  readonly writes: (ctx: KCtx, next: unknown) => Record<string, Obj>;
  /** The kind's working record as step records (fixture `records()`). */
  readonly records: (ctx: KCtx) => Record<string, Obj>;
};

function erase<K extends LaterKind>(kind: K, m: KindModule<K>): Erased {
  const own = (ctx: KCtx): RecOf[K] => ctx.rec(kind);
  // The side stored what `seed`/`apply`/`land`/`fromRecords` of THIS module returned.
  const back = (x: unknown): RecOf[K] => x as RecOf[K];
  return {
    kind,
    seed: (ctx) => m.seed(ctx),
    fromRecords: (recs, ctx) => m.fromRecords(recs, ctx),
    verdict: (ctx) => m.verdict(ctx, own(ctx)),
    view: (ctx, frame) => {
      const rec = own(ctx);
      const v: PartView<K> = { ...frame, kind, verdict: m.verdict(ctx, rec), acts: m.acts(ctx, rec), data: m.data(ctx, rec) } as PartView<K>;
      return v as PartView;
    },
    apply: (ctx, op) => {
      if (!m.ops.includes(op.op)) return err("invalid", `${op.op} is not a ${kind} op`);
      const o = op as PartOp<K>;
      const next = m.apply(ctx, own(ctx), o);
      return next.ok ? ok({ next: next.value, label: m.label(o) }) : next;
    },
    units: (ctx, act, target) => m.units(ctx, own(ctx), act, target),
    land: (ctx, act, at, jobId, target) => m.land(ctx, own(ctx), act, at, jobId, target),
    actLabel: (act) => m.actLabel(act),
    writes: (ctx, next) => changed(m.toRecords(own(ctx)), m.toRecords(back(next))),
    records: (ctx) => m.toRecords(own(ctx)),
  };
}

/** The module for a later kind, its record type closed over. */
export function later<K extends LaterKind>(kind: K): Erased {
  return erase(kind, LATER[kind]);
}

/* ── the receipt of a per-unit act ────────────────────────────────────────── */

/** A later act's receipt token: L38's receipt digests the part, rev, act, option and units; a
 *  per-unit act adds its TARGET, so a receipt read for plate A never confirms a render of B. */
export const targetToken = (base: string, target: string | undefined): string => (target === undefined ? base : digest({ base, target }));

/** A side's `rec`: research and script through L38's readers, a later kind through its module. */
export function recReader(read: { readonly research: () => ResearchRec; readonly script: () => ScriptRec; readonly later: (kind: LaterKind) => unknown }): KCtx["rec"] {
  // The one cast of the registry: `later(kind)` answers what THAT kind's module made.
  return <K extends EditorKind>(kind: K): RecOf[K] => (kind === "research" ? read.research() : kind === "script" ? read.script() : read.later(kind as LaterKind)) as RecOf[K];
}
