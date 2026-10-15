// THE PACKET SOURCES, zod-free: where a Weir pile came from, the desk modes it is
// decided in, and the words a reject may give for itself. A client holds this
// table (the Board draws the reason keys from it), so it imports nothing that
// reaches zod; ./packet.ts builds its schema enums from these arrays.
//
// REASONS BELONG TO THE SOURCE (Phase 3 decision 4, plan §8 "Reasons"). v1 had
// one reason vocabulary per surface and the rebuild's first domain had one for
// all of them (the prototype's REJECT_REASONS, four image words), so an audio
// take could only be rejected for "motion". Each list below is v1's own, cited
// where it lives; the Board binds keys 1-9, 0, - to a list in order, so the
// ORDER is part of the contract and a reorder rebinds the operator's fingers.
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
export const PACKET_SOURCES = ["forge", "extract", "dojo", "strips", "article", "audio", "suno", "mv", "trials", "step"] as const;
export type PacketSource = (typeof PACKET_SOURCES)[number];

export const PACKET_MODES = ["matrix-cull", "blind-pair", "packet-review"] as const;
export type PacketMode = (typeof PACKET_MODES)[number];

export type SourceSpec = {
  /** The desk modes a packet of this source may be opened in. */
  readonly modes: readonly PacketMode[];
  /** The reject reasons, in key order (1-9, 0, -). Empty: a reject is one thing. */
  readonly reasons: readonly string[];
  /** How many reasons one verdict may carry. */
  readonly maxReasons: number;
  /** The longest note a verdict may carry; 0 means v1 had no note to keep it in. */
  readonly noteMax: number;
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
  // lib/sound/types.ts:48 DEFECTS - eleven codes, which is exactly 1-9, 0, -.
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
  step: { modes: ["packet-review"], reasons: [], maxReasons: 0, noteMax: NOTE_LONG },
} as const satisfies { readonly [S in PacketSource]: SourceSpec };

/** The keys a reason list is bound to, in order (plan §8: the Board's 1-4 grew to eleven for audio). */
export const REASON_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-"] as const;
export type ReasonKey = (typeof REASON_KEYS)[number];

export function sourceSpec(source: PacketSource): SourceSpec {
  return SOURCES[source];
}

/** The reason a key names for this source, or undefined when the key is past the list. */
export function reasonForKey(source: PacketSource, key: string): string | undefined {
  const i = REASON_KEYS.findIndex((k) => k === key);
  return i < 0 ? undefined : SOURCES[source].reasons[i];
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
