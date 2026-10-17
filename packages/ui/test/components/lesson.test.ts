// A lesson's rules (Phase 6, L65): one count of the evidence for the engine and the hand paths,
// the key a confirm is checked against, the sign's contract, the strengths cell's floor, and the
// signed list as drawn.
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import type { HuntLeafView } from "../../src/components/audio/hunt.ts";
import { cellLesson, claimProblem, EVIDENCE_FLOOR, evidenceKey, evidenceOf, handLesson, huntLessonBlock } from "../../src/components/audio/lesson.ts";
import { LessonList } from "../../src/components/audio/LessonList.tsx";

const leaf = (o: Partial<HuntLeafView> & { readonly id: string }): HuntLeafView => ({
  parentId: "ax",
  axis: "tempo",
  label: o.id,
  rationale: "",
  provider: "elevenlabs",
  technique: [],
  prompt: "p",
  negative: null,
  durationS: 30,
  tempoBpm: null,
  key: null,
  loop: null,
  state: "rendered",
  takeIds: [`t-${o.id}`],
  winner: false,
  error: null,
  ...o,
});

const NODES: readonly HuntLeafView[] = [
  leaf({ id: "ax", parentId: null, prompt: "", state: "idea", takeIds: [] }),
  leaf({ id: "w", winner: true, technique: ["duration-and-tempo-locking"] }),
  leaf({ id: "l", technique: ["duration-and-tempo-locking", "tag-list"] }),
  leaf({ id: "u", state: "idea", takeIds: [] }),
];

describe("the evidence", () => {
  test("a hunt's lesson counts the heard leaves and cites each winner's newest take", () => {
    const p = handLesson({ id: "h", kind: "music", nodes: NODES }, 7.5);
    expect(p).toMatchObject({ kind: "music", source: "hunt", huntId: "h", claim: "", provider: "elevenlabs", technique: ["duration-and-tempo-locking"] });
    expect(p.evidence).toEqual({ n: 2, keepRate: 0.5, meanScore: 7.5, takeIds: ["t-w"] });
    expect(evidenceOf(NODES).axes).toEqual([{ axis: "tempo", n: 1 }]);
  });

  test("the key moves when a crown moves, so a confirm over the old count is caught", () => {
    const before = evidenceKey(handLesson({ id: "h", kind: "music", nodes: NODES }).evidence);
    const crowned = NODES.map((n) => (n.id === "l" ? { ...n, winner: true } : n));
    const after = evidenceKey(handLesson({ id: "h", kind: "music", nodes: crowned }).evidence);
    expect(after).not.toBe(before);
    expect(evidenceKey(handLesson({ id: "h", kind: "music", nodes: NODES }).evidence)).toBe(before);
  });

  test("a hunt with nothing heard, or no crown, cannot be signed yet", () => {
    expect(huntLessonBlock(NODES.map((n) => ({ ...n, state: "idea" as const })))).not.toBeNull();
    expect(huntLessonBlock(NODES.map((n) => ({ ...n, winner: false })))).toMatch(/no crown/);
    expect(huntLessonBlock(NODES)).toBeNull();
  });
});

describe("the sign", () => {
  test("a claim is one sentence that says why", () => {
    expect(claimProblem("")).not.toBeNull();
    expect(claimProblem("When a bed sits under speech, lock the tempo.")).toMatch(/because/);
    expect(claimProblem(`When x, brief y, because ${"z".repeat(600)}`)).toMatch(/600/);
    expect(claimProblem("When a bed sits under speech, lock the tempo, because unlocked beds drift.")).toBeNull();
  });
});

describe("a strengths cell's lesson", () => {
  test("under the evidence floor a cell is waiting, not a finding", () => {
    const r = cellLesson({ kind: "music", provider: "suno", facet: "genre", value: "lo-fi", n: EVIDENCE_FLOOR - 1, kept: 2, meanScore: null });
    expect(r.ok).toBe(false);
  });

  test("at the floor it proposes a triage lesson with the cell's evidence and an empty claim", () => {
    const r = cellLesson({ kind: "sfx", provider: "elevenlabs", facet: "technique", value: "envelope-first-briefing", n: 4, kept: 3, meanScore: 7.2, takeIds: ["a"] });
    expect(r).toEqual({ ok: true, value: { kind: "sfx", source: "triage", provider: "elevenlabs", huntId: null, claim: "", technique: ["envelope-first-briefing"], evidence: { n: 4, keepRate: 0.75, meanScore: 7.2, takeIds: ["a"] } } });
  });
});

describe("the signed list", () => {
  test("each claim verbatim, with its count and its hunt as a door", () => {
    const html = renderToStaticMarkup(
      h(LessonList, {
        lessons: [{ id: "ls-1", claim: "When a bed sits under speech, lock the tempo, because unlocked beds drift.", source: "hunt", provider: "elevenlabs", technique: ["duration-and-tempo-locking"], n: 3, keepRate: 0.33, meanScore: null, confirmedAt: "2026-10-17T10:00:00Z", hunt: { id: "hn-1", idea: "a vault bed" } }],
        huntHref: (id) => `/audio?s=hunt&h=${id}`,
      }),
    );
    expect(html).toContain("When a bed sits under speech, lock the tempo, because unlocked beds drift.");
    expect(html).toContain('href="/audio?s=hunt&amp;h=hn-1"');
    expect(html).toContain("33%");
  });
});
