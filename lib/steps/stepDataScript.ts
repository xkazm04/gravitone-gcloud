// THE SCRIPT, CUT AND SCORE STEPS' RECORD SHAPES: script-adopted, script-trailer,
// the Cut's clip offsets and the Score's spots.
//
// Types only. Split out of the stepStore.ts door, which re-exports every name here,
// so importers keep using the door. Each record is its own phase key, as the
// comments on each interface say.

import type { ScoreSpot } from "@/lib/score/spots";
import type { CutOp } from "@/lib/script/trailer/ops";
import type { TrailerCut, WithholdingBudget } from "@/lib/script/trailer/types";

/** WHICH candidate script this project adopted, under phase key
 *  `"script-adopted"` — the record frames.ts:300 names as missing.
 *
 *  One field on purpose: adoption is a pointer into the render registry, not a
 *  copy of the render. The Frames step resolves it against RENDER_BY_ID and
 *  falls back to the positional default when the id is unknown or the record
 *  absent — absence keeps today's behaviour, honestly. Separate from
 *  `"script-versions"` because the duel writes on a card click and the version
 *  ledger on accept, and one record shared between them would have each save
 *  erase the other's field. */
export interface ScriptAdoptionStepData {
  renderId: string;
  savedAt?: number;
}

/** The trailer half of the Script step, under phase key `"script-trailer"`.
 *
 *  The cut is composed ONCE from the confirmed spine in `research-beats` and
 *  is then the creator's own: every edit here (a rewritten beat, a connector,
 *  a payer, a raised variable) lands on this record and never back on the
 *  picks. The budget travels with the cut because it is the campaign's object
 *  and the withholding rule reads them together — a budget stored elsewhere
 *  would let the two drift apart between saves. */
export interface TrailerCutStepData {
  cut: TrailerCut;
  budget: WithholdingBudget;
  /** THE SPINE THIS CUT WAS COMPOSED FROM — the confirmed picks, slot → variant,
   *  as they stood at compose time (added 2026-09-05). A cut is composed ONCE
   *  and then edited; the board's picks are its history, not its source. So
   *  when the creator reopens the spine in Step 1 and composes a different one,
   *  the Script step needs a way to tell that the cut on screen predates the
   *  spine on the board — this is that record. Absent on cuts saved before the
   *  field existed, which readers treat as "unknown", never as "current". */
  spine?: Record<string, string>;
  /** THE EDIT LOG (added 2026-10-12). `origin` is the cut as `composeCut` dealt
   *  it, `ops` every edit the creator made since, `head` how many are applied
   *  (the rest are the redo tail). `cut` above is kept as the DERIVED cache —
   *  `replay(origin, ops[0..head))` — so Step 3's readers stay unchanged. A
   *  record without `origin`/`ops` is a legacy one: `cut` is its own origin with
   *  an empty log. `originBudget` is the budget the origin was dealt with;
   *  `budget` is the derived one. */
  origin?: TrailerCut;
  originBudget?: WithholdingBudget;
  ops?: CutOp[];
  head?: number;
  savedAt?: number;
}

/** The drift the creator has dialled into the Cut's sync bench, clip id → offset
 *  in milliseconds.
 *
 *  Small on purpose, and that is what makes it storable. The Cut and Score steps
 *  were the two of five phases that persisted nothing, and they are not the same
 *  problem: this is a handful of integers, while a Score take is an object URL
 *  over megabytes of decoded audio that no `blob:` string survives a reload to
 *  reach. So the offsets land here now and the audio question stays open — see
 *  .vault/Architect/decisions/2026-08-29-score-take-persistence.md.
 *
 *  ABSENT IS NOT ZERO. A clip nobody has touched must report what the cut itself
 *  says about it (`TimelineClip.offsetMs`), not a dialled-in zero — `offsetFrom`
 *  in the Cut step reads the record that way, and storing a zero for every clip
 *  on first load would erase the distinction between "at its mark" and "brought
 *  back to its mark", which the surface colours differently. Only clips the
 *  creator has actually nudged appear in this map. */
export interface CutStepData {
  offsets: Record<string, number>;
  savedAt?: number;
}

/** THE SPOTTING SESSION — where the cues go, and what each one is for.
 *
 *  The other half of the paragraph above, and it lands here on the same terms.
 *  A spot is a title, a scene range, a purpose sentence and (once somebody
 *  chooses one) a tempo: plain data, a few dozen bytes a row. A TAKE is still
 *  an object URL over megabytes of decoded audio that no `blob:` string
 *  survives a reload to reach, and this record does not carry one, does not
 *  have a field for one, and must not grow one without answering the question
 *  .vault/Architect/decisions/2026-08-29-score-take-persistence.md leaves open.
 *  Spots survive a reload; takes do not, and the surface says so rather than
 *  implying otherwise.
 *
 *  WHY IT IS THE WHOLE LIST AND NOT A DIFF AGAINST THE PROPOSAL. Spots are
 *  seeded once — proposed from the script's movements the first time this step
 *  meets a project with a picture (app/_phases/score/spots.ts), saved, and
 *  after that they are the creator's. A record that stored only the edits would
 *  have to re-derive the proposal on every load to know what the edits were
 *  against, which makes a change upstream silently rewrite work downstream. The
 *  same rule `useTrailerCut` composes a cut under: composed once from the
 *  confirmed spine, then owned.
 *
 *  An EMPTY array is a decision — every spot deleted — and is distinct from no
 *  record at all, which means this step has never been opened with a picture in
 *  front of it. The seeder writes nothing in the second case, so re-opening the
 *  step after composing a spine still proposes. */
export interface ScoreStepData {
  spots: ScoreSpot[];
  savedAt?: number;
}
