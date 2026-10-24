// EXTRACT - THE COMMIT DOOR READS THE PLANT'S SET, NOT A COPY OF IT.
//
// Which extract statuses may be committed is decided in three places: the
// server's commitExtractRun (lib/foundry/extract/store.ts), the Board's gate
// (lib/decision/v1/sources/extract.ts) and the ledger (lib/ledger/v1/sources/
// extract.ts). The last two read EXTRACT_COMMITTABLE (lib/foundry/plant.ts);
// the server held its own literal, beside a comment naming a file
// (app/foundry/parts.tsx) the Phase 6 rebuild deleted. The forge's commitRun
// already reads COMMITTABLE (_ast.probe.spec.ts). Read from the program, so the
// comment that names the constant cannot satisfy it.
import { test, expect } from "@playwright/test";
import ts from "typescript";

import { fn, walk } from "./_ast";

const STORE = "lib/foundry/extract/store.ts";

function shape(name: string) {
  const body = fn(STORE, name);
  let reads = 0;
  const literals: string[] = [];
  walk(body, (n) => {
    if (ts.isIdentifier(n) && n.text === "EXTRACT_COMMITTABLE") reads++;
    if (ts.isArrayLiteralExpression(n) && n.elements.length > 0 && n.elements.every(ts.isStringLiteral)) {
      const words = n.elements.map((e) => (e as ts.StringLiteral).text);
      if (words.includes("done")) literals.push(words.join(","));
    }
  });
  return { reads, literals };
}

test("commitExtractRun gates on EXTRACT_COMMITTABLE and carries no status list of its own", () => {
  const s = shape("commitExtractRun");
  expect(s.literals).toEqual([]);
  expect(s.reads).toBeGreaterThan(0);
});
