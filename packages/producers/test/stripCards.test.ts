import { describe, expect, it } from "vitest";
import type { EventData } from "@gt/domain/event";
import type { Outputs } from "@gt/kernel/job-core";
import { splitCeiling } from "../src/research/facts.ts";
import { unitStep } from "../src/research/partAct.ts";
import { cardOutcome, DRY_WHY, mergeCards, NO_PAGE, type DrawOut, type TurnOut } from "../src/stripCards/cards.ts";
import { ALL_DRAWN, CARD_ROUNDS, cardUnitOf, feedbackOf, NO_ARTICLE, parseUnit, skipOf, stripCardsPlan, type StripCardsView } from "../src/stripCards/define.ts";
import { cardWorstUsd, RENDER_ESTIMATE, TURN_ESTIMATE } from "../src/strips/plan.ts";

// The strip-cards act over literal inputs: which cards a draw plans (every undrawn section, or the
// one named), the units each card books and when a round is skipped, and the card each booking
// becomes - drawn with its poster, pending when dry, refused with the gate's own sentence.

const S = (id: string) => ({ id, heading: `Heading ${id}`, body: `The body of ${id}.` });
const view = (over: Partial<StripCardsView> = {}): StripCardsView => ({ title: "Why bitcoin", sections: [S("intro"), S("supply"), S("price")], drawn: new Set(), ...over });
const names = (v: StripCardsView, target?: string) => {
  const p = stripCardsPlan(v, "draw-strips", target);
  if (!p.ok) throw p.error;
  return p.value.units.map((u) => u.name);
};
const outs = (entries: Record<string, EventData>): Outputs => new Map(Object.entries(entries).map(([k, value]) => [unitStep(k), { step: unitStep(k), value, at: "2026-10-24T09:00:00.000Z" }]));
const turn = (o: TurnOut): EventData => ({ ...o });
const drawn = (o: DrawOut): EventData => ({ ...o });
const GOOD = drawn({ round: 0, pass: true, lint: [], caption: "the turn's caption", blob: { sha256: "a".repeat(64), bytes: 9, mime: "image/png" } });
const FAILED = drawn({ round: 0, pass: false, lint: [], gates: { seek: { ok: true, detail: "ok" }, legibility: { ok: false, detail: "smallest 18px at 1080w" } } });

describe("the plan", () => {
  const card = (c: string) => [`turn:${c}`, `draw:${c}`, ...Array.from({ length: CARD_ROUNDS }, (_, i) => [`fix:${c}:r${i + 1}`, `draw:${c}:r${i + 1}`]).flat()];
  it("a whole-part draw plans every undrawn section's card: a turn and a draw, then two fix rounds", () => {
    expect(CARD_ROUNDS).toBe(2);
    expect(card("card-intro")).toEqual(["turn:card-intro", "draw:card-intro", "fix:card-intro:r1", "draw:card-intro:r1", "fix:card-intro:r2", "draw:card-intro:r2"]);
    expect(names(view({ drawn: new Set(["supply"]) }))).toEqual([...card("card-intro"), ...card("card-price")]);
  });

  it("a targeted draw plans that section's card alone, drawn or not", () => {
    expect(names(view({ drawn: new Set(["supply"]) }), "supply")).toEqual(card("card-supply"));
  });

  it("prices each turn at the strip run's measured figure and each draw as this machine's free work", () => {
    const p = stripCardsPlan(view(), null, "intro");
    if (!p.ok) throw p.error;
    expect(p.value.act).toBe("draw-strips");
    expect(p.value.units.map((u) => u.estimate)).toEqual(Array.from({ length: CARD_ROUNDS + 1 }, () => [TURN_ESTIMATE, RENDER_ESTIMATE]).flat());
    // The receipt's worst case a card: a turn a round, every round taken.
    expect(p.value.units.reduce((n, u) => n + (u.estimate.usd ?? 0), 0)).toBeCloseTo(cardWorstUsd(CARD_ROUNDS, false, 0), 6);
    expect(cardWorstUsd(CARD_ROUNDS, false, 0)).toBeCloseTo(3 * (TURN_ESTIMATE.usd ?? 0), 6);
    expect(p.value.units[0]?.input).toEqual({ section: "intro", heading: "Heading intro", body: "The body of intro.", title: "Why bitcoin", card: "card-intro", round: 0 });
  });

  it("refuses in the work's words: no article, nothing left to draw, a section it does not have, another act", () => {
    const msg = (v: StripCardsView, act: string | null, target?: string) => {
      const p = stripCardsPlan(v, act, target);
      return p.ok ? "" : p.error.message;
    };
    expect(msg(view({ sections: [] }), "draw-strips")).toBe(NO_ARTICLE);
    expect(msg(view({ drawn: new Set(["intro", "supply", "price"]) }), "draw-strips")).toBe(ALL_DRAWN);
    expect(msg(view(), "draw-strips", "outro")).toBe("the article has no section outro");
    expect(msg(view(), "write-article")).toBe("write-article is not an act of a strips part");
  });

  it("reads a booked unit back as its card, round and section", () => {
    expect(parseUnit("turn:card-a")).toEqual({ kind: "turn", card: "card-a", round: 0 });
    expect(parseUnit("fix:card-a:r1")).toEqual({ kind: "turn", card: "card-a", round: 1 });
    expect(parseUnit("draw:card-a:r1")).toEqual({ kind: "draw", card: "card-a", round: 1 });
    expect([parseUnit("turn:card-a:r1"), parseUnit("fix:card-a"), parseUnit("lint:card-a:r0")]).toEqual([undefined, undefined, undefined]);
    const p = stripCardsPlan(view({ title: null }), "draw-strips", "price");
    if (!p.ok) throw p.error;
    expect(cardUnitOf(p.value.units[2]!, "2026-10-24T09:00:00.000Z")).toEqual({ name: "fix:card-price:r1", kind: "turn", card: "card-price", round: 1, section: S("price"), title: null, planned: "2026-10-24T09:00:00.000Z" });
  });
});

