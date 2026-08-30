"use client";

// THE CARD — the atom of the deck engine.
//
// A card is one candidate in a decision: an art zone on top, the argument below
// (title, pitch, chips, an honest downside where there is one), and the WHOLE
// CARD as the pick target. The target is built the way the research board's
// CardTile builds it, and for the reason stated there at length: an overlay
// <button className="absolute inset-0 z-10"> inside a relatively-positioned
// frame — never role="button" on the container, which would drop every child
// from the accessibility tree. Anything a consumer layers on top of a card
// (actions, badges) belongs at z-20, above the target.
//
// This file is the repo's FIRST JS animation (motion/react springs) — the
// motion doctrine everywhere else is entrance-only CSS on --gt-ease. Springs
// are used here because a deal-in and a hover lift are physical gestures a
// fixed curve flattens; the cost is that CSS's reduced-motion blanket cannot
// reach them, so every animated property consults useDeckReducedMotion
// (motionGuard.ts). Reduced: entrance collapses to opacity, hover and press
// do not move at all.

import { motion } from "motion/react";

import { SURFACE } from "../tokens";
import { DeckArtView } from "./artVariants";
import { useDeckReducedMotion } from "./motionGuard";

/* ── The spec ─────────────────────────────────────────────────────────────── */

export type DeckArt =
  /** Tailwind gradient classes from data (they must appear literally in some
   *  source file for the JIT to emit them). `hexes` — runtime data, e.g. a
   *  style's palette — wins over `tone` when present, drawn as an inline
   *  gradient because a class name composed at runtime gets no CSS. */
  | { kind: "gradient"; tone: string; hexes?: string[]; manifestKey?: string }
  /** A real picture. `fallback` is what the gradient variant (and a missing
   *  image) draws instead — without it, the neutral default ground. */
  | { kind: "image"; src: string; alt?: string; fallback?: { tone?: string; hexes?: string[] } }
  /** WP2 replaces this with real emblems; WP1 draws the gradient ground plus
   *  the card title's initial glyph. */
  | { kind: "emblem"; emblemId: string; tone?: string };

export interface DeckCardSpec {
  id: string;
  /** Small mono kicker, e.g. "discipline". */
  eyebrow?: string;
  /** Serif hero, font-instrument. */
  title: string;
  /** One/two sentence pitch. */
  body?: string;
  chips?: { label: string; tone?: "cyan" | "violet" | "emerald" | "amber" | "neutral" }[];
  art: DeckArt;
  /** Amber honest-downside line (VariantTile precedent). */
  risk?: string;
  /** Small provenance/mono line. */
  footnote?: string;
  disabled?: boolean;
}

/* ── Tones ────────────────────────────────────────────────────────────────── */

const CHIP_TONE: Record<NonNullable<NonNullable<DeckCardSpec["chips"]>[number]["tone"]>, string> = {
  cyan: "border-cyan-400/30 bg-cyan-400/[0.06] text-cyan-200/90",
  violet: "border-violet-400/35 bg-violet-400/[0.08] text-violet-200",
  emerald: "border-emerald-400/30 bg-emerald-400/[0.07] text-emerald-200",
  amber: "border-amber-400/30 bg-amber-400/[0.06] text-amber-200",
  neutral: "border-white/12 bg-white/[0.04] text-white/60",
};

/* ── Springs — the deck's two gestures ────────────────────────────────────── */

/** The deal: rise + settle from ~0.9 scale. Firm but not bouncy. */
const DEAL_SPRING = { type: "spring", stiffness: 240, damping: 26, mass: 0.9 } as const;
/** The lift: quicker, so hover feels like the card answering the cursor. */
const LIFT_SPRING = { type: "spring", stiffness: 340, damping: 24 } as const;

export default function DeckCard({
  spec,
  picked,
  onPick,
  dealDelay = 0,
  children,
}: {
  spec: DeckCardSpec;
  picked: boolean;
  /** Click the picked card again = unpick (SlotColumn precedent) — the null. */
  onPick: (id: string | null) => void;
  /** Seconds. DeckStage staggers this by distance from the stage centre. */
  dealDelay?: number;
  /** Replaces the default content block below the art zone. */
  children?: React.ReactNode;
}) {
  const reduced = useDeckReducedMotion();
  const interactive = !spec.disabled;

  return (
    <motion.article
      data-testid={`deck-card-${spec.id}`}
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 26, scale: 0.9 }}
      animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
      transition={
        reduced
          ? { duration: 0.2 }
          : { ...DEAL_SPRING, delay: dealDelay, opacity: { duration: 0.35, delay: dealDelay } }
      }
      whileHover={
        reduced || !interactive
          ? undefined
          : { y: -6, scale: 1.02, rotate: -0.4, transition: LIFT_SPRING }
      }
      whileTap={reduced || !interactive ? undefined : { scale: 0.98, transition: LIFT_SPRING }}
      className={`group relative flex h-full flex-col overflow-hidden rounded-2xl ${SURFACE} ${
        picked ? "ring-2 ring-cyan-300/60" : ""
      } ${spec.disabled ? "opacity-50" : ""}`}
    >
      {/* art zone — the top ~40% */}
      <div className="relative h-28 shrink-0 overflow-hidden sm:h-32">
        <DeckArtView art={spec.art} title={spec.title} />
        {/* sheen — sweeps in on hover; a colour transition, which the CSS
            reduced-motion blanket already switches off */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        />
        {/* the content block's own ground fading in over the art */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[var(--gt-ink)]/60 to-transparent"
        />
      </div>

      {/* picked tint over the whole card, under the content */}
      {picked && <div aria-hidden className="pointer-events-none absolute inset-0 bg-cyan-400/[0.05]" />}

      {children ?? (
        <div className="flex grow flex-col gap-2 p-4">
          {spec.eyebrow && (
            <span className="font-jetbrains text-[10px] tracking-[0.16em] text-white/35 uppercase">
              {spec.eyebrow}
            </span>
          )}
          <h3 className="font-instrument text-xl leading-snug text-slate-100">{spec.title}</h3>
          {spec.body && (
            <p className="font-hanken line-clamp-3 text-[13px] leading-relaxed text-slate-400 transition-colors duration-200 ease-linear group-hover:text-slate-200">
              {spec.body}
            </p>
          )}
          {spec.chips && spec.chips.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {spec.chips.map((c) => (
                <span
                  key={c.label}
                  className={`font-jetbrains rounded border px-1.5 py-0.5 text-[10px] tracking-[0.1em] ${CHIP_TONE[c.tone ?? "neutral"]}`}
                >
                  {c.label}
                </span>
              ))}
            </div>
          )}
          {spec.risk && (
            <p className="font-jetbrains text-[11px] leading-relaxed text-amber-200/85">
              risk — {spec.risk}
            </p>
          )}
          {spec.footnote && (
            <p className="font-jetbrains mt-auto pt-1 text-[10px] text-white/30">{spec.footnote}</p>
          )}
        </div>
      )}

      {/* The whole-card target: a real button laid OVER the card, never a role
          on it (CardTile.tsx states what the role costs). It draws nothing of
          its own — the frame's ring and tint are the visual. */}
      <button
        type="button"
        disabled={spec.disabled}
        onClick={() => onPick(picked ? null : spec.id)}
        aria-pressed={picked}
        aria-label={`${picked ? "Unpick" : "Pick"}: ${spec.title}`}
        className="absolute inset-0 z-10 cursor-pointer rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed"
      />
    </motion.article>
  );
}
