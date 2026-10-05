// LANE — AN UNMEASURED CRAFT CHECK IS DRAWN AS LOUDLY AS THE GATE DRAWS IT.
//
// GatePanel and StructurePanel draw `unmeasured` as an amber "?" worded "not
// checked", and keep "—" for n/a. CheckList drew the same verdict as a grey "—"
// (3.14:1 on the ink ground) worded "not measured", so one glyph meant two
// verdicts on one page, and the greyed-out version is the lie GatePanel's header
// names. This pins CheckList to the gate's spelling.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

import { stripComments } from "./_helpers";

test("CheckList draws unmeasured as the gate does: amber ? 'not checked'", () => {
  const raw = readFileSync(join(process.cwd(), "app/_phases/script/_parts/Meters.tsx"), "utf8");
  expect(raw.length, "the walk read nothing").toBeGreaterThan(0);
  const src = stripComments(raw);
  const entry = src.match(/\n\s*unmeasured:\s*\{[^}]*\}/)?.[0];
  expect(entry, "CHECK has no unmeasured entry").toBeTruthy();
  expect(entry).toContain('mark: "?"');
  expect(entry).toContain("text-amber-300");
  expect(entry).toContain('label: "not checked"');
  expect(entry).not.toContain("—");
});
