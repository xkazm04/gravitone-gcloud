// LANE — DECK TEXT CLEARS 4.5:1 ON INK.
// White at alpha a over #080a10: .30 = 2.59, .35 = 3.14, .40 = 3.77, .45 = 4.50.
// The locked-CTA reason, card footnote and eyebrows sat under the floor.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

import { stripComments } from "./_helpers";

test("Deck and DeckCard carry no text-white/30|35|40", () => {
  let read = 0;
  const hits: string[] = [];
  for (const f of ["components/ui/deck/Deck.tsx", "components/ui/deck/DeckCard.tsx"]) {
    const s = stripComments(readFileSync(join(process.cwd(), f), "utf8"));
    read += s.length;
    for (const m of s.matchAll(/text-white\/(30|35|40)\b/g)) hits.push(`${f}:${m[0]}`);
  }
  expect(read).toBeGreaterThan(0);
  expect(hits).toEqual([]);
});