describe("when a round is skipped", () => {
  const u = (kind: "turn" | "draw", round: number) => ({ kind, card: "card-a", round });
  it("a passing round 0 ends the card: its fix and its second draw are skipped", () => {
    const o = outs({ "turn:card-a": turn({ ok: true, outcome: "completed" }), "draw:card-a": GOOD });
    expect(skipOf(u("turn", 1), o)).toBe("round 0 passed");
    expect(skipOf(u("draw", 1), outs({ "fix:card-a:r1": turn({ ok: false, outcome: "skipped", skipped: "round 0 passed" }) }))).toBe("round 0 passed");
  });
  it("a failing round 0 is fixed and drawn again", () => {
    const o = outs({ "turn:card-a": turn({ ok: true, outcome: "completed" }), "draw:card-a": FAILED, "fix:card-a:r1": turn({ ok: true, outcome: "completed" }) });
    expect(skipOf(u("turn", 1), o)).toBeUndefined();
    expect(skipOf(u("draw", 1), o)).toBeUndefined();
  });
  it("a turn that left no page is not drawn, and a dry draw is not fixed", () => {
    expect(skipOf(u("draw", 0), outs({ "turn:card-a": turn({ ok: false, outcome: "errored", why: "errored: exited 1" }) }))).toBe("errored: exited 1");
    expect(skipOf(u("draw", 0), outs({ "turn:card-a": turn({ ok: false, outcome: "errored" }) }))).toBe(NO_PAGE);
    expect(skipOf(u("turn", 1), outs({ "draw:card-a": drawn({ round: 0, pass: false, dry: true }) }))).toBe(DRY_WHY);
  });
  it("the fixer is shown round 0's lint, error and gates", () => {
    const f = feedbackOf({ round: 0, pass: false, lint: ["caption: 12 words, the bar is 30-60"], error: "boom", gates: { motion: { ok: false, detail: "motion in 1/8 s" } } }, 1);
    expect(f).toContain("- caption: 12 words, the bar is 30-60");
    expect(f).toContain("## Render error\nboom");
    expect(f).toContain("- motion: FAIL - motion in 1/8 s");
  });
});

