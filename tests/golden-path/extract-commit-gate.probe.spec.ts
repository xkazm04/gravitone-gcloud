// FOUNDRY - BOTH COMMIT DOORS READ THE PLANT'S SET, NOT A COPY OF IT.
//
// Which statuses may be committed is decided in three places per kind: the
// server's commit (lib/foundry/extract/store.ts commitExtractRun,
// lib/foundry/store.ts commitRun), the Board's gate (lib/decision/v1/sources/
// {extract,forge}.ts) and the ledger (lib/ledger/v1/sources/{extract,forge}.ts).
// The last two read EXTRACT_COMMITTABLE / COMMITTABLE (lib/foundry/plant.ts);
// BOTH servers held their own literal, beside a comment naming a file
// (app/foundry/parts.tsx) the Phase 6 rebuild deleted. The forge's door was
// thought guarded by _ast.probe.spec.ts, whose text match on "COMMITTABLE" was
// satisfied by that very comment. Read from the program, so a comment that
// names the constant cannot satisfy it.
import { test, expect } from "@playwright/test";
import ts from "typescript";

import { fn, walk } from "./_ast";

function shape(file: string, name: string, constant: string) {
  const body = fn(file, name);
  let reads = 0;
  const literals: string[] = [];
  walk(body, (n) => {
    if (ts.isIdentifier(n) && n.text === constant) reads++;
    if (ts.isArrayLiteralExpression(n) && n.elements.length > 0 && n.elements.every(ts.isStringLiteral)) {
      const words = n.elements.map((e) => (e as ts.StringLiteral).text);
      if (words.includes("done")) literals.push(words.join(","));
    }
  });
  return { reads, literals };
}

test("commitExtractRun gates on EXTRACT_COMMITTABLE and carries no status list of its own", () => {
  const s = shape("lib/foundry/extract/store.ts", "commitExtractRun", "EXTRACT_COMMITTABLE");
  expect(s.literals).toEqual([]);
  expect(s.reads).toBeGreaterThan(0);
});

test("commitRun gates on COMMITTABLE and carries no status list of its own", () => {
  const s = shape("lib/foundry/store.ts", "commitRun", "COMMITTABLE");
  expect(s.literals).toEqual([]);
  expect(s.reads).toBeGreaterThan(0);
});
