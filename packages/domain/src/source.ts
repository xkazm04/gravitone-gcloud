// THE PACKET SOURCES, zod-free: where a Weir pile came from, the desk modes it is
// decided in, and the words a reject may give for itself. A client holds this
// table (the Board draws the reason keys from it), so it imports nothing that
// reaches zod; ./packet.ts builds its schema enums from these arrays.
//
// REASONS BELONG TO THE SOURCE (Phase 3 decision 4, plan §8 "Reasons"). v1 had
// one reason vocabulary per surface and the rebuild's first domain had one for
// all of them (the prototype's REJECT_REASONS, four image words), so an audio
// take could only be rejected for "motion". Each list below is v1's own, cited
// where it lives; the Board binds keys 2, 3 and 4 to the first three of a row's
// order (`reasonsBy`, else this list), so the ORDER is part of the contract and
// a reorder rebinds the operator's fingers.
//
// What the table refuses by construction: `satisfies { [S in PacketSource]: … }`
// makes a source without a row a compile error, so a new source cannot reach
// the Board with no reason vocabulary decided.

import { err, ok, type Result } from "./errors.ts";

/** Where a pile came from (prototype model.js `sourceKind`). v1's eight
 *  decision surfaces, plus `trials` (the mechanism A/B the prototype draws as
 *  blind pairs) and `step` (a Project part's gate - v1's per-step sign-off,
 *  carried to Phase 4). The first domain also had `triage`; nothing opened a
 *  packet under it, and the word was ambiguous between audio triage (`audio`)
 *  and v1's explainer research scope (not a Weir surface), so it is gone. */
export const PACKET_SOURCES = ["forge", "extract", "dojo", "strips", "article", "audio", "suno", "mv", "trials", "step", "proof", "scout", "seeds", "spend"] as const;
export type PacketSource = (typeof PACKET_SOURCES)[number];

export const PACKET_MODES = ["matrix-cull", "blind-pair", "packet-review"] as const;
export type PacketMode = (typeof PACKET_MODES)[number];

export type SourceSpec = {
  /** The desk modes a packet of this source may be opened in. */
  readonly modes: readonly PacketMode[];
  /** The reject reasons, in chip order; the first three are keys 2-4 where `reasonsBy` names no order. Empty: a reject is one thing. */
  readonly reasons: readonly string[];
  /** How many reasons one verdict may carry. */
  readonly maxReasons: number;
  /** The longest note a verdict may carry; 0 means v1 had no note to keep it in. */
  readonly noteMax: number;
  /**
   * A reject must name at least one reason before the packet COMMITS (spark scout-decision-graph:
   * "every X needs a reason"). Enforced at the commit - the cull's gate and the kernel's planCommit -
   * never at the verdict write, so X then a reason key stays two keystrokes. Absent: a bare reject
   * commits, as every source before `seeds` did.
   */
  readonly reasonOnReject?: true;
  /**
   * The reasons in key order PER ROW GROUP (spark scout-storyboards: "1 keep, 2-4 reject with reason 1-3
   * in order"): a desk binds keys 2, 3 and 4 to the first three of the row's group, so a 3D row's keys
   * name a mesh's defects and an idea's an idea's. Each list is an ORDER over this source's own
   * `reasons` (the domain test refuses a word outside it); a group absent here keys off `reasons`.
   */
  readonly reasonsBy?: Readonly<Record<string, readonly string[]>>;
};

/** v1's note bound where v1 had one (lib/articles/types.ts NOTE_MAX_CHARS, lib/sound/takes.ts `str(b.note, 2000)`). */
const NOTE_LONG = 2000;
/** lib/foundry/strips/triage.ts STRIP_NOTE_MAX; the extractor cut at the same 500 (extract/store.ts verdictSpec). */
const NOTE_SHORT = 500;

