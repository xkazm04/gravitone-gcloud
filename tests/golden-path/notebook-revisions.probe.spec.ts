// LANE - A RETURNED FOLLOW-UP CAN LAND IN THE NOTEBOOK (follow-up revisions, stage 1).
//
// followup.ts::standingOf could only say "not applied" because the notebook is a
// static module and there was nowhere per-project to write an effect. Stage 1 is
// the pure half of the answer: research/revisions.ts::applyRevisions lays the
// APPLIED effects of a revision over a base notebook and never touches the base.
//
// The base here is the shipped fixture and the effects are the CANNED transcripts'
// own kinds, pointed at ids the fixture still carries (the real transcripts'
// targets were absorbed into it long ago, so replaying them verbatim would test
// "already there", not "lands"). Persistence, the queue controls and parseEffects
// are later stages and are not exercised here.
import { test, expect } from "@playwright/test";

import { buildCards, notebookIssues } from "@/lib/notebook/cards";
import { NOTEBOOK } from "@/lib/notebook/notebook";
import { fixtureSource, sourceOf } from "@/lib/notebook/source";
import type { Notebook } from "@/lib/notebook/types";
import type { Effect } from "@/lib/research/followup";
import {
  applyRevisions,
  decide,
  reviseNotebook,
  undoRevision,
  type NotebookRevision,
} from "@/lib/research/revisions";
import { woundsOf, scopeSummary } from "@/lib/research/scope";

const AT = "2026-10-11T12:00:00.000Z";

function rev(id: string, effects: Effect[], decided: "all" | Record<number, "applied" | "rejected"> = "all"): NotebookRevision {
  const map = decided === "all" ? Object.fromEntries(effects.map((_, i) => [i, "applied" as const])) : decided;
  return { id, requestId: `req-${id}`, effects, decided: map, at: AT };
}

/** The board a creator would see over a revised notebook: the fixture's columns
 *  and conclusions, this notebook's facts. */
function sourceFor(nb: Notebook) {
  const fs = fixtureSource();
  return sourceOf(nb, { kind: "replay", conclusions: fs.conclusions, dimensions: fs.dimensions, tags: fs.tags });
}

const KILL: Effect = { kind: "kills", targetId: "f-m2-divergence", note: "single-sourced" };
const ADD: Effect = {
  kind: "adds-fact", factId: "f-new", claim: "A new claim", confidence: "medium", source: "Example Research", note: "why",
};

test("1. a kill removes the fact, keeps a tombstone, and the wound names it", () => {
  const nb = applyRevisions(NOTEBOOK, [rev("a", [KILL])]);
  expect(nb.facts.some((f) => f.id === "f-m2-divergence")).toBe(false);
  expect(nb.killed?.map((k) => k.id)).toEqual(["f-m2-divergence"]);
  expect(nb.killed?.[0].revisionId).toBe("a");

  const src = sourceFor(nb);
  const wounds = woundsOf(buildCards(src), {}, undefined, new Set((nb.killed ?? []).map((k) => k.id)));
  const r4 = wounds.find((w) => w.cardId === "r4");
  expect(r4?.missing).toEqual(["f-m2-divergence"]);
  // The same wound arrives through the summary the board and the gate read.
  expect(scopeSummary(buildCards(src), {}, src).wounds.map((w) => w.cardId)).toContain("r4");
  // And the base notebook, untouched, reports none from this fact.
  expect(NOTEBOOK.facts.some((f) => f.id === "f-m2-divergence")).toBe(true);
  expect(NOTEBOOK.killed).toBeUndefined();
});

test("1b. a killed fact's references are wounds, not dangling-ref graph issues", () => {
  const nb = applyRevisions(NOTEBOOK, [rev("a", [KILL])]);
  expect(notebookIssues(sourceFor(nb)).filter((i) => i.ref === "f-m2-divergence")).toEqual([]);
});

