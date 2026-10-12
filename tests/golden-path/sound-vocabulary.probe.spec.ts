// LANE — ONE VOCABULARY, ONE COUNT (static, pure).
//
// The Library's term list and Triage's strengths map must give the same n, kept
// and keepRate for a term off the same ledger. lib/sound/vocabulary.ts sums
// computeInsights' cells instead of recounting, and this probe holds it to that.

import { test, expect } from "@playwright/test";

import { computeInsights, keepRate } from "@/lib/sound/insights";
import type { LedgerVerdict } from "@/lib/sound/ledger";
import type { DefectCode, ProviderId } from "@/lib/sound/types";
import { deriveVocabulary, termId } from "@/lib/sound/vocabulary";

type RowOpts = Partial<LedgerVerdict> & { genre?: string[]; mood?: string[]; instrument?: string[]; sfxCategory?: string | null };

let seq = 0;
function row(p: RowOpts): LedgerVerdict {
  const { genre = [], mood = [], instrument = [], sfxCategory = null, ...rest } = p;
  return {
    takeId: `t${++seq}`,
    kind: "music",
    provider: "elevenlabs" as ProviderId,
    op: "compose",
    origin: "agent",
    technique: [],
    terms: { genre, mood, instrument, sfxCategory },
    prompt: "",
    negative: null,
    durationS: 30,
    verdict: "kept",
    ratings: {},
    score: null,
    reasons: [],
    huntId: null,
    judgedAt: "2026-10-05T10:00:00.000Z",
    ...rest,
  };
}

// A defect code the ledger accepts; the exact one does not matter to the probe.
const THIN = "thin" as DefectCode;

const ledger: LedgerVerdict[] = [
  row({ genre: ["Lo-Fi"], mood: ["warm"], verdict: "kept", score: 4 }),
  row({ genre: ["lo-fi"], mood: ["warm"], verdict: "rejected", reasons: [THIN], provider: "suno" as ProviderId }),
  row({ genre: ["lo-fi "], verdict: "kept", provider: "suno" as ProviderId }),
  row({ genre: ["synthwave"], instrument: ["rhodes"], verdict: "rejected", reasons: [THIN] }),
  row({ kind: "sfx", sfxCategory: "whoosh", mood: ["tense"], verdict: "kept" }),
  row({ genre: ["lo-fi"], origin: "fixture", verdict: "kept" }),
];

test("identity: every term's n, kept and keepRate equal Triage's cells summed over providers", () => {
  const { cells } = computeInsights(ledger);
  const vocab = deriveVocabulary(cells);
  expect(vocab.length).toBeGreaterThan(0);
  for (const v of vocab) {
    const mine = cells.filter((c) => c.facet === v.facet && c.kind === v.kind && c.value.trim().toLowerCase() === v.term.trim().toLowerCase());
    const n = mine.reduce((s, c) => s + c.n, 0);
    const kept = mine.reduce((s, c) => s + c.kept, 0);
    expect({ id: v.id, n: v.n, kept: v.kept, rate: v.keepRate }).toEqual({ id: v.id, n, kept, rate: keepRate({ n, kept }) });
  }
  const lofi = vocab.find((v) => v.id === termId("genre", "lo-fi"))!;
  expect([lofi.n, lofi.kept, lofi.rejected, lofi.topDefect]).toEqual([3, 2, 1, "thin"]);
});

test("the hand is laid over the evidence and never changes a count", () => {
  const { cells } = computeInsights(ledger);
  const bare = deriveVocabulary(cells);
  const handed = deriveVocabulary(cells, { [termId("genre", "lo-fi")]: { stance: "avoid", phrase: "lofi" }, [termId("sfxCategory", "whoosh")]: { stance: "prefer" } });
  const pick = (vs: typeof bare, id: string) => vs.find((v) => v.id === id)!;
  expect(pick(handed, termId("genre", "lo-fi"))).toMatchObject({ stance: "avoid", phrase: "lofi" });
  expect(pick(bare, termId("genre", "lo-fi")).stance).toBeNull();
  expect(handed.map((v) => [v.id, v.n, v.kept])).toEqual(bare.map((v) => [v.id, v.n, v.kept]));
  // an effect category takes no stance
  expect(pick(handed, termId("sfxCategory", "whoosh"))).toMatchObject({ stance: null, phrase: "" });
});

test("only vocabulary facets appear: no technique cells, no effect moods", () => {
  const { cells } = computeInsights([row({ genre: ["x"], technique: ["layered"] }), row({ kind: "sfx", sfxCategory: "hit", mood: ["tense"] })]);
  const ids = deriveVocabulary(cells).map((v) => v.id).sort();
  expect(ids).toEqual(["genre:x", "sfxCategory:hit"]);
});