export const SOURCES = {
  // The forge cull. v1's Board named two axes (lib/board/sources/cull.ts:80
  // `reasonAxes: ["style", "subject"]`, carried in the note's `reasons:` line,
  // lib/board/verdicts.ts encodeNote); the prototype added `text` (REASONS,
  // index.html:452) for a plate whose type rendered as glyph soup, which the
  // forge grades as `has_text`; `craft` is the axis its craft grade scores.
  // The prototype's `motion` is not here: a forge plate is a still.
  forge: { modes: ["matrix-cull"], reasons: ["style", "subject", "text", "craft"], maxReasons: 4, noteMax: NOTE_LONG },
  // The extractor kept free tags, up to 8, verbatim (extract/store.ts:358)
  // and no surface ever offered a fixed list, so no tag set is evidence of a
  // vocabulary; it shares the forge's, the four ways an extracted style misses.
  extract: { modes: ["matrix-cull"], reasons: ["style", "subject", "text", "craft"], maxReasons: 4, noteMax: NOTE_SHORT },
  // lib/board/sources/dojo.ts:90 `reasonAxes: ["technique", "execution"]`.
  // TrainingVerdicts stored a bare word per improvement, so v1 had no note
  // and its reasons were session-only; here they persist with the decision.
  // Blind pairs per improvement (training/blind.ts), then the claim itself.
  dojo: { modes: ["blind-pair", "packet-review"], reasons: ["technique", "execution"], maxReasons: 2, noteMax: 0 },
  // lib/foundry/strips/types.ts:122 STRIP_CHIPS, at most STRIP_CHIPS_MAX = 3 (triage.ts:106).
  strips: { modes: ["matrix-cull"], reasons: ["concept", "legibility", "motion", "craft", "identity", "too-busy", "generic", "broken"], maxReasons: 3, noteMax: NOTE_SHORT },
  // lib/articles/types.ts:337 CHECK_DIMENSIONS, the Board's reject axes for
  // articles (lib/board/sources/articles.ts:569). A reject may name all seven.
  article: { modes: ["packet-review"], reasons: ["structure", "storytelling", "depth", "figures", "voice", "medium-fidelity", "truth"], maxReasons: 7, noteMax: NOTE_LONG },
  // lib/sound/types.ts:48 DEFECTS - eleven codes; keys 2-4 name the first three, the chips all eleven.
  // takes.ts reasonsOf de-duplicated and capped nothing, so all eleven may stand.
  audio: {
    modes: ["matrix-cull"],
    reasons: ["smeared-transients", "vocal-garble", "section-bleed", "tempo-instability", "broken-ending", "loop-seam", "spectral-imbalance", "phase-width", "confident-hallucination", "off-brief", "wrong-event"],
    maxReasons: 11,
    noteMax: NOTE_LONG,
  },
  // lib/suno/types.ts:88 and lib/sound/mv/types.ts:46: keep | drop, nothing more.
  suno: { modes: ["matrix-cull"], reasons: [], maxReasons: 0, noteMax: 0 },
  mv: { modes: ["matrix-cull"], reasons: [], maxReasons: 0, noteMax: 0 },
  // The prototype's mechanism trials: a pair is judged, never explained.
  trials: { modes: ["blind-pair"], reasons: [], maxReasons: 0, noteMax: 0 },
  // A Project part's gate (Phase 4, COMMON decision 10). Frames is decided as a CULL of its
  // plates (a reject owes a re-render), score and the album still as a PICK - a cull with one
  // keep per row (cue / still), which @gt/domain has no separate mode for and needs none: the
  // row-per-cue grid is the cull's own rows, and "one keep" is the adapter's commit rule
  // (lib/parts/gates.ts). Cut, article and strips stay packet reviews. No reasons: what a plate
  // or a take is rejected FOR is the note's, v1 had no vocabulary for either.
  step: { modes: ["packet-review", "matrix-cull"], reasons: [], maxReasons: 0, noteMax: NOTE_LONG },
  // A style's pending proofs (Phase 5, L56; v1 lib/board/sources/proof.ts `reasonAxes: []`): a
  // matrix cull with a row per trial problem. v1 had no reason list for a proof - only its note,
  // which the atelier shows beside the plate - so a reject is one thing here too.
  proof: { modes: ["matrix-cull"], reasons: [], maxReasons: 0, noteMax: NOTE_SHORT },
  // One /scout night (spark media-training-loop): a row per candidate - an extracted look, a found
  // scene's replicas and clip, a craft finding, a watchlist line. The forge's three still axes, then
  // `motion` for a clip, `rights` for material that should not have been taken, `generic` for a
  // find that teaches nothing the Library does not already hold.
  // `use case` (2026-10-22): the run serves no content worth making - the next nights steer away from it.
  // A game asset's variant (spark game-3d-assets) adds the defects a mesh is thrown for, APPENDED so
  // every earlier key keeps its binding: `topology` (holes, floaters, fused or thin parts), `texture`
  // (the bake), `rig` (the weights or the chains), `scale` (world size against the class).
  // `story` (spark scout-storyboards): a storyboard's frames do not add up to a video worth making - APPENDED.
  // reasonsBy: the first three of each row group are keys 2-4 (RowWords.group, lib/decision/v1/sources/scoutPlan.ts).
  scout: {
    modes: ["matrix-cull"],
    reasons: ["style", "subject", "craft", "motion", "rights", "generic", "use case", "topology", "texture", "rig", "scale", "story"],
    maxReasons: 3,
    noteMax: NOTE_SHORT,
    reasonsBy: {
      ideas: ["generic", "use case", "subject"],
      storyboards: ["story", "generic", "use case"],
      videos: ["craft", "motion", "style"],
      "art styles": ["style", "generic", "craft"],
      "3d": ["topology", "texture", "rig"],
      music: ["craft", "generic", "use case"],
      notes: ["generic", "use case", "subject"],
      sources: ["generic", "use case", "subject"],
      // spark scout-vision S2: a night's proposal to birth a genre or a venture.
      genres: ["generic", "use case", "story"],
    },
  },
  // A batch of one-sentence SEEDS (spark scout-decision-graph): genre, subgenre, type of content,
  // audience and format, kept or thrown in one pass. Every reject names why (the operator, wave 3),
  // because a reasoned throw is the ban the next batch steers by; a note may follow the reason.
  seeds: { modes: ["matrix-cull"], reasons: ["generic", "not for us", "audience", "done before", "format"], maxReasons: 2, noteMax: NOTE_SHORT, reasonOnReject: true },
  // spark athena-control-mcp: a day's live launches an agent asked for (@gt/domain/mcp SpendRequest), a row
  // per request; K pays at the price on the card, X says why not, and the agent reads the reason back.
  spend: { modes: ["matrix-cull"], reasons: ["price", "vendor", "timing", "brief", "duplicate", "local"], maxReasons: 2, noteMax: NOTE_SHORT, reasonOnReject: true },
} as const satisfies { readonly [S in PacketSource]: SourceSpec };

