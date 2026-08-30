"use client";

// The wizard's PASSES over the notebook — which cards each stage deals, and how
// a triage card is spoken in the deck's card language.
//
// Selection only, never state: the cards come from the SAME `buildCards()` the
// board flattens (through useScope), and every keep/cut the wizard offers writes
// through the same `toggle` the board's CardTile uses. This file decides what is
// ON the table per stage; it holds no opinion about what is in scope.
//
// DENSE, per the operator's verdict (2026-08-30): research cards carry rich
// generated titles and metadata, so they use the deck's dense face — no art
// zone (the output-type ICON is the watermark), the reading title, and the
// description plus rich metadata folded behind the card's own expand. The
// title carries the idea; the reader opens the rest only when not yet certain.

import {
  Cog,
  FileText,
  Flag,
  Flame,
  FlipHorizontal2,
  Shield,
} from "lucide-react";

import type { DeckCardSpec } from "@/components/ui/deck/DeckCard";

import type { Leap } from "../../_shared/notebook/conclusions";
import type { Card, CardState } from "../scope";

/** Stage 2's hand: the take(s) flagged hottest. Conclusions, so opt-in — the
 *  default reading is "not taken", and picking one takes it. */
export function hotTakes(cards: Card[]): Card[] {
  return cards.filter((c) => c.hottest);
}

/** Stage 2's fixed card. `required: true` in the card contract — the library
 *  forbids removing it, so the wizard deals it with NO pick target at all. */
export function steelManOf(cards: Card[]): Card | undefined {
  return cards.find((c) => c.kind === "steel-man");
}

/** Stage 3's hand: every opt-in conclusion NOT already decided in stage 2. The
 *  hottest take is a conclusion too, but a decision offered twice is a wizard
 *  second-guessing itself. */
export function conclusionChoices(cards: Card[]): Card[] {
  return cards.filter((c) => c.optIn && !c.hottest);
}

/* ── the card language ────────────────────────────────────────────────────── */

// Tailwind gradient classes as DATA (DeckArt's gradient contract): listed
// literally here so the JIT emits them — the dense face draws them as a faint
// full-card wash rather than an art zone.
const HOT_TONE = "from-rose-400/30 via-violet-400/10 to-transparent";
const STEEL_TONE = "from-amber-400/25 via-orange-300/10 to-transparent";
const CONCLUSION_TONE = "from-violet-400/25 via-fuchsia-400/10 to-transparent";

/** The output-type icons — one per card kind, hottest overriding its kind the
 *  way the board's 😈 eyebrow does. Small beside the eyebrow, oversized and
 *  faint as the card's background watermark (DeckCard's dense face). */
export function kindIcon(card: Pick<Card, "kind" | "hottest">): React.ReactNode {
  if (card.hottest) return <Flame />;
  switch (card.kind) {
    case "fact":
      return <FileText />;
    case "mechanism":
      return <Cog />;
    case "reversal":
      return <FlipHorizontal2 />;
    case "steel-man":
      return <Shield />;
    default:
      return <Flag />; // conclusions and anything the notebook grows next
  }
}

/** The leap tiers in the deck's chip tones — CardTile's LEAP_TONE vocabulary
 *  (near quiet · moderate amber · far violet · unhinged rose) mapped onto the
 *  four tones DeckCard chips actually have. The deck has no rose chip, so
 *  `unhinged` rides amber here and the card's rose-hot wash + risk line carry
 *  the heat instead — the tier NAME is always printed, so nothing is hidden. */
const LEAP_CHIP: Record<Leap, NonNullable<NonNullable<DeckCardSpec["chips"]>[number]["tone"]>> = {
  near: "neutral",
  moderate: "amber",
  far: "violet",
  unhinged: "amber",
};

/** A generated title split into a scannable head and the overflow.
 *
 *  The prompt now asks for short declarative titles (pipeline/RESEARCH-PROMPT.md),
 *  but the shipped fixture — and any run from before that rule — carries titles
 *  up to three sentences long. Those are handled here rather than trusted away:
 *  the first sentence leads (word-truncated if even that runs long), and the
 *  remainder is returned for the card's expandable detail, where it reads as
 *  the opening of the description. Nothing is dropped. */
