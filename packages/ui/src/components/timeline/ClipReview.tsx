"use client";

// THE SELECTED TAKE'S VERDICT, beside the strip: keep or reject with the source's reasons (the cull's VerdictPick,
// d3bafd83), and the direction for the redo - the operator's instruction, written into the verdict's note through
// the reject note's field (RejectNote), so one note rides one verdict as the production port stores it. The note is
// carried across a keep/reject flip: a direction is not lost to a change of mind.

import { Chip } from "../chip/Chip.tsx";
import type { Tone } from "../chip/tone.ts";
import { RejectNote } from "../cull/RejectNote.tsx";
import { VerdictPick, type VerdictReasons } from "../cull/VerdictPick.tsx";
import { timecode, type TimelineBlock } from "./geometry.ts";
import s from "./Timeline.module.css";

/** One verdict the timeline hands up: the node, keep/reject/none, the reasons, the direction. */
export type TimelineVerdict = {
  readonly node: string;
  readonly verdict: "keep" | "reject" | null;
  readonly reasons: readonly string[];
  readonly note?: string;
};

const STATE_TONE: Readonly<Record<TimelineBlock["state"], Tone>> = { made: "emerald", stale: "amber", pending: "neutral", failed: "rose" };

export type ClipReviewProps = {
  readonly block: TimelineBlock;
  readonly reasons: VerdictReasons;
  readonly noteMax: number;
  readonly onVerdict: (v: TimelineVerdict) => void;
};

export function ClipReview({ block, reasons, noteMax, onVerdict }: ClipReviewProps) {
  const v = block.verdict;
  const note = v?.note;
  const withNote = (text: string | undefined) => (text === undefined || text.trim() === "" ? {} : { note: text.trim() });
  return (
    <div className={s.review} role="group" aria-label={`review of ${block.label}`}>
      <div className={s.reviewHead}>
        <b className={s.reviewLabel}>{block.label}</b>
        <span className={s.reviewSpan}>
          {timecode(block.at)} – {timecode(block.at + block.dur)}
        </span>
        <Chip label={block.state} tone={STATE_TONE[block.state]} casing="lower" dot />
      </div>
      <VerdictPick
        label={block.label}
        verdict={v}
        reasons={reasons}
        size="sm"
        onChange={(next) => onVerdict({ node: block.id, verdict: next?.verdict ?? null, reasons: next?.reasons ?? [], ...(next === null ? {} : withNote(next.note ?? note)) })}
      />
      {v !== undefined && noteMax > 0 && (
        <RejectNote
          label={block.label}
          name={`direction for ${block.label}`}
          placeholder="direction"
          text={note}
          max={noteMax}
          onSave={(text) => onVerdict({ node: block.id, verdict: v.verdict, reasons: v.reasons, ...withNote(text) })}
        />
      )}
    </div>
  );
}