test("2. adds-fact deals a card with its source and confidence, and twice is once", () => {
  const nb = applyRevisions(NOTEBOOK, [rev("a", [ADD])]);
  const card = buildCards(sourceFor(nb)).find((c) => c.id === "f-new");
  expect(card?.kind).toBe("fact");
  expect(card?.source).toBe("Example Research");
  expect(card?.confidence).toBe("medium");
  expect(card?.sources?.[0].name).toBe("Example Research");

  const once = sourceFor(nb).digest;
  const twice = sourceFor(applyRevisions(NOTEBOOK, [rev("a", [ADD]), rev("a", [ADD])])).digest;
  const again = sourceFor(applyRevisions(NOTEBOOK, [rev("a", [ADD]), rev("b", [ADD])])).digest;
  expect(twice).toBe(once);
  expect(again).toBe(once); // a different revision adding the same id writes nothing more
});

test("3. a downgrade of an absent id is reported and leaves the notebook unchanged", () => {
  const r = rev("a", [{ kind: "downgrades", targetId: "f-nope", note: "n" }]);
  const { notebook, landings } = reviseNotebook(NOTEBOOK, [r]);
  expect(landings).toEqual([{ revisionId: "a", effectIndex: 0, state: "no such id here" }]);
  expect(notebook).toBe(NOTEBOOK);
  expect(sourceFor(notebook).digest).toBe(sourceFor(NOTEBOOK).digest);
});

test("3b. downgrade steps one rung, resolves-unknown sets resolvedBy, confirms writes nothing", () => {
  const high = NOTEBOOK.facts.find((f) => f.confidence === "high")!;
  const open = NOTEBOOK.unknowns.find((u) => !u.resolvedBy);
  const effects: Effect[] = [
    { kind: "downgrades", targetId: high.id, note: "only one source after all" },
    { kind: "confirms", targetId: high.id, note: "fine" },
  ];
  if (open) effects.push({ kind: "resolves-unknown", targetId: open.id, note: "answered" });
  const nb = applyRevisions(NOTEBOOK, [rev("a", effects), rev("a", effects)]);
  const f = nb.facts.find((x) => x.id === high.id)!;
  expect(f.confidence).toBe("medium"); // one rung, once - the repeated revision is not a second step
  expect(f.confidenceNote).toBe("only one source after all");
  if (open) expect(nb.unknowns.find((u) => u.id === open.id)?.resolvedBy).toBe("answered");
});

test("4. rejecting one of three effects lands the other two; pending lands nothing", () => {
  const effects: Effect[] = [KILL, ADD, { kind: "downgrades", targetId: "f-yields", note: "n" }];
  const r = rev("a", effects, { 0: "applied", 1: "rejected", 2: "applied" });
  const { notebook, landings } = reviseNotebook(NOTEBOOK, [r]);
  expect(landings.map((l) => l.state)).toEqual(["landed", "rejected", "landed"]);
  expect(notebook.facts.some((f) => f.id === "f-new")).toBe(false);
  expect(notebook.facts.some((f) => f.id === "f-m2-divergence")).toBe(false);

  const pending = reviseNotebook(NOTEBOOK, [rev("p", effects, {})]);
  expect(pending.notebook).toBe(NOTEBOOK);
  expect(pending.landings.every((l) => l.state === "pending")).toBe(true);

  // decide() is the only writer of a decision and does not mutate its input.
  const d = decide(rev("p", effects, {}), 1, "rejected");
  expect(d.decided).toEqual({ 1: "rejected" });
});

test("5. undoing the newest revision returns the digest and the card count", () => {
  const a = rev("a", [ADD]);
  const b = rev("b", [KILL]);
  const s0 = sourceFor(applyRevisions(NOTEBOOK, [a]));
  const s1 = sourceFor(applyRevisions(NOTEBOOK, [a, b]));
  expect(s1.digest).not.toBe(s0.digest);
  expect(buildCards(s1).length).toBe(buildCards(s0).length - 1);

  const back = sourceFor(applyRevisions(NOTEBOOK, undoRevision([a, b], "b")));
  expect(back.digest).toBe(s0.digest);
  expect(buildCards(back).length).toBe(buildCards(s0).length);
});
