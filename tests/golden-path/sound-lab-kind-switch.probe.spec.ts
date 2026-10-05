// LANE — A CONTROL ANNOUNCED AS A RADIO GROUP RESPONDS LIKE ONE (source ratchet).
//
// KindSwitch marked two <button>s role="radio", which promises arrow-key
// selection and a single tab stop and implemented neither (the same mis-promise
// UserMenu.tsx records removing for role=menu). Native radio inputs give both
// for free, as components/ui/Field.tsx's Segmented already does.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

import { stripComments } from "./_helpers";

test("the kind switch uses native radios, not role=radio buttons", () => {
  const src = stripComments(readFileSync(join(__dirname, "..", "..", "app/playground/PlaygroundView.tsx"), "utf8"));
  expect(src.length, "read nothing").toBeGreaterThan(0);
  expect(src.match(/role="radio"/g) ?? []).toHaveLength(0);
  expect(src.match(/type="radio"/g)?.length ?? 0).toBeGreaterThanOrEqual(1);
});