export function splitTitle(title: string): { head: string; rest?: string } {
  const trimmed = title.trim();
  if (trimmed.length <= 90) return { head: trimmed };
  const sentence = trimmed.match(/^[^.?!]+[.?!]/)?.[0]?.trim();
  if (sentence && sentence.length <= 110) {
    const rest = trimmed.slice(sentence.length).trim();
    return { head: sentence.replace(/[.]$/, ""), rest: rest || undefined };
  }
  // No usable sentence break — cut at the last word boundary inside the budget.
  const cut = trimmed.slice(0, 88);
  const head = `${cut.slice(0, cut.lastIndexOf(" "))}…`;
  return { head, rest: trimmed };
}

/** One triage card, spoken as a dense deck card. `s` is the card's CURRENT
 *  scope state — the front chip says taken/not-taken with the exact words the
 *  board's ScopeChip uses, so the two faces cannot disagree about what a state
 *  is called. Everything else — the description, the title's overflow, leap
 *  and use-for metadata, the precedent — lives in the expandable detail.
 *  Rebuilt per render on purpose: the state chip must move when the scope
 *  does, and a stable `id` keeps the deal-in from re-firing. */
export function specOf(card: Card, s: CardState): DeckCardSpec {
  const kept = !s.descoped;
  const { head, rest } = splitTitle(card.title);

  // The front carries ONE chip — the decision state. That chip is the thing a
  // sweep of the hand must show; the rest is metadata and waits in the detail.
  const stateChip: NonNullable<DeckCardSpec["chips"]>[number] = card.required
    ? { label: "locked in scope", tone: "amber" }
    : card.optIn
      ? { label: kept ? "taken" : "not taken", tone: kept ? "cyan" : "neutral" }
      : { label: kept ? "in scope" : "descoped", tone: kept ? "cyan" : "amber" };

  const metaChips: NonNullable<DeckCardSpec["chips"]> = [];
  if (card.leap) metaChips.push({ label: `${card.leap} leap`, tone: LEAP_CHIP[card.leap] });
  if (card.useFor) metaChips.push({ label: `would be the ${card.useFor}`, tone: "neutral" });

  const hasDetail = Boolean(rest || card.detail || metaChips.length > 0 || card.precedent);

  return {
    id: card.id,
    density: "dense",
    icon: kindIcon(card),
    eyebrow: card.hottest ? "😈 hottest take" : card.kind,
    title: head,
    chips: [stateChip],
    // The honest-downside line stays on the FRONT — the downside must be
    // visible before the decision it belongs to, never one gesture behind it
    // (VariantTile's law). It is one line; the metadata it is not.
    risk: card.hottest
      ? "speculation about motive — not reporting. Held to a higher bar, not a lower one."
      : undefined,
    detail: hasDetail ? (
      <div className="space-y-2">
        {rest && (
          <p className="font-hanken text-[13px] leading-relaxed text-slate-300">{rest}</p>
        )}
        {card.detail && (
          <p className="font-hanken text-[13px] leading-relaxed text-slate-400">{card.detail}</p>
        )}
        {metaChips.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {metaChips.map((c) => (
              <span
                key={c.label}
                className={`font-jetbrains rounded border px-1.5 py-0.5 text-[10px] tracking-[0.1em] ${
                  c.tone === "violet"
                    ? "border-violet-400/35 bg-violet-400/[0.08] text-violet-200"
                    : c.tone === "amber"
                      ? "border-amber-400/30 bg-amber-400/[0.06] text-amber-200"
                      : "border-white/12 bg-white/[0.04] text-white/60"
                }`}
              >
                {c.label}
              </span>
            ))}
          </div>
        )}
        {card.precedent && (
          <p className="font-jetbrains text-[10px] text-white/30">
            pattern · {card.precedent.domain}
          </p>
        )}
      </div>
    ) : undefined,
    art: {
      kind: "gradient",
      tone: card.kind === "steel-man" ? STEEL_TONE : card.hottest ? HOT_TONE : CONCLUSION_TONE,
    },
  };
}
