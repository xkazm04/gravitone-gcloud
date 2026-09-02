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

import { useState } from "react";
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
  /** A settled bake-off verdict for THIS card: pin its art face regardless of
   *  the global switcher. The operator ruled emblem for the create wizard's
   *  discipline and template stages (2026-08-30); surfaces still in the
   *  bake-off leave this unset and follow the switcher. */
  artVariant?: import("./useArtVariant").ArtVariant;
  /** DENSE — the reading card (operator verdict 2026-08-30 for research and
   *  the later phases): these cards carry rich generated titles and metadata,
   *  so the showcase shape is wrong for them. Dense drops the art zone (the
   *  `icon` becomes a faint background watermark instead — the art was dead
   *  height here), sets the title in the body face rather than the landing
   *  serif, and folds `detail` behind an expand: the title carries the idea,
   *  the reader opens the rest only when not yet certain. The front keeps the
   *  decision-critical minimum — state chips and the honest-downside line. */
  density?: "showcase" | "dense";
  /** The output-type icon (dense cards): rendered small beside the eyebrow and
   *  large as the card's background watermark. */
  icon?: React.ReactNode;
  /** Expandable depth — description overflow and rich metadata. When set, the
   *  card renders its own "details" toggle (z-20, above the pick target). */
  detail?: React.ReactNode;
  /** false = a card with no choice in it (the steel-man): no pick target, no
   *  hover lift — it is dealt with the hand but only states itself. */
  pickable?: boolean;
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

/** The deal: rise + settle from ~0.9 scale. Firm but not bouncy. Exported so
 *  a surface that mirrors the deal (a card dealt outside DeckCard) shares the
 *  numbers instead of copying them. */
export const DEAL_SPRING = { type: "spring", stiffness: 240, damping: 26, mass: 0.9 } as const;
/** The lift: quicker, so hover feels like the card answering the cursor. */
export const LIFT_SPRING = { type: "spring", stiffness: 340, damping: 24 } as const;

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
  const pickable = spec.pickable !== false;
  const interactive = !spec.disabled && pickable;
  const dense = spec.density === "dense";
  const [open, setOpen] = useState(false);

  const chipRow = spec.chips && spec.chips.length > 0 && (
    <div className="flex flex-wrap items-center gap-1.5">
      {spec.chips.map((c) => (
        <span
          key={c.label}
          className={`font-jetbrains rounded border px-1.5 py-0.5 text-label tracking-[0.1em] ${CHIP_TONE[c.tone ?? "neutral"]}`}
        >
          {c.label}
        </span>
      ))}
    </div>
  );
  const riskLine = spec.risk && (
    <p className="font-jetbrains text-label leading-relaxed text-amber-200/85">risk — {spec.risk}</p>
  );
  const footnoteLine = spec.footnote && (
    <p className="font-jetbrains mt-auto pt-1 text-label text-white/30">{spec.footnote}</p>
  );

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
      {dense ? (
        // The dense ground: the art's gradient as a faint full-card wash, the
        // icon as an oversized watermark bleeding off the top-right corner —
        // background, not a zone, so the card is only as tall as its words.
        <>
          {spec.art.kind === "gradient" && (
            <div
              aria-hidden
              className={`pointer-events-none absolute inset-0 bg-gradient-to-br opacity-60 ${spec.art.tone}`}
            />
          )}
          {spec.icon && (
            <span
              aria-hidden
              className="pointer-events-none absolute -top-4 -right-4 rotate-12 text-white opacity-[0.06] [&>svg]:h-28 [&>svg]:w-28"
            >
              {spec.icon}
            </span>
          )}
        </>
      ) : (
        /* art zone — the top ~40% */
        <div className="relative h-28 shrink-0 overflow-hidden sm:h-32">
          <DeckArtView art={spec.art} title={spec.title} pinned={spec.artVariant} />
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
      )}

      {/* picked tint over the whole card, under the content */}
      {picked && <div aria-hidden className="pointer-events-none absolute inset-0 bg-cyan-400/[0.05]" />}

      {children ??
        (dense ? (
          <div className="relative flex grow flex-col gap-2 p-4">
            <div className="flex items-center gap-1.5">
              {spec.icon && (
                <span aria-hidden className="text-white/45 [&>svg]:h-3.5 [&>svg]:w-3.5">
                  {spec.icon}
                </span>
              )}
              {spec.eyebrow && (
                <span className="font-jetbrains text-label tracking-[0.16em] text-white/35 uppercase">
                  {spec.eyebrow}
                </span>
              )}
            </div>
            {/* The reading title — the body face, not the landing serif: a
                generated title can run long, and it has to scan, not pose. */}
            <h3 className="font-hanken text-[15px] leading-snug font-semibold text-slate-100">
              {spec.title}
            </h3>
            {chipRow}
            {riskLine}
            {spec.detail && open && (
              <motion.div
                data-testid={`deck-detail-${spec.id}`}
                initial={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
                animate={reduced ? { opacity: 1 } : { opacity: 1, height: "auto" }}
                transition={reduced ? { duration: 0.15 } : { duration: 0.28, ease: "easeOut" }}
                className="overflow-hidden"
              >
                <div className="border-t border-white/8 pt-2.5">{spec.detail}</div>
              </motion.div>
            )}
            {footnoteLine}
            {spec.detail && (
              /* Above the pick target (z-20 over its z-10) — the deck's rule
                 for anything layered on a card. */
              <div className="relative z-20 pt-1">
                <button
                  type="button"
                  data-testid={`deck-more-${spec.id}`}
                  aria-expanded={open}
                  onClick={() => setOpen((o) => !o)}
                  className={`font-jetbrains rounded-full border px-3 py-1 text-label transition ${
                    open
                      ? "border-cyan-400/40 text-cyan-200"
                      : "border-white/12 text-white/50 hover:text-white/80"
                  }`}
                >
                  {open ? "less" : "details"}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex grow flex-col gap-2 p-4">
            {spec.eyebrow && (
              <span className="font-jetbrains text-label tracking-[0.16em] text-white/35 uppercase">
                {spec.eyebrow}
              </span>
            )}
            <h3 className="font-instrument text-xl leading-snug text-slate-100">{spec.title}</h3>
            {spec.body && (
              <p className="font-hanken line-clamp-3 text-content leading-relaxed text-slate-400 transition-colors duration-200 ease-linear group-hover:text-slate-200">
                {spec.body}
              </p>
            )}
            {chipRow}
            {riskLine}
            {footnoteLine}
          </div>
        ))}

      {/* The whole-card target: a real button laid OVER the card, never a role
          on it (CardTile.tsx states what the role costs). It draws nothing of
          its own — the frame's ring and tint are the visual. A card that is
          not pickable (the steel-man) gets NO target at all: disabled would
          announce a choice that is switched off, and there is no choice. */}
      {pickable && (
        <button
          type="button"
          disabled={spec.disabled}
          onClick={() => onPick(picked ? null : spec.id)}
          aria-pressed={picked}
          aria-label={`${picked ? "Unpick" : "Pick"}: ${spec.title}`}
          className="absolute inset-0 z-10 cursor-pointer rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed"
        />
      )}
    </motion.article>
  );
}