type ReasonOf<S extends PacketSource> = (typeof SOURCES)[S]["reasons"][number];

// The forge's four, which the extractor shares (above): a plate is a still, so craft names a still's faults.
const STILL_MEANING = {
  style: "The look is wrong for the video we are making.",
  subject: "What is shown does not fit: the wrong subject or content.",
  text: "Type in the plate rendered as garbled glyphs.",
  craft: "Poorly executed: anatomy, composition, artefacts or framing.",
} as const;

/**
 * WHAT EACH REASON MEANS (operator, 2026-10-23: "explain on hover in one sentence the meaning of
 * the reason in case the one word is not clear"). One sentence, at most twelve words, the work as
 * its subject; the Board shows it as the reason's tip, carried in PacketView.reasons. The type
 * holds every source's every reason to a meaning (a reason added above without one is a compile
 * error) and refuses a word the list does not have; the twelve-word bound is the domain test's.
 * Taken from where each list is defined: the comments above, the registry's generated-audio defect
 * taxonomy (lib/sound/types.ts DEFECTS) and the article check's seven dimensions (docs/articles.md).
 * The dojo's two and the strips' eight had no recorded definition and are the plainest reading.
 */
export const REASON_MEANING: { readonly [S in PacketSource]: { readonly [R in ReasonOf<S>]: string } } = {
  forge: STILL_MEANING,
  extract: STILL_MEANING,
  dojo: {
    technique: "The claimed technique itself does not improve the work.",
    execution: "The technique is sound but was applied badly here.",
  },
  strips: {
    concept: "The idea does not land: the wrong chart form or story.",
    legibility: "Text or data is too small, tilted, or outside the safe box.",
    motion: "The movement is wrong: too many cues, or none selling a beat.",
    craft: "Poorly executed: easing, spacing, timing or finish.",
    identity: "Off the channel's look: palette, type or style module.",
    "too-busy": "Too much at once: the frame crowds its one beat.",
    generic: "A template look, nothing specific to this story.",
    broken: "Fails to render or play: blank, frozen or glitched frames.",
  },
  article: {
    structure: "The shape is off: preview, sections, closing table or length.",
    storytelling: "The post does not carry the reader through a story.",
    depth: "Too shallow: the insight a practitioner needs is missing.",
    figures: "Too few figures, uncaptioned or unsourced, or long prose between them.",
    voice: "Not the author's voice: no first person, or em dashes.",
    "medium-fidelity": "Will not read well on Medium: type, scroll or resources.",
    truth: "Claims outrun their sources: too few, undated or unresolved.",
  },
  audio: {
    "smeared-transients": "Drums without edges: mush where an attack should be.",
    "vocal-garble": "Syllables melt, or words are invented mid-line.",
    "section-bleed": "One section's elements leak into the section before it.",
    "tempo-instability": "The grid drifts or a bar hiccups.",
    "broken-ending": "An unbriefed abrupt stop, or a fade where a hard out was.",
    "loop-seam": "An audible joint where the material repeats.",
    "spectral-imbalance": "No low end, harsh highs, or hollow mids.",
    "phase-width": "Swimmy stereo that vanishes in mono.",
    "confident-hallucination": "An instrument or voice nobody briefed, mixed as if intended.",
    "off-brief": "Pleasant, but the wrong piece for the brief.",
    "wrong-event": "The sound reads as a different event than the one briefed.",
  },
  suno: {},
  mv: {},
  trials: {},
  step: {},
  proof: {},
  scout: {
    style: STILL_MEANING.style,
    subject: STILL_MEANING.subject,
    craft: STILL_MEANING.craft,
    motion: "The movement is wrong: drift, jitter, or an unmotivated camera.",
    rights: "Material we should not have taken, or may not use.",
    generic: "Teaches nothing new: the median, or already in the Library.",
    "use case": "Serves no video worth making; later nights steer away.",
    topology: "The mesh is broken: holes, floaters, fused or too-thin parts.",
    texture: "The texture bake is wrong: seams, smears, wrong materials.",
    rig: "The rig fails: bad weights or broken bone chains.",
    scale: "Its size in the world is wrong for its class.",
    story: "The frames do not add up to a video worth making.",
  },
  seeds: {
    generic: "The obvious take: nothing here we would make differently.",
    "not for us": "A genre or content type this channel will not make.",
    audience: "Wrong audience for this genre or type of content.",
    "done before": "Already kept, thrown or made under another seed.",
    format: "Will not hold as a Short or a short video.",
  },
  spend: {
    price: "Costs more than this work is worth right now.",
    vendor: "The wrong vendor or model for this piece.",
    timing: "Not now: after another result lands, or another day.",
    brief: "The brief is wrong: fix what it makes before paying.",
    duplicate: "Already made, or already asked for on another card.",
    local: "A free local lane can make this instead.",
  },
};

