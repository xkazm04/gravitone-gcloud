import type { EventData } from "@gt/domain/event";

// WHAT A STRIP-CARDS JOB'S UNITS BOOK, AND THE CARD EACH BOOKING BECOMES - pure, beside the
// producer (./define.ts) so the landing and its tests read one rule.
//
// A card lands in one of the STRIPS record's three states (packages/domain/src/steps/parts.ts):
//   drawn    a round passed its lint (the page's purity and the caption's door), its capture and
//            all four gates, and left a poster: the poster's blob and the turn's caption land.
//   pending  a dry job: no capture was taken, so there is no picture. The caption is the section's
//            first sentences (the stand-in, lib/foundry/strips/brief.ts `standInCaption`).
//   refused  the last round that ran failed, or the author turn left no page: `why` is the gate's,
//            the lint's or the seat's own sentence, never a summary of it.
// A refused or pending card still carries a caption - the section's words when the turn's caption
// did not pass its door - so the voice part has a line to speak and the cut a span to hold.

export const DRY_WHY = "dry stand-in: no capture was taken";
export const NO_PAGE = "the author turn left no page";

export const cardIdOf = (sectionId: string): string => `card-${sectionId}`;

export const unitNames = {
  turn: (card: string, round: number): string => (round === 0 ? `turn:${card}` : `fix:${card}:r${round}`),
  draw: (card: string, round: number): string => (round === 0 ? `draw:${card}` : `draw:${card}:r${round}`),
};

/** A turn unit's booking. `skipped`: it did not run, and why; `adopted`: its page was on disk. */
export type TurnOut = {
  readonly ok: boolean;
  readonly outcome: string;
  readonly dry?: true;
  readonly adopted?: true;
  readonly skipped?: string;
  readonly costUsd?: number;
  readonly why?: string;
};

/** A draw unit's booking: whether the round passed, and what it measured. */
export type DrawOut = {
  readonly round: number;
  readonly pass: boolean;
  readonly dry?: true;
  readonly skipped?: string;
  readonly lint?: readonly string[];
  readonly caption?: string;
  readonly gates?: Readonly<Record<string, { readonly ok: boolean; readonly detail: string }>>;
  readonly error?: string;
  readonly blob?: Readonly<Record<string, unknown>>;
};

export type LandedCard = {
  readonly id: string;
  readonly section: string;
  readonly title: string;
  readonly caption: string;
  readonly state: "drawn" | "pending" | "refused";
  readonly blob?: Readonly<Record<string, unknown>>;
  readonly why?: string;
};

const asTurn = (x: EventData | undefined): TurnOut | undefined => x as TurnOut | undefined;
const asDraw = (x: EventData | undefined): DrawOut | undefined => x as DrawOut | undefined;

/** Why a round that ran did not pass, in its own words: the lint first (it was not rendered), then
 *  the render's error, then every failing gate. */
export function whyOf(d: DrawOut): string {
  const lint = d.lint ?? [];
  if (lint.length > 0) return lint.slice(0, 3).join("; ");
  if (d.error !== undefined) return d.error;
  const failing = Object.entries(d.gates ?? {}).filter(([, g]) => !g.ok);
  return failing.length > 0 ? failing.map(([k, g]) => `${k}: ${g.detail}`).join("; ") : "the round did not pass";
}

export type CardSource = { readonly id: string; readonly heading: string };

/** The card a section's bookings make, read off the LAST round that ran. */
export function cardOutcome(sec: CardSource, rounds: number, made: ReadonlyMap<string, EventData>, standIn: string): LandedCard {
  const id = cardIdOf(sec.id);
  const base = { id, section: sec.id, title: sec.heading };
  for (let r = rounds; r >= 0; r--) {
    const d = asDraw(made.get(unitNames.draw(id, r)));
    if (d === undefined || d.skipped !== undefined) continue;
    if (d.dry === true) return { ...base, caption: standIn, state: "pending", why: DRY_WHY };
    if (d.pass && d.blob !== undefined) return { ...base, caption: d.caption ?? standIn, state: "drawn", blob: d.blob };
    return { ...base, caption: d.caption ?? standIn, state: "refused", why: whyOf(d) };
  }
  const t = asTurn(made.get(unitNames.turn(id, 0)));
  return { ...base, caption: standIn, state: "refused", why: t?.why ?? (t === undefined ? NO_PAGE : `${NO_PAGE} (${t.outcome})`) };
}

type Rec = Readonly<Record<string, unknown>> & { readonly id: string };

/** The STRIPS cards after `landed` replace theirs by id (a new id is appended), in the article's
 *  section order (`order`: the ARTICLE record's section ids as the landing reads them).
 *
 *  A card whose section the article NO LONGER HAS is DROPPED, not kept as `refused`: an explainer
 *  that adopts another article keeps its STRIPS record, and every reader downstream takes every
 *  card - the voice part would narrate a stale caption (lib/producers/voice.ts `linesIn`) and the
 *  cut would hold a span for it, a refused one as a named picture gap. The card's files stay on
 *  disk under its job's directory; only the record forgets it. */
export function mergeCards(existing: readonly Rec[], landed: readonly LandedCard[], order: readonly string[]): Rec[] {
  const byId = new Map<string, Rec>(existing.map((c) => [c.id, c]));
  for (const c of landed) byId.set(c.id, { ...c });
  const at = (c: Rec): number => order.indexOf(typeof c["section"] === "string" ? c["section"] : "");
  return [...byId.values()].filter((c) => at(c) >= 0).sort((a, b) => at(a) - at(b));
}
