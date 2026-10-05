// LANE — A LIVE REFUSAL IS DRAWN AS A REFUSAL, NOT AS AN OUTAGE (static).
//
// `cue.status` is absent by construction on every live cue (spots.ts), so every
// refused-silence affordance keyed on it was unreachable in production, and the
// session's real refusal (`take.state === "refused"`) rendered identically to a
// dropped connection. The refusal vocabulary must read the take as well, and an
// error take is its own element with an alert role.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

import { stripComments } from "./_helpers";

const FILE = join(process.cwd(), "app/_phases/score/ScoreSpotting.tsx");

test("score refusal affordances read the take, and an error take is a separate alert", () => {
  const src = stripComments(readFileSync(FILE, "utf8"));
  expect(src.length).toBeGreaterThan(1000);

  // (a) a derived refusal that includes the take, and no affordance keyed on
  // cue.status alone.
  expect(src).toMatch(/state === "refused"/);
  expect(src).toMatch(/const refused\s*=[^;]*status === "failed"[^;]*state === "refused"/);
  expect(src.match(/\.status === "failed"/g)?.length ?? 0).toBeLessThanOrEqual(4);

  // (b) the old shared branch is gone; the error take carries role="alert".
  expect(src).not.toMatch(/state === "refused" \|\| take\?\.state === "error"/);
  expect(src).toMatch(/take\?\.state === "error"[\s\S]{0,200}role="alert"/);
});