/** A source's vocabulary as the Board holds it (PacketView.reasons): the reasons in key order, how
 *  many a verdict may carry, the note bound, and each reason's meaning. */
export type ReasonVocabulary = {
  readonly list: readonly string[];
  readonly max: number;
  readonly noteMax: number;
  /** One sentence per reason; a reason absent here draws no tip. */
  readonly meaning: Readonly<Record<string, string>>;
  /** Set when a reject must name a reason before the packet commits (SourceSpec.reasonOnReject). */
  readonly required?: true;
  /** The list's order per row group (SourceSpec.reasonsBy); `reasonsOf` reads it. */
  readonly by?: Readonly<Record<string, readonly string[]>>;
};

/** The reasons a row of `group` offers, in key order: its group's order first, then the rest of the list. */
export function reasonsOf(v: Pick<ReasonVocabulary, "list" | "by">, group: string | undefined): readonly string[] {
  const first = group === undefined ? undefined : v.by?.[group];
  return first === undefined ? v.list : [...first, ...v.list.filter((r) => !first.includes(r))];
}

/** The one builder of a packet view's vocabulary, so the meanings travel with the list they define. */
export function reasonVocabulary(source: PacketSource): ReasonVocabulary {
  const spec: SourceSpec = SOURCES[source];
  return { list: spec.reasons, max: spec.maxReasons, noteMax: spec.noteMax, meaning: REASON_MEANING[source], ...(spec.reasonOnReject === true ? { required: true as const } : {}), ...(spec.reasonsBy === undefined ? {} : { by: spec.reasonsBy }) };
}

