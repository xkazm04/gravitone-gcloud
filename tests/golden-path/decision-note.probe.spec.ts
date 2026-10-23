// LANE — A REJECT'S REASONS RIDE THE NOTE AND READ BACK (static).
//
// lib/decision/v1/note.ts spells a reject's axes as a leading `reasons: style, subject` line in a
// free-text note, and decodes it again. encodeNote and decodeNote are one rule with two halves,
// so every pair must round-trip - including a human's own note that happens to begin the way the
// reasons line does. Before the fix, `encodeNote([], "reasons: too dark")` wrote the bare string,
// which decodeNote read as reasons ["too dark"] and no note; and the `\s*` after the colon reached
// across the line break, so an empty `reasons:` head swallowed the note below it.
import { test, expect } from "@playwright/test";

import { decodeNote, encodeNote } from "../../lib/decision/v1/note";

test("decision note: a note that opens on `reasons:` reads back as a note, never as reasons", () => {
  const cases: { reasons: string[]; note: string | null }[] = [
    { reasons: [], note: "reasons: too dark" },
    { reasons: [], note: "reasons:\nsecond line" },
    { reasons: ["style"], note: "reasons: too dark" },
    { reasons: ["style", "subject"], note: "too dark" },
    { reasons: ["style"], note: null },
    { reasons: [], note: "plain words" },
  ];
  for (const c of cases) {
    expect(decodeNote(encodeNote(c.reasons, c.note)), JSON.stringify(c)).toEqual(c);
  }
  // The empty head does not turn into reasons of its own.
  expect(decodeNote("reasons:\nkept whole")).toEqual({ reasons: [], note: "kept whole" });
  expect(encodeNote([], null)).toBe(undefined);
});
