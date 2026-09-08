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
  /* THERE IS NO PER-CARD ART PIN ANY MORE (2026-09-08). A card used to be able
   * to carry `artVariant` to opt out of a global bake-off switcher; the operator
   * ordered the switcher removed ("Lets remove it from the codebase"), so there
   * is nothing left to opt out OF. What a card draws is decided once, per
   * family, by the manifest key its `art` already carries — see FAMILY_FACE in
   * artVariants.tsx, which also records how each family was ruled. The verdict
   * this pin used to hold (emblem for the create wizard's discipline and
   * template stages, 2026-08-30, re-ruled permanent 2026-09-08 after the
   * committed illustrations were compared against redrawn denotative emblems
   * and lost) lives there now, unchanged in effect. */
  /** HERO — the deciding card (operator verdict 2026-09-06, the create wizard's
   *  three pick stages). Where `dense` is for cards you READ, hero is for cards
   *  you CHOOSE BETWEEN: the illustration and one large centred title, and
   *  nothing else. Eyebrow, body, chips, risk and footnote are not laid out at
   *  all — on a stage whose headline already asks the question, a kicker
   *  reading "discipline" over a card in the discipline deck is the label of a
   *  label, and a template count is a number nobody chooses on. The supporting
   *  facts live one level up, in the stage's own sub-line.
   *
   *  Hero cards are normally dealt with `noUnpick` (below): the card IS the
   *  decision, so clicking it commits and the consumer moves on. */
  /** DENSE — the reading card (operator verdict 2026-08-30 for research and
   *  the later phases): these cards carry rich generated titles and metadata,
   *  so the showcase shape is wrong for them. Dense drops the art zone (the
   *  `icon` becomes a faint background watermark instead — the art was dead
   *  height here), sets the title in the body face rather than the landing
   *  serif, and folds `detail` behind an expand: the title carries the idea,
   *  the reader opens the rest only when not yet certain. The front keeps the
   *  decision-critical minimum — state chips and the honest-downside line. */
  density?: "showcase" | "dense" | "hero";
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
  noUnpick = false,
  children,
}: {
  spec: DeckCardSpec;
  picked: boolean;
  /** Click the picked card again = unpick (SlotColumn precedent) — the null. */
  onPick: (id: string | null) => void;
  /** Seconds. DeckStage staggers this by distance from the stage centre. */
  dealDelay?: number;
  /** Suppress the unpick half of the toggle: every click reports THIS card's
   *  id, never null. For a deck whose pick advances the surface — the create
   *  wizard's stages — the toggle is a trap rather than a shortcut: coming
   *  back to a stage lands on the card you already chose, and the one gesture
   *  that should re-confirm it would instead clear it and go nowhere. */
  noUnpick?: boolean;
  /** Replaces the default content block below the art zone. */
  children?: React.ReactNode;
}) {
  const reduced = useDeckReducedMotion();
  const pickable = spec.pickable !== false;
  const interactive = !spec.disabled && pickable;
  const dense = spec.density === "dense";
  const hero = spec.density === "hero";
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
        /* art zone — the top ~40%, and taller on a hero card, where the
           illustration and the title are the whole of the card */
        <div
          className={`relative shrink-0 overflow-hidden ${
            hero ? "h-40 sm:h-48" : "h-28 sm:h-32"
          }`}
        >
          <DeckArtView art={spec.art} />
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
        (hero ? (
          /* The whole card, below the art: one large centred title and nothing
             else. `grow` + centring is what makes it read as the middle of the
             card rather than a caption under a picture — cards in a row keep
             equal height, so short and long titles both sit on the same line. */
          <div className="relative flex grow items-center justify-center p-5 text-center">
            <h3 className="font-hanken text-2xl leading-tight font-semibold text-slate-100 transition-colors duration-200 ease-linear group-hover:text-white">
              {spec.title}
            </h3>
          </div>
        ) : dense ? (
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
                generated title can run long, and it has to scan, not pose.

                IT HAS TO LEAD THE CARD, AND IT DID NOT. Measured at 1920 on a
                real research card: title 17px/600, the prose it sits over 18px.
                The title was literally SMALLER than the body underneath it, so
                the eye entered the card at the paragraph and had to work back
                up — which is what the operator reported as "small title".
                `text-xl` (1.375rem/22px on this repo's scale) puts a clear step
                between the two; the weight and the leading are unchanged. */}
            <h3 className="font-hanken text-xl leading-snug font-semibold text-slate-100">
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
                {/* THE READING REGION OWNS ITS OWN LEGIBILITY (operator,
                    2026-09-08: "poor description font for readability of
                    multiple sentences, poor description readability if font
                    color gray in the card").

                    `detail` is arbitrary consumer JSX, and every consumer had
                    reached for a muted grey: the research passes set their two
                    prose paragraphs on slate-300 and slate-400, and slate-400
                    (#94a3b8) over this card's ground is the grey the operator
                    named. A card that opens a panel of prose cannot leave the
                    readability of that prose to each caller's taste, so the rung
                    and the contrast are DECLARED here — `text-content` (the
                    1.125rem reading rung) and slate-200, the same brightness the
                    dense title sits at one weight above.

                    `[&_p.font-hanken]` rather than a plain colour on the
                    wrapper, because an inherited colour loses to the child's own
                    `text-slate-400`: a descendant selector outranks a bare class,
                    so this wins. It is scoped to the PROSE face on purpose —
                    mono lines inside a detail (provenance, pattern footnotes)
                    are chrome, keep their own quieter tone, and are not
                    touched. */}
                <div className="border-t border-white/8 pt-2.5 [&_p.font-hanken]:text-content [&_p.font-hanken]:text-slate-200">
                  {spec.detail}
                </div>
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
            {/* The body face, not the landing serif. font-instrument is the
                display voice of the marketing surfaces; on a working card it
                poses where it should scan, and it was carrying every showcase
                title in the app (operator verdict 2026-09-06). The serif stays
                where it belongs — headlines and the landing page. */}
            <h3 className="font-hanken text-xl leading-snug font-semibold text-slate-100">
              {spec.title}
            </h3>
            {/* The pitch. Read at rest, not on hover — it used to sit on
                slate-400 and brighten to slate-200 under the cursor, which is
                the same muted grey the operator called out in the dense card's
                detail panel (2026-09-08) and which a keyboard user or a reader
                comparing a row of cards never lifts. Body copy starts legible;
                the hover lift is the card's answer to the cursor, not the
                condition for reading it. */}
            {spec.body && (
              <p className="font-hanken line-clamp-3 text-content leading-relaxed text-slate-200">
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
          onClick={() => onPick(picked && !noUnpick ? null : spec.id)}
          aria-pressed={picked}
          aria-label={`${picked && !noUnpick ? "Unpick" : "Pick"}: ${spec.title}`}
          className="absolute inset-0 z-10 cursor-pointer rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed"
        />
      )}
    </motion.article>
  );
}