/**
 * The keys that reject WITH a reason (spark scout-storyboards, the operator: "1 keep, 2-4 reject with reason
 * 1-3 in order, 5 reject without one, the reason clicked"): 2, 3 and 4 name the first three of a row's ordered
 * list (`reasonsOf`). A source's other reasons are reached by the chips only. Before this the number row bound
 * the whole list, 1-9, 0, - (plan §8), which no hand could hold.
 */
export const REJECT_KEYS = ["2", "3", "4"] as const;
export type RejectKey = (typeof REJECT_KEYS)[number];

export function sourceSpec(source: PacketSource): SourceSpec {
  return SOURCES[source];
}

/** The reason a reject key names on a row of `group`, or undefined when the key is not one or its slot is past the list. */
export function keyedReason(v: ReasonVocabulary, group: string | undefined, key: string): string | undefined {
  const i = REJECT_KEYS.findIndex((k) => k === key);
  return i < 0 ? undefined : reasonsOf(v, group)[i];
}

export type VerdictInput = {
  readonly verdict: "keep" | "reject" | null;
  readonly reasons: readonly string[];
  readonly note?: string;
};

/**
 * The verdict door's source half: reasons from this source's list, unique, at
 * most its max, and only on a reject (v1 wrote reasons only on a reject,
 * lib/board/verdicts.ts withCullVerdict); a note only where the source keeps
 * one, within its bound, and only on a verdict - an undecide clears the note
 * with the verdict. Reasons come back in the list's order, so two writes that
 * name the same set in a different order are the same decision.
 */
export function checkVerdict(source: PacketSource, v: VerdictInput): Result<readonly string[]> {
  const spec: SourceSpec = SOURCES[source];
  if (v.reasons.length > 0 && v.verdict !== "reject") return err("invalid", "only a reject carries reasons");
  const unknown = v.reasons.filter((r) => !spec.reasons.includes(r));
  if (unknown.length > 0) {
    const known = spec.reasons.length > 0 ? spec.reasons.join(", ") : "none";
    return err("invalid", `unknown reason(s) for a ${source} packet: ${unknown.join(", ")} (known: ${known})`);
  }
  if (new Set(v.reasons).size !== v.reasons.length) return err("invalid", "a reason is named twice");
  if (v.reasons.length > spec.maxReasons) return err("invalid", `a ${source} verdict carries at most ${spec.maxReasons} reason(s); this one has ${v.reasons.length}`);
  if (v.note !== undefined) {
    if (spec.noteMax === 0) return err("invalid", `a ${source} verdict carries no note`);
    if (v.verdict === null) return err("invalid", "an undecided candidate carries no note");
    if (v.note.trim().length === 0) return err("invalid", "a note is not blank; omit it instead");
    if (v.note.length > spec.noteMax) return err("invalid", `a ${source} note is at most ${spec.noteMax} characters; this one has ${v.note.length}`);
  }
  return ok(spec.reasons.filter((r) => v.reasons.includes(r)));
}
