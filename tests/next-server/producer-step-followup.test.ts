// THE FOLLOW-UP TURN'S DOOR (Phase 4 wave C, L37). v1's follow-ups were a 700 ms canned answer;
// the real turn's answer passes an allowlist before it can become a revision: an effect naming an
// id the notebook does not hold, or "adding" a fact id it already has, is refused whole, with the
// ids named, and nothing changes (structured-output: op-grammar-allowlisting).

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { fixtureSource } from "../../lib/notebook/source.ts";
import { followUpPrompt, parseFollowUp } from "../../lib/producers/research.ts";

const nb = fixtureSource().notebook;
const fact = nb.facts[0]?.id ?? "";
const unknown = nb.unknowns[0]?.id ?? "";

describe("a follow-up answer through its door", () => {
  it("keeps effects on ids this notebook holds and a fact that is new", () => {
    const r = parseFollowUp(
      {
        summary: "s",
        effects: [
          { kind: "downgrades", targetId: fact, note: "weaker" },
          { kind: "resolves-unknown", targetId: unknown, note: "found" },
          { kind: "adds-fact", factId: "f-new", claim: "c", confidence: "low", source: "src" },
        ],
        sources: [],
        verdict: "weakened",
      },
      nb,
    );
    expect(r.ok ? r.value.effects.map((e) => e.kind) : r.error.message).toEqual(["downgrades", "resolves-unknown", "adds-fact"]);
  });

  it("refuses an effect on an id the notebook does not hold, and a fact added twice - naming them", () => {
    const r = parseFollowUp({ summary: "s", effects: [{ kind: "kills", targetId: "f-ghost", note: "x" }, { kind: "adds-fact", factId: fact, claim: "c", confidence: "high", source: "s" }], sources: [], verdict: "weakened" }, nb);
    expect(r.ok ? "" : r.error.message).toBe(`The engine returned effects this notebook cannot hold (f-ghost is not in this notebook; ${fact} already exists). Nothing was changed.`);
    expect(parseFollowUp({ summary: "s", effects: [], sources: [], verdict: "maybe" }, nb).ok).toBe(false);
  });

  it("refuses one answer that adds the same new fact twice, or downgrades one fact twice - the set is checked, not each effect", () => {
    const twice = parseFollowUp(
      {
        summary: "s",
        effects: [
          { kind: "adds-fact", factId: "f-new", claim: "the first claim", confidence: "low", source: "a" },
          { kind: "adds-fact", factId: "f-new", claim: "a different claim", confidence: "high", source: "b" },
        ],
        sources: [],
        verdict: "strengthened",
      },
      nb,
    );
    expect(twice.ok ? "" : twice.error.message).toBe("The engine returned effects this notebook cannot hold (f-new is added twice). Nothing was changed.");
    const rungs = parseFollowUp({ summary: "s", effects: [{ kind: "downgrades", targetId: fact, note: "weaker" }, { kind: "downgrades", targetId: fact, note: "weaker still" }], sources: [], verdict: "weakened" }, nb);
    expect(rungs.ok ? "" : rungs.error.message).toBe(`The engine returned effects this notebook cannot hold (${fact} is downgraded twice). Nothing was changed.`);
    // Two different kinds on one id are not a repeat: a confirm beside a downgrade stays the engine's to say.
    expect(parseFollowUp({ summary: "s", effects: [{ kind: "confirms", targetId: fact, note: "a" }, { kind: "downgrades", targetId: fact, note: "b" }], sources: [], verdict: "weakened" }, nb).ok).toBe(true);
  });

  it("the prompt carries the question and every id the answer may name", () => {
    const p = followUpPrompt(nb, { prompt: "who holds it?" });
    expect(p).toContain('"prompt":"who holds it?"');
    expect(p).toContain(fact);
    expect(p).toContain(unknown);
  });
});