describe("the card a section's bookings make", () => {
  const sec = { id: "a", heading: "Heading a" };
  const made = (e: Record<string, EventData>) => new Map(Object.entries(e));
  it("drawn: the last round that passed, its poster and its caption", () => {
    const c = cardOutcome(sec, 1, made({ "turn:card-a": turn({ ok: true, outcome: "completed" }), "draw:card-a": FAILED, "fix:card-a:r1": turn({ ok: true, outcome: "completed" }), "draw:card-a:r1": { ...GOOD, round: 1 } }), "stand-in");
    expect(c).toEqual({ id: "card-a", section: "a", title: "Heading a", caption: "the turn's caption", state: "drawn", blob: (GOOD as DrawOut).blob });
  });
  it("refused: the last round failed, with its gate's own words; the stand-in caption when the turn's did not pass", () => {
    const c = cardOutcome(sec, 1, made({ "draw:card-a": FAILED, "draw:card-a:r1": { ...FAILED, round: 1 } }), "stand-in");
    expect(c).toMatchObject({ state: "refused", why: "legibility: smallest 18px at 1080w", caption: "stand-in" });
    expect("blob" in c).toBe(false);
  });
  it("refused when no round ran: the seat's own sentence", () => {
    const c = cardOutcome(sec, 1, made({ "turn:card-a": turn({ ok: false, outcome: "errored", why: "errored: exited 1" }), "draw:card-a": drawn({ round: 0, pass: false, skipped: "errored: exited 1" }) }), "stand-in");
    expect(c).toMatchObject({ state: "refused", why: "errored: exited 1" });
  });
  it("pending when dry: no capture was taken", () => {
    const c = cardOutcome(sec, 1, made({ "draw:card-a": drawn({ round: 0, pass: false, dry: true }), "draw:card-a:r1": drawn({ round: 1, pass: false, skipped: DRY_WHY }) }), "The section's first sentence.");
    expect(c).toEqual({ id: "card-a", section: "a", title: "Heading a", caption: "The section's first sentence.", state: "pending", why: DRY_WHY });
  });
  it("lands by id: a redrawn card replaces its own entry, a new one joins in the article's order, a card of a section the article lost is dropped", () => {
    const old = [{ id: "card-b", section: "b", state: "drawn", blob: { sha256: "b" } }, { id: "card-x", section: "x", state: "drawn" }, { id: "card-c", section: "c", state: "drawn" }];
    const merged = mergeCards(old, [{ id: "card-b", section: "b", title: "B", caption: "new", state: "refused", why: "w" }, { id: "card-a", section: "a", title: "A", caption: "c", state: "pending" }], ["a", "b", "c"]);
    expect(merged.map((c) => c.id)).toEqual(["card-a", "card-b", "card-c"]);
    expect(merged[1]).toEqual({ id: "card-b", section: "b", title: "B", caption: "new", state: "refused", why: "w" });
  });
});

describe("a whole-part draw's ceiling, split across its card jobs", () => {
  const worst = cardWorstUsd(CARD_ROUNDS, false, 0);
  const usd = (x: number) => `$${x.toFixed(2)}`;
  it("three cards under 3 x a card's worst + $1: each share covers its card, rounded down to cents, and they never sum past the ceiling", () => {
    const r = splitCeiling(3 * worst + 1, [worst, worst, worst]);
    if (!r.ok) throw r.error;
    const share = Math.floor(Math.round((3 * worst + 1) * 100) / 3) / 100;
    expect(r.value).toEqual([share, share, share]);
    expect(r.value.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(3 * worst + 1);
    expect(r.value.every((c) => c >= worst)).toBe(true);
  });
  it("splits in proportion to each job's own receipt, and an exact ceiling gives each exactly its worst case", () => {
    expect(splitCeiling(30, [10, 20])).toEqual({ ok: true, value: [10, 20] });
    const exact = splitCeiling(3 * worst, [worst, worst, worst]);
    if (!exact.ok) throw exact.error;
    for (const c of exact.value) expect(c).toBeCloseTo(worst, 6);
  });
  it("refuses a ceiling that cannot cover every card's worst case, naming the shortfall", () => {
    const r = splitCeiling(5, [worst, worst, worst]);
    expect(r.ok ? "" : r.error.message).toBe(`the ceiling $5.00 does not cover the 3 jobs' worst case ${usd(3 * worst)}: ${usd(3 * worst - 5)} short`);
    expect(r.ok ? "" : r.error.code).toBe("refused");
  });
});
