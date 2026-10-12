"use client";

// A COUNT, OR A RATIO, AS A CHIP — the shape most of the app's tab blurbs turn
// out to be once the sentence is taken away.
//
//   app/library/LibraryView.tsx:26-29   three tabs, three blurbs. "Visual
//                                       identities. A locked one is required
//                                       before any project." is a rule the tab
//                                       cannot enforce and the reader cannot
//                                       act on; what the reader wants is how
//                                       many styles there are and how many are
//                                       locked. `2/5`.
//   app/_phases/script/ScriptStep.tsx:74-79
//                                       four tab captions ("three renders,
//                                       measured", "who used what, and for how
//                                       long") that each restate a number the
//                                       tab's own content already holds.
//   app/_phases/research/ResearchTriageBoard.tsx:62-67
//                                       a paragraph that exists to say
//                                       `columns.length` out loud, and whose
//                                       own comment records that the number was
//                                       wrong for as long as it was prose.
//
// THE CHIP LOOK IS THE HOUSE LOOK, not a new one. `rounded` (not `rounded-full`),
// a hairline border, `px-1.5 py-0.5`, mono, `text-label` — measured against
// app/_phases/_shared/notebook/Chips.tsx:14-19 and app/foundry/parts.tsx:71.
// The repo's pills (Eyebrow, the Deck rail, Segmented) are a different object:
// they are CONTROLS or headings. A tally is a stamp.

import Link from "next/link";

import { useWorld } from "../world";

export type TallyTone = "neutral" | "cyan" | "emerald" | "amber" | "rose";

/**
 * The one chip spelling in this vocabulary. Exported so <StaleBadge> and
 * <Provenance> draw the same object rather than each re-deriving it — the
 * failure components/ui/tokens.ts opens by describing, one layer up.
 */
export const CHIP_CLASS =
  "font-jetbrains inline-flex items-center gap-1.5 rounded border px-1.5 py-0.5 text-label tracking-[0.12em] whitespace-nowrap";

export const TALLY_TONE: Record<TallyTone, string> = {
  neutral: "border-white/10 bg-white/[0.04] text-white/60",
  cyan: "border-cyan-400/25 bg-cyan-400/[0.07] text-cyan-200/90",
  emerald: "border-emerald-400/25 bg-emerald-400/[0.07] text-emerald-200/90",
  amber: "border-amber-400/30 bg-amber-400/[0.08] text-amber-200/90",
  rose: "border-rose-400/30 bg-rose-400/[0.08] text-rose-200/90",
};

/**
 * The Almanac skin (components/kit/kit.css `.k-tally*`). Tones are roles there,
 * not hues: `amber` is "live, or waiting on a person" (gold, with a lit dot),
 * `emerald` is a pick (Aldebaran), `rose` an error (Antares), the rest are an
 * inventory. Same `TallyTone` vocabulary, so a caller never learns a second one.
 */
const ALMANAC_TONE: Record<TallyTone, string> = {
  neutral: "k-tally",
  cyan: "k-tally",
  emerald: "k-tally k-tally--pick",
  amber: "k-tally k-tally--live",
  rose: "k-tally k-tally--err",
};

export interface TallyProps {
  value: number;
  /** The denominator, when this is a ratio rather than a count. */
  of?: number;
  /** A mono uppercase prefix — `KEPT 12/36`. Two words at most. */
  label?: string;
  tone?: TallyTone;
  /**
   * What `tone` does at zero. `"neutral"` (the default) is the "zero is not
   * news" rule: a tone colours a chip only when there is something to see, so
   * `missed 0` never glows amber. `"keep"` is the opt-out for a zero that IS
   * news (a gate that must read green at 0 errors, say).
   */
  zero?: "neutral" | "keep";
  /** Native tooltip. Prefer `hint`; this exists for the machine-short case
   *  (an exact timestamp, an id) where a popover is more furniture than fact. */
  title?: string;
  /** Rendered as a <Hint> after the numerals. Same twelve-word rule. */
  hint?: React.ReactNode;
  /**
   * EVERY COUNT IS A DOOR: the chip becomes the filter for the set it counts.
   * Renders the same chip as a `<button aria-pressed>`; the accessible name
   * stays "missed 2" and the pressed state is announced separately. Use `href`
   * instead when the filtered view is a URL.
   */
  select?: { pressed: boolean; onToggle: () => void };
  /** Same chip as a link. Mutually exclusive with `select` (select wins). */
  href?: string;
  className?: string;
}

/** A pressed chip reads as lit: the tone's own border, a ring, never a new hue. */
const PRESSED = "ring-1 ring-white/40";
const DOOR = "cursor-pointer transition hover:brightness-125 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300/70";

/**
 * `<Tally value={12} of={36} />` → `12/36`. `<Tally value={3} />` → `3`.
 *
 * The numerals are `aria-hidden` and an equivalent sentence sits beside them
 * `sr-only`, because "12/36" is announced as "twelve slash thirty six" and a
 * ratio read as a slash is a worse label than the paragraph this replaces.
 */
export function Tally({
  value,
  of,
  label,
  tone = "neutral",
  zero = "neutral",
  title,
  hint,
  select,
  href,
  className = "",
}: TallyProps) {
  const almanac = useWorld() === "almanac";
  const spoken = `${label ? `${label} ` : ""}${of === undefined ? `${value}` : `${value} of ${of}`}`;
  const shown: TallyTone = value > 0 || zero === "keep" ? tone : "neutral";
  const interactive = Boolean(select || href);
  const skin = almanac ? ALMANAC_TONE[shown] : `${CHIP_CLASS} ${TALLY_TONE[shown]}`;
  const cls = `${skin}${interactive ? ` ${DOOR}` : ""}${select?.pressed ? ` ${PRESSED}` : ""} ${className}`;
  const body = (
    <>
      {label && (
        <span aria-hidden className={almanac ? "uppercase" : "uppercase opacity-80"}>
          {label}
        </span>
      )}
      <span aria-hidden>{of === undefined ? value : `${value}/${of}`}</span>
      <span className="sr-only">{spoken}</span>
    </>
  );
  // A hint is its own control; nesting it inside a button/link is invalid, so a
  // door draws it beside the chip instead.
  const withHint = (chip: React.ReactNode) =>
    hint ? (
      <span className="inline-flex items-center gap-1">
        {chip}
        {hint}
      </span>
    ) : (
      chip
    );
  if (select) {
    return withHint(
      <button type="button" aria-pressed={select.pressed} onClick={select.onToggle} className={cls} title={title}>
        {body}
      </button>,
    );
  }
  if (href) {
    return withHint(
      <Link href={href} className={cls} title={title}>
        {body}
      </Link>,
    );
  }
  return (
    <span className={cls} title={title}>
      {body}
      {hint}
    </span>
  );
}
