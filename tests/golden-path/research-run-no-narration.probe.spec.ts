// LANE: the research run stage does not narrate itself.
//
// Three rendered strings had the app as their subject: LiveResult's 33-word
// running paragraph, a non-interactive "Next deals the takes" arrow, and
// FaceSwitch's template-literal title (invisible to check:narration, whose
// regex only matches title="...").
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

import { stripComments } from "./_helpers";

function code(rel: string): string {
  const src = stripComments(readFileSync(join(process.cwd(), rel), "utf8"));
  expect(src.length, `${rel} read as empty`).toBeGreaterThan(500);
  return src;
}

test("LiveResult's running card is the work (topic, billing, bell), not a paragraph", () => {
  const src = code("app/_phases/research/run/LiveResult.tsx");
  expect(src).not.toContain("The engine is writing");
  expect(src).toContain("billing");
  expect(src).toMatch(/import\s*\{[^}]*\bBell\b[^}]*\}\s*from\s*"lucide-react"/);
});

test("RunStage has no fake 'Next deals the takes' affordance", () => {
  expect(code("app/_phases/research/guided/RunStage.tsx")).not.toContain("Next deals the takes");
});

test("FaceSwitch carries no title attribute", () => {
  // FaceSwitch moved to its own module (Wave 2) so the expert face does not
  // import the wizard to draw it.
  const src = code("app/_phases/research/guided/FaceSwitch.tsx");
  const at = src.indexOf("export function FaceSwitch");
  expect(at).toBeGreaterThan(-1);
  const body = src.slice(at, src.indexOf("</button>", at));
  expect(body).not.toMatch(/\btitle=/);
});
